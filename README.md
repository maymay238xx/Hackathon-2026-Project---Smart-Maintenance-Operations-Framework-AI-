
<img width="100" alt="L'Avenir Logo" src="https://github.com/user-attachments/assets/026a7ffa-88a0-4753-ab4d-57c75e774af8" />

# L'Avenir – Smart Maintenance Operational Framework (SMOF)
### 🚀 Azure Hackathon Project

An AI-driven, cloud-native predictive maintenance platform built on Microsoft Azure that transforms maintenance operations from a reactive "check and fix" model into a predictive, human-in-the-loop, audit-ready workflow.

---

## Project Notes 🗒️ ‼️

- Sensor telemetry data is **synthetic** — generated programmatically for demonstration and testing purposes.
- **_This project was built as a hackathon submission and demonstrates a production-grade agentic architecture: multi-agent AI orchestration, role-based access control enforced at the API layer, a Microsoft Fabric data backend with graceful CSV fallback, and a structured prompt engineering pattern with JSON recovery logic._**
- This project demonstrates: **multi-agent AI orchestration** with Azure OpenAI, **structured prompt engineering** (enforced JSON output with regex truncation recovery), **sensor threshold engineering** and traffic-light anomaly classification, **RBAC** via FastAPI + Microsoft Entra ID, **Microsoft Fabric Lakehouse integration** (SQL Analytics Endpoint via `pyodbc` with service principal auth), **RAG-based SOP retrieval**, and a **React + MSAL** triage dashboard frontend.

---

## Architecture Overview

SMOF operates across two phases with a human-in-the-loop at each decision point:

**Phase 1 — Detect & Triage**
Sensor telemetry is continuously monitored. When anomalies are flagged, a dispatcher reviews the alert; complex cases escalate to a manager. Once approved, a work ticket is generated.

**Phase 2 — Guide & Audit**
An engineer receives step-by-step guidance drawn from relevant SOPs via RAG. On completion, an audit register is auto-generated and written back to Fabric for compliance review.

---

## Agent Pipeline 🤖

| Agent | Role |
|-------|------|
| **Agent 1 — Predictive Monitor** | Analyses sensor telemetry rows, classifies fault type and severity (Critical/Warning), scores confidence 0–100, produces a one-sentence issue summary |
| **Agent 2 — Ticketing** | Generates ServiceNow-style work orders from approved anomalies: deterministic ticket ID, priority mapping, AI-written short description and description, category inference, and urgency note |
| **Agent 3 — SOP Retrieval & Guidance** | Loads equipment manuals as PDFs, chunks them with overlap, routes retrieval by equipment category (pump, HVAC, chiller, motor, drive), scores chunks via keyword matching, and delivers mobile-optimised step-by-step guidance grounded strictly in retrieved SOP content |
| **Agent 4 — SOP Chat** | Provides interactive, step-by-step maintenance guidance to engineers via chatbot |
| **Audit Agent** | Consolidates maintenance logs and generates a structured audit register |

---

## Key Components

### Sensor Threshold Engineering (`Hackathon_Notebook.ipynb`)
Synthetic time-series telemetry is generated across 5 sensor types (temperature, pressure, vibration, power consumption, humidity) at 5-minute intervals over a 7-day window. A traffic-light classification function computes per-sensor deviation from baseline and assigns Green / Yellow / Red status. A unified `is_anomaly` flag is derived by checking whether any sensor fires Yellow or Red, then the enriched dataset is exported to the Microsoft Fabric Lakehouse.

### Predictive Agent (`predictive_agent.py`)
Calls Azure OpenAI with a tightly engineered system prompt that enforces non-negotiable severity rules — `calculated_status: "Red"` maps to `"Critical"` with zero exceptions. The agent returns structured JSON covering fault type, fault value, confidence score, issue summary, and routing metadata. Truncated JSON responses are handled with a regex-based partial recovery fallback before raising an error.

### Ticketing Agent (`agent2_ticketing.py`)
Triggered after a human dispatcher approves an anomaly. Generates a deterministic ticket ID via MD5 hash of equipment ID, department, and UTC hour — ensuring idempotency within the same dispatch window. Severity is mapped to a ServiceNow-style priority (`Critical → P1 - Urgent`, `Warning → P2 - High`). Azure OpenAI is prompted to produce a structured work order (short description capped at 12 words, 3–4 sentence operational description, fault category, and a timed urgency note). If the GPT call fails, a fully formed fallback ticket is assembled locally from deterministic fields and keyword-based department-to-category inference — the API never returns an error to the caller.

### RAG / SOP Agent (`rag_agent.py`)
Implements a custom retrieval pipeline without a vector database. PDFs are loaded from the `manuals/` directory using `PyMuPDF` (`fitz`) and chunked into 400-word windows with 80-word overlap to preserve context across boundaries. Each PDF is categorised by filename fragment matching into one of six equipment types (pump, HVAC, chiller, cooling tower, motor, drive), and chunks are indexed by category. At query time, the best-fit category is selected by scoring the query against each category's keyword list, with an additional +3.0 boost if the equipment ID directly matches category fragments. The top-k chunks are then scored by word overlap with the query and passed to Azure OpenAI as context. The system prompt enforces strict SOP grounding — the agent must not invent steps, must quote exact threshold values, must use numbered steps for action sequences, and must cap responses at 200 words for field engineers on mobile. If the relevant SOP does not cover the question, it returns a fixed escalation message rather than hallucinating an answer. Every completed job ends with a mandatory D365 evidence logging reminder.

### FastAPI Backend (`main.py`)
Full REST API with 12+ endpoints covering the entire workflow. Sensor data is loaded, threshold-classified, and trend-calculated (comparing current vs previous reading rank per equipment) before being sent to Agent 1. The scan endpoint selects the latest reading per equipment across status buckets, merges with department contact data, and injects Healthy rows deterministically without involving the AI. A keyword-based `EQUIPMENT_DEPT_MAP` resolves equipment IDs to department codes when the department isn't explicit. Session state is held in an in-memory `_SESSION` dict shared across requests — acting as a lightweight shift-scoped state store for anomalies, work order history, escalations, completions, and the last scan timestamp. Manager-declined anomalies are re-injected into the Kanban with a prefixed explanation. The built React SPA is served statically from `/static`, with API prefix detection to avoid SPA routing conflicts.

### Fabric Data Client (`fabric_client.py`)
Connects to the Microsoft Fabric SQL Analytics Endpoint using `pyodbc` with `ActiveDirectoryServicePrincipal` auth — no interactive login. Provides a graceful CSV fallback for local development and demo environments when Fabric credentials are absent. Also handles audit log writes (DDL + DML with `IF NOT EXISTS` table creation), multi-source sensor data deduplication, and PDF SOP downloads from the Fabric Lakehouse via `azure-storage-file-datalake` / OneLake.

### Role-Based Access Control (`roles.py`)
Endpoint-level permissions enforced via a FastAPI dependency. Five human roles (dispatcher, manager, engineer, auditor, admin) and one agent role (`agent.call`), each mapped to a precise set of permitted endpoints. Agent service principals are additionally validated against a registry of known client IDs loaded from environment variables, preventing spoofed agent calls.

### Multi-Role React Frontend (`App.jsx`)
React 19 SPA authenticating via Microsoft Entra ID with `acquireTokenSilent` — the role is extracted directly from JWT token claims and used to route the user into their specific view at login. Each role sees an entirely different interface: dispatchers and managers get the Kanban triage board; engineers land directly in the Engineer Workbench; auditors see only the Audit dashboard. The Kanban board renders three columns (Optimal / Warning / Critical) with skeleton loading cards during scans, animated KPI counters, and per-anomaly confidence bars. The Engineer Workbench implements a three-stage job flow (Accept → In Progress → Complete), with file upload for evidence attachment and an inline SOP chat panel per ticket. The Audit dashboard includes five automated compliance checks, a DonutChart compliance score with cubic-bezier animation, sortable records table, AI narrative, and CSV export. A Shift Handover view generates an AI-written structured report (under 200 words). Session state is polled every 30 seconds so engineers see new tickets without refreshing. Managers can clear the session to reset the Kanban for a new shift.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI / Agents | Azure OpenAI (GPT-4.1), AI Foundry |
| Data Platform | Microsoft Fabric (Lakehouse, SQL Analytics Endpoint) |
| Backend API | FastAPI, Python, `pyodbc`, `pandas` |
| Authentication | Microsoft Entra ID, MSAL, `python-jose` |
| Frontend | React 19, Vite, `@azure/msal-react` |
| Storage | Azure Blob Storage, Azure Data Lake Storage (OneLake) |
| RAG | Azure AI Search / Fabric Files (PDF SOPs) |

---

## How to Run 🛠️

### Backend

```bash
pip install -r requirements.txt
```

Configure a `.env` file with:

```
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_API_VERSION=
AZURE_OPENAI_DEPLOYMENT_NAME=
FABRIC_SQL_ENDPOINT=
FABRIC_DATABASE=
FABRIC_WORKSPACE_ID=
FABRIC_TENANT_ID=
FABRIC_CLIENT_ID=
FABRIC_CLIENT_SECRET=
```

> If Fabric credentials are not set, the system automatically falls back to local CSV files — no code changes required.

### Frontend

```bash
npm install
npm run dev
```

Set `VITE_ENTRA_CLIENT_ID` and `VITE_ENTRA_TENANT_ID` in your environment before running.

---

## Projected Impact (from Business Case) 🎯

| KPI | Target |
|-----|--------|
| Reduction in unplanned downtime | 45–75% |
| Maintenance cycle time | 40–60% faster |
| Engineer productivity | 30–50% increase |
| Predictive health accuracy | 80–95% |
| Implementation break-even (cost savings) | ~3 years 5 months |
