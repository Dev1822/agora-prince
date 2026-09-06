from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastmcp import FastMCP
from pydantic import BaseModel


mcp = FastMCP("incident-tools")


# ---------------------------------------------------------------------------
# Demo state
# ---------------------------------------------------------------------------

services: Dict[str, Dict[str, Any]] = {
    "api": {
        "status": "degraded",
        "error_rate": "8.4%",
        "latency": "1.8s",
        "description": "Core API service",
    },
    "web": {
        "status": "healthy",
        "error_rate": "0.2%",
        "latency": "180ms",
        "description": "Web application",
    },
    "database": {
        "status": "healthy",
        "error_rate": "0.1%",
        "latency": "35ms",
        "description": "Primary database",
    },
}

incidents: Dict[str, Dict[str, Any]] = {}


def now() -> str:
    """Return the current UTC timestamp."""
    return datetime.now(timezone.utc).isoformat()


def active_incident_status(status: str) -> bool:
    return status in {
        "investigating",
        "identified",
        "monitoring",
    }


def create_timeline_event(
    event_type: str,
    details: str,
    category: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a standardized, categorized timeline event."""
    if not timestamp:
        timestamp = now()

    # Determine canonical category
    if not category:
        if event_type in {"incident_created", "status_changed"}:
            category = "lifecycle"
        elif event_type in {"fact_recorded"}:
            category = "fact"
        elif event_type in {"hypothesis_recorded", "hypothesis_confirmed", "hypothesis_rejected"}:
            category = "hypothesis"
        elif event_type in {"action_requested", "action_approved", "action_rejected"}:
            category = "authorization"
        elif event_type in {"action_completed", "action_executed"}:
            category = "action"
        elif event_type in {"note_added", "investigation_note"}:
            category = "note"
        else:
            category = "lifecycle"

    return {
        "timestamp": timestamp,
        "event": event_type,
        "category": category,
        "details": details,
        "metadata": metadata or {},
    }


# ---------------------------------------------------------------------------
# Service health
# ---------------------------------------------------------------------------

@mcp.tool()
def get_active_incidents() -> Dict[str, Any]:
    """Get all currently active incidents."""
    active = [
        incident
        for incident in incidents.values()
        if active_incident_status(incident["status"])
    ]

    return {
        "success": True,
        "count": len(active),
        "incidents": active,
    }


@mcp.tool()
def get_all_service_health() -> Dict[str, Any]:
    """Get the current health of all monitored services."""
    degraded = [
        name
        for name, health in services.items()
        if health["status"] != "healthy"
    ]

    return {
        "success": True,
        "overall_status": "degraded" if degraded else "healthy",
        "degraded_services": degraded,
        "services": services,
    }


@mcp.tool()
def get_service_health(service: str) -> Dict[str, Any]:
    """Check the current health of a specific service."""
    service = service.lower().strip()

    if service not in services:
        return {
            "success": False,
            "error": f"Unknown service: {service}",
            "available_services": list(services.keys()),
        }

    return {
        "success": True,
        "service": service,
        **services[service],
    }


# ---------------------------------------------------------------------------
# Incident lookup
# ---------------------------------------------------------------------------

@mcp.tool()
def get_incident_status(incident_id: str) -> Dict[str, Any]:
    """Get the current status and timeline of a specific incident."""
    incident_id = incident_id.strip()

    if incident_id not in incidents:
        return {
            "success": False,
            "error": f"Incident not found: {incident_id}",
        }

    return {
        "success": True,
        "incident": incidents[incident_id],
    }


@mcp.tool()
def get_incident_summary(incident_id: str) -> Dict[str, Any]:
    """Return a concise operational summary for an incident."""
    incident_id = incident_id.strip()

    if incident_id not in incidents:
        return {
            "success": False,
            "error": f"Incident not found: {incident_id}",
        }

    incident = incidents[incident_id]

    return {
        "success": True,
        "summary": {
            "id": incident["id"],
            "title": incident["title"],
            "service": incident["service"],
            "severity": incident["severity"],
            "status": incident["status"],
            "impact": incident["impact"],
            "root_cause": incident["root_cause"],
            "created_at": incident["created_at"],
            "updated_at": incident["updated_at"],
            "facts": incident.get("facts", []),
            "hypotheses": incident.get("hypotheses", []),
            "pending_actions": incident.get("pending_actions", []),
            "timeline_events": len(incident["timeline"]),
            "notes": len(incident["notes"]),
        },
    }


# ---------------------------------------------------------------------------
# Incident creation
# ---------------------------------------------------------------------------

@mcp.tool()
def create_incident(
    title: str,
    severity: str,
    service: Optional[str] = None,
    impact: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create a new incident.

    Before creating an incident, the agent should check active incidents
    to avoid duplicates.
    """
    title = title.strip()
    severity = severity.lower().strip()

    allowed_severities = {
        "low",
        "medium",
        "high",
        "critical",
    }

    if severity not in allowed_severities:
        return {
            "success": False,
            "error": "Invalid severity.",
            "allowed_severities": sorted(allowed_severities),
        }

    if not title:
        return {
            "success": False,
            "error": "Incident title cannot be empty.",
        }

    normalized_service = None

    if service:
        normalized_service = service.lower().strip()

        if normalized_service not in services:
            return {
                "success": False,
                "error": f"Unknown service: {normalized_service}",
                "available_services": list(services.keys()),
            }

    # Server-side duplicate protection.
    for existing in incidents.values():
        if not active_incident_status(existing["status"]):
            continue

        same_title = existing["title"].lower() == title.lower()
        same_service = existing["service"] == normalized_service

        if same_title and same_service:
            return {
                "success": False,
                "duplicate": True,
                "message": "A matching active incident already exists.",
                "incident": existing,
            }

    incident_id = f"INC-{uuid4().hex[:6].upper()}"
    timestamp = now()

    sev_display = severity.upper()
    initial_event = create_timeline_event(
        event_type="incident_created",
        category="lifecycle",
        details=f"Incident {incident_id} created ({sev_display}) - {title}",
        metadata={
            "incident_id": incident_id,
            "title": title,
            "severity": severity,
            "service": normalized_service,
        },
        timestamp=timestamp,
    )

    incident = {
        "id": incident_id,
        "title": title,
        "service": normalized_service,
        "severity": severity,
        "status": "investigating",
        "impact": impact.strip() if impact else "Impact not yet confirmed.",
        "root_cause": None,
        "created_at": timestamp,
        "updated_at": timestamp,
        "facts": [],
        "hypotheses": [],
        "pending_actions": [],
        "notes": [],
        "timeline": [initial_event],
    }

    incidents[incident_id] = incident

    return {
        "success": True,
        "message": "Incident created successfully.",
        "incident": incident,
    }


# ---------------------------------------------------------------------------
# Incident updates
# ---------------------------------------------------------------------------

@mcp.tool()
def update_incident_status(
    incident_id: str,
    status: str,
    root_cause: Optional[str] = None,
    impact: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update the lifecycle state of an incident.

    Valid states:
    investigating, identified, monitoring, resolved
    """
    incident_id = incident_id.strip()
    status = status.lower().strip()

    allowed_statuses = {
        "investigating",
        "identified",
        "monitoring",
        "resolved",
    }

    if status not in allowed_statuses:
        return {
            "success": False,
            "error": "Invalid incident status.",
            "allowed_statuses": sorted(allowed_statuses),
        }

    if incident_id not in incidents:
        return {
            "success": False,
            "error": f"Incident not found: {incident_id}",
        }

    incident = incidents[incident_id]
    previous_status = incident["status"]
    timestamp = now()

    incident["status"] = status
    incident["updated_at"] = timestamp

    if root_cause and root_cause.strip():
        incident["root_cause"] = root_cause.strip()

    if impact and impact.strip():
        incident["impact"] = impact.strip()

    event = create_timeline_event(
        event_type="status_changed",
        category="lifecycle",
        details=f"Incident moved from {previous_status.upper()} -> {status.upper()}",
        metadata={
            "previous_status": previous_status,
            "new_status": status,
            "root_cause": root_cause.strip() if root_cause and root_cause.strip() else None,
        },
        timestamp=timestamp,
    )
    incident["timeline"].append(event)

    return {
        "success": True,
        "message": "Incident status updated.",
        "incident": incident,
    }


@mcp.tool()
def add_incident_note(
    incident_id: str,
    note: str,
) -> Dict[str, Any]:
    """Add an investigation note to an existing incident."""
    incident_id = incident_id.strip()
    note = note.strip()

    if incident_id not in incidents:
        return {
            "success": False,
            "error": f"Incident not found: {incident_id}",
        }

    if not note:
        return {
            "success": False,
            "error": "Incident note cannot be empty.",
        }

    timestamp = now()

    incidents[incident_id]["notes"].append(
        {
            "timestamp": timestamp,
            "note": note,
        }
    )

    event = create_timeline_event(
        event_type="note_added",
        category="note",
        details=note,
        metadata={"incident_id": incident_id},
        timestamp=timestamp,
    )
    incidents[incident_id]["timeline"].append(event)
    incidents[incident_id]["updated_at"] = timestamp

    return {
        "success": True,
        "incident_id": incident_id,
        "message": "Incident note added.",
        "note": note,
    }


# ---------------------------------------------------------------------------
# Incident investigation evidence & hypotheses
# ---------------------------------------------------------------------------

@mcp.tool()
def add_incident_fact(
    incident_id: str,
    text: str,
    confidence: str = "high",
    evidence: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Record a confirmed technical fact or empirical finding on an incident.
    """
    incident_id = incident_id.strip()
    text = text.strip()
    confidence = confidence.lower().strip()

    if incident_id not in incidents:
        return {
            "success": False,
            "error": f"Incident not found: {incident_id}",
        }

    if not text:
        return {
            "success": False,
            "error": "Fact text cannot be empty.",
        }

    allowed_confidences = {"high", "medium", "low"}
    if confidence not in allowed_confidences:
        confidence = "high"

    timestamp = now()
    fact_id = f"FACT-{uuid4().hex[:6].upper()}"

    fact = {
        "id": fact_id,
        "text": text,
        "confidence": confidence,
        "evidence": evidence.strip() if evidence and evidence.strip() else None,
        "timestamp": timestamp,
    }

    if "facts" not in incidents[incident_id]:
        incidents[incident_id]["facts"] = []

    incidents[incident_id]["facts"].append(fact)
    incidents[incident_id]["updated_at"] = timestamp

    evidence_note = f" (Evidence: {evidence.strip()})" if evidence and evidence.strip() else ""
    event = create_timeline_event(
        event_type="fact_recorded",
        category="fact",
        details=f"{text}{evidence_note} [Confidence: {confidence.upper()}]",
        metadata={
            "fact_id": fact_id,
            "confidence": confidence,
            "evidence": evidence.strip() if evidence and evidence.strip() else None,
        },
        timestamp=timestamp,
    )
    incidents[incident_id]["timeline"].append(event)

    return {
        "success": True,
        "incident_id": incident_id,
        "message": "Fact recorded successfully.",
        "fact": fact,
    }


@mcp.tool()
def add_incident_hypothesis(
    incident_id: str,
    text: str,
) -> Dict[str, Any]:
    """
    Record an unverified working hypothesis or theory about the incident root cause.
    """
    incident_id = incident_id.strip()
    text = text.strip()

    if incident_id not in incidents:
        return {
            "success": False,
            "error": f"Incident not found: {incident_id}",
        }

    if not text:
        return {
            "success": False,
            "error": "Hypothesis text cannot be empty.",
        }

    timestamp = now()
    hypothesis_id = f"HYPO-{uuid4().hex[:6].upper()}"

    hypothesis = {
        "id": hypothesis_id,
        "text": text,
        "status": "unverified",
        "timestamp": timestamp,
    }

    if "hypotheses" not in incidents[incident_id]:
        incidents[incident_id]["hypotheses"] = []

    incidents[incident_id]["hypotheses"].append(hypothesis)
    incidents[incident_id]["updated_at"] = timestamp

    event = create_timeline_event(
        event_type="hypothesis_recorded",
        category="hypothesis",
        details=f"Hypothesis recorded: {text}",
        metadata={
            "hypothesis_id": hypothesis_id,
            "status": "unverified",
        },
        timestamp=timestamp,
    )
    incidents[incident_id]["timeline"].append(event)

    return {
        "success": True,
        "incident_id": incident_id,
        "message": "Hypothesis recorded successfully.",
        "hypothesis": hypothesis,
    }


@mcp.tool()
def verify_hypothesis(
    incident_id: str,
    hypothesis_id: str,
    status: str,
) -> Dict[str, Any]:
    """
    Update a hypothesis status to 'confirmed' or 'rejected' based on investigation evidence.
    """
    incident_id = incident_id.strip()
    hypothesis_id = hypothesis_id.strip()
    status = status.lower().strip()

    if status not in {"confirmed", "rejected"}:
        return {
            "success": False,
            "error": "Invalid status. Allowed values are 'confirmed' or 'rejected'.",
        }

    if incident_id not in incidents:
        return {
            "success": False,
            "error": f"Incident not found: {incident_id}",
        }

    incident = incidents[incident_id]
    hypotheses = incident.get("hypotheses", [])

    matched = None
    for h in hypotheses:
        if h["id"].lower() == hypothesis_id.lower():
            matched = h
            break

    if not matched:
        return {
            "success": False,
            "error": f"Hypothesis not found: {hypothesis_id}",
            "available_hypotheses": [h["id"] for h in hypotheses],
        }

    timestamp = now()
    matched["status"] = status
    incident["updated_at"] = timestamp

    event = create_timeline_event(
        event_type=f"hypothesis_{status}",
        category="hypothesis",
        details=f"Hypothesis {status.upper()}: {matched['text']}",
        metadata={
            "hypothesis_id": hypothesis_id,
            "status": status,
        },
        timestamp=timestamp,
    )
    incident["timeline"].append(event)

    return {
        "success": True,
        "incident_id": incident_id,
        "message": f"Hypothesis marked as {status}.",
        "hypothesis": matched,
    }


# ---------------------------------------------------------------------------
# Critical Actions & Human Confirmation Safeguards
# ---------------------------------------------------------------------------

@mcp.tool()
def request_critical_action(
    incident_id: str,
    action: str,
    target_resource: str,
    risk_level: str,
    details: str,
) -> Dict[str, Any]:
    """
    Request human authorization for a high-risk remediation action (e.g. database failover, cluster scaling, cache flush).
    This tool creates an approval request and does not automatically execute the action.
    """
    incident_id = incident_id.strip()
    action = action.strip()
    target_resource = target_resource.strip()
    risk_level = risk_level.lower().strip()
    details = details.strip()

    if incident_id not in incidents:
        return {
            "success": False,
            "error": f"Incident not found: {incident_id}",
        }

    if not action or not target_resource:
        return {
            "success": False,
            "error": "Action and target_resource cannot be empty.",
        }

    allowed_risks = {"low", "medium", "high", "critical"}
    if risk_level not in allowed_risks:
        risk_level = "high"

    timestamp = now()
    action_id = f"ACTION-{uuid4().hex[:6].upper()}"
    title = action.replace("_", " ").title()

    pending_action = {
        "id": action_id,
        "title": title,
        "action": action,
        "target_resource": target_resource,
        "risk_level": risk_level,
        "details": details if details else f"Execute {title} on {target_resource}.",
        "status": "pending",
        "requested_at": timestamp,
        "approved_by": None,
        "rejected_reason": None,
    }

    if "pending_actions" not in incidents[incident_id]:
        incidents[incident_id]["pending_actions"] = []

    incidents[incident_id]["pending_actions"].append(pending_action)
    incidents[incident_id]["updated_at"] = timestamp

    event = create_timeline_event(
        event_type="action_requested",
        category="authorization",
        details=f"Critical action requested: {title} on {target_resource} (Risk: {risk_level.upper()}) - awaiting human authorization",
        metadata={
            "action_id": action_id,
            "action": action,
            "target_resource": target_resource,
            "risk_level": risk_level,
        },
        timestamp=timestamp,
    )
    incidents[incident_id]["timeline"].append(event)

    return {
        "success": True,
        "requires_human_approval": True,
        "action_id": action_id,
        "incident_id": incident_id,
        "action": action,
        "target_resource": target_resource,
        "risk_level": risk_level,
        "status": "pending",
        "message": f"Critical action request {action_id} created. Human confirmation required before {action} can be executed.",
    }


@mcp.tool()
def complete_action(
    incident_id: str,
    action_id: str,
    result_summary: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Record that an approved remediation action was successfully executed and completed.
    """
    incident_id = incident_id.strip()
    action_id = action_id.strip()

    if incident_id not in incidents:
        return {
            "success": False,
            "error": f"Incident not found: {incident_id}",
        }

    incident = incidents[incident_id]
    actions = incident.get("pending_actions", [])

    matched_action = None
    for a in actions:
        if a["id"].lower() == action_id.lower():
            matched_action = a
            break

    if not matched_action:
        return {
            "success": False,
            "error": f"Action not found: {action_id}",
        }

    timestamp = now()
    matched_action["status"] = "completed"
    incident["updated_at"] = timestamp

    result_detail = f" Result: {result_summary.strip()}" if result_summary and result_summary.strip() else ""
    event = create_timeline_event(
        event_type="action_completed",
        category="action",
        details=f"Action completed: {matched_action['title']} on {matched_action['target_resource']}.{result_detail}",
        metadata={
            "action_id": action_id,
            "target_resource": matched_action["target_resource"],
            "result_summary": result_summary.strip() if result_summary and result_summary.strip() else None,
        },
        timestamp=timestamp,
    )
    incident["timeline"].append(event)

    return {
        "success": True,
        "message": f"Action {action_id} marked as completed.",
        "action": matched_action,
    }


def compute_duration(start_iso: Optional[str], end_iso: Optional[str]) -> str:
    if not start_iso or not end_iso:
        return "Not recorded"
    try:
        t0 = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
        t1 = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
        delta_sec = int((t1 - t0).total_seconds())
        if delta_sec < 0:
            return "Unknown"
        minutes, seconds = divmod(delta_sec, 60)
        hours, minutes = divmod(minutes, 60)
        days, hours = divmod(hours, 24)
        parts = []
        if days > 0:
            parts.append(f"{days}d")
        if hours > 0:
            parts.append(f"{hours}h")
        if minutes > 0:
            parts.append(f"{minutes}m")
        parts.append(f"{seconds}s")
        return " ".join(parts)
    except Exception:
        return "Unknown"


def build_postmortem_markdown(incident: Dict[str, Any]) -> str:
    inc_id = incident.get("id", "UNKNOWN")
    title = incident.get("title", "Untitled Incident")
    severity = incident.get("severity", "unknown").upper()
    service = incident.get("service") or "Not specified"
    status = incident.get("status", "unknown").upper()
    created_at = incident.get("created_at") or "Unknown"
    updated_at = incident.get("updated_at") or "Unknown"
    duration = compute_duration(incident.get("created_at"), incident.get("updated_at"))

    # Impact & Root Cause
    impact = incident.get("impact") or "Impact not confirmed."
    root_cause = incident.get("root_cause") or "Not recorded."

    # Facts
    facts = incident.get("facts", [])
    if facts:
        facts_lines = []
        for f in facts:
            conf = f.get("confidence", "unknown").upper()
            ev = f" *(Evidence: {f['evidence']})*" if f.get("evidence") else ""
            ts = f"`{f.get('timestamp', '')}`" if f.get("timestamp") else ""
            facts_lines.append(f"- **[{conf}]** {f.get('text', '')}{ev} {ts}".strip())
        facts_section = "\n".join(facts_lines)
    else:
        facts_section = "_No confirmed facts recorded._"

    # Hypotheses
    hypotheses = incident.get("hypotheses", [])
    if hypotheses:
        confirmed_hypos = [h for h in hypotheses if h.get("status") == "confirmed"]
        rejected_hypos = [h for h in hypotheses if h.get("status") == "rejected"]
        unverified_hypos = [h for h in hypotheses if h.get("status") not in ("confirmed", "rejected")]

        def format_hypo_list(hypos: List[Dict[str, Any]]) -> str:
            if not hypos:
                return "- _None_"
            return "\n".join([f"- {h.get('text', '')} `({h.get('id', '')})`" for h in hypos])

        hypos_section = (
            f"### Confirmed\n{format_hypo_list(confirmed_hypos)}\n\n"
            f"### Rejected\n{format_hypo_list(rejected_hypos)}\n\n"
            f"### Unverified / Inconclusive\n{format_hypo_list(unverified_hypos)}"
        )
    else:
        hypos_section = "_No hypotheses recorded._"

    # Pending / Executed Actions
    actions = incident.get("pending_actions", [])
    if actions:
        action_lines = []
        for a in actions:
            act_status = a.get("status", "unknown").upper()
            risk = a.get("risk_level", "unknown").upper()
            act_title = a.get("title") or a.get("action", "Action")
            resource = a.get("target_resource", "unknown")
            auth_detail = ""
            if act_status == "APPROVED" and a.get("approved_by"):
                auth_detail = f" — *Authorized by {a['approved_by']}*"
            elif act_status == "REJECTED" and a.get("rejected_reason"):
                auth_detail = f" — *Rejected: {a['rejected_reason']}*"
            elif act_status == "COMPLETED":
                auth_detail = " — *Execution Completed*"
            action_lines.append(
                f"- **[{act_status}]** {act_title} on `{resource}` (Risk: {risk}){auth_detail}\n"
                f"  - Details: {a.get('details', 'No details provided.')}"
            )
        actions_section = "\n".join(action_lines)
    else:
        actions_section = "_No critical actions requested._"

    # Timeline
    timeline = incident.get("timeline", [])
    if timeline:
        timeline_lines = []
        for t in timeline:
            ts = t.get("timestamp", "Unknown")
            cat = (t.get("category") or t.get("event", "event")).upper()
            det = t.get("details", "")
            timeline_lines.append(f"- **`{ts}`** `[{cat}]` {det}")
        timeline_section = "\n".join(timeline_lines)
    else:
        timeline_section = "_No timeline events recorded._"

    # Notes
    notes = incident.get("notes", [])
    if notes:
        notes_lines = []
        for n in notes:
            ts = n.get("timestamp", "Unknown")
            txt = n.get("note", "")
            notes_lines.append(f"- **`{ts}`**: {txt}")
        notes_section = "\n".join(notes_lines)
    else:
        notes_section = "_No investigation notes recorded._"

    md = f"""# Incident Post-Mortem: {inc_id} — {title}

## Executive Summary
- **Incident ID:** `{inc_id}`
- **Title:** {title}
- **Severity:** `{severity}`
- **Affected Service:** `{service}`
- **Status:** `{status}`
- **Created At:** `{created_at}`
- **Updated At:** `{updated_at}`
- **Incident Duration:** {duration}

---

## Impact Assessment
{impact}

---

## Root Cause Analysis
{root_cause}

---

## Confirmed Technical Facts
{facts_section}

---

## Working Hypotheses & Investigation Findings
{hypos_section}

---

## Remediation Actions & Human Authorizations
{actions_section}

---

## Chronological Timeline
{timeline_section}

---

## Investigation Notes
{notes_section}
"""
    return md.strip()


@mcp.tool()
def generate_incident_postmortem(incident_id: str) -> Dict[str, Any]:
    """
    Generate a complete, deterministic incident post-mortem markdown report from confirmed incident data.
    """
    incident_id = incident_id.strip()

    if incident_id not in incidents:
        return {
            "success": False,
            "error": f"Incident not found: {incident_id}",
        }

    incident = incidents[incident_id]
    markdown = build_postmortem_markdown(incident)

    return {
        "success": True,
        "incident_id": incident_id,
        "status": incident.get("status"),
        "markdown": markdown,
    }


# ---------------------------------------------------------------------------
# HTTP / MCP server
# ---------------------------------------------------------------------------

app = FastAPI()


class ApproveActionRequest(BaseModel):
    approved_by: Optional[str] = "Incident Lead"


class RejectActionRequest(BaseModel):
    reason: Optional[str] = "Rejected by human operator."


class CompleteActionRequest(BaseModel):
    result_summary: Optional[str] = None


@app.get("/health")
async def health():
    """Health check for the MCP server."""
    return {
        "status": "ok",
        "service": "incident-tools",
        "tools": [
            "get_active_incidents",
            "get_all_service_health",
            "get_service_health",
            "get_incident_status",
            "get_incident_summary",
            "create_incident",
            "update_incident_status",
            "add_incident_note",
            "add_incident_fact",
            "add_incident_hypothesis",
            "verify_hypothesis",
            "request_critical_action",
            "complete_action",
            "generate_incident_postmortem",
        ],
    }


@app.get("/services/health")
async def get_services_health():
    """Return health status of all monitored services for the dashboard."""
    return {
        "success": True,
        "services": [
            {
                "name": name,
                "status": health["status"],
                "error_rate": health["error_rate"],
                "latency": health["latency"],
                "description": health["description"],
            }
            for name, health in services.items()
        ],
    }


@app.get("/incidents")
async def list_incidents():
    """Return all incidents for the web dashboard."""
    return {
        "success": True,
        "count": len(incidents),
        "incidents": list(incidents.values()),
    }


@app.get("/incidents/{incident_id}")
async def get_incident(incident_id: str):
    """Return one incident for the web dashboard."""
    incident_id = incident_id.strip()

    if incident_id not in incidents:
        return {
            "success": False,
            "error": f"Incident not found: {incident_id}",
        }

    return {
        "success": True,
        "incident": incidents[incident_id],
    }


@app.post("/incidents/{incident_id}/actions/{action_id}/approve")
async def approve_incident_action(incident_id: str, action_id: str, req: ApproveActionRequest):
    """Approve a pending critical action for an incident."""
    incident_id = incident_id.strip()
    action_id = action_id.strip()

    if incident_id not in incidents:
        raise HTTPException(status_code=404, detail=f"Incident not found: {incident_id}")

    incident = incidents[incident_id]
    actions = incident.get("pending_actions", [])

    matched_action = None
    for a in actions:
        if a["id"].lower() == action_id.lower():
            matched_action = a
            break

    if not matched_action:
        raise HTTPException(status_code=404, detail=f"Action not found: {action_id}")

    if matched_action["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Action is not pending (current status: {matched_action['status']})",
        )

    timestamp = now()
    approved_by = req.approved_by.strip() if req.approved_by and req.approved_by.strip() else "Incident Lead"
    matched_action["status"] = "approved"
    matched_action["approved_by"] = approved_by
    incident["updated_at"] = timestamp

    event = create_timeline_event(
        event_type="action_approved",
        category="authorization",
        details=f"Action {matched_action['title']} on {matched_action['target_resource']} authorized by {approved_by}.",
        metadata={
            "action_id": action_id,
            "approved_by": approved_by,
            "target_resource": matched_action["target_resource"],
        },
        timestamp=timestamp,
    )
    incident["timeline"].append(event)

    return {
        "success": True,
        "message": f"Action {action_id} approved by {approved_by}.",
        "action": matched_action,
    }


@app.post("/incidents/{incident_id}/actions/{action_id}/reject")
async def reject_incident_action(incident_id: str, action_id: str, req: RejectActionRequest):
    """Reject a pending critical action for an incident."""
    incident_id = incident_id.strip()
    action_id = action_id.strip()

    if incident_id not in incidents:
        raise HTTPException(status_code=404, detail=f"Incident not found: {incident_id}")

    incident = incidents[incident_id]
    actions = incident.get("pending_actions", [])

    matched_action = None
    for a in actions:
        if a["id"].lower() == action_id.lower():
            matched_action = a
            break

    if not matched_action:
        raise HTTPException(status_code=404, detail=f"Action not found: {action_id}")

    if matched_action["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Action is not pending (current status: {matched_action['status']})",
        )

    timestamp = now()
    reason = req.reason.strip() if req.reason and req.reason.strip() else "Rejected by human operator."
    matched_action["status"] = "rejected"
    matched_action["rejected_reason"] = reason
    incident["updated_at"] = timestamp

    event = create_timeline_event(
        event_type="action_rejected",
        category="authorization",
        details=f"Action {matched_action['title']} on {matched_action['target_resource']} rejected: {reason}.",
        metadata={
            "action_id": action_id,
            "rejected_reason": reason,
            "target_resource": matched_action["target_resource"],
        },
        timestamp=timestamp,
    )
    incident["timeline"].append(event)

    return {
        "success": True,
        "message": f"Action {action_id} rejected.",
        "action": matched_action,
    }


@app.post("/incidents/{incident_id}/actions/{action_id}/complete")
async def complete_incident_action_endpoint(
    incident_id: str, action_id: str, req: CompleteActionRequest
):
    """Mark an action as completed via REST endpoint."""
    res = complete_action(incident_id, action_id, req.result_summary)
    if not res.get("success"):
        raise HTTPException(status_code=404 if "not found" in res.get("error", "").lower() else 400, detail=res.get("error"))
    return res


@app.get("/incidents/{incident_id}/postmortem")
async def get_incident_postmortem_endpoint(incident_id: str):
    """Return a structured, deterministic Markdown post-mortem report for the incident."""
    incident_id = incident_id.strip()

    if incident_id not in incidents:
        raise HTTPException(status_code=404, detail=f"Incident not found: {incident_id}")

    incident = incidents[incident_id]
    markdown = build_postmortem_markdown(incident)

    return {
        "success": True,
        "incident_id": incident_id,
        "status": incident.get("status"),
        "markdown": markdown,
    }


app.mount("/mcp", mcp.http_app())