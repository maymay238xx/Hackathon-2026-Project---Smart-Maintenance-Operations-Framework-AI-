import os, httpx
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

from rag_agent import knowledge_base

SYSTEM_PROMPT = """You are the Interactive Maintenance Guidance Agent for L'Avenir Smart Maintenance.
You guide field technicians through maintenance interventions step by step.

EQUIPMENT CONTEXT
{equipment_context}

SOP CONTENT
{sop_context}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE RULES — FOLLOW WITHOUT EXCEPTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULE 1 — SAFETY COMES FIRST
If this step involves physical contact with equipment, ALWAYS state PPE and LOTO first.
Format:
⚠️ SAFETY REQUIREMENTS:
- PPE: [list required PPE]
- LOTO: [isolation requirements]

RULE 2 — ONE OR TWO STEPS AT A TIME
NEVER give more than 2 steps in a single response.
After each response, ask ONE of:
- "Is that step complete?"
- "Ready to continue?"
- "Any issues before we proceed?"

RULE 3 — NUMBERED STEPS EVERY TIME
ALWAYS number every action step. No exceptions.
Format:
1. [Action verb]. [Detail]. [Why if important].
2. [Action verb]. [Detail].

Example of CORRECT format:
1. Close the upstream isolation valve by turning clockwise until resistance is felt.
2. Tag the valve with a LOTO tag and record the time.
Ready to continue?

Example of WRONG format (NEVER do this):
"You should close the valve and then tag it before proceeding to the next part..."

RULE 4 — BRIEF AND FIELD-READY
Maximum 120 words per response. Technicians are on mobile devices.
Use plain English. No jargon unless it is in the SOP.

RULE 5 — SOP ONLY
ONLY use information from the SOP content provided.
If something is not in the SOP, say:
"That isn't covered in the SOP for this equipment. Please escalate to your supervisor before proceeding."
NEVER invent steps, values, or procedures.

RULE 6 — EXCEPTIONS
If the technician reports something unexpected (unusual noise, smell, reading),
refer to the Exception Handling section of the SOP immediately.
Do not continue with standard steps until the exception is addressed.

RULE 7 — JOB COMPLETION
When the technician confirms the job is done, remind them:
"Please log all completion evidence and photos in D365 before closing ticket {ticket_ref}."
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""


def run_chatbot(
    messages: list[dict],
    equipment_id: str = "",
    fault_context: str = "",
    sop_context: str = "",
) -> dict:
    print(f"\n🤖 [AGENT 4] Guidance for: {equipment_id or 'general'}")

    if not sop_context:
        latest = next(
            (m["content"] for m in reversed(messages) if m["role"] == "user"), ""
        )
        sop_context = knowledge_base.retrieve(query=latest, equipment_id=equipment_id)
        print(f"   ↳ Agent 3 retrieved {len(sop_context.split())} SOP words")

    equipment_context = ""
    ticket_ref        = "this ticket"
    if equipment_id or fault_context:
        equipment_context = (
            f"Equipment ID: {equipment_id}\n"
            f"Fault: {fault_context}\n"
            "Guide the technician through the intervention for this specific fault."
        )
        ticket_ref = equipment_id

    # Determine SOP source for logging
    eq_lower   = equipment_id.lower()
    sop_source = (
        "Fluid Pump Intervention Guideline v2"   if "pump" in eq_lower else
        "HVAC Predictive Maintenance Guideline v2" if "hvac" in eq_lower else
        "General SOP Library"
    )

    system = SYSTEM_PROMPT.format(
        sop_context=sop_context or "No SOP content available for this equipment.",
        equipment_context=equipment_context or "No specific equipment context provided.",
        ticket_ref=ticket_ref,
    )

    response = client.chat.completions.create(
        model=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME"),
        max_tokens=500,
        temperature=0.1,
        messages=[
            {"role": "system", "content": system},
            *messages,
        ],
    )

    reply          = response.choices[0].message.content
    user_turn_count = sum(1 for m in messages if m["role"] == "user")

    print(f"✅ [AGENT 4] Response | Turn {user_turn_count} | Source: {sop_source}")

    return {
        "reply":      reply,
        "sop_source": sop_source,
        "turn":       user_turn_count,
    }


if __name__ == "__main__":
    print("\n── AGENT 4 STANDALONE TEST ──")
    conversation = [
        {"role": "user", "content": "I've just received the alert. Where do I start?"},
    ]
    result = run_chatbot(
        messages=conversation,
        equipment_id="PUMP_1",
        fault_context="Critical · High Vibration · 9.3 mm/s",
    )
    print(f"\nSource: {result['sop_source']} | Turn: {result['turn']}")
    print(f"\nResponse:\n{result['reply']}")

    conversation.append({"role": "assistant", "content": result["reply"]})
    conversation.append({"role": "user", "content": "Done, I've isolated the pump. What next?"})

    result2 = run_chatbot(
        messages=conversation,
        equipment_id="PUMP_1",
        fault_context="Critical · High Vibration · 9.3 mm/s",
    )
    print(f"\nFollow-up:\n{result2['reply']}")