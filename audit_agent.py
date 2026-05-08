import os, json, httpx
from datetime import datetime, timezone
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

AUDIT_PROMPT = """You are a Maintenance Compliance Auditor for L'Avenir Smart Maintenance.
Write a professional audit summary from the shift records provided.

OUTPUT FORMAT — MANDATORY
Use EXACTLY these four section headers in CAPS on their own lines.
Write in plain prose sentences under each header. No bullet points. No lists.

SHIFT OVERVIEW
One or two sentences. State total jobs, completion rate, and escalation count. Be specific with numbers.

CRITICAL FINDINGS
State any Critical severity items, unresolved work orders, or patterns requiring management attention.
If none, write: "No critical findings requiring immediate escalation."

COMPLIANCE STATUS
State whether SOPs were followed, whether jobs were completed with evidence, and any compliance gaps.
Be specific about ticket IDs where relevant.

RECOMMENDED ACTIONS
State 2–3 concrete actions for the next shift or management. Be specific with equipment IDs and ticket numbers.

RULES
- Under 220 words total
- Plain formal English — no bullet points anywhere
- Always reference specific equipment IDs and ticket numbers
- If a field is unknown, omit it — never write "N/A" or "unknown"
"""


def generate_audit_summary(audit_records: list[dict]) -> str:
    response = client.chat.completions.create(
        model=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME"),
        max_tokens=400,
        temperature=0.1,
        messages=[
            {"role": "system", "content": AUDIT_PROMPT},
            {"role": "user",   "content": json.dumps(audit_records, indent=2)},
        ],
    )
    return response.choices[0].message.content


def build_audit_register(
    accepted:  list[dict],
    escalated: list[dict],
    completed: list[int],
) -> dict:
    print(f"\n📋 [AGENT 5 — AUDIT] {len(accepted)} accepted, {len(escalated)} escalated")

    now     = datetime.now(timezone.utc).isoformat()
    records = []

    for entry in accepted:
        completed_flag = entry.get("id") in completed
        records.append({
            "record_type":   "WORK_ORDER",
            "equipment_id":  entry.get("equipment"),
            "ticket_id":     entry.get("ticket", {}).get("ticket_id") if entry.get("ticket") else None,
            "priority":      entry.get("ticket", {}).get("priority")  if entry.get("ticket") else None,
            "severity":      entry.get("type", "").upper(),
            "action_taken":  entry.get("message"),
            "dispatched_at": entry.get("time"),
            "completed":     completed_flag,
            "completed_at":  entry.get("completedAt") if completed_flag else None,
            "status":        "COMPLETE" if completed_flag else "IN_PROGRESS",
            "department":    entry.get("ticket", {}).get("assigned_to") if entry.get("ticket") else "Unknown",
            "technician_note": entry.get("note"),
            "accepted_by":   entry.get("accepted_by"),
            #"markComplete":  entry.get("completed_by") if completed_flag else None,
            "completed_by":  entry.get("completed_by") or "Unknown" if entry.get("id") in completed else None,
        })

    for entry in escalated:
        records.append({
            "record_type":       "ESCALATION",
            "equipment_id":      entry.get("equipment_id"),
            "ticket_id":         None,
            "severity":          entry.get("severity", "").upper(),
            "action_taken":      "Escalated to manager review",
            "escalation_reason": entry.get("reason"),
            "dispatched_at":     entry.get("time"),
            "completed":         False,
            "status":            "ESCALATED — PENDING MANAGER REVIEW",
            "department":        entry.get("assigned_department", "Unknown"),
        })

    total           = len(records)
    completed_count = sum(1 for r in records if r["status"] == "COMPLETE")
    escalated_count = sum(1 for r in records if r["record_type"] == "ESCALATION")
    in_progress     = sum(1 for r in records if r["status"] == "IN_PROGRESS")
    completion_rate = round((completed_count / total * 100) if total > 0 else 0, 1)

    stats = {
        "total_records":   total,
        "completed":       completed_count,
        "in_progress":     in_progress,
        "escalated":       escalated_count,
        "completion_rate": f"{completion_rate}%",
    }

    print(f"   ↳ Stats: {stats}")
    print("🤖 [AGENT 5] Generating audit summary...")

    ai_summary = (
        generate_audit_summary(records)
        if records
        else "No maintenance records to audit for this session."
    )

    register = {
        "generated_at": now,
        "period":       "Current Session",
        "stats":        stats,
        "records":      records,
        "ai_summary":   ai_summary,
    }

    print(f"✅ [AGENT 5] {total} records | {completion_rate}% completion")
    return register


if __name__ == "__main__":
    test_accepted = [
        {"id": 1, "equipment": "PUMP_1", "type": "critical", "time": "14:32:01",
         "message": "Emergency response dispatched to Engineering.",
         "ticket": {"ticket_id": "WRK-A1B2C", "priority": "P1 - Urgent", "assigned_to": "Engineering"},
         "completedAt": "15:14:22", "note": "Bearing replaced, vibration confirmed at 0.8 mm/s."},
        {"id": 2, "equipment": "HVAC_2", "type": "warning", "time": "14:33:10",
         "message": "Inspection scheduled with Facilities.",
         "ticket": {"ticket_id": "WRK-D3E4F", "priority": "P2 - High", "assigned_to": "Facilities"}},
    ]
    test_escalated = [
        {"equipment_id": "HVAC_1", "severity": "Critical",
         "reason": "Unusual fault pattern — specialist required",
         "time": "14:34:00", "assigned_department": "Facilities"},
    ]
    result = build_audit_register(test_accepted, test_escalated, completed=[1])
    print(json.dumps(result, indent=2))