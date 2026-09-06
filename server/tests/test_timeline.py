import sys
import asyncio
import pytest

from src.mcp_server import (
    create_incident,
    add_incident_fact,
    add_incident_hypothesis,
    verify_hypothesis,
    request_critical_action,
    update_incident_status,
    add_incident_note,
    complete_action,
    get_incident_status,
    incidents,
    ApproveActionRequest,
    RejectActionRequest,
    approve_incident_action,
    reject_incident_action,
)


@pytest.mark.asyncio
async def test_timeline_lifecycle():
    print("Testing Incident Timeline Event Generation & Categorization...")

    # 1. Create Incident
    res_create = create_incident(
        title="API Gateway 502 Outage",
        severity="high",
        service="api",
        impact="Users experiencing 502 errors",
    )
    assert res_create["success"], f"Create failed: {res_create}"
    inc_id = res_create["incident"]["id"]
    print(f"[OK] Created incident: {inc_id}")

    # 2. Add Fact
    res_fact = add_incident_fact(
        incident_id=inc_id,
        text="API error rate spike observed at 8.4%",
        confidence="high",
        evidence="Datadog APM monitor",
    )
    assert res_fact["success"], f"Add fact failed: {res_fact}"
    print("[OK] Added fact")

    # 3. Add Hypothesis
    res_hypo = add_incident_hypothesis(
        incident_id=inc_id,
        text="Database connection pool saturation suspected",
    )
    assert res_hypo["success"], f"Add hypothesis failed: {res_hypo}"
    hypo_id = res_hypo["hypothesis"]["id"]
    print(f"[OK] Added hypothesis: {hypo_id}")

    # 4. Verify Hypothesis (confirmed)
    res_verify = verify_hypothesis(
        incident_id=inc_id,
        hypothesis_id=hypo_id,
        status="confirmed",
    )
    assert res_verify["success"], f"Verify hypothesis failed: {res_verify}"
    print(f"[OK] Verified hypothesis: {hypo_id} -> confirmed")

    # 5. Add Note
    res_note = add_incident_note(
        incident_id=inc_id,
        note="Primary DB replica lag is nominal, but max connections reached.",
    )
    assert res_note["success"], f"Add note failed: {res_note}"
    print("[OK] Added note")

    # 6. Request Critical Action
    res_act = request_critical_action(
        incident_id=inc_id,
        action="database_failover",
        target_resource="db-primary-us-east",
        risk_level="high",
        details="Failover to replica db-replica-us-east-2",
    )
    assert res_act["success"], f"Request action failed: {res_act}"
    action_id = res_act["action_id"]
    print(f"[OK] Requested critical action: {action_id}")

    # 7. Approve Critical Action
    res_appr = await approve_incident_action(
        incident_id=inc_id,
        action_id=action_id,
        req=ApproveActionRequest(approved_by="Lead SRE"),
    )
    assert res_appr["success"], f"Approve action failed: {res_appr}"
    print(f"[OK] Approved action: {action_id}")

    # 8. Complete Critical Action
    res_comp = complete_action(
        incident_id=inc_id,
        action_id=action_id,
        result_summary="Failover finished in 18s with zero data loss.",
    )
    assert res_comp["success"], f"Complete action failed: {res_comp}"
    print(f"[OK] Completed action: {action_id}")

    # 9. Test Rejection flow for another action
    res_act2 = request_critical_action(
        incident_id=inc_id,
        action="flush_cache",
        target_resource="redis-primary",
        risk_level="medium",
        details="Flush session cache",
    )
    assert res_act2["success"], f"Request action failed: {res_act2}"
    action2_id = res_act2["action_id"]
    print(f"[OK] Requested second action: {action2_id}")

    res_rej = await reject_incident_action(
        incident_id=inc_id,
        action_id=action2_id,
        req=RejectActionRequest(
            reason="Cache flush would degrade latency further"
        ),
    )
    assert res_rej["success"], f"Reject action failed: {res_rej}"
    print(f"[OK] Rejected action: {action2_id}")

    # 10. Update Incident Status
    res_status = update_incident_status(
        incident_id=inc_id,
        status="monitoring",
        root_cause="Connection pool leak in v2.4 deployment",
    )
    assert res_status["success"], f"Update status failed: {res_status}"
    print("[OK] Updated status -> monitoring")

    # 11. Check timeline events and ordering
    inc = get_incident_status(inc_id)["incident"]
    timeline = inc["timeline"]

    print(f"\n--- Incident Timeline ({len(timeline)} events) ---")

    expected_categories = [
        "lifecycle",       # incident_created
        "fact",            # fact_recorded
        "hypothesis",      # hypothesis_recorded
        "hypothesis",      # hypothesis_confirmed
        "note",            # note_added
        "authorization",   # action_requested
        "authorization",   # action_approved
        "action",          # action_completed
        "authorization",   # action_requested (second action)
        "authorization",   # action_rejected (second action)
        "lifecycle",       # status_changed
    ]

    assert len(timeline) == len(
        expected_categories
    ), f"Expected {len(expected_categories)} events, got {len(timeline)}"

    for i, evt in enumerate(timeline):
        print(
            f"[{evt['timestamp']}] "
            f"[{evt['category'].upper():<13}] "
            f"({evt['event']}) {evt['details']}"
        )

        assert evt["category"] == expected_categories[i], (
            f"Event {i} expected category "
            f"{expected_categories[i]}, got {evt['category']}"
        )
        assert evt["timestamp"], f"Event {i} missing timestamp"
        assert evt["details"], f"Event {i} missing details"

    print("\n[OK] ALL TIMELINE TESTS PASSED!")


if __name__ == "__main__":
    asyncio.run(test_timeline_lifecycle())