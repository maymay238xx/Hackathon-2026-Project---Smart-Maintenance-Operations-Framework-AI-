
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

## Agent Pipeline

| Agent | Role |
|-------|------|
| **Agent 1 — Predictive Monitor** | Analyses sensor telemetry rows, classifies fault type and severity (Critical/Warning), scores confidence 0–100, produces a one-sentence issue summary |
| **Agent 3 — SOP Retrieval** | Retrieves relevant Standard Operating Procedures from the Lakehouse using RAG |
| **Agent 4 — SOP Chat** | Provides interactive, step-by-step maintenance guidance to engineers via chatbot |
| **Audit Agent** | Consolidates maintenance logs and generates a structured audit register |

---

## Key Components

### Sensor Threshold Engineering (`Hackathon_Notebook.ipynb`)
Synthetic time-series telemetry is generated across 5 sensor types (temperature, pressure, vibration, power consumption, humidity) at 5-minute intervals over a 7-day window. A traffic-light classification function computes per-sensor deviation from baseline and assigns Green / Yellow / Red status. A unified `is_anomaly` flag is derived by checking whether any sensor fires Yellow or Red, then the enriched dataset is exported to the Microsoft Fabric Lakehouse.

### Predictive Agent (`predictive_agent.py`)
Calls Azure OpenAI with a tightly engineered system prompt that enforces non-negotiable severity rules — `calculated_status: "Red"` maps to `"Critical"` with zero exceptions. The agent returns structured JSON covering fault type, fault value, confidence score, issue summary, and routing metadata. Truncated JSON responses are handled with a regex-based partial recovery fallback before raising an error.

### Fabric Data Client (`fabric_client.py`)
Connects to the Microsoft Fabric SQL Analytics Endpoint using `pyodbc` with `ActiveDirectoryServicePrincipal` auth — no interactive login. Provides a graceful CSV fallback for local development and demo environments when Fabric credentials are absent. Also handles audit log writes (DDL + DML with `IF NOT EXISTS` table creation), multi-source sensor data deduplication, and PDF SOP downloads from the Fabric Lakehouse via `azure-storage-file-datalake` / OneLake.

### Role-Based Access Control (`roles.py`)
Endpoint-level permissions enforced via a FastAPI dependency. Five human roles (dispatcher, manager, engineer, auditor, admin) and one agent role (`agent.call`), each mapped to a precise set of permitted endpoints. Agent service principals are additionally validated against a registry of known client IDs loaded from environment variables, preventing spoofed agent calls.

### Triage Dashboard (React + Vite)
React 19 frontend authenticating via Microsoft Entra ID using `@azure/msal-browser` and `@azure/msal-react`. Provides the dispatcher and manager UI for reviewing flagged anomalies, approving or escalating tickets, and monitoring session state.

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

## How to Run

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

Set `VITE_ENTRA_CLIENT_ID` in your environment before running.

---

## Projected Impact (from Business Case)

| KPI | Target |
|-----|--------|
| Reduction in unplanned downtime | 45–75% |
| Maintenance cycle time | 40–60% faster |
| Engineer productivity | 30–50% increase |
| Predictive health accuracy | 80–95% |
| Implementation break-even (cost savings) | ~3 years 5 months |
