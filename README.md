# Ada — AI Incident Commander & Developer Advocate

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Python](https://img.shields.io/badge/python-%3E%3D3.10-blue)](https://www.python.org/)
[![Bun](https://img.shields.io/badge/bun-latest-black)](https://bun.sh/)

**Ada** is an AI Incident Commander and Developer Advocate powered by [Agora Conversational AI](https://www.agora.io/en/products/conversational-ai/).

She investigates production incidents through voice, reasons over evidence, manages the full incident lifecycle, uses real incident-management tools via MCP, and requires human authorization before executing high-risk remediations.

---

## Architecture

```
┌──────────────────────────┐
│   Next.js Frontend :3000 │   Web UI, voice client, incident dashboard
└────────────┬─────────────┘
             │  /api/* proxy
┌────────────▼─────────────┐
│ Python Agora Agent :8000 │   FastAPI — token generation, agent lifecycle
└────────────┬─────────────┘
             │
┌────────────▼─────────────┐
│  Agora Conversational AI │   Cloud — RTC/RTM, managed STT/LLM/TTS
└────────────┬─────────────┘
             │
┌────────────▼─────────────┐
│    Ada  (GPT-4o-mini)    │   Agent persona with incident-commander prompt
└────────────┬─────────────┘
             │ MCP (tool calls)
┌────────────▼─────────────┐
│ FastMCP Incident Server  │   :9000 — incident + service-health state
│    (source of truth)     │
└──────────────────────────┘
```

The **FastMCP Incident Server** (`server/src/mcp_server.py`) is the single source of truth for all incident data and service-health state. Ada interacts with it exclusively through MCP tool calls. The web dashboard reads from the same server over REST endpoints.

### Repo Map

| Path | Description |
| --- | --- |
| `web/` | Next.js 16 + React 19 + TypeScript frontend |
| `server/` | Python FastAPI backend + Agora Agent SDK integration |
| `server/src/agent.py` | Ada agent configuration, prompt, and MCP connection |
| `server/src/mcp_server.py` | FastMCP incident-management server (tools + REST API) |
| `server/src/server.py` | FastAPI routes — `/get_config`, `/startAgent`, `/stopAgent` |
| `ARCHITECTURE.md` | System-level flow and ownership boundaries |
| `AGENTS.md` | Contributor agent instructions |

---

## Current Features

### Voice & Conversational AI
- Real-time voice interaction via Agora Conversational AI (Deepgram STT → GPT-4o-mini → MiniMax TTS)
- Live transcript UI and agent visualizer ([Agent UIKit](https://agoraio-conversational-ai.github.io/agent-uikit/))

### Incident Management (via MCP tools)
- **Service health monitoring** — check individual or all services for status, error rate, and latency
- **Incident creation** with server-side duplicate prevention
- **Incident lifecycle** — `investigating` → `identified` → `monitoring` → `resolved`
- **Incident facts** — confirmed findings with confidence level (high/medium/low) and evidence source
- **Incident hypotheses** — unverified theories that can be confirmed or rejected as evidence arrives
- **Investigation notes** and **chronological timeline**
- **Incident summary** — concise operational view of any incident

### Human-in-the-Loop
- **Critical action requests** — Ada requests human authorization for high-risk remediations (e.g., database failover, cache flush, service restart)
- **Pending action approval/rejection** — humans approve or reject via the dashboard; Ada continues accordingly
- **Human confirmation modal** in the web UI

### Reporting
- **Post-mortem generation** — deterministic Markdown report from confirmed incident data (MCP tool + REST endpoint)
- **Post-mortem modal** in the web UI

### Dashboard
- **Real-time incident dashboard** — all incidents, service health, facts, hypotheses, pending actions, and timeline
- Service health panel with status, error rate, and latency
- Incident detail view with full timeline and action history

---

## How to Run Locally

### Prerequisites

- [Python 3.10+](https://www.python.org/)
- [Bun](https://bun.sh/)
- [Agora CLI](https://github.com/AgoraIO/cli) (for credential setup)

### 1. Clone the repository

```bash
git clone https://github.com/princenayakpara/agora-prince.git
cd agora-prince
```

### 2. Set up environment variables

Copy the example env file and fill in your credentials (see [Environment Variables](#environment-variables)):

```bash
cp server/.env.example server/.env
# Edit server/.env with your Agora credentials
```

### 3. Start the MCP Incident Server (port 9000)

```bash
cd server
python -m venv venv
# Windows
venv\Scripts\activate
# macOS / Linux
# source venv/bin/activate

pip install -r requirements.txt
pip install fastmcp

uvicorn src.mcp_server:app --host 0.0.0.0 --port 9000
```

### 4. Start the Agent Backend (port 8000)

In a **second terminal**:

```bash
cd server
# Activate the same venv
venv\Scripts\activate

uvicorn src.server:app --host 0.0.0.0 --port 8000
```

### 5. Start the Next.js Frontend (port 3000)

In a **third terminal** (from the project root):

```bash
cd web
bun install
bun run dev
```

### 6. Open the app

Navigate to [http://localhost:3000](http://localhost:3000) and click **Start conversation** to talk to Ada.

### Quick Start (alternative)

If you have the Agora CLI configured, you can use the one-command setup:

```bash
agora login
agora project use <your-project>
bun run setup
agora quickstart env write .
bun run dev
```

### Ports

| Service | Port | URL |
| --- | :---: | --- |
| Next.js Frontend | 3000 | `http://localhost:3000` |
| Agent Backend (FastAPI) | 8000 | `http://localhost:8000` |
| MCP Incident Server | 9000 | `http://localhost:9000` |
| API Docs (Agent Backend) | 8000 | `http://localhost:8000/docs` |
| MCP Health Check | 9000 | `http://localhost:9000/health` |

---

## Environment Variables

Primary env file: `server/.env` (copied from [`server/.env.example`](server/.env.example)).

| Variable | Required | Default | Description |
| --- | :---: | :---: | --- |
| `AGORA_APP_ID` | ✅ | — | Agora Console → Project → App ID |
| `AGORA_APP_CERTIFICATE` | ✅ | — | Agora Console → Project → App Certificate |
| `PORT` | | `8000` | FastAPI agent backend port |
| `MCP_SERVER_URL` | | `http://localhost:9000/mcp` | URL of the FastMCP incident server |
| `AGENT_BACKEND_URL` | (deploy) | `http://localhost:8000` | Set in deployed `web` to proxy to external FastAPI |

Example `server/.env`:

```env
AGORA_APP_ID=your_agora_app_id_here
AGORA_APP_CERTIFICATE=your_agora_app_certificate_here
PORT=8000
MCP_SERVER_URL=http://localhost:9000/mcp
```

> **⚠️ Never commit real API keys, credentials, or secrets to the repository.** The `.gitignore` already excludes `.env` files.

> **Default vs BYOK** — This project defaults to Agora-managed STT + LLM + TTS. Enable BYOK by uncommenting provider blocks in `server/src/agent.py` and adding matching keys (e.g., `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`).

---

## Demo Flow

Here is a typical incident-response session with Ada:

1. **User reports a problem** — _"Ada, our API is returning 500 errors and response times are through the roof."_

2. **Ada checks service health** — calls `get_service_health("api")` and discovers the API service is degraded (8.4% error rate, 1.8s latency).

3. **Ada checks active incidents** — calls `get_active_incidents()` to see if this problem is already tracked.

4. **Ada records confirmed facts** — calls `add_incident_fact()` with the metrics returned by the health check (confidence: high, evidence: service health monitor).

5. **Ada creates hypotheses** — calls `add_incident_hypothesis()` with a working theory (e.g., _"Upstream dependency timeout causing cascading failures"_).

6. **Ada creates the incident** — calls `create_incident()` with title, severity, affected service, and impact. Server-side duplicate prevention ensures no duplicates.

7. **Ada evaluates evidence** — confirms or rejects hypotheses with `verify_hypothesis()` as new information arrives.

8. **Ada requests human authorization** — if a high-risk remediation is needed (e.g., database failover), Ada calls `request_critical_action()`. She does **not** execute it autonomously.

9. **Human approves or rejects** — the operator uses the incident dashboard to approve or reject the pending action.

10. **Ada continues the lifecycle** — updates the incident status through `investigating` → `identified` → `monitoring` → `resolved` as the situation evolves.

11. **Post-mortem** — once resolved, Ada generates a full post-mortem report with `generate_incident_postmortem()`, including facts, hypotheses, actions, and timeline.

---

## How It Works (Agora Integration)

1. Browser requests connection config from `/api/get_config`.
2. Backend generates combined RTC+RTM config and returns channel + token.
3. Browser joins RTC/RTM and starts streaming audio.
4. Browser calls `/api/startAgent`; backend starts the cloud agent session.
5. Browser receives transcript and state updates over RTM; `/api/stopAgent` ends the session.
6. Ada (the LLM agent) uses MCP tool calls to interact with the incident server on port 9000.

---

## Commands

```bash
# Dev
bun run setup
bun run dev

# Quality
bun run doctor
bun run doctor:local
bun run verify:backend

# CI / pre-ship
bun run verify:web
bun run verify:local
bun run verify
```

Run `bun run verify` before shipping web-only changes, and `bun run verify:local` when backend behavior changed.

---

## Team Development

- **`main`** is the current shared baseline — always keep it working.
- Create **feature branches** for your work (e.g., `feature/dashboard-improvements`).
- **Do not commit `.env` files or secrets.** The `.gitignore` already excludes them.
- **Pull and rebase** before starting major work: `git pull --rebase origin main`.
- Use **pull requests** for all changes to `main`.
- Communicate with the team if your changes affect shared files (`agent.py`, `mcp_server.py`, dashboard components).

---

## Deploy

Deploy `web/` as a Next.js app and `server/` as a reachable Python service.

Browser-facing `/api/*` routes in Next proxy to FastAPI via:

```bash
AGENT_BACKEND_URL=https://your-python-backend.example.com
```

Set backend env values:

```bash
AGORA_APP_ID=your_agora_app_id
AGORA_APP_CERTIFICATE=your_agora_app_certificate
```

To export local env values from the Agora CLI-bound project:

```bash
agora project use <your-project>
agora quickstart env write .
rg "^(AGORA_APP_ID|AGORA_APP_CERTIFICATE)=" server/.env
```

---

## Troubleshooting

- **Agent does not join or transcripts are missing:** run `agora project doctor --deep`.
- **Missing credentials:** run `agora quickstart env write .`.
- **Auth errors from backend:** confirm `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` are set in `server/.env`.
- **Frontend cannot reach backend:** confirm `AGENT_BACKEND_URL=http://localhost:8000` in local frontend scripts.
- **MCP server not reachable:** confirm the incident server is running on port 9000 and `MCP_SERVER_URL` is correct.
- **Dashboard shows no incidents:** incidents are held in memory; they reset when the MCP server restarts.

---

## More Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [AGENTS.md](./AGENTS.md)
- [docs/ai/L1/02_architecture.md](./docs/ai/L1/02_architecture.md) — full-stack topology and lifecycle
- [docs/ai/L1/03_code_map.md](./docs/ai/L1/03_code_map.md) — curated `web/` + `server/` file map

---

## Hackathon Goal

This project demonstrates an AI agent that can **investigate production incidents**, **reason over evidence** (facts vs. hypotheses), **use real tools** (service health, incident management), **request human authorization** for risky actions, and **communicate through natural voice** — all powered by Agora Conversational AI and the Model Context Protocol.

---

## License

Released under the [MIT License](./LICENSE).
