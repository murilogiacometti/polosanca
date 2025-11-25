"""
Test Suite: Read Scalability & Data Integrity Hardening
Verifies database constraints, non-destructive soft-deactivation, race-free alert deduplication,
serialized status recomputation, 0.0°C serialization, and constant-query-count (zero N+1) reads.
"""

from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import event, text
from sqlalchemy.exc import IntegrityError

from app import db
from app.models import (
    Alert,
    AlertRule,
    AlertRuleScope,
    AlertRuleType,
    AlertSeverity,
    AlertStatus,
    AuditLog,
    Branch,
    Company,
    ComparisonOperator,
    Equipment,
    EquipmentStatus,
    EquipmentType,
    MaintenanceRecord,
    Telemetry,
    User,
    UserRole,
    UserStatus,
)
from app.utils import (
    create_alert_if_not_open,
    hash_api_key,
    recompute_equipment_status,
    utc_now,
)
from tests.conftest import get_auth_headers, login_user


def test_01_zero_celsius_and_zero_threshold_not_dropped_as_falsy(client, init_database):
    """0.0°C, 0.0 kPa, and 0.0 threshold_value must serialize as 0.0, never None."""
    response = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json={
            "serial": "EQ-TEST-001",
            "temperature": 0.0,
            "pressure": 0.0,
            "door": 0,
            "heater": 0,
            "compressor": 0,
            "fan": 0,
        },
    )
    assert response.status_code == 200

    admin_token, _ = login_user(client, "admin@polosanca.com", "admin123")
    eq_list = client.get("/v1/equipments", headers=get_auth_headers(admin_token)).get_json()["equipment"]
    eq = next(e for e in eq_list if e["serial"] == "EQ-TEST-001")

    assert eq["current_data"]["temperature"] == 0.0
    assert eq["current_data"]["pressure"] == 0.0

    history = client.get(
        f"/v1/equipments/{eq['id']}/telemetry",
        headers=get_auth_headers(admin_token),
    ).get_json()
    assert history["data"][0]["temperature"] == 0.0
    assert history["data"][0]["pressure"] == 0.0

    rule_resp = client.post(
        "/v1/alert-rules",
        headers=get_auth_headers(admin_token),
        json={
            "name": "Freezing Point Rule",
            "rule_type": "temperature_high",
            "threshold_value": 0.0,
            "comparison_operator": ">",
            "duration_seconds": 60,
            "severity": "warning",
            "message_template": "Above 0C",
            "scope": "global",
        },
    )
    assert rule_resp.status_code == 201
    assert rule_resp.get_json()["threshold_value"] == 0.0


def test_02_composite_fk_blocks_cross_tenant_equipment_branch_assignment(app, init_database):
    """Database composite FK fk_equipments_branch_company blocks cross-company branch assignment."""
    with app.app_context():
        company_a = Company.query.filter_by(name="Test Company").first()
        branch_a = Branch.query.filter_by(company_id=company_a.id).first()

        company_b = Company(name="Other Tenant Co", contact_email="other@tenant.com")
        db.session.add(company_b)
        db.session.flush()

        # Attempt to attach branch_a (owned by company_a) to company_b directly at SQL level
        bad_eq = Equipment(
            serial="EQ-CROSS-TENANT",
            type=EquipmentType.FREEZER,
            branch_id=branch_a.id,
            company_id=company_b.id,
            api_key=hash_api_key("cross_tenant_key"),
        )
        db.session.add(bad_eq)
        with pytest.raises(IntegrityError):
            db.session.flush()
        db.session.rollback()


def test_03_domain_check_constraints_enforced_at_db_level(app, init_database):
    """Database CHECK constraints enforce User, AlertRule, and Telemetry invariants."""
    with app.app_context():
        company = Company.query.first()
        admin = User.query.filter_by(role=UserRole.GLOBAL_ADMIN).first()
        eq = Equipment.query.first()

        # 1. Global Admin cannot have a company_id
        bad_global = User(
            email="bad_global@polosanca.com",
            password_hash="hash",
            name="Bad Global",
            role=UserRole.GLOBAL_ADMIN,
            company_id=company.id,
            status=UserStatus.ACTIVE,
        )
        db.session.add(bad_global)
        with pytest.raises(IntegrityError):
            db.session.flush()
        db.session.rollback()

        # 2. Non-numeric alert rule (DOOR_OPEN) works with null operator/threshold, rejects numeric threshold
        valid_door_rule = AlertRule(
            name="Valid Door Rule",
            rule_type=AlertRuleType.DOOR_OPEN,
            threshold_value=None,
            comparison_operator=None,
            duration_seconds=120,
            severity=AlertSeverity.WARNING,
            message_template="Door open",
            scope=AlertRuleScope.GLOBAL,
            scope_id=None,
            created_by=admin.id,
        )
        db.session.add(valid_door_rule)
        db.session.flush()
        assert valid_door_rule.to_dict()["comparison_operator"] is None

        invalid_door_rule = AlertRule(
            name="Invalid Door Rule",
            rule_type=AlertRuleType.DOOR_OPEN,
            threshold_value=Decimal("1.00"),
            comparison_operator=ComparisonOperator.GT,
            duration_seconds=120,
            severity=AlertSeverity.WARNING,
            message_template="Door open",
            scope=AlertRuleScope.GLOBAL,
            scope_id=None,
            created_by=admin.id,
        )
        db.session.add(invalid_door_rule)
        with pytest.raises(IntegrityError):
            db.session.flush()
        db.session.rollback()

        # 3. Telemetry source='device' requires pressure and 0/1 flags; source='manual' requires recorded_by
        bad_device_telemetry = Telemetry(
            time=utc_now(),
            equipment_id=eq.id,
            temperature=Decimal("4.00"),
            pressure=None,
            door=0,
            heater=0,
            compressor=1,
            fan=1,
            source="device",
        )
        db.session.add(bad_device_telemetry)
        with pytest.raises(IntegrityError):
            db.session.flush()
        db.session.rollback()

        valid_manual_telemetry = Telemetry(
            time=utc_now(),
            equipment_id=eq.id,
            temperature=Decimal("3.50"),
            source="manual",
            recorded_by=admin.id,
            notes="Thermometer check during power outage",
        )
        db.session.add(valid_manual_telemetry)
        db.session.commit()


def test_04_partial_unique_index_deduplicates_open_alerts_and_allows_reopen_after_resolve(app, init_database):
    """uq_open_alert_per_rule guarantees at most 1 open alert per (equipment_id, alert_rule_id)."""
    with app.app_context():
        admin = User.query.filter_by(role=UserRole.GLOBAL_ADMIN).first()
        eq = Equipment.query.first()

        rule = AlertRule(
            name="High Temp Dedup Rule",
            rule_type=AlertRuleType.TEMPERATURE_HIGH,
            threshold_value=Decimal("8.00"),
            comparison_operator=ComparisonOperator.GT,
            duration_seconds=60,
            severity=AlertSeverity.CRITICAL,
            message_template="Temp > 8C",
            scope=AlertRuleScope.GLOBAL,
            created_by=admin.id,
        )
        db.session.add(rule)
        db.session.commit()

        first_id, created_1 = create_alert_if_not_open(
            equipment_id=eq.id,
            alert_rule_id=rule.id,
            alert_type=rule.rule_type,
            severity=rule.severity,
            message="Temp is 10C",
        )
        assert created_1 is True
        assert first_id is not None

        # Duplicate concurrent attempt while ACTIVE is a clean no-op
        second_id, created_2 = create_alert_if_not_open(
            equipment_id=eq.id,
            alert_rule_id=rule.id,
            alert_type=rule.rule_type,
            severity=rule.severity,
            message="Temp is 10.5C",
        )
        assert created_2 is False
        assert second_id is None

        # Acknowledge alert — still open, so duplicate attempt must still be blocked
        alert_obj = db.session.get(Alert, first_id)
        alert_obj.status = AlertStatus.ACKNOWLEDGED
        db.session.commit()

        third_id, created_3 = create_alert_if_not_open(
            equipment_id=eq.id,
            alert_rule_id=rule.id,
            alert_type=rule.rule_type,
            severity=rule.severity,
            message="Temp is 11C",
        )
        assert created_3 is False
        assert third_id is None

        # Resolve alert — future breach must now create a fresh open alert
        alert_obj.status = AlertStatus.RESOLVED
        alert_obj.resolved_at = utc_now()
        db.session.commit()

        fourth_id, created_4 = create_alert_if_not_open(
            equipment_id=eq.id,
            alert_rule_id=rule.id,
            alert_type=rule.rule_type,
            severity=rule.severity,
            message="Temp breached again",
        )
        assert created_4 is True
        assert fourth_id is not None
        assert fourth_id != first_id
        db.session.commit()


def test_05_serialized_equipment_status_recompute_on_alert_resolve_and_silence(client, app, init_database):
    """recompute_equipment_status enforces offline > critical > warning > operational."""
    # 1. Send live telemetry -> operational
    resp = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json={
            "serial": "EQ-TEST-001",
            "temperature": 4.0,
            "pressure": 120.0,
            "door": 0,
            "heater": 0,
            "compressor": 1,
            "fan": 1,
        },
    )
    assert resp.status_code == 200

    with app.app_context():
        eq = Equipment.query.filter_by(serial="EQ-TEST-001").first()
        assert eq.status == EquipmentStatus.OPERATIONAL

        crit_alert = Alert(
            equipment_id=eq.id,
            type=AlertRuleType.TEMPERATURE_HIGH,
            severity=AlertSeverity.CRITICAL,
            message="Critical temp",
            status=AlertStatus.ACTIVE,
        )
        warn_alert = Alert(
            equipment_id=eq.id,
            type=AlertRuleType.DOOR_OPEN,
            severity=AlertSeverity.WARNING,
            message="Door open warning",
            status=AlertStatus.ACTIVE,
        )
        db.session.add_all([crit_alert, warn_alert])
        db.session.flush()
        recompute_equipment_status(eq.id)
        db.session.commit()
        crit_id = str(crit_alert.id)
        warn_id = str(warn_alert.id)
        eq_id = str(eq.id)

    admin_token, _ = login_user(client, "admin@testcompany.com", "password123")
    assert (
        client.get(f"/v1/equipments/{eq_id}", headers=get_auth_headers(admin_token)).get_json()["status"] == "critical"
    )

    # Acknowledge critical alert (AIP-136 POST custom action; PATCH rejected with 405)
    assert client.patch(f"/v1/alerts/{crit_id}/acknowledge", headers=get_auth_headers(admin_token)).status_code == 405
    ack_res = client.post(
        f"/v1/alerts/{crit_id}/acknowledge",
        headers=get_auth_headers(admin_token),
        json={"notes": "Dispatching technician"},
    )
    assert ack_res.status_code == 200
    assert ack_res.get_json()["status"] == "acknowledged"

    # Resolve critical alert -> drops to warning
    res1 = client.post(f"/v1/alerts/{crit_id}/resolve", headers=get_auth_headers(admin_token))
    assert res1.status_code == 200
    assert (
        client.get(f"/v1/equipments/{eq_id}", headers=get_auth_headers(admin_token)).get_json()["status"] == "warning"
    )

    # Resolve warning alert -> drops to operational
    res2 = client.post(f"/v1/alerts/{warn_id}/resolve", headers=get_auth_headers(admin_token))
    assert res2.status_code == 200
    assert (
        client.get(f"/v1/equipments/{eq_id}", headers=get_auth_headers(admin_token)).get_json()["status"]
        == "operational"
    )

    # Simulate >10 minutes (601s) of hardware silence -> transitions to offline
    with app.app_context():
        eq = db.session.get(Equipment, eq_id)
        eq.last_seen_at = utc_now() - timedelta(seconds=601)
        recompute_equipment_status(eq.id)
        db.session.commit()
        assert eq.status == EquipmentStatus.OFFLINE


def test_06_soft_deactivating_equipment_preserves_history_and_blocks_ingestion(client, app, init_database):
    """DELETE /v1/equipments/<id> sets is_active=False, blocks ingestion (403), and keeps 100% of history."""
    client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json={
            "serial": "EQ-TEST-001",
            "temperature": 3.2,
            "pressure": 115.0,
            "door": 0,
            "heater": 0,
            "compressor": 1,
            "fan": 1,
        },
    )

    admin_token, _ = login_user(client, "admin@testcompany.com", "password123")
    eq_list = client.get("/v1/equipments", headers=get_auth_headers(admin_token)).get_json()["equipment"]
    eq_id = next(e["id"] for e in eq_list if e["serial"] == "EQ-TEST-001")

    # Add a maintenance record
    maint_resp = client.post(
        f"/v1/equipments/{eq_id}/maintenance-records",
        headers=get_auth_headers(admin_token),
        json={
            "type": "routine_inspection",
            "description": "Quarterly coil inspection",
            "performed_by": "Tech A",
            "next_maintenance_date": "2027-02-01",
        },
    )
    assert maint_resp.status_code == 201

    # Soft-deactivate equipment
    del_resp = client.delete(f"/v1/equipments/{eq_id}", headers=get_auth_headers(admin_token))
    assert del_resp.status_code == 204

    # Excluded from default active list, included when include_inactive=true
    active_list = client.get("/v1/equipments", headers=get_auth_headers(admin_token)).get_json()["equipment"]
    assert not any(e["id"] == eq_id for e in active_list)

    all_list = client.get(
        "/v1/equipments?include_inactive=true",
        headers=get_auth_headers(admin_token),
    ).get_json()["equipment"]
    deactivated_eq = next(e for e in all_list if e["id"] == eq_id)
    assert deactivated_eq["is_active"] is False

    # Further hardware telemetry is rejected with 403
    blocked_resp = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json={
            "serial": "EQ-TEST-001",
            "temperature": 3.5,
            "pressure": 115.0,
            "door": 0,
            "heater": 0,
            "compressor": 1,
            "fan": 1,
        },
    )
    assert blocked_resp.status_code == 403

    # Historical telemetry & maintenance records remain 100% intact, and hard SQL DELETE is RESTRICT-blocked
    with app.app_context():
        assert Telemetry.query.filter_by(equipment_id=eq_id).count() == 1
        assert MaintenanceRecord.query.filter_by(equipment_id=eq_id).count() == 1
        eq_obj = db.session.get(Equipment, eq_id)
        db.session.delete(eq_obj)
        with pytest.raises(IntegrityError):
            db.session.flush()
        db.session.rollback()


def test_07_read_scalability_zero_n_plus_one_fillfactor_and_interval_buckets(client, app, init_database):
    """Verify fillfactor=80, constant SQL query counts (zero N+1), and bucketed telemetry queries."""
    with app.app_context():
        reloptions = db.session.execute(text("SELECT reloptions FROM pg_class WHERE relname = 'equipments'")).scalar()
        assert reloptions is not None and "fillfactor=80" in reloptions

    global_token, _ = login_user(client, "admin@polosanca.com", "admin123")

    # Measure baseline query count on GET /v1/equipments and GET /v1/branches
    def count_queries(fn):
        queries = []

        def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
            queries.append(statement)

        with app.app_context():
            event.listen(db.engine, "before_cursor_execute", _before_cursor_execute)
            try:
                resp = fn()
            finally:
                event.remove(db.engine, "before_cursor_execute", _before_cursor_execute)
        return resp, len(queries)

    _, baseline_eq_queries = count_queries(lambda: client.get("/v1/equipments", headers=get_auth_headers(global_token)))
    _, baseline_branch_queries = count_queries(
        lambda: client.get("/v1/branches", headers=get_auth_headers(global_token))
    )

    # Seed 8 more branches + 8 more equipments with telemetry
    with app.app_context():
        company = Company.query.filter_by(name="Test Company").first()
        for i in range(8):
            b = Branch(company_id=company.id, name=f"Scale Branch {i}", address=f"{i} Scale Rd")
            db.session.add(b)
            db.session.flush()
            e = Equipment(
                serial=f"EQ-SCALE-{i:03d}",
                type=EquipmentType.REFRIGERATOR,
                company_id=company.id,
                branch_id=b.id,
                api_key=hash_api_key(f"scale_key_{i}"),
                last_seen_at=utc_now(),
                status=EquipmentStatus.OPERATIONAL,
                current_data={"temperature": 2.5 + i * 0.1, "pressure": 110.0, "door": "closed"},
            )
            db.session.add(e)
        db.session.commit()

    eq_resp, scaled_eq_queries = count_queries(
        lambda: client.get("/v1/equipments", headers=get_auth_headers(global_token))
    )
    branch_resp, scaled_branch_queries = count_queries(
        lambda: client.get("/v1/branches", headers=get_auth_headers(global_token))
    )

    assert eq_resp.status_code == 200
    assert len(eq_resp.get_json()["equipment"]) == 10
    assert all(e["branch_name"] is not None for e in eq_resp.get_json()["equipment"])
    assert scaled_eq_queries <= baseline_eq_queries

    assert branch_resp.status_code == 200
    assert len(branch_resp.get_json()["branches"]) == 10
    assert all("equipment_count" in b for b in branch_resp.get_json()["branches"])
    assert scaled_branch_queries <= baseline_branch_queries

    # Realtime polling endpoint executes in <= 2 queries (1 user lookup + 1 equipments scan)
    rt_resp, rt_queries = count_queries(
        lambda: client.get("/v1/telemetry/realtime", headers=get_auth_headers(global_token))
    )
    assert rt_resp.status_code == 200
    assert len(rt_resp.get_json()["equipment"]) == 10
    assert rt_queries <= 2

    # Bucketed historical query (interval=5min & interval=1hour) aggregates in SQL
    with app.app_context():
        target_eq = Equipment.query.filter_by(serial="EQ-TEST-001").first()
        base_time = utc_now().replace(minute=10, second=0, microsecond=0)
        for idx, temp in enumerate([2.0, 4.0, 6.0]):
            db.session.add(
                Telemetry(
                    time=base_time + timedelta(seconds=idx * 30),
                    equipment_id=target_eq.id,
                    temperature=Decimal(str(temp)),
                    pressure=Decimal("120.00"),
                    door=0,
                    heater=0,
                    compressor=1,
                    fan=1,
                    source="device",
                )
            )
        db.session.commit()
        target_eq_id = str(target_eq.id)

    agg_resp = client.get(
        f"/v1/equipments/{target_eq_id}/telemetry?interval=5min",
        headers=get_auth_headers(global_token),
    )
    assert agg_resp.status_code == 200
    agg_data = agg_resp.get_json()
    assert agg_data["count"] == 1
    assert agg_data["data"][0]["temperature"] == 4.0
    assert agg_data["data"][0]["min_temperature"] == 2.0
    assert agg_data["data"][0]["max_temperature"] == 6.0
    assert agg_data["data"][0]["sample_count"] == 3


def test_08_aip_improvements_idempotency_cursor_pagination_and_status_codes(client, app, init_database):
    """Verify AIP-133/135 (201/204), AIP-136 (POST actions), AIP-155 (Idempotency-Key/request_id), and AIP-158 (page_token)."""
    global_token, _ = login_user(client, "admin@polosanca.com", "admin123")
    company_token, _ = login_user(client, "admin@testcompany.com", "password123")

    # 1. AIP-133 & AIP-135: POST /v1/alert-rules returns 201 AlertRule; DELETE returns 204 No Content
    rule_resp = client.post(
        "/v1/alert-rules",
        headers=get_auth_headers(global_token),
        json={
            "name": "AIP Temp Rule",
            "scope": "global",
            "rule_type": "temperature_high",
            "threshold_value": 8.0,
            "comparison_operator": ">",
            "duration_seconds": 120,
            "severity": "warning",
            "message_template": "Temp high",
        },
    )
    assert rule_resp.status_code == 201
    created_rule = rule_resp.get_json()
    assert created_rule["name"] == "AIP Temp Rule"
    assert created_rule["threshold_value"] == 8.0

    del_rule_resp = client.delete(
        f"/v1/alert-rules/{created_rule['id']}",
        headers=get_auth_headers(global_token),
    )
    assert del_rule_resp.status_code == 204
    assert del_rule_resp.data == b""

    # 2. AIP-155: Idempotent hardware telemetry ingestion via Idempotency-Key / request_id
    payload = {
        "serial": "EQ-TEST-001",
        "temperature": 1.5,
        "pressure": 118.0,
        "door": 0,
        "heater": 0,
        "compressor": 1,
        "fan": 1,
    }
    first_sub = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001", "Idempotency-Key": "iot-seq-0001"},
        json=payload,
    )
    assert first_sub.status_code == 200
    first_body = first_sub.get_json()
    assert "deduplicated" not in first_body

    # Retry with same key (via body request_id and header) -> deduplicated 200 with original record_id
    retry_sub = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001", "Idempotency-Key": "iot-seq-0001"},
        json={**payload, "temperature": 99.9, "request_id": "iot-seq-0001"},
    )
    assert retry_sub.status_code == 200
    retry_body = retry_sub.get_json()
    assert retry_body["deduplicated"] is True
    assert retry_body["record_id"] == first_body["record_id"]
    assert retry_body["timestamp"] == first_body["timestamp"]

    # Mismatched header vs body request_id -> 400 Bad Request
    mismatch_sub = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001", "Idempotency-Key": "iot-seq-0002"},
        json={**payload, "request_id": "iot-seq-9999"},
    )
    assert mismatch_sub.status_code == 400

    with app.app_context():
        eq = Equipment.query.filter_by(serial="EQ-TEST-001").first()
        eq_id = str(eq.id)
        assert Telemetry.query.filter_by(equipment_id=eq.id).count() == 1

        # Seed 4 more telemetry points at distinct timestamps (total 5 rows) + 5 AuditLog entries
        base = utc_now() - timedelta(minutes=20)
        for i in range(4):
            db.session.add(
                Telemetry(
                    time=base + timedelta(minutes=i * 5),
                    equipment_id=eq.id,
                    temperature=Decimal(str(2.0 + i)),
                    pressure=Decimal("115.00"),
                    door=0,
                    heater=0,
                    compressor=1,
                    fan=1,
                    source="device",
                )
            )
        admin_user = User.query.filter_by(email="admin@polosanca.com").first()
        for i in range(5):
            db.session.add(
                AuditLog(
                    user_id=admin_user.id,
                    action=f"test_action_{i}",
                    entity_type="equipment",
                    entity_id=eq.id,
                    changes={"step": i},
                    created_at=base + timedelta(seconds=i * 10),
                )
            )
        db.session.commit()

    # 3. AIP-158: Keyset cursor pagination on GET /v1/equipments/<id>/telemetry (raw & 5min)
    seen_timestamps = []
    token = None
    pages = 0
    while True:
        url = f"/v1/equipments/{eq_id}/telemetry?interval=raw&limit=2"
        if token:
            url += f"&page_token={token}"
        resp = client.get(url, headers=get_auth_headers(company_token))
        assert resp.status_code == 200
        body = resp.get_json()
        pages += 1
        seen_timestamps.extend(row["timestamp"] for row in body["data"])
        token = body["next_page_token"]
        if not token:
            break

    assert pages == 3
    assert len(seen_timestamps) == 5
    assert seen_timestamps == sorted(seen_timestamps, reverse=True)

    # Bucketed keyset pagination (interval=5min)
    agg_seen = []
    token = None
    while True:
        url = f"/v1/equipments/{eq_id}/telemetry?interval=5min&limit=2"
        if token:
            url += f"&page_token={token}"
        resp = client.get(url, headers=get_auth_headers(company_token))
        assert resp.status_code == 200
        body = resp.get_json()
        agg_seen.extend(row["timestamp"] for row in body["data"])
        token = body["next_page_token"]
        if not token:
            break
    assert len(agg_seen) == 5
    assert agg_seen == sorted(agg_seen, reverse=True)

    # Invalid page_token -> 400
    bad_tok = client.get(
        f"/v1/equipments/{eq_id}/telemetry?page_token=not-a-valid-cursor",
        headers=get_auth_headers(company_token),
    )
    assert bad_tok.status_code == 400

    # 4. AIP-158 + RBAC on GET /v1/audit-logs (Global Admin only)
    assert client.get("/v1/audit-logs", headers=get_auth_headers(company_token)).status_code == 403

    audit_ids = []
    token = None
    while True:
        url = "/v1/audit-logs?entity_type=equipment&limit=2"
        if token:
            url += f"&page_token={token}"
        resp = client.get(url, headers=get_auth_headers(global_token))
        assert resp.status_code == 200
        body = resp.get_json()
        audit_ids.extend(item["id"] for item in body["audit_logs"])
        token = body["next_page_token"]
        if not token:
            break

    assert len(audit_ids) == 5
    assert len(set(audit_ids)) == 5


def test_09_administrative_mutations_populate_audit_logs_automatically(client, init_database):
    """
    Verify M1 administrative mutation audit trail records actions, entity IDs, IP, and User-Agent
    across companies, branches, equipments, users, alert_rules, alerts, and maintenance.
    """
    global_token, _ = login_user(client, "admin@polosanca.com", "admin123")
    headers = {**get_auth_headers(global_token), "User-Agent": "PoloSancaAuditTest/1.0"}

    co = client.post(
        "/v1/companies",
        headers=headers,
        json={"name": "Audited Cold Chain Co", "contact_email": "audit@coldchain.com"},
    ).get_json()

    br = client.post(
        "/v1/branches",
        headers=headers,
        json={"company_id": co["id"], "name": "Audited Branch", "address": "Rua 1"},
    ).get_json()

    eq = client.post(
        "/v1/equipments",
        headers=headers,
        json={"serial": "EQ-AUDIT-001", "type": "freezer", "branch_id": br["id"]},
    ).get_json()

    client.post(
        "/v1/users/invite",
        headers=headers,
        json={
            "email": "audited@coldchain.com",
            "name": "Audited User",
            "role": "company_admin",
            "company_id": co["id"],
        },
    )

    client.post(
        f"/v1/equipments/{eq['id']}/maintenance-records",
        headers=headers,
        json={"type": "preventive", "description": "Initial inspection", "performed_by": "Tech A"},
    )

    logs_resp = client.get("/v1/audit-logs?limit=50", headers=headers)
    assert logs_resp.status_code == 200
    logs = logs_resp.get_json()["audit_logs"]
    recorded_actions = {entry["action"] for entry in logs}

    assert {
        "create_company",
        "create_branch",
        "create_equipment",
        "invite_user",
        "create_maintenance_record",
    }.issubset(recorded_actions)

    company_log = next(entry for entry in logs if entry["action"] == "create_company")
    assert company_log["entity_type"] == "company"
    assert company_log["entity_id"] == co["id"]
    assert company_log["ip_address"] == "127.0.0.1"
    assert company_log["user_agent"] == "PoloSancaAuditTest/1.0"


def test_10_alembic_migrations_upgrade_and_downgrade_cleanly(app):
    """Verify full Alembic migration chain (0001 -> 0002 -> 0001 -> head -> base) executes cleanly."""
    from flask_migrate import downgrade, upgrade
    from sqlalchemy import inspect

    with app.app_context():
        db.session.remove()
        db.drop_all()
        db.session.execute(text("DROP TABLE IF EXISTS alembic_version"))
        db.session.commit()

        upgrade(revision="head")
        inspector = inspect(db.engine)
        user_cols = {c["name"] for c in inspector.get_columns("users")}
        assert {"password_reset_token", "password_reset_expires_at"}.issubset(user_cols)
        user_indexes = {idx["name"] for idx in inspector.get_indexes("users")}
        assert {"ix_users_invitation_token", "ix_users_password_reset_token"}.issubset(user_indexes)

        downgrade(revision="0001_initial_hardened")
        inspector = inspect(db.engine)
        user_cols_after_down = {c["name"] for c in inspector.get_columns("users")}
        assert "password_reset_token" not in user_cols_after_down
        assert "password_reset_expires_at" not in user_cols_after_down

        upgrade(revision="head")
        downgrade(revision="base")
        db.session.execute(text("DROP TABLE IF EXISTS alembic_version"))
        db.session.commit()


def test_11_deep_health_check_database_and_redis_readiness(client, app, init_database, monkeypatch):
    """Verify /health validates PostgreSQL (SELECT 1) and Redis (PING) readiness and returns 503 on failure."""
    import redis

    import app as app_pkg

    # Default healthy check in test mode
    ok_resp = client.get("/health")
    assert ok_resp.status_code == 200
    ok_body = ok_resp.get_json()
    assert ok_body["status"] == "healthy"
    assert ok_body["checks"]["database"] == "ok"

    # Force live Redis PING check with mocked healthy Redis client -> 200
    class _HealthyRedis:
        def ping(self):
            return True

    monkeypatch.setitem(app.config, "HEALTHCHECK_FORCE_REDIS", True)
    monkeypatch.setattr(redis.Redis, "from_url", staticmethod(lambda *a, **kw: _HealthyRedis()))
    redis_ok = client.get("/health")
    assert redis_ok.status_code == 200
    assert redis_ok.get_json()["checks"]["redis"] == "ok"

    # Simulated Redis outage -> 503 Service Unavailable
    class _FailingRedis:
        def ping(self):
            raise redis.ConnectionError("Redis down")

    monkeypatch.setattr(redis.Redis, "from_url", staticmethod(lambda *a, **kw: _FailingRedis()))
    redis_down = client.get("/health")
    assert redis_down.status_code == 503
    assert redis_down.get_json()["status"] == "unhealthy"
    assert "unreachable" in redis_down.get_json()["checks"]["redis"]

    # Simulated PostgreSQL outage -> 503 Service Unavailable
    monkeypatch.setitem(app.config, "HEALTHCHECK_FORCE_REDIS", False)
    monkeypatch.setattr(app_pkg, "check_database_health", lambda: (False, "unreachable: OperationalError"))
    db_down = client.get("/health")
    assert db_down.status_code == 503
    assert db_down.get_json()["status"] == "unhealthy"
