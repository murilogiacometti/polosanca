"""
Test Suite: Equipment Monitoring Flow (PRD 5.4)

Tests end-to-end dashboard monitoring journeys:
1. User polls GET /v1/telemetry/realtime for live equipment snapshots (scoped by role & branch access)
2. User filters GET /v1/equipments by branch, equipment type, status, and serial search
3. User inspects equipment detail, historical telemetry (field projection, date range, 5min buckets)
4. User exports telemetry as CSV (capped at 90 days for interval=raw)
"""

from datetime import timedelta
from decimal import Decimal

from app import db
from app.models import Equipment, Telemetry
from app.utils import utc_now
from tests.conftest import get_auth_headers, login_user


def _ingest_sample(client, api_key: str, serial: str, temperature: float, pressure: float = 118.5, door: int = 0):
    resp = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": api_key},
        json={
            "serial": serial,
            "temperature": temperature,
            "pressure": pressure,
            "door": door,
            "heater": 0,
            "compressor": 1,
            "fan": 1,
        },
    )
    assert resp.status_code == 200
    return resp.get_json()


def test_01_realtime_polling_dashboard_snapshot_and_branch_scoping(client, init_database):
    """
    PRD 5.4 Steps 1-2:
    Hardware reports on both branches; full-access viewer sees both live snapshots on
    GET /v1/telemetry/realtime, while branch-restricted viewer only sees assigned Main Branch.
    """
    _ingest_sample(client, "test_api_key_001", "EQ-TEST-001", -18.4, door=0)
    _ingest_sample(client, "test_api_key_002", "EQ-TEST-002", 3.6, door=1)

    viewer_token, _ = login_user(client, "viewer@testcompany.com", "viewer123")
    restricted_token, _ = login_user(client, "restricted@testcompany.com", "restricted123")

    full_rt = client.get("/v1/telemetry/realtime", headers=get_auth_headers(viewer_token))
    assert full_rt.status_code == 200
    full_items = {e["serial"]: e for e in full_rt.get_json()["equipment"]}
    assert set(full_items.keys()) == {"EQ-TEST-001", "EQ-TEST-002"}
    assert full_items["EQ-TEST-001"]["status"] == "operational"
    assert full_items["EQ-TEST-001"]["temperature"] == -18.4
    assert full_items["EQ-TEST-002"]["door"] == "open"

    rest_rt = client.get("/v1/telemetry/realtime", headers=get_auth_headers(restricted_token))
    assert rest_rt.status_code == 200
    rest_serials = [e["serial"] for e in rest_rt.get_json()["equipment"]]
    assert rest_serials == ["EQ-TEST-001"]


def test_02_filter_equipment_dashboard_by_type_status_branch_and_search(client, init_database):
    """
    PRD 5.4 Step 3:
    User filters equipment overview by equipment type, operational/offline status, branch_id, and serial search.
    """
    # Only EQ-TEST-001 reports -> becomes operational; EQ-TEST-002 stays offline
    _ingest_sample(client, "test_api_key_001", "EQ-TEST-001", -19.0)

    viewer_token, _ = login_user(client, "viewer@testcompany.com", "viewer123")
    headers = get_auth_headers(viewer_token)

    # Filter by type
    freezers = client.get("/v1/equipments?type=freezer", headers=headers).get_json()["equipment"]
    assert [e["serial"] for e in freezers] == ["EQ-TEST-001"]

    refrigerators = client.get("/v1/equipments?type=refrigerator", headers=headers).get_json()["equipment"]
    assert [e["serial"] for e in refrigerators] == ["EQ-TEST-002"]

    # Filter by status
    operational = client.get("/v1/equipments?status=operational", headers=headers).get_json()["equipment"]
    assert [e["serial"] for e in operational] == ["EQ-TEST-001"]

    offline = client.get("/v1/equipments?status=offline", headers=headers).get_json()["equipment"]
    assert [e["serial"] for e in offline] == ["EQ-TEST-002"]

    # Filter by serial search substring
    searched = client.get("/v1/equipments?search=002", headers=headers).get_json()["equipment"]
    assert [e["serial"] for e in searched] == ["EQ-TEST-002"]

    # Invalid filter values return 400 Bad Request
    assert client.get("/v1/equipments?type=oven", headers=headers).status_code == 400
    assert client.get("/v1/equipments?status=broken", headers=headers).status_code == 400


def test_03_equipment_detail_and_historical_telemetry_with_field_projection(client, app, init_database):
    """
    PRD 5.4 Steps 4-5:
    User inspects equipment detail and queries historical telemetry with field projection,
    time window filters, and 5-minute trend buckets.
    """
    base = utc_now().replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
    with app.app_context():
        eq = Equipment.query.filter_by(serial="EQ-TEST-001").first()
        eq_id = str(eq.id)
        for idx, temp in enumerate([-20.0, -18.0, -16.0]):
            db.session.add(
                Telemetry(
                    time=base + timedelta(minutes=idx * 10),
                    equipment_id=eq.id,
                    temperature=Decimal(str(temp)),
                    pressure=Decimal("115.00"),
                    door=1 if idx == 2 else 0,
                    heater=0,
                    compressor=1,
                    fan=1,
                    source="device",
                )
            )
        db.session.commit()

    viewer_token, _ = login_user(client, "viewer@testcompany.com", "viewer123")
    headers = get_auth_headers(viewer_token)

    detail_resp = client.get(f"/v1/equipments/{eq_id}", headers=headers)
    assert detail_resp.status_code == 200
    detail = detail_resp.get_json()
    assert detail["serial"] == "EQ-TEST-001"
    assert detail["branch_name"] == "Main Branch"

    # Field projection (temperature,door only) + date window excluding earliest point
    start_iso = (base + timedelta(minutes=5)).isoformat()
    hist_resp = client.get(
        f"/v1/equipments/{eq_id}/telemetry",
        query_string={"fields": "temperature,door", "start_date": start_iso},
        headers=headers,
    )
    assert hist_resp.status_code == 200
    hist = hist_resp.get_json()
    assert hist["count"] == 2
    first_point = hist["data"][0]
    assert "temperature" in first_point and "door" in first_point
    assert "pressure" not in first_point and "compressor" not in first_point


def test_04_export_equipment_telemetry_csv_and_90_day_raw_cap(client, app, init_database):
    """
    PRD 5.4 Step 4:
    Export equipment telemetry (device + manual) as streamed text/csv, enforce 90-day max window
    on interval=raw (allowing up to 2 years on aggregates), and enforce branch RBAC.
    """
    import csv
    import io

    admin_token, _ = login_user(client, "admin@testcompany.com", "password123")
    viewer_token, _ = login_user(client, "viewer@testcompany.com", "viewer123")
    restricted_token, _ = login_user(client, "restricted@testcompany.com", "restricted123")

    headers = get_auth_headers(viewer_token)
    equipments = {e["serial"]: e["id"] for e in client.get("/v1/equipments", headers=headers).get_json()["equipment"]}
    eq1_id = equipments["EQ-TEST-001"]
    eq2_id = equipments["EQ-TEST-002"]

    # Log a manual offline temperature first (while EQ-TEST-001 is offline), then ingest a live hardware reading
    manual_resp = client.post(
        f"/v1/equipments/{eq1_id}/telemetry/manual",
        headers=get_auth_headers(admin_token),
        json={"temperature": -17.2, "notes": "Analog check before reconnect"},
    )
    assert manual_resp.status_code == 201
    _ingest_sample(client, "test_api_key_001", "EQ-TEST-001", -18.0, pressure=118.5, door=0)

    csv_resp = client.get(f"/v1/equipments/{eq1_id}/telemetry/export?interval=raw", headers=headers)
    assert csv_resp.status_code == 200
    assert csv_resp.mimetype == "text/csv"
    assert "attachment;" in csv_resp.headers.get("Content-Disposition", "")

    parsed_rows = list(csv.DictReader(io.StringIO(csv_resp.get_data(as_text=True))))
    assert len(parsed_rows) == 2
    sources = {r["source"]: r for r in parsed_rows}
    assert set(sources.keys()) == {"device", "manual"}
    assert float(sources["device"]["temperature_c"]) == -18.0
    assert sources["device"]["door"] == "closed"
    assert float(sources["manual"]["temperature_c"]) == -17.2
    assert sources["manual"]["pressure_kpa"] == ""
    assert sources["manual"]["notes"] == "Analog check before reconnect"

    # Restricted viewer is blocked from exporting Secondary Branch equipment
    assert (
        client.get(
            f"/v1/equipments/{eq2_id}/telemetry/export?interval=raw",
            headers=get_auth_headers(restricted_token),
        ).status_code
        == 403
    )

    # Raw export > 90 days returns 400 Bad Request
    now = utc_now()
    over_90d_start = (now - timedelta(days=95)).isoformat()
    capped_resp = client.get(
        f"/v1/equipments/{eq1_id}/telemetry/export",
        query_string={"interval": "raw", "start_date": over_90d_start, "end_date": now.isoformat()},
        headers=headers,
    )
    assert capped_resp.status_code == 400

    # Aggregated 1hour export supports > 90 days (e.g. 180 days -> 200), but rejects > 2 years (750 days -> 400)
    agg_ok = client.get(
        f"/v1/equipments/{eq1_id}/telemetry/export",
        query_string={
            "interval": "1hour",
            "start_date": (now - timedelta(days=180)).isoformat(),
            "end_date": now.isoformat(),
        },
        headers=headers,
    )
    assert agg_ok.status_code == 200
    assert agg_ok.mimetype == "text/csv"
    agg_rows = list(csv.DictReader(io.StringIO(agg_ok.get_data(as_text=True))))
    assert len(agg_rows) >= 1
    assert int(agg_rows[0]["sample_count"]) == 2

    agg_over_2y = client.get(
        f"/v1/equipments/{eq1_id}/telemetry/export",
        query_string={
            "interval": "1day",
            "start_date": (now - timedelta(days=750)).isoformat(),
            "end_date": now.isoformat(),
        },
        headers=headers,
    )
    assert agg_over_2y.status_code == 400


def test_05_telemetry_overview_sparklines_and_threshold_context(client, app, init_database):
    """
    Dashboard glanceability batch endpoint (/v1/telemetry/overview):
    Returns 24-hour hourly sparklines and priority-resolved target temperature range labels
    while enforcing tenant and restricted-branch viewer isolation.
    """
    from app.models import AlertRule, AlertRuleScope, AlertRuleType, AlertSeverity, ComparisonOperator

    now = utc_now().replace(minute=15, second=0, microsecond=0)
    with app.app_context():
        eq1 = Equipment.query.filter_by(serial="EQ-TEST-001").first()
        eq2 = Equipment.query.filter_by(serial="EQ-TEST-002").first()
        eq1_id = str(eq1.id)
        eq2_id = str(eq2.id)

        # Seed 3 hourly points for EQ-TEST-001 inside last 24h + 1 point > 24h ago (must be excluded)
        for hours_ago, temp in [(30, -25.0), (3, -19.5), (2, -18.0), (1, -17.2)]:
            db.session.add(
                Telemetry(
                    time=now - timedelta(hours=hours_ago),
                    equipment_id=eq1.id,
                    temperature=Decimal(str(temp)),
                    pressure=Decimal("115.00"),
                    door=0,
                    heater=0,
                    compressor=1,
                    fan=1,
                    source="device",
                )
            )

        # Global high ceiling (8.0 °C) overridden on EQ-TEST-001 by equipment-specific range (-22.0 to -16.0 °C)
        # and on EQ-TEST-002 by company-level high rule (2.0 °C)
        db.session.add_all(
            [
                AlertRule(
                    name="Global High Ceiling",
                    rule_type=AlertRuleType.TEMPERATURE_HIGH,
                    scope=AlertRuleScope.GLOBAL,
                    scope_id=None,
                    threshold_value=Decimal("8.0"),
                    comparison_operator=ComparisonOperator.GT,
                    duration_seconds=300,
                    severity=AlertSeverity.WARNING,
                    message_template="Temp {value} > {threshold}",
                    is_active=True,
                ),
                AlertRule(
                    name="Company Chiller High",
                    rule_type=AlertRuleType.TEMPERATURE_HIGH,
                    scope=AlertRuleScope.COMPANY,
                    scope_id=eq2.company_id,
                    threshold_value=Decimal("2.0"),
                    comparison_operator=ComparisonOperator.GT,
                    duration_seconds=300,
                    severity=AlertSeverity.WARNING,
                    message_template="Temp {value} > {threshold}",
                    is_active=True,
                ),
                AlertRule(
                    name="EQ1 Freezer High",
                    rule_type=AlertRuleType.TEMPERATURE_HIGH,
                    scope=AlertRuleScope.EQUIPMENT,
                    scope_id=eq1.id,
                    threshold_value=Decimal("-16.0"),
                    comparison_operator=ComparisonOperator.GT,
                    duration_seconds=300,
                    severity=AlertSeverity.WARNING,
                    message_template="Temp {value} > {threshold}",
                    is_active=True,
                ),
                AlertRule(
                    name="EQ1 Freezer Low",
                    rule_type=AlertRuleType.TEMPERATURE_LOW,
                    scope=AlertRuleScope.EQUIPMENT,
                    scope_id=eq1.id,
                    threshold_value=Decimal("-22.0"),
                    comparison_operator=ComparisonOperator.LT,
                    duration_seconds=300,
                    severity=AlertSeverity.WARNING,
                    message_template="Temp {value} < {threshold}",
                    is_active=True,
                ),
            ]
        )
        db.session.commit()

    viewer_token, _ = login_user(client, "viewer@testcompany.com", "viewer123")
    restricted_token, _ = login_user(client, "restricted@testcompany.com", "restricted123")

    ov_resp = client.get("/v1/telemetry/overview", headers=get_auth_headers(viewer_token))
    assert ov_resp.status_code == 200
    overview = ov_resp.get_json()["overview"]
    assert set(overview.keys()) == {eq1_id, eq2_id}

    # EQ-TEST-001 has 3 hourly sparkline points within last 24h and combined low-to-high target label
    assert [pt["v"] for pt in overview[eq1_id]["sparkline_24h"]] == [-19.5, -18.0, -17.2]
    assert overview[eq1_id]["threshold"]["label"] == "Meta: -22,0 a -16,0 °C"
    assert overview[eq1_id]["threshold"]["low"] == -22.0
    assert overview[eq1_id]["threshold"]["high"] == -16.0

    # EQ-TEST-002 inherits Company Chiller High (2.0 °C) over Global High (8.0 °C)
    assert overview[eq2_id]["sparkline_24h"] == []
    assert overview[eq2_id]["threshold"]["label"] == "Meta: ≤ 2,0 °C"
    assert overview[eq2_id]["threshold"]["high"] == 2.0

    # Restricted viewer only receives Main Branch equipment (EQ-TEST-001)
    rest_resp = client.get("/v1/telemetry/overview", headers=get_auth_headers(restricted_token))
    assert rest_resp.status_code == 200
    assert set(rest_resp.get_json()["overview"].keys()) == {eq1_id}
