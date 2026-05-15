import os, json, re, httpx
from openai import AzureOpenAI
from dotenv import load_dotenv

load_dotenv()

http_client = httpx.Client(verify=False)

def get_client():
    return AzureOpenAI(
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_key=os.getenv("AZURE_OPENAI_API_KEY"),
        api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
        http_client=http_client,
    )

SYSTEM_PROMPT = """You are the Predictive Monitoring Agent for L'Avenir Smart Maintenance.

TASK
Analyse sensor telemetry rows and return a JSON object identifying faults.

INPUT
A JSON array. Each row has: equipment_id, building_id, sensor readings, calculated_status ("Red" or "Amber"), department_name, contact_name.

SEVERITY RULE — NON-NEGOTIABLE
- calculated_status "Red"   → severity MUST be "Critical". No exceptions.
- calculated_status "Amber" → severity MUST be "Warning". No exceptions.
You MUST NOT change, downgrade, or upgrade severity. It is already correct.

THRESHOLDS (reference only — do not reclassify)
| Sensor          | Baseline | Warning delta | Critical absolute |
|-----------------|----------|---------------|-------------------|
| temperature_c   | 22.0 °C  | > 0.8         | >= 24.5 °C        |
| pressure_bar    | 2.5 bar  | > 0.15        | >= 2.95 bar       |
| vibration_mm_s  | 1.2 mm/s | > 0.10        | >= 1.50 mm/s      |
| power_kw        | 18.0 kW  | > 1.5         | >= 23.0 kW        |
| humidity_pct    | 45.0 %   | > 5.0         | >= 58.0 %         |

FIELD RULES
1. fault_type: name the worst breached sensor. Examples: "High Vibration", "Temperature Spike", "High Pressure", "Multi-Sensor Anomaly".
2. fault_value: the exact number from the triggering sensor reading. Float.
3. confidence: integer 0–100.
   - 90–100: single sensor well above threshold, unambiguous
   - 75–89:  clear breach or multi-sensor pattern
   - 55–74:  marginal or borderline reading
   - 40–54:  weak or unusual signal
4. issue_summary: ONE sentence. State what is wrong and the risk. Max 20 words. Example: "Vibration at 9.3 mm/s exceeds 1.50 critical threshold; bearing failure likely without immediate shutdown."
5. assigned_department: copy VERBATIM from department_name. NEVER invent or change.
6. contact_person: copy VERBATIM from contact_name. NEVER invent or change.

OUTPUT FORMAT
Return ONLY raw JSON. No markdown. No explanation. No preamble.

{
  "anomalies_detected": [
    {
      "equipment_id": "string",
      "building_id": "string",
      "severity": "Critical or Warning",
      "fault_type": "string",
      "fault_value": 0.0,
      "confidence": 0,
      "issue_summary": "string",
      "assigned_department": "string",
      "contact_person": "string"
    }
  ]
}
"""


def run_predictive_analysis(sensor_data_json: str) -> dict:
    print("🤖 [AGENT 1 — CHRISTABELLE] Running predictive analysis...")

    response = get_client().chat.completions.create(
        model=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME"),
        max_tokens=4000,
        temperature=0,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": sensor_data_json},
        ],
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        print("⚠️  [AGENT 1] JSON truncated — attempting partial recovery...")
        pattern = r'\{[^{}]*"equipment_id"[^{}]*"severity"[^{}]*"issue_summary"[^{}]*\}'
        recovered = []
        for m in re.findall(pattern, raw, re.DOTALL):
            try:
                recovered.append(json.loads(m))
            except Exception:
                pass
        if recovered:
            result = {"anomalies_detected": recovered}
        else:
            raise ValueError(f"Agent 1 unrecoverable. Raw: {raw[:300]}")

    for a in result.get("anomalies_detected", []):
        try:
            a["confidence"] = int(a.get("confidence", 75))
        except (ValueError, TypeError):
            a["confidence"] = 75

    print(f"✅ [AGENT 1] {len(result.get('anomalies_detected', []))} anomalies flagged.")
    return result