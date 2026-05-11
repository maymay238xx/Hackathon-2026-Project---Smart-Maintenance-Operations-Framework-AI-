

import os, re
from pathlib import Path
from openai import AzureOpenAI
import httpx
from dotenv import load_dotenv

load_dotenv()

http_client = httpx.Client(verify=False)
client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
    http_client=http_client,
)

MANUAL_DIRS = [
    Path(__file__).parent / "manuals",
    Path(__file__).parent,
]


EQUIPMENT_CATEGORIES = {
    "pump": {
        "keywords": ["pump", "fluid", "pressure", "seal", "bearing", "vibration",
                     "discharge", "centrifugal", "impeller", "cavitation", "flow",
                     "waukesha", "grundfos", "etanorm", "ksb", "wilo"],
        "filename_fragments": ["pump", "fluid", "centrifugal", "waukesha",
                               "grundfos", "etanorm", "ksb", "wilo"],
    },
    "hvac": {
        "keywords": ["hvac", "temperature", "airflow", "filter", "blower",
                     "contactor", "air conditioner", "air conditioning",
                     "panasonic", "lg", "mitsubishi", "daikin", "carrier",
                     "trane", "split"],
        "filename_fragments": ["hvac", "air conditioner", "air conditioning",
                               "panasonic", "lg", "mitsubishi", "daikin",
                               "carrier", "trane", "cg-svx"],
    },
    "chiller": {
        "keywords": ["chiller", "refrigerant", "compressor", "condenser",
                     "evaporator", "aquasnap", "hermetic", "screw chiller"],
        "filename_fragments": ["chiller", "aquasnap", "hermetic", "screw"],
    },
    "cooling_tower": {
        "keywords": ["cooling tower", "tower", "bac", "evapco", "marley",
                     "spx", "fill", "basin", "drift", "baltimore"],
        "filename_fragments": ["cooling tower", "bac", "evapco", "marley",
                               "baltimore"],
    },
    "motor": {
        "keywords": ["motor", "electric motor", "winding", "insulation",
                     "rotor", "stator", "emerson", "vibration motor"],
        "filename_fragments": ["motor", "emerson", "vibration-motor"],
    },
    "drive": {
        "keywords": ["vfd", "variable frequency", "drive", "inverter", "svx"],
        "filename_fragments": ["svx", "drive", "vfd", "inverter"],
    },
}


def extract_pdf_text(pdf_path: str) -> str:
    try:
        import fitz
        doc  = fitz.open(pdf_path)
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
        return text
    except Exception as e:
        print(f"⚠️  [RAG] Failed to read {pdf_path}: {e}")
        return ""


def chunk_text(text: str, chunk_size: int = 400, overlap: int = 80) -> list[str]:
    words  = text.split()
    chunks, i = [], 0
    while i < len(words):
        chunks.append(" ".join(words[i: i + chunk_size]))
        i += chunk_size - overlap
    return chunks


def _categorise_pdf(filename: str) -> list[str]:
    name_lower = filename.lower()
    matched = [cat for cat, cfg in EQUIPMENT_CATEGORIES.items()
               if any(frag in name_lower for frag in cfg["filename_fragments"])]
    return matched if matched else ["general"]


class SOPKnowledgeBase:
    def __init__(self):
        self.chunks:    dict[str, list[str]] = {}
        self.pdf_index: dict[str, list[str]] = {}
        self._load()

    def _find_pdfs(self) -> list[Path]:
        found = {}
        for d in MANUAL_DIRS:
            if d.exists():
                for pdf in d.glob("*.pdf"):
                    if pdf.name not in found:
                        found[pdf.name] = pdf
        return list(found.values())

    def _load(self):
        pdfs = self._find_pdfs()
        if not pdfs:
            print("⚠️  [AGENT 3] No PDFs found in manuals/ or current directory")
            return
        print(f"📄 [AGENT 3] Loading {len(pdfs)} PDFs...")
        for pdf_path in pdfs:
            text = extract_pdf_text(str(pdf_path))
            if not text.strip():
                continue
            chunks     = chunk_text(text)
            categories = _categorise_pdf(pdf_path.name)
            self.pdf_index[pdf_path.name] = categories
            for cat in categories:
                self.chunks.setdefault(cat, []).extend(chunks)
            print(f"   ✅ {pdf_path.name} → {categories} ({len(chunks)} chunks)")
        total = sum(len(v) for v in self.chunks.values())
        print(f"📚 [AGENT 3] Ready: {len(pdfs)} PDFs, {total} chunks, {len(self.chunks)} categories")

    def retrieve(self, query: str, equipment_id: str = "", top_k: int = 6) -> str:
        if not self.chunks:
            return "No SOP content available."
        query_lower = (query + " " + equipment_id).lower()
        query_words = set(re.findall(r'\w+', query_lower))
        cat_scores  = {}
        for cat, cfg in EQUIPMENT_CATEGORIES.items():
            if cat not in self.chunks:
                continue
            score = sum(1.0 for kw in cfg["keywords"] if kw in query_lower)
            if any(frag in equipment_id.lower() for frag in cfg["filename_fragments"]):
                score += 3.0
            cat_scores[cat] = score
        if "general" in self.chunks:
            cat_scores["general"] = 0.5
        if not cat_scores:
            all_chunks = [c for v in self.chunks.values() for c in v]
        else:
            sorted_cats = sorted(cat_scores.items(), key=lambda x: x[1], reverse=True)
            all_chunks  = list(self.chunks.get(sorted_cats[0][0], []))
            for cat, _ in sorted_cats[1:3]:
                all_chunks.extend(self.chunks.get(cat, [])[:20])
        def score_chunk(c):
            return len(query_words & set(re.findall(r'\w+', c.lower())))
        return "\n\n---\n\n".join(sorted(all_chunks, key=score_chunk, reverse=True)[:top_k])

    def list_loaded_pdfs(self) -> list[str]:
        return list(self.pdf_index.keys())


knowledge_base = SOPKnowledgeBase()


SOP_SYSTEM_PROMPT = """You are the SOP Guidance Agent for L'Avenir Smart Maintenance.
You help field engineers using retrieved Standard Operating Procedure content.

EQUIPMENT CONTEXT
{equipment_context}

RETRIEVED SOP CONTENT
{sop_context}

STRICT OUTPUT RULES — FOLLOW EXACTLY

1. SAFETY FIRST
   If the SOP mentions PPE or LOTO for this task, state them BEFORE any steps.
   Format: ⚠️ SAFETY: [requirement]

2. NUMBERED STEPS — ALWAYS
   ALWAYS use numbered steps for any action sequence. Example:
   1. Isolate the pump using the upstream isolation valve.
   2. Verify zero energy state with a voltage tester.
   3. Remove the bearing cover using a 13mm spanner.
   Never use paragraphs for action sequences.

3. BULLET POINTS — CHECKS AND LISTS ONLY
   Use bullet points ONLY for non-sequential items (tools needed, checks, warnings).
   - Item one
   - Item two

4. RESPONSE LENGTH
   Maximum 200 words per response. engineers are on mobile in the field.
   Give 1–3 steps at a time. Then ask: "Ready to continue?" or "Step complete?"

5. STRICT SOP GROUNDING
   ONLY use information from the SOP content provided above.
   If the SOP does not cover the question, say exactly:
   "This isn't covered in the available SOP. Please escalate to your supervisor."
   NEVER invent steps, thresholds, or procedures.

6. EXACT THRESHOLDS
   When quoting limits (pressure, vibration, temperature), quote the exact value from the SOP.
   Never round or approximate threshold values.

7. D365 REMINDER
   When a job is complete, ALWAYS end with:
   "Please log completion evidence and photos in D365 before closing this ticket."
"""


def build_system_prompt(sop_context: str, equipment_context: str) -> str:
    return SOP_SYSTEM_PROMPT.format(
        sop_context=sop_context or "No SOP content retrieved for this query.",
        equipment_context=equipment_context or "No specific equipment context provided."
    )


def run_sop_chat(
    messages: list[dict],
    equipment_id: str = "",
    fault_context: str = "",
) -> str:
    equipment_context = ""
    if equipment_id or fault_context:
        equipment_context = (
            f"Equipment ID: {equipment_id}\n"
            f"Fault: {fault_context}\n"
            "Tailor all guidance to this specific fault and equipment."
        )

    latest_query = next(
        (m["content"] for m in reversed(messages) if m["role"] == "user"), ""
    )
    sop_context   = knowledge_base.retrieve(query=latest_query, equipment_id=equipment_id)
    system_prompt = build_system_prompt(sop_context, equipment_context)

    print(f"🔍 [AGENT 3] {len(sop_context.split())} SOP words | equipment={equipment_id or 'general'}")

    response = client.chat.completions.create(
        model=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME"),
        max_tokens=600,
        temperature=0.1,
        messages=[
            {"role": "system", "content": system_prompt},
            *messages,
        ],
    )
    reply = response.choices[0].message.content
    print(f"✅ [AGENT 3] {len(reply)} chars")
    return reply


if __name__ == "__main__":
    print(f"\nPDFs loaded: {knowledge_base.list_loaded_pdfs()}")
    result = run_sop_chat(
        messages=[{"role": "user", "content": "What steps should I follow for a vibration fault?"}],
        equipment_id="PUMP_1",
        fault_context="Critical · High Vibration · 9.3 mm/s",
    )
    print("\n── AGENT 3 RESPONSE ──")
    print(result)