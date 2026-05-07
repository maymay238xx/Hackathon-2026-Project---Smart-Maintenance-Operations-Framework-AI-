import os, json, hashlib, httpx
from datetime import datetime
from openai import AzureOpenAI
from dotenv import load_dotenv

load_dotenv()

http_client = httpx.Client(verify=False)
client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
    http_client=http_client,
)

SYSTEM_PROMPT = """You are the Ticketing Agent for L'Avenir Smart Maintenance.
You write professional ServiceNow-style work order descriptions.

Given a fault event, produce a JSON object with exactly these fields:

short_description
  One line. Max 12 words. Format: "[Priority] [Equipment] — [Fault Type] in [Building]"
  Example: "P1 URGENT: PUMP-001 — Critical High Pressure in Building B2"

description
  3-4 sentences. Include:
  - What was detected and the exact sensor reading
  - Why it matters (operational risk)
  - What the assigned department should do first
  - Any safety considerations

category
  One of: "Mechanical" | "HVAC" | "Electrical" | "Structural" | "Environmental"

urgency_note
  One sentence. State response time expectation.
  P1: "Immediate response required — escalate to on-call engineer within 15 minutes."
  P2: "Response required within 2 hours — schedule inspection before next shift."
  P3: "Routine — schedule within 48 hours."

Return ONLY raw JSON. No markdown. No preamble.

{
  "short_description": "string",
  "description": "string",
  "category": "string",
  "urgency_note": "string"
}"""


def _make_ticket_id(equipment_id: str, department: str) -> str:
    raw = f"{equipment_id}{department}{datetime.utcnow().strftime('%Y%m%d%H')}"
    return "WRK-" + hashlib.md5(raw.encode()).hexdigest()[:5].upper()


def _priority(severity: str) -> str:
    return {"Critical": "P1 - Urgent", "Warning": "P2 - High"}.get(severity, "P3 - Normal")


def _category_from_dept(department: str) -> str:
    dept_lower = department.lower()
    if any(k in dept_lower for k in ["hvac", "air", "cooling", "chiller"]):
        return "HVAC"
    if any(k in dept_lower for k in ["mechanical", "pump", "fluid"]):
        return "Mechanical"
    if any(k in dept_lower for k in ["electrical", "power", "elec"]):
        return "Electrical"
    if any(k in dept_lower for k in ["facilities", "structural", "building"]):
        return "Structural"
    return "Environmental"


def create_ticket(
    equipment_id: str,
    severity: str,
    department: str,
    accepted_by: str,
    fault_type: str = "",
    fault_value: float = None,
    issue_summary: str = "",
    building_id: str = "",
) -> dict:
    print(f"🎫 [AGENT 2] Generating ticket for {equipment_id} ({severity})...")

    priority = _priority(severity)
    ticket_id = _make_ticket_id(equipment_id, department)

    user_prompt = json.dumps({
        "equipment_id": equipment_id,
        "building_id": building_id or "Unknown",
        "severity": severity,
        "priority": priority,
        "fault_type": fault_type or "Unspecified Fault",
        "fault_value": fault_value,
        "issue_summary": issue_summary,
        "assigned_department": department,
        "accepted_by": accepted_by,
    })

    try:
        response = client.chat.completions.create(
            model=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME"),
            max_tokens=400,
            temperature=0,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_prompt},
            ],
            response_format={"type": "json_object"},
        )
        ai = json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"⚠️  [AGENT 2] GPT failed, using fallback: {e}")
        ai = {
            "short_description": f"{priority}: {equipment_id} — {fault_type or 'Fault'} detected",
            "description": issue_summary or f"Fault detected on {equipment_id}. Inspection required.",
            "category": _category_from_dept(department),
            "urgency_note": "P1 - Immediate response required." if severity == "Critical" else "P2 - Respond within 2 hours.",
        }

    ticket = {
        "ticket_id":         ticket_id,
        "system":            "ServiceNow",
        "priority":          priority,
        "category":          ai.get("category", _category_from_dept(department)),
        "short_description": ai.get("short_description", f"{priority}: {equipment_id}"),
        "description":       ai.get("description", issue_summary),
        "urgency_note":      ai.get("urgency_note", ""),
        "assigned_to":       department,
        "equipment_id":      equipment_id,
        "building_id":       building_id,
        "fault_type":        fault_type,
        "status":            "Open",
        "accepted_by":       accepted_by,
        "dispatched_at":     datetime.utcnow().isoformat() + "Z",
    }

    print(f"✅ [AGENT 2] {ticket_id} | {priority} | {equipment_id} → {department}")
    return ticket