"""
Test Suite: Alert Management Flow (PRD 5.7)

Tests alert visibility, filtering, inspection, acknowledgment, and manual resolution:
1. Alerts list enforces Global Admin, Company, and Branch-Restricted Viewer scoping
2. Users filter alerts by severity, status, branch_id, and equipment_id
3. Users inspect individual alert details with RBAC isolation
4. Admins acknowledge (with notes) and resolve alerts via POST custom actions (recomputing equipment.status)
5. Users query alert statistics and export alerts as CSV
"""

from app import db
from app.models import (
    Alert,
    AlertRuleType,
    AlertSeverity,
    AlertStatus,
    Branch,
    Company,
    Equipment,
    EquipmentStatus,
    EquipmentType,
)
from app.utils import hash_api_key, recompute_equipment_status, utc_now
from tests.conftest import get_auth_headers, login_user


def _seed_multi_scope_alerts(app):
    """Seed alerts on Main Branch, Secondary Branch, and an external tenant."""
    with app.app_context():
        eq1 = Equipment.query.filter_by(serial="EQ-TEST-001").first()
        eq2 = Equipment.query.filter_by(serial="EQ-TEST-002").first()
        now = utc_now()
        eq1.last_seen_at = now
        eq2.last_seen_at = now

        other_co = Company(name="Other Cold Co", contact_email="ops@othercold.com")
        db.session.add(other_co)
        db.session.flush()
        other_branch = Branch(company_id=other_co.id, name="Other Branch", address="999 Other Ave")
        db.session.add(other_branch)
        db.session.flush()
        other_eq = Equipment(
            serial="EQ-OTHER-001",
            type=EquipmentType.COLD_ROOM,
            company_id=other_co.id,
            branch_id=other_branch.id,
            api_key=hash_api_key("other_api_key_001"),
            last_seen_at=now,
            status=EquipmentStatus.OPERATIONAL,
        )
        db.session.add(other_eq)
        db.session.flush()

        a1 = Alert(
            equipment_id=eq1.id,
            type=AlertRuleType.TEMPERATURE_HIGH,
            severity=AlertSeverity.CRITICAL,
            message="EQ-TEST-001 high temp (12.5°C > 8.0°C)",
            status=AlertStatus.ACTIVE,
        )
        a2 = Alert(
            equipment_id=eq2.id,
            type=AlertRuleType.DOOR_OPEN,
            severity=AlertSeverity.WARNING,
            message="EQ-TEST-002 door open",
            status=AlertStatus.ACTIVE,
        )
        a3 = Alert(
            equipment_id=other_eq.id,
            type=AlertRuleType.PRESSURE_HIGH,
            severity=AlertSeverity.CRITICAL,
            message="EQ-OTHER-001 pressure high",
            status=AlertStatus.ACTIVE,
        )
        db.session.add_all([a1, a2, a3])
        db.session.flush()
        recompute_equipment_status(eq1.id, now=now)
        recompute_equipment_status(eq2.id, now=now)
        recompute_equipment_status(other_eq.id, now=now)
        db.session.commit()

        return {
            "a1_id": str(a1.id),
            "a2_id": str(a2.id),
            "a3_id": str(a3.id),
            "eq1_id": str(eq1.id),
            "eq2_id": str(eq2.id),
            "branch1_id": str(eq1.branch_id),
            "branch2_id": str(eq2.branch_id),
        }


def test_01_list_alerts_with_tenant_and_branch_scoping(client, app, init_database):
    """PRD 5.7 Steps 2-3: Global Admin sees all 3 alerts; Company users see 2; Restricted viewer sees 1."""
    ids = _seed_multi_scope_alerts(app)

    global_token, _ = login_user(client, "admin@polosanca.com", "admin123")
    company_token, _ = login_user(client, "admin@testcompany.com", "password123")
    viewer_token, _ = login_user(client, "viewer@testcompany.com", "viewer123")
    restricted_token, _ = login_user(client, "restricted@testcompany.com", "restricted123")

    global_alerts = client.get("/v1/alerts", headers=get_auth_headers(global_token)).get_json()["alerts"]
    assert len(global_alerts) == 3

    company_alerts = client.get("/v1/alerts", headers=get_auth_headers(company_token)).get_json()["alerts"]
    assert {a["id"] for a in company_alerts} == {ids["a1_id"], ids["a2_id"]}

    viewer_alerts = client.get("/v1/alerts", headers=get_auth_headers(viewer_token)).get_json()["alerts"]
    assert {a["id"] for a in viewer_alerts} == {ids["a1_id"], ids["a2_id"]}

    restricted_alerts = client.get("/v1/alerts", headers=get_auth_headers(restricted_token)).get_json()["alerts"]
    assert [a["id"] for a in restricted_alerts] == [ids["a1_id"]]


def test_02_filter_alerts_by_severity_status_branch_and_equipment(client, app, init_database):
    """PRD 5.7 Step 4: Filter alerts by severity, status, branch_id, and equipment_id."""
    ids = _seed_multi_scope_alerts(app)
    company_token, _ = login_user(client, "admin@testcompany.com", "password123")
    headers = get_auth_headers(company_token)

    crit = client.get("/v1/alerts?severity=critical", headers=headers).get_json()["alerts"]
    assert [a["id"] for a in crit] == [ids["a1_id"]]

    by_branch = client.get(f"/v1/alerts?branch_id={ids['branch2_id']}", headers=headers).get_json()["alerts"]
    assert [a["id"] for a in by_branch] == [ids["a2_id"]]

    by_eq = client.get(f"/v1/alerts?equipment_id={ids['eq1_id']}", headers=headers).get_json()["alerts"]
    assert [a["id"] for a in by_eq] == [ids["a1_id"]]

    assert client.get("/v1/alerts?severity=invalid", headers=headers).status_code == 400
    assert client.get("/v1/alerts?status=invalid", headers=headers).status_code == 400


def test_03_inspect_alert_detail_and_rbac_isolation(client, app, init_database):
    """PRD 5.7 Step 5: GET /v1/alerts/<id> returns context for permitted users and 403 outside tenant/branch."""
    ids = _seed_multi_scope_alerts(app)
    company_token, _ = login_user(client, "admin@testcompany.com", "password123")
    restricted_token, _ = login_user(client, "restricted@testcompany.com", "restricted123")

    detail_resp = client.get(f"/v1/alerts/{ids['a1_id']}", headers=get_auth_headers(restricted_token))
    assert detail_resp.status_code == 200
    detail = detail_resp.get_json()
    assert detail["serial"] == "EQ-TEST-001"
    assert detail["branch_id"] == ids["branch1_id"]
    assert "12.5°C" in detail["message"]

    # Restricted viewer blocked from Secondary Branch alert
    assert client.get(f"/v1/alerts/{ids['a2_id']}", headers=get_auth_headers(restricted_token)).status_code == 403

    # Company Admin blocked from another company's alert
    assert client.get(f"/v1/alerts/{ids['a3_id']}", headers=get_auth_headers(company_token)).status_code == 403


def test_04_admin_acknowledges_and_resolves_alert_while_viewer_forbidden(client, app, init_database):
    """
    PRD 5.7 Step 6:
    Viewer is forbidden from acknowledging/resolving; Company Admin acknowledges with notes,
    then resolves alert (recomputing equipment.status to operational); re-acknowledging a resolved alert returns 409.
    """
    ids = _seed_multi_scope_alerts(app)
    company_token, _ = login_user(client, "admin@testcompany.com", "password123")
    viewer_token, _ = login_user(client, "viewer@testcompany.com", "viewer123")
    admin_user_id = client.get("/v1/auth/me", headers=get_auth_headers(company_token)).get_json()["id"]

    assert (
        client.post(
            f"/v1/alerts/{ids['a1_id']}/acknowledge",
            headers=get_auth_headers(viewer_token),
            json={"notes": "Viewer try"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/v1/alerts/{ids['a1_id']}/resolve",
            headers=get_auth_headers(viewer_token),
        ).status_code
        == 403
    )

    ack_resp = client.post(
        f"/v1/alerts/{ids['a1_id']}/acknowledge",
        headers=get_auth_headers(company_token),
        json={"notes": "Checked condenser coil"},
    )
    assert ack_resp.status_code == 200
    ack_data = ack_resp.get_json()
    assert ack_data["status"] == "acknowledged"
    assert ack_data["acknowledgment_notes"] == "Checked condenser coil"
    assert ack_data["acknowledged_by"] == admin_user_id

    res_resp = client.post(
        f"/v1/alerts/{ids['a1_id']}/resolve",
        headers=get_auth_headers(company_token),
    )
    assert res_resp.status_code == 200
    assert res_resp.get_json()["status"] == "resolved"
    assert res_resp.get_json()["resolved_at"] is not None

    # Equipment status transitions back to operational
    eq_state = client.get(
        f"/v1/equipments/{ids['eq1_id']}",
        headers=get_auth_headers(company_token),
    ).get_json()
    assert eq_state["status"] == "operational"

    # Resolved alert cannot be acknowledged again (409 Conflict)
    re_ack = client.post(
        f"/v1/alerts/{ids['a1_id']}/acknowledge",
        headers=get_auth_headers(company_token),
    )
    assert re_ack.status_code == 409


def test_05_alert_statistics_and_csv_export(client, app, init_database):
    """PRD 5.7 Step 4: Query active alert counts by severity/type and export filtered alerts as text/csv."""
    import csv
    import io

    _seed_multi_scope_alerts(app)
    global_token, _ = login_user(client, "admin@polosanca.com", "admin123")
    company_token, _ = login_user(client, "admin@testcompany.com", "password123")
    restricted_token, _ = login_user(client, "restricted@testcompany.com", "restricted123")

    # Global Admin sees all 3 active alerts across tenants
    g_stats = client.get("/v1/alerts/statistics", headers=get_auth_headers(global_token)).get_json()
    assert g_stats["total_active"] == 3
    assert g_stats["by_severity"] == {"warning": 1, "critical": 2}

    # Company Admin sees 2 active alerts for Test Company
    stats_resp = client.get("/v1/alerts/statistics", headers=get_auth_headers(company_token))
    assert stats_resp.status_code == 200
    c_stats = stats_resp.get_json()
    assert c_stats["total_active"] == 2
    assert c_stats["by_severity"] == {"warning": 1, "critical": 1}
    assert c_stats["by_type"] == {"temperature_high": 1, "door_open": 1}

    # Restricted Viewer sees only Main Branch active alert
    r_stats = client.get("/v1/alerts/statistics", headers=get_auth_headers(restricted_token)).get_json()
    assert r_stats["total_active"] == 1
    assert r_stats["by_severity"] == {"warning": 0, "critical": 1}
    assert r_stats["by_type"] == {"temperature_high": 1}

    # CSV export filtered by severity=critical for Company Admin
    export_resp = client.get("/v1/alerts/export?severity=critical", headers=get_auth_headers(company_token))
    assert export_resp.status_code == 200
    assert export_resp.mimetype == "text/csv"
    crit_rows = list(csv.DictReader(io.StringIO(export_resp.get_data(as_text=True))))
    assert len(crit_rows) == 1
    assert crit_rows[0]["serial"] == "EQ-TEST-001"
    assert crit_rows[0]["severity"] == "critical"

    # Restricted viewer unfiltered CSV export only includes Main Branch alert (never Secondary Branch or external company)
    rest_export = client.get("/v1/alerts/export", headers=get_auth_headers(restricted_token))
    assert rest_export.status_code == 200
    rest_rows = list(csv.DictReader(io.StringIO(rest_export.get_data(as_text=True))))
    assert [r["serial"] for r in rest_rows] == ["EQ-TEST-001"]
