"""
Test Suite: Alert Rule Configuration Flow (PRD 5.8)

Tests generic alert rule lifecycle, domain validation, RBAC, and rule priority:
1. Global Admin creates numeric (temperature/pressure) and non-numeric (door_open, equipment_offline) rules across global/company/equipment scopes
2. Domain validation rejects missing/extraneous thresholds and mismatched scope_id
3. Global Admin lists, inspects, updates, and deletes rules (204 No Content, preserving historical alerts)
4. Non-global-admin write attempts are rejected with 403 Forbidden
5. Company Admin read-only visibility and per-equipment rule priority shadowing
"""

from app import db
from app.models import Alert, AlertRuleType, AlertSeverity, AlertStatus, Company, Equipment
from tests.conftest import get_auth_headers, login_user


def test_01_global_admin_creates_numeric_and_non_numeric_rules_across_scopes(client, app, init_database):
    """
    PRD 5.8 Steps 1-4:
    Global Admin creates global numeric rule, company door_open rule, and equipment_offline rule,
    while invalid threshold/scope combinations return 400.
    """
    global_token, _ = login_user(client, "admin@polosanca.com", "admin123")
    headers = get_auth_headers(global_token)

    with app.app_context():
        company_id = str(Company.query.filter_by(name="Test Company").first().id)
        eq_id = str(Equipment.query.filter_by(serial="EQ-TEST-001").first().id)

    # 1. Global numeric rule
    r_global = client.post(
        "/v1/alert-rules",
        headers=headers,
        json={
            "name": "Global High Temp",
            "scope": "global",
            "rule_type": "temperature_high",
            "threshold_value": 10.0,
            "comparison_operator": ">",
            "duration_seconds": 300,
            "severity": "critical",
            "message_template": "{serial} exceeded 10C",
        },
    )
    assert r_global.status_code == 201
    assert r_global.get_json()["scope"] == "global"
    assert r_global.get_json()["scope_id"] is None

    # 2. Company-scoped non-numeric rule (door_open -> threshold_value & operator null)
    r_company = client.post(
        "/v1/alert-rules",
        headers=headers,
        json={
            "name": "Company Door Open",
            "scope": "company",
            "scope_id": company_id,
            "rule_type": "door_open",
            "duration_seconds": 180,
            "severity": "warning",
        },
    )
    assert r_company.status_code == 201
    assert r_company.get_json()["threshold_value"] is None
    assert r_company.get_json()["scope_id"] == company_id

    # 3. Equipment-scoped equipment_offline rule
    r_eq = client.post(
        "/v1/alert-rules",
        headers=headers,
        json={
            "name": "Freezer Offline SLA",
            "scope": "equipment",
            "scope_id": eq_id,
            "rule_type": "equipment_offline",
            "duration_seconds": 900,
            "severity": "critical",
        },
    )
    assert r_eq.status_code == 201
    assert r_eq.get_json()["scope_id"] == eq_id

    # Domain validation errors -> 400
    # Numeric rule missing threshold_value
    assert (
        client.post(
            "/v1/alert-rules",
            headers=headers,
            json={
                "name": "Bad Numeric",
                "scope": "global",
                "rule_type": "temperature_high",
                "comparison_operator": ">",
                "severity": "warning",
            },
        ).status_code
        == 400
    )

    # Non-numeric rule supplying threshold_value
    assert (
        client.post(
            "/v1/alert-rules",
            headers=headers,
            json={
                "name": "Bad Door Rule",
                "scope": "global",
                "rule_type": "door_open",
                "threshold_value": 1.0,
                "comparison_operator": "=",
                "severity": "warning",
            },
        ).status_code
        == 400
    )

    # Company scope missing scope_id
    assert (
        client.post(
            "/v1/alert-rules",
            headers=headers,
            json={
                "name": "Missing Scope ID",
                "scope": "company",
                "rule_type": "door_open",
                "severity": "warning",
            },
        ).status_code
        == 400
    )


def test_02_global_admin_lists_inspects_updates_and_deletes_alert_rules(client, app, init_database):
    """
    PRD 5.8 Step 5:
    Global Admin exercises GET list, GET detail, PATCH update, and DELETE (204 No Content),
    verifying Company Admin / Viewer write attempts return 403 and historical alerts survive rule deletion.
    """
    global_token, _ = login_user(client, "admin@polosanca.com", "admin123")
    company_token, _ = login_user(client, "admin@testcompany.com", "password123")
    viewer_token, _ = login_user(client, "viewer@testcompany.com", "viewer123")

    # Company Admin & Viewer cannot create rules
    rule_payload = {
        "name": "Freezer Low Pressure",
        "scope": "global",
        "rule_type": "pressure_low",
        "threshold_value": 80.0,
        "comparison_operator": "<",
        "duration_seconds": 240,
        "severity": "warning",
    }
    assert client.post("/v1/alert-rules", headers=get_auth_headers(company_token), json=rule_payload).status_code == 403
    assert client.post("/v1/alert-rules", headers=get_auth_headers(viewer_token), json=rule_payload).status_code == 403

    create_resp = client.post("/v1/alert-rules", headers=get_auth_headers(global_token), json=rule_payload)
    assert create_resp.status_code == 201
    rule_id = create_resp.get_json()["id"]

    # Seed an alert referencing this rule to prove ON DELETE SET NULL preserves alert history
    with app.app_context():
        eq = Equipment.query.filter_by(serial="EQ-TEST-001").first()
        alert = Alert(
            equipment_id=eq.id,
            alert_rule_id=rule_id,
            type=AlertRuleType.PRESSURE_LOW,
            severity=AlertSeverity.WARNING,
            message="Low pressure warning",
            status=AlertStatus.ACTIVE,
        )
        db.session.add(alert)
        db.session.commit()
        alert_id = str(alert.id)

    # List & inspect
    list_resp = client.get("/v1/alert-rules", headers=get_auth_headers(global_token))
    assert list_resp.status_code == 200
    assert any(r["id"] == rule_id for r in list_resp.get_json()["alert_rules"])

    detail_resp = client.get(f"/v1/alert-rules/{rule_id}", headers=get_auth_headers(global_token))
    assert detail_resp.status_code == 200
    assert detail_resp.get_json()["threshold_value"] == 80.0

    # Update threshold, duration, and active state
    assert (
        client.patch(
            f"/v1/alert-rules/{rule_id}",
            headers=get_auth_headers(company_token),
            json={"threshold_value": 75.0},
        ).status_code
        == 403
    )

    patch_resp = client.patch(
        f"/v1/alert-rules/{rule_id}",
        headers=get_auth_headers(global_token),
        json={"threshold_value": 75.0, "duration_seconds": 180, "is_active": False},
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.get_json()
    assert updated["threshold_value"] == 75.0
    assert updated["duration_seconds"] == 180
    assert updated["is_active"] is False

    # Delete returns 204 and keeps historical Alert intact with alert_rule_id = NULL
    del_resp = client.delete(f"/v1/alert-rules/{rule_id}", headers=get_auth_headers(global_token))
    assert del_resp.status_code == 204
    assert client.get(f"/v1/alert-rules/{rule_id}", headers=get_auth_headers(global_token)).status_code == 404

    with app.app_context():
        preserved_alert = db.session.get(Alert, alert_id)
        assert preserved_alert is not None
        assert preserved_alert.alert_rule_id is None


def test_03_company_admin_readonly_visibility_and_equipment_rule_priority(client, app, init_database):
    """
    PRD 5.8 Step 6 & Rule Priority Scenario:
    Company Admin views applicable rules read-only (scoped to global + own company/equipment),
    and GET /v1/equipments/<id>/alert-rules orders priority equipment (1) > company (2) > global (3)
    per (rule_type, severity) pair with accurate `is_effective` shadowing.
    """
    from app.models import Branch, EquipmentType
    from app.utils import hash_api_key

    global_token, _ = login_user(client, "admin@polosanca.com", "admin123")
    company_token, _ = login_user(client, "admin@testcompany.com", "password123")
    viewer_token, _ = login_user(client, "viewer@testcompany.com", "viewer123")
    restricted_token, _ = login_user(client, "restricted@testcompany.com", "restricted123")

    with app.app_context():
        company_id = str(Company.query.filter_by(name="Test Company").first().id)
        eq1_id = str(Equipment.query.filter_by(serial="EQ-TEST-001").first().id)
        eq2_id = str(Equipment.query.filter_by(serial="EQ-TEST-002").first().id)

        other_co = Company(name="External Cold Co", contact_email="ext@cold.com")
        db.session.add(other_co)
        db.session.flush()
        other_br = Branch(company_id=other_co.id, name="Ext Branch", address="1 Ext Way")
        db.session.add(other_br)
        db.session.flush()
        other_eq = Equipment(
            serial="EQ-EXT-001",
            type=EquipmentType.FREEZER,
            company_id=other_co.id,
            branch_id=other_br.id,
            api_key=hash_api_key("ext_key_001"),
        )
        db.session.add(other_eq)
        db.session.commit()
        other_co_id = str(other_co.id)

    created_ids = {}
    for scope, scope_id, threshold in [
        ("global", None, 10.0),
        ("company", company_id, 8.0),
        ("equipment", eq1_id, 7.0),
    ]:
        resp = client.post(
            "/v1/alert-rules",
            headers=get_auth_headers(global_token),
            json={
                "name": f"{scope} crit high temp",
                "scope": scope,
                "scope_id": scope_id,
                "rule_type": "temperature_high",
                "threshold_value": threshold,
                "comparison_operator": ">",
                "duration_seconds": 300,
                "severity": "critical",
            },
        )
        assert resp.status_code == 201
        created_ids[scope] = resp.get_json()["id"]

    # Distinct (temperature_high, warning) company rule should NOT be shadowed by (temperature_high, critical)
    warn_resp = client.post(
        "/v1/alert-rules",
        headers=get_auth_headers(global_token),
        json={
            "name": "company warn high temp",
            "scope": "company",
            "scope_id": company_id,
            "rule_type": "temperature_high",
            "threshold_value": 5.0,
            "comparison_operator": ">",
            "duration_seconds": 180,
            "severity": "warning",
        },
    )
    assert warn_resp.status_code == 201
    warn_rule_id = warn_resp.get_json()["id"]

    # External company's rule must NEVER be visible to Test Company's admin
    ext_resp = client.post(
        "/v1/alert-rules",
        headers=get_auth_headers(global_token),
        json={
            "name": "external company door rule",
            "scope": "company",
            "scope_id": other_co_id,
            "rule_type": "door_open",
            "duration_seconds": 120,
            "severity": "warning",
        },
    )
    assert ext_resp.status_code == 201
    ext_rule_id = ext_resp.get_json()["id"]

    # Viewer cannot list global/company rule catalog; Company Admin has read-only visibility
    assert client.get("/v1/alert-rules", headers=get_auth_headers(viewer_token)).status_code == 403

    ca_list = client.get("/v1/alert-rules", headers=get_auth_headers(company_token))
    assert ca_list.status_code == 200
    visible_ids = {r["id"] for r in ca_list.get_json()["alert_rules"]}
    assert {created_ids["global"], created_ids["company"], created_ids["equipment"], warn_rule_id}.issubset(visible_ids)
    assert ext_rule_id not in visible_ids

    assert (
        client.get(f"/v1/alert-rules/{created_ids['company']}", headers=get_auth_headers(company_token)).status_code
        == 200
    )
    assert client.get(f"/v1/alert-rules/{ext_rule_id}", headers=get_auth_headers(company_token)).status_code == 403

    # Per-equipment applicable rules: accessible to Company Admin + permitted Viewers (403 on restricted branch)
    assert client.get(f"/v1/equipments/{eq1_id}/alert-rules", headers=get_auth_headers(viewer_token)).status_code == 200
    assert (
        client.get(f"/v1/equipments/{eq1_id}/alert-rules", headers=get_auth_headers(restricted_token)).status_code
        == 200
    )
    assert (
        client.get(f"/v1/equipments/{eq2_id}/alert-rules", headers=get_auth_headers(restricted_token)).status_code
        == 403
    )

    eq_rules_resp = client.get(f"/v1/equipments/{eq1_id}/alert-rules", headers=get_auth_headers(company_token))
    assert eq_rules_resp.status_code == 200
    applicable = eq_rules_resp.get_json()["applicable_rules"]
    priorities = [r["priority"] for r in applicable]
    assert priorities == sorted(priorities)

    by_id = {r["id"]: r for r in applicable}
    assert by_id[created_ids["equipment"]]["priority"] == 1
    assert by_id[created_ids["equipment"]]["is_effective"] is True
    assert by_id[created_ids["company"]]["priority"] == 2
    assert by_id[created_ids["company"]]["is_effective"] is False
    assert by_id[created_ids["global"]]["priority"] == 3
    assert by_id[created_ids["global"]]["is_effective"] is False
    assert by_id[warn_rule_id]["is_effective"] is True

    # Disabling the equipment override promotes the company rule to effective
    client.patch(
        f"/v1/alert-rules/{created_ids['equipment']}",
        headers=get_auth_headers(global_token),
        json={"is_active": False},
    )
    after_disable = {
        r["id"]: r
        for r in client.get(
            f"/v1/equipments/{eq1_id}/alert-rules",
            headers=get_auth_headers(company_token),
        ).get_json()["applicable_rules"]
    }
    assert after_disable[created_ids["equipment"]]["is_effective"] is False
    assert after_disable[created_ids["company"]]["is_effective"] is True


def test_04_celery_rule_evaluation_duration_hysteresis_and_scoped_email_notifications(
    client, app, init_database, monkeypatch
):
    """
    Verify M2 background alerting engine end-to-end:
    1. Transient breach shorter than duration_seconds does NOT trigger an alert
    2. Sustained breach >= duration_seconds triggers only the winning priority rule, sets equipment.status,
       and dispatches a single email scoped to active Company Admins + branch-permitted Viewers
    3. 60-second normal-reading hysteresis keeps open alert active on brief/sub-60s normal readings
       and auto-resolves once hardware readings stay normal continuously for >= 60s
    """
    from datetime import timedelta
    from decimal import Decimal

    import app.services.tasks as task_module
    from app.models import EquipmentStatus, Telemetry
    from app.services import evaluate_equipment_rules_task
    from app.utils import utc_now

    dispatched_emails: list[dict] = []

    def _capture_alert_email(recipients, alert_data, raise_on_error=False):
        dispatched_emails.append({"recipients": list(recipients), "alert_data": dict(alert_data)})
        return True

    monkeypatch.setattr(task_module, "send_alert_notification_email", _capture_alert_email)

    global_token, _ = login_user(client, "admin@polosanca.com", "admin123")
    global_headers = get_auth_headers(global_token)

    with app.app_context():
        eq1 = Equipment.query.filter_by(serial="EQ-TEST-001").first()
        eq2 = Equipment.query.filter_by(serial="EQ-TEST-002").first()
        eq1_id = str(eq1.id)
        eq2_id = str(eq2.id)

    # Global rule (> 12C, critical, 300s) shadowed on EQ-TEST-001 by equipment rule (> 7C, critical, 300s)
    client.post(
        "/v1/alert-rules",
        headers=global_headers,
        json={
            "name": "Global Crit Temp",
            "scope": "global",
            "rule_type": "temperature_high",
            "threshold_value": 12.0,
            "comparison_operator": ">",
            "duration_seconds": 300,
            "severity": "critical",
        },
    )
    eq_override_resp = client.post(
        "/v1/alert-rules",
        headers=global_headers,
        json={
            "name": "EQ1 Crit Temp Override",
            "scope": "equipment",
            "scope_id": eq1_id,
            "rule_type": "temperature_high",
            "threshold_value": 7.0,
            "comparison_operator": ">",
            "duration_seconds": 300,
            "severity": "critical",
            "message_template": "{serial} sustained {value}C > {threshold}C",
        },
    )
    eq_override_id = eq_override_resp.get_json()["id"]

    # Also add an immediate door_open warning rule on Secondary Branch equipment EQ-TEST-002 to verify UserBranchAccess email filtering
    client.post(
        "/v1/alert-rules",
        headers=global_headers,
        json={
            "name": "EQ2 Immediate Door Open",
            "scope": "equipment",
            "scope_id": eq2_id,
            "rule_type": "door_open",
            "duration_seconds": 0,
            "severity": "warning",
        },
    )

    # 1. Single transient spike on EQ-TEST-001 (0s elapsed < 300s duration_seconds) -> NO alert
    spike_resp = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json={
            "serial": "EQ-TEST-001",
            "temperature": 8.5,
            "pressure": 115.0,
            "door": 0,
            "heater": 0,
            "compressor": 1,
            "fan": 1,
        },
    )
    assert spike_resp.status_code == 200
    assert dispatched_emails == []
    with app.app_context():
        assert Alert.query.filter_by(equipment_id=eq1_id).count() == 0

    # 2. Seed prior breaching reading at t - 305s so continuous breach >= 300s, then ingest live reading
    with app.app_context():
        db.session.add(
            Telemetry(
                time=utc_now() - timedelta(seconds=305),
                equipment_id=eq1_id,
                temperature=Decimal("8.20"),
                pressure=Decimal("115.00"),
                door=0,
                heater=0,
                compressor=1,
                fan=1,
                source="device",
            )
        )
        db.session.commit()

    sustained_resp = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json={
            "serial": "EQ-TEST-001",
            "temperature": 8.8,
            "pressure": 115.0,
            "door": 0,
            "heater": 0,
            "compressor": 1,
            "fan": 1,
        },
    )
    assert sustained_resp.status_code == 200

    # Exactly 1 critical alert created for the equipment override rule + 1 email to Main Branch recipients
    assert len(dispatched_emails) == 1
    assert set(dispatched_emails[0]["recipients"]) == {
        "admin@testcompany.com",
        "viewer@testcompany.com",
        "restricted@testcompany.com",
    }
    assert "8.8C > 7.0C" in dispatched_emails[0]["alert_data"]["message"]

    with app.app_context():
        open_alerts = Alert.query.filter_by(equipment_id=eq1_id, status=AlertStatus.ACTIVE).all()
        assert len(open_alerts) == 1
        assert str(open_alerts[0].alert_rule_id) == eq_override_id
        assert db.session.get(Equipment, eq1_id).status == EquipmentStatus.CRITICAL

    # Subsequent breaching reading does NOT duplicate the open alert or re-send email
    client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json={
            "serial": "EQ-TEST-001",
            "temperature": 9.1,
            "pressure": 115.0,
            "door": 0,
            "heater": 0,
            "compressor": 1,
            "fan": 1,
        },
    )
    assert len(dispatched_emails) == 1

    # Verify Secondary Branch alert email EXCLUDES Main-Branch-only restricted@testcompany.com
    client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_002"},
        json={
            "serial": "EQ-TEST-002",
            "temperature": 3.0,
            "pressure": 110.0,
            "door": 1,
            "heater": 0,
            "compressor": 1,
            "fan": 1,
        },
    )
    assert len(dispatched_emails) == 2
    assert set(dispatched_emails[1]["recipients"]) == {
        "admin@testcompany.com",
        "viewer@testcompany.com",
    }

    # 3. 60-second sustained normal-reading hysteresis on EQ-TEST-001
    # First normal reading (0s elapsed < 60s) -> alert MUST stay active!
    client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json={
            "serial": "EQ-TEST-001",
            "temperature": 2.0,
            "pressure": 115.0,
            "door": 0,
            "heater": 0,
            "compressor": 1,
            "fan": 1,
        },
    )
    with app.app_context():
        alert_obj = Alert.query.filter_by(equipment_id=eq1_id).first()
        assert alert_obj.status == AlertStatus.ACTIVE

        # At +30s of normal readings (< 60s), alert STILL stays active
        res_30s = evaluate_equipment_rules_task.delay(
            eq1_id,
            (utc_now() + timedelta(seconds=30)).isoformat(),
        ).get()
        assert res_30s["resolved_alert_ids"] == []
        assert db.session.get(Alert, alert_obj.id).status == AlertStatus.ACTIVE

        # At +65s of continuous normal readings (>= 60s), alert auto-resolves and status returns to operational
        res_65s = evaluate_equipment_rules_task.delay(
            eq1_id,
            (utc_now() + timedelta(seconds=65)).isoformat(),
        ).get()
        assert str(alert_obj.id) in res_65s["resolved_alert_ids"]
        assert db.session.get(Alert, alert_obj.id).status == AlertStatus.RESOLVED
        assert db.session.get(Equipment, eq1_id).status == EquipmentStatus.OPERATIONAL


def test_05_alert_rule_trigger_statistics_and_global_admin_rbac(client, app, init_database):
    """
    Verify GET /v1/alert-rules/<id>/statistics returns accurate total_triggers,
    triggers_last_30_days, affected_equipments, and avg_triggers_per_equipment (Global Admin only).
    """
    from datetime import timedelta

    from app.utils import utc_now

    global_token, _ = login_user(client, "admin@polosanca.com", "admin123")
    company_token, _ = login_user(client, "admin@testcompany.com", "password123")
    viewer_token, _ = login_user(client, "viewer@testcompany.com", "viewer123")

    rule_resp = client.post(
        "/v1/alert-rules",
        headers=get_auth_headers(global_token),
        json={
            "name": "Global High Temp Stats Rule",
            "scope": "global",
            "rule_type": "temperature_high",
            "threshold_value": 9.0,
            "comparison_operator": ">",
            "duration_seconds": 300,
            "severity": "critical",
        },
    )
    assert rule_resp.status_code == 201
    rule_id = rule_resp.get_json()["id"]

    with app.app_context():
        eq1 = Equipment.query.filter_by(serial="EQ-TEST-001").first()
        eq2 = Equipment.query.filter_by(serial="EQ-TEST-002").first()
        now = utc_now()

        # 2 triggers in last 30 days (across eq1 and eq2) + 1 historical resolved trigger 45 days ago on eq1
        a_recent_1 = Alert(
            equipment_id=eq1.id,
            alert_rule_id=rule_id,
            type=AlertRuleType.TEMPERATURE_HIGH,
            severity=AlertSeverity.CRITICAL,
            message="Recent trigger 1",
            status=AlertStatus.ACTIVE,
            created_at=now - timedelta(days=2),
        )
        a_recent_2 = Alert(
            equipment_id=eq2.id,
            alert_rule_id=rule_id,
            type=AlertRuleType.TEMPERATURE_HIGH,
            severity=AlertSeverity.CRITICAL,
            message="Recent trigger 2",
            status=AlertStatus.RESOLVED,
            created_at=now - timedelta(days=10),
            resolved_at=now - timedelta(days=10),
        )
        a_old = Alert(
            equipment_id=eq1.id,
            alert_rule_id=rule_id,
            type=AlertRuleType.TEMPERATURE_HIGH,
            severity=AlertSeverity.CRITICAL,
            message="Historical trigger 45d ago",
            status=AlertStatus.RESOLVED,
            created_at=now - timedelta(days=45),
            resolved_at=now - timedelta(days=45),
        )
        db.session.add_all([a_recent_1, a_recent_2, a_old])
        db.session.commit()

    # Non-Global-Admin callers receive 403 Forbidden
    assert (
        client.get(
            f"/v1/alert-rules/{rule_id}/statistics",
            headers=get_auth_headers(company_token),
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"/v1/alert-rules/{rule_id}/statistics",
            headers=get_auth_headers(viewer_token),
        ).status_code
        == 403
    )

    stats_resp = client.get(
        f"/v1/alert-rules/{rule_id}/statistics",
        headers=get_auth_headers(global_token),
    )
    assert stats_resp.status_code == 200
    stats = stats_resp.get_json()
    assert stats["rule_id"] == rule_id
    assert stats["total_triggers"] == 3
    assert stats["triggers_last_30_days"] == 2
    assert stats["affected_equipments"] == 2
    assert stats["avg_triggers_per_equipment"] == 1.5
