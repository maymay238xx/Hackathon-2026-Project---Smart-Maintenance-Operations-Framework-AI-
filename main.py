import os, json, hashlib, httpx
import pandas as pd
from datetime import datetime
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from openai import AzureOpenAI
from dotenv import load_dotenv

from predictive_agent import run_predictive_analysis
from rag_agent import run_sop_chat, knowledge_base
from agent4_chatbot import run_chatbot
from audit_agent import build_audit_register
from agent2_ticketing import create_ticket
from fabric_client import (
    load_sensor_data, load_department_data,
    write_audit_record, health_check as fabric_health_check,
)
from auth import get_current_user
from roles import check_permission, require_role, ROLE_DISPATCHER, ROLE_MANAGER, ROLE_ADMIN, ROLE_TECHNICIAN, ROLE_AUDITOR, ROLE_AGENT

load_dotenv()

app = FastAPI(title="L'Avenir Smart Maintenance Command Centre")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_http = httpx.Client(verify=False)
_az   = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
    http_client=_http,
)

THRESHOLDS = {
    "temperature_c":  {"base": 22.0, "warning_delta": 0.8,  "critical_abs": 24.5},
    "pressure_bar":   {"base": 2.5,  "warning_delta": 0.15, "critical_abs": 2.95},
    "vibration_mm_s": {"base": 1.2,  "warning_delta": 0.10, "critical_abs": 1.50},
    "power_kw":       {"base": 18.0, "warning_delta": 1.5,  "critical_abs": 23.0},
    "humidity_pct":   {"base": 45.0, "warning_delta": 5.0,  "critical_abs": 58.0},
}

_SESSION = {
    "anomalies":  [],
    "history":    [],
    "escalated":  [],
    "completed":  {},
    "last_scan":  None,
}

EQUIPMENT_DEPT_MAP = {
    "ewad": "MECH", "30rb": "MECH", "aquasnap": "MECH", "chiller": "MECH",
    "hermetic": "MECH", "pump": "MECH", "il ": "MECH", "wilo": "MECH",
    "grundfos": "MECH", "etanorm": "MECH",
    "msz": "HVAC", "ftkf": "HVAC", "cs-x": "HVAC", "fxv": "HVAC",
    "ls-q": "HVAC", "nc": "HVAC", "hvac": "HVAC", "panasonic": "HVAC",
    "lg": "HVAC", "daikin": "HVAC", "carrier": "HVAC", "trane": "HVAC",
    "bac": "MECH", "evapco": "MECH", "marley": "MECH",
    "motor": "ELEC", "vfd": "ELEC", "drive": "ELEC",
    "bms": "BMS", "sensor": "BMS",
}

def resolve_department_id(equipment_id: str) -> str:
    eq_lower = equipment_id.lower()
    if "_" in equipment_id:
        prefix = equipment_id.split("_")[0].upper()
        if prefix in ("HVAC", "ELEC", "MECH", "BMS"):
            return prefix
    for keyword, dept in EQUIPMENT_DEPT_MAP.items():
        if keyword in eq_lower:
            return dept
    return "MECH"

def calculate_status(row):
    for s, l in THRESHOLDS.items():
        if float(row.get(s, 0)) >= l["critical_abs"]: return "Red"
    for s, l in THRESHOLDS.items():
        if abs(float(row.get(s, 0)) - l["base"]) > l["warning_delta"]: return "Amber"
    return "Green"

def make_ticket_id(equipment_id, department):
    return "WRK-" + hashlib.sha256(
        f"{equipment_id}:{department}".encode()
    ).hexdigest()[:5].upper()

def calculate_trends(df):
    RANK = {"Red": 3, "Amber": 2, "Green": 1}
    trends = {}
    for eq_id in df["equipment_id"].unique():
        eq = df[df["equipment_id"] == eq_id].sort_values("timestamp")
        if len(eq) < 2: trends[eq_id] = "stable"; continue
        last, prev = eq.iloc[-1], eq.iloc[-2]
        lr = RANK.get(last.get("calculated_status", "Green"), 1)
        pr = RANK.get(prev.get("calculated_status", "Green"), 1)
        if lr > pr: trends[eq_id] = "up"
        elif lr < pr: trends[eq_id] = "down"
        else:
            lv, pv = float(last.get("vibration_mm_s", 0)), float(prev.get("vibration_mm_s", 0))
            trends[eq_id] = "up" if lv > pv * 1.03 else "down" if lv < pv * 0.97 else "stable"
    return trends

class TriageDecision(BaseModel):
    equipment_id:    str
    decision:        str
    escalate_reason: Optional[str] = None
    severity:        Optional[str] = "Unknown"
    department:      Optional[str] = "Unassigned"
    accepted_by:     Optional[str] = "Unknown"
    fault_type:      Optional[str] = ""
    fault_value:     Optional[float] = None
    issue_summary:   Optional[str] = ""
    building_id:     Optional[str] = ""

class ManagerDecision(BaseModel):
    equipment_id:   str
    decision:       str
    decline_reason: Optional[str] = None
    severity:       Optional[str] = "Unknown"
    department:     Optional[str] = "Unassigned"
    fault_context:  Optional[str] = ""
    decided_by:     Optional[str] = "Manager"
    fault_type:     Optional[str] = ""
    fault_value:    Optional[float] = None
    issue_summary:  Optional[str] = ""
    building_id:    Optional[str] = ""

class SOPChatMessage(BaseModel):
    role: str
    content: str

class SOPChatRequest(BaseModel):
    messages: list[SOPChatMessage]
    equipment_id: Optional[str] = ""
    fault_context: Optional[str] = ""

class ChatbotRequest(BaseModel):
    messages: list[SOPChatMessage]
    equipment_id: Optional[str] = ""
    fault_context: Optional[str] = ""
    sop_context: Optional[str] = ""

class AuditEntry(BaseModel):
    id: int
    equipment: str
    type: str
    time: str
    message: str
    ticket: Optional[dict] = None
    completedAt: Optional[str] = None
    note: Optional[str] = None
    accepted_by: Optional[str] = None

class EscalatedEntry(BaseModel):
    equipment_id: str
    severity: str
    reason: str
    time: str
    assigned_department: Optional[str] = "Unknown"
    escalated_by: Optional[str] = None

class AuditRequest(BaseModel):
    accepted: list[AuditEntry]
    escalated: list[EscalatedEntry]
    completed: list[int] = []

class HandoverRequest(BaseModel):
    accepted: list[AuditEntry]
    escalated: list[EscalatedEntry]
    completed: list[int] = []
    remaining: list[dict] = []

@app.get("/health")
async def health_check():

    try:
        import asyncio, concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            future = pool.submit(fabric_health_check)
            fabric_status = future.result(timeout=8)
    except Exception:
        fabric_status = {"fabric": "timeout", "note": "CSV fallback active"}
    return {
        "status":  "ok",
        "service": "L'Avenir Smart Maintenance API",
        "fabric":  fabric_status,
    }

@app.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    
    check_permission(user, "get_me")
    return user

@app.post("/run-predictive-scan")
async def run_scan(user: dict = Depends(get_current_user)):
    
    check_permission(user, "run_predictive_scan")
    print(f"\n─── 🔍 SCAN by {user['name']} ({user['role']}) ───")
    try:
        df      = load_sensor_data()
        df_dept = load_department_data()
        df = df.sort_values("timestamp")
        df["calculated_status"] = df.apply(calculate_status, axis=1)
        trend_map = calculate_trends(df)

        def latest_per_eq(sub, n):
            return sub.sort_values("timestamp").drop_duplicates("equipment_id", keep="last").tail(n)

        showcase = pd.concat([
            latest_per_eq(df[df["calculated_status"] == "Red"],   5),
            latest_per_eq(df[df["calculated_status"] == "Amber"], 5),
            latest_per_eq(df[df["calculated_status"] == "Green"], 4),
        ]).copy()

        showcase["department_id"] = showcase["equipment_id"].apply(resolve_department_id)
        merged = pd.merge(showcase, df_dept, on="department_id", how="left")
        merged["department_name"] = merged["department_name"].fillna("Facilities")
        merged["contact_name"]    = merged["contact_name"].fillna("On-Call Engineer")

        GPT_COLS = ["equipment_id", "building_id", "temperature_c", "pressure_bar",
                    "vibration_mm_s", "power_kw", "humidity_pct",
                    "calculated_status", "department_name", "contact_name"]
        avail    = [c for c in GPT_COLS if c in merged.columns]
        gpt_rows = merged[merged["calculated_status"].isin(["Red", "Amber"])][avail].copy()

        print(f"🤖 [AGENT 1] Sending {len(gpt_rows)} rows to GPT-4.1-mini...")
        ai_result  = run_predictive_analysis(gpt_rows.to_json(orient="records", date_format="iso"))
        status_map = {r["equipment_id"]: r["calculated_status"] for _, r in gpt_rows.iterrows()}

        for a in ai_result.get("anomalies_detected", []):
            eq = a.get("equipment_id", "")
            if status_map.get(eq) == "Red"   and a.get("severity") != "Critical": a["severity"] = "Critical"
            if status_map.get(eq) == "Amber" and a.get("severity") not in ("Critical","Warning"): a["severity"] = "Warning"
            a["trend"]      = trend_map.get(eq, "stable")
            a["confidence"] = int(a.get("confidence", 75))

        healthy_rows = []
        for _, row in merged[merged["calculated_status"] == "Green"].iterrows():
            eq_id = row["equipment_id"]
            healthy_rows.append({
                "equipment_id":        eq_id,
                "building_id":         row.get("building_id", "Unknown"),
                "severity":            "Healthy",
                "fault_type":          "None",
                "fault_value":         round(float(row["temperature_c"]), 2),
                "confidence":          100,
                "trend":               trend_map.get(eq_id, "stable"),
                "issue_summary":       f"OPTIMAL STATE: {eq_id} operating within all baseline parameters.",
                "assigned_department": row.get("department_name", "Facilities"),
                "contact_person":      row.get("contact_name", "On-Call Engineer"),
            })

        ai_result["anomalies_detected"].extend(healthy_rows)

        _SESSION["anomalies"] = ai_result["anomalies_detected"]
        _SESSION["last_scan"] = datetime.utcnow().isoformat()
        return {"status": "Success", "data": ai_result}

    except Exception as e:
        print(f"❌ SCAN ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/triage-decision")
async def process_triage(action: TriageDecision, user: dict = Depends(get_current_user)):
    
    check_permission(user, "triage_decision")
    print(f"\n📝 [TRIAGE] {action.decision} → {action.equipment_id} | by {user['name']} ({user['role']})")

    action.accepted_by = user["name"]

    if action.severity == "Healthy":
        return {
            "status": "Acknowledged", "equipment": action.equipment_id,
            "message": "Equipment healthy — no work order required.",
            "ticket": None, "notification": None,
        }

    if action.decision == "Escalate":
        if not action.escalate_reason:
            raise HTTPException(status_code=400, detail="An escalation reason is required.")
        import time
        escalated_item = {
            "equipment_id":       action.equipment_id,
            "severity":           action.severity,
            "fault_type":         "",
            "fault_value":        "",
            "assigned_department": action.department,
            "building_id":        "",
            "issue_summary":      "",
            "reason":             action.escalate_reason,
            "escalated_by":       user["name"],
            "time":               datetime.utcnow().strftime("%H:%M:%S"),
            "manager_outcome":    None,
            "ui_id":              f"{action.equipment_id}-esc-{int(time.time())}",
        }
        _SESSION["escalated"].append(escalated_item)

        _SESSION["anomalies"] = [a for a in _SESSION["anomalies"] if a.get("equipment_id") != action.equipment_id]
        return {
            "status":            "Escalated",
            "equipment":         action.equipment_id,
            "escalation_reason": action.escalate_reason,
            "escalated_by":      user["name"],
            "escalated_by_role": user["role"],
            "ticket":            None,
            "notification":      None,
        }

    if action.decision == "Accept":
        ticket = create_ticket(
            equipment_id  = action.equipment_id,
            severity      = action.severity,
            department    = action.department,
            accepted_by   = user["name"],
            fault_type    = action.fault_type or "",
            fault_value   = action.fault_value,
            issue_summary = action.issue_summary or "",
            building_id   = action.building_id or "",
        )
        import time
        log_id = int(time.time() * 1000)
        history_item = {
            "id":          log_id,
            "time":        datetime.utcnow().strftime("%H:%M:%S"),
            "equipment":   action.equipment_id,
            "type":        action.severity.lower() if action.severity else "warning",
            "message":     f"Work order dispatched to {action.department}.",
            "ticket":      ticket,
            "accepted_by": user["name"],
        }
        _SESSION["history"].append(history_item)
        _SESSION["anomalies"] = [a for a in _SESSION["anomalies"] if a.get("equipment_id") != action.equipment_id]
        return {
            "status":      "Processed",
            "equipment":   action.equipment_id,
            "ticket":      ticket,
            "log_id":      log_id,
        }

    raise HTTPException(status_code=400, detail=f"Unknown decision: {action.decision}")

@app.post("/manager-decision")
async def manager_decision(action: ManagerDecision, user: dict = Depends(get_current_user)):
    
    check_permission(user, "manager_decision")
    print(f"\n👔 [MANAGER] {action.decision} → {action.equipment_id} | by {user['name']} ({user['role']})")

    action.decided_by = user["name"]

    if action.decision == "Accept":
        ticket = create_ticket(
            equipment_id  = action.equipment_id,
            severity      = action.severity,
            department    = action.department,
            accepted_by   = f"Manager: {user['name']}",
            fault_type    = action.fault_type or "",
            fault_value   = action.fault_value,
            issue_summary = action.issue_summary or "",
            building_id   = action.building_id or "",
        )
        import time
        log_id = int(time.time() * 1000)
        history_item = {
            "id":          log_id,
            "time":        datetime.utcnow().strftime("%H:%M:%S"),
            "equipment":   action.equipment_id,
            "type":        action.severity.lower() if action.severity else "warning",
            "message":     f"Manager-approved response dispatched to {action.department}.",
            "ticket":      ticket,
            "accepted_by": f"Manager: {user['name']}",
        }
        _SESSION["history"].append(history_item)
        for item in _SESSION["escalated"]:
            if item.get("equipment_id") == action.equipment_id and item.get("manager_outcome") is None:
                item["manager_outcome"] = "accepted"
                item["manager_ticket"]  = ticket.get("ticket_id")
                item["decided_by"]      = user["name"]
                break
        return {
            "status":          "Accepted by Manager",
            "equipment":       action.equipment_id,
            "decided_by":      user["name"],
            "decided_by_role": user["role"],
            "ticket":          ticket,
            "log_id":          log_id,
        }

    if action.decision == "Decline":
        if not action.decline_reason:
            raise HTTPException(status_code=400, detail="A decline reason is required.")

        for item in _SESSION["escalated"]:
            if item.get("equipment_id") == action.equipment_id and item.get("manager_outcome") is None:
                item["manager_outcome"]    = "declined"
                item["decided_by"]         = user["name"]
                item["decline_reason"]     = action.decline_reason
                break

        returned = {
            "equipment_id":        action.equipment_id,
            "severity":            action.severity or "Warning",
            "fault_type":          "Returned",
            "fault_value":         "N/A",
            "confidence":          75,
            "trend":               "stable",
            "issue_summary":       f'↩ Returned by manager: "{action.decline_reason}"',
            "assigned_department": action.department or "Unassigned",
            "contact_person":      "On-Call Engineer",
            "building_id":         "",
            "ui_id":               f"{action.equipment_id}-returned",
        }
        _SESSION["anomalies"].append(returned)
        return {
            "status":          "Declined by Manager",
            "equipment":       action.equipment_id,
            "decided_by":      user["name"],
            "decided_by_role": user["role"],
            "decline_reason":  action.decline_reason,
            "ticket":          None,
            "notification":    None,
        }

    raise HTTPException(status_code=400, detail=f"Unknown decision: {action.decision}")

@app.post("/sop-chat")
async def sop_chat(request: SOPChatRequest, user: dict = Depends(get_current_user)):
    
    check_permission(user, "sop_chat")
    try:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
        reply    = run_sop_chat(messages=messages, equipment_id=request.equipment_id or "",
                                fault_context=request.fault_context or "")
        return {"status": "ok", "reply": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/agent3-retrieve")
async def agent3_retrieve(request: SOPChatRequest, user: dict = Depends(get_current_user)):
    
    check_permission(user, "agent3_retrieve")
    try:
        latest = next((m.content for m in reversed(request.messages) if m.role == "user"), "")
        chunks = knowledge_base.retrieve(query=latest, equipment_id=request.equipment_id or "")
        return {"status": "ok", "sop_context": chunks, "word_count": len(chunks.split())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/agent4-chat")
async def agent4_chat(request: ChatbotRequest, user: dict = Depends(get_current_user)):
    
    check_permission(user, "agent4_chat")
    try:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
        result   = run_chatbot(messages=messages, equipment_id=request.equipment_id or "",
                               fault_context=request.fault_context or "",
                               sop_context=request.sop_context or "")
        return {"status": "ok", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-audit")
async def generate_audit(request: AuditRequest, user: dict = Depends(get_current_user)):
    
    check_permission(user, "generate_audit")
    print(f"\n📋 [AGENT 5 — AUDIT] requested by {user['name']} ({user['role']})")
    try:
        register = build_audit_register(
            accepted  = [a.dict() for a in request.accepted],
            escalated = [e.dict() for e in request.escalated],
            completed = request.completed,
        )
        for record in register.get("records", []):
            write_audit_record(record)
        return {"status": "ok", "register": register}
    except Exception as e:
        print(f"❌ [AGENT 5] {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-handover")
async def generate_handover(request: HandoverRequest, user: dict = Depends(get_current_user)):
    
    check_permission(user, "generate_handover")
    print(f"\n📋 [HANDOVER] by {user['name']} ({user['role']})")
    try:
        completed_set = set(request.completed)
        resolved    = [a for a in request.accepted if a.id in completed_set]
        in_progress = [a for a in request.accepted if a.id not in completed_set]
        context = {
            "shift_stats": {
                "total_accepted":      len(request.accepted),
                "resolved":            len(resolved),
                "in_progress":         len(in_progress),
                "escalated":           len(request.escalated),
                "remaining_in_kanban": len(request.remaining),
            },
            "resolved_items": [
                {"equipment": a.equipment,
                 "ticket": a.ticket.get("ticket_id") if a.ticket else None,
                 "completed_at": a.completedAt,
                 "technician_note": a.note,
                 "accepted_by": a.accepted_by}
                for a in resolved
            ],
            "active_work_orders": [
                {"equipment": a.equipment,
                 "ticket": a.ticket.get("ticket_id") if a.ticket else None,
                 "type": a.type, "dispatched": a.time,
                 "accepted_by": a.accepted_by}
                for a in in_progress
            ],
            "escalations": [
                {"equipment": e.equipment_id, "severity": e.severity,
                 "reason": e.reason, "escalated_by": e.escalated_by}
                for e in request.escalated
            ],
            "remaining_anomalies": request.remaining,
        }
        prompt = (
            "You are a shift handover assistant. Given shift data, write a concise handover report with 4 sections: "
            "SHIFT SUMMARY / RESOLVED THIS SHIFT / ACTIVE WORK ORDERS / ESCALATIONS PENDING / WATCH LIST FOR NEXT SHIFT. "
            "Under 200 words. Second person for watch list. Include who accepted each ticket where available."
        )
        resp = _az.chat.completions.create(
            model=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME"), max_tokens=350,
            messages=[{"role":"system","content":prompt},
                      {"role":"user","content":json.dumps(context,indent=2)}],
        )
        return {"status": "ok", "handover": resp.choices[0].message.content}
    except Exception as e:
        print(f"❌ [HANDOVER] {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/session-state")
async def get_session_state(request: Request):
    
    return {
        "anomalies":  _SESSION["anomalies"],
        "history":    _SESSION["history"],
        "escalated":  _SESSION["escalated"],
        "completed":  _SESSION["completed"],
        "last_scan":  _SESSION["last_scan"],
    }

@app.post("/session-state/complete")
async def mark_job_complete(payload: dict, request: Request):
    
    log_id  = str(payload.get("log_id", ""))
    done_at = payload.get("completed_at", datetime.utcnow().strftime("%H:%M:%S"))
    if log_id:
        _SESSION["completed"][log_id] = done_at
    return {"status": "ok"}

@app.post("/session-state/clear")
async def clear_session(user: dict = Depends(get_current_user)):
    
    if user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Admin or Manager role required")
    _SESSION["anomalies"]  = []
    _SESSION["history"]    = []
    _SESSION["escalated"]  = []
    _SESSION["completed"]  = {}
    _SESSION["last_scan"]  = None
    print(f"🔄 [SESSION] Cleared by {user['name']}")
    return {"status": "cleared"}

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

API_PREFIXES = (
    "health", "me", "run-", "triage-", "manager-",
    "sop-", "agent", "generate-", "session-",
)

if os.path.exists(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):

        if full_path.startswith(API_PREFIXES):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        index = os.path.join(STATIC_DIR, "index.html")
        if os.path.exists(index):
            return FileResponse(index, media_type="text/html")
        raise HTTPException(status_code=404, detail="Frontend not built")