"""
Test Suite: Equipment Data Ingestion Flow (PRD 5.9)

Tests the telemetry data ingestion process:
1. Equipment collects sensor readings
2. Equipment sends POST request with monitoring data
3. Server validates equipment serial number
4. Server captures timestamp and stores data
5. Server evaluates alert rules
6. Server returns success response
7. Dashboard updates with new data
"""

from tests.conftest import get_auth_headers


def test_01_equipment_sends_telemetry_data_successfully(client, init_database):
    """
    Test: Equipment successfully sends telemetry data to server

    Flow:
    1. Equipment sends POST with all required fields
    2. Server validates serial number
    3. Server stores data with timestamp
    4. Server returns success response
    """
    response = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json={
            "serial": "EQ-TEST-001",
            "temperature": 4.5,
            "pressure": 120.3,
            "door": 0,
            "heater": 1,
            "compressor": 1,
            "fan": 1,
        },
    )

    assert response.status_code == 200
    data = response.get_json()

    assert data["success"] is True
    assert "message" in data
    assert "timestamp" in data
    assert "record_id" in data


def test_02_equipment_data_with_invalid_serial(client, init_database):
    """
    Test: Server rejects data from unknown equipment serial

    Error Scenario: Unknown serial number
    """
    response = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "some_api_key"},
        json={
            "serial": "EQ-UNKNOWN-999",
            "temperature": 5.0,
            "pressure": 120.0,
            "door": 0,
            "heater": 1,
            "compressor": 1,
            "fan": 1,
        },
    )

    assert response.status_code == 404
    data = response.get_json()
    assert "error" in data or "message" in data


def test_03_equipment_data_with_missing_fields(client, init_database):
    """
    Test: Server validates required fields in telemetry data

    Error Scenario: Missing required fields
    """
    # Missing temperature
    response = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json={"serial": "EQ-TEST-001", "pressure": 120.0, "door": 0, "heater": 1, "compressor": 1, "fan": 1},
    )
    assert response.status_code == 400

    # Missing serial
    response = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json={"temperature": 4.5, "pressure": 120.0, "door": 0, "heater": 1, "compressor": 1, "fan": 1},
    )
    assert response.status_code == 400


def test_04_equipment_data_without_api_key(client, init_database):
    """
    Test: Server requires API key authentication for telemetry
    """
    response = client.post(
        "/v1/equipments/telemetry",
        json={
            "serial": "EQ-TEST-001",
            "temperature": 4.5,
            "pressure": 120.3,
            "door": 0,
            "heater": 1,
            "compressor": 1,
            "fan": 1,
        },
    )

    assert response.status_code == 401


def test_05_equipment_status_updates_after_data_ingestion(client, init_database):
    """
    Test: Equipment status changes from offline to operational after receiving data

    Flow:
    1. Equipment initially has offline status
    2. Equipment sends telemetry data
    3. Equipment status updates to operational
    4. last_seen_at timestamp is updated
    """
    from tests.conftest import login_user

    # Send telemetry data
    client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json={
            "serial": "EQ-TEST-001",
            "temperature": 4.5,
            "pressure": 120.3,
            "door": 0,
            "heater": 1,
            "compressor": 1,
            "fan": 1,
        },
    )

    # Check equipment status via API
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    equipment_list = client.get("/v1/equipments", headers=get_auth_headers(access_token)).get_json()["equipment"]

    eq_test_001 = next((eq for eq in equipment_list if eq["serial"] == "EQ-TEST-001"), None)
    assert eq_test_001 is not None
    assert eq_test_001["status"] in ["operational", "warning", "critical"]  # No longer offline
    assert eq_test_001["current_data"] is not None
    assert eq_test_001["current_data"]["temperature"] == 4.5


def test_06_multiple_telemetry_submissions(client, init_database):
    """
    Test: Equipment can send multiple telemetry readings over time

    Flow:
    1. Equipment sends first reading
    2. Equipment sends second reading with different values
    3. Equipment sends third reading
    4. All readings are stored
    5. Latest reading is reflected in equipment status
    """
    from tests.conftest import login_user

    # Send multiple readings
    for i in range(3):
        response = client.post(
            "/v1/equipments/telemetry",
            headers={"X-API-Key": "test_api_key_001"},
            json={
                "serial": "EQ-TEST-001",
                "temperature": 4.0 + (i * 0.5),
                "pressure": 120.0 + i,
                "door": i % 2,
                "heater": 1,
                "compressor": 1,
                "fan": 1,
            },
        )
        assert response.status_code == 200

    # Verify latest reading is shown
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    equipment_list = client.get("/v1/equipments", headers=get_auth_headers(access_token)).get_json()["equipment"]

    eq_test_001 = next((eq for eq in equipment_list if eq["serial"] == "EQ-TEST-001"), None)
    assert eq_test_001 is not None
    # Should show latest reading
    assert eq_test_001["current_data"]["temperature"] == 5.0
    assert eq_test_001["current_data"]["pressure"] == 122.0


def test_07_telemetry_data_retrievable_via_api(client, init_database):
    """
    Test: Historical telemetry data can be retrieved

    Flow:
    1. Equipment sends telemetry data
    2. User queries historical data via API
    3. System returns time-series data
    """
    from tests.conftest import login_user

    # Send telemetry
    client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json={
            "serial": "EQ-TEST-001",
            "temperature": 4.5,
            "pressure": 120.3,
            "door": 0,
            "heater": 1,
            "compressor": 1,
            "fan": 1,
        },
    )

    # Retrieve via API
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    equipment_list = client.get("/v1/equipments", headers=get_auth_headers(access_token)).get_json()["equipment"]

    eq_test_001 = next((eq for eq in equipment_list if eq["serial"] == "EQ-TEST-001"), None)
    equipment_id = eq_test_001["id"]

    # Get telemetry history
    response = client.get(f"/v1/equipments/{equipment_id}/telemetry", headers=get_auth_headers(access_token))

    assert response.status_code == 200
    data = response.get_json()
    assert "data" in data
    assert len(data["data"]) > 0
    assert data["data"][0]["temperature"] is not None


def test_08_form_urlencoded_telemetry_submission(client, init_database):
    """
    Test: Equipment can send data as application/x-www-form-urlencoded

    The API should support both JSON and form-encoded data
    """
    response = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001", "Content-Type": "application/x-www-form-urlencoded"},
        data={
            "serial": "EQ-TEST-001",
            "temperature": "4.5",
            "pressure": "120.3",
            "door": "0",
            "heater": "1",
            "compressor": "1",
            "fan": "1",
        },
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True


def test_09_telemetry_with_different_door_states(client, init_database):
    """
    Test: System correctly handles door open/closed states
    """
    # Door closed
    response_closed = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json={
            "serial": "EQ-TEST-001",
            "temperature": 4.5,
            "pressure": 120.3,
            "door": 0,  # Closed
            "heater": 1,
            "compressor": 1,
            "fan": 1,
        },
    )
    assert response_closed.status_code == 200

    # Door open
    response_open = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json={
            "serial": "EQ-TEST-001",
            "temperature": 5.5,
            "pressure": 118.0,
            "door": 1,  # Open
            "heater": 1,
            "compressor": 1,
            "fan": 1,
        },
    )
    assert response_open.status_code == 200


def test_10_high_frequency_telemetry_submissions(client, init_database):
    """
    Test: System handles multiple rapid telemetry submissions

    Flow:
    1. Equipment sends 10 rapid telemetry readings
    2. All are accepted and stored
    3. System processes without errors
    """
    for i in range(10):
        response = client.post(
            "/v1/equipments/telemetry",
            headers={"X-API-Key": "test_api_key_001"},
            json={
                "serial": "EQ-TEST-001",
                "temperature": 4.0 + (i * 0.1),
                "pressure": 120.0 + i,
                "door": 0,
                "heater": 1,
                "compressor": 1,
                "fan": 1,
            },
        )
        assert response.status_code == 200

    # Verify all data was stored (check via telemetry endpoint)
    from tests.conftest import login_user

    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    equipment_list = client.get("/v1/equipments", headers=get_auth_headers(access_token)).get_json()["equipment"]

    eq_test_001 = next((eq for eq in equipment_list if eq["serial"] == "EQ-TEST-001"), None)
    equipment_id = eq_test_001["id"]

    telemetry = client.get(
        f"/v1/equipments/{equipment_id}/telemetry", headers=get_auth_headers(access_token)
    ).get_json()

    assert telemetry["count"] >= 10


def test_11_manual_offline_temperature_entry_fallback(client, app, init_database):
    """
    PRD 5.9 Error & Offline Fallback Scenario:
    When equipment is offline, Admin logs manual thermometer reading via
    POST /v1/equipments/<id>/telemetry/manual (source="manual", status stays offline,
    last_seen_at/current_data untouched, 0.0°C preserved); returns 409 Conflict once online.
    """
    from app import db
    from app.models import Equipment, EquipmentStatus
    from tests.conftest import login_user

    admin_token, _ = login_user(client, "admin@testcompany.com", "password123")
    viewer_token, _ = login_user(client, "viewer@testcompany.com", "viewer123")
    headers = get_auth_headers(admin_token)
    admin_id = client.get("/v1/auth/me", headers=headers).get_json()["id"]
    eq_id = client.get("/v1/equipments?search=EQ-TEST-001", headers=headers).get_json()["equipment"][0]["id"]

    # Viewer forbidden from logging manual readings (403)
    assert (
        client.post(
            f"/v1/equipments/{eq_id}/telemetry/manual",
            headers=get_auth_headers(viewer_token),
            json={"temperature": -18.0},
        ).status_code
        == 403
    )

    # Company Admin logs manual reading while offline (including 0.0°C falsy-zero check)
    zero_resp = client.post(
        f"/v1/equipments/{eq_id}/telemetry/manual",
        headers=headers,
        json={"temperature": 0.0, "notes": "Ice-bath zero check"},
    )
    assert zero_resp.status_code == 201
    assert zero_resp.get_json()["temperature"] == 0.0

    manual_resp = client.post(
        f"/v1/equipments/{eq_id}/telemetry/manual",
        headers=headers,
        json={"temperature": -17.2, "notes": "Handheld probe check during Wi-Fi outage"},
    )
    assert manual_resp.status_code == 201
    manual_data = manual_resp.get_json()
    assert manual_data["source"] == "manual"
    assert manual_data["recorded_by"] == admin_id

    # Equipment remains offline and last_seen_at / current_data stay untouched
    with app.app_context():
        eq = db.session.get(Equipment, eq_id)
        assert eq.status == EquipmentStatus.OFFLINE
        assert eq.last_seen_at is None
        assert eq.current_data in (None, {})

    # Once hardware reports live telemetry (online), manual fallback returns 409 Conflict
    live = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json={
            "serial": "EQ-TEST-001",
            "temperature": -18.5,
            "pressure": 118.0,
            "door": 0,
            "heater": 0,
            "compressor": 1,
            "fan": 1,
        },
    )
    assert live.status_code == 200

    conflict_resp = client.post(
        f"/v1/equipments/{eq_id}/telemetry/manual",
        headers=headers,
        json={"temperature": -18.0, "notes": "Should fail while online"},
    )
    assert conflict_resp.status_code == 409


def test_12_telemetry_rate_limiting_per_equipment_api_key(client, init_database):
    """
    Verify /v1/equipments/telemetry enforces 12 req/min per X-API-Key (429 on 13th),
    while isolating quotas per equipment so EQ-TEST-002 continues ingesting normally.
    """
    payload_1 = {
        "serial": "EQ-TEST-001",
        "temperature": -18.0,
        "pressure": 115.0,
        "door": 0,
        "heater": 0,
        "compressor": 1,
        "fan": 1,
    }
    for _ in range(12):
        resp = client.post(
            "/v1/equipments/telemetry",
            headers={"X-API-Key": "test_api_key_001"},
            json=payload_1,
        )
        assert resp.status_code == 200

    throttled = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_001"},
        json=payload_1,
    )
    assert throttled.status_code == 429

    # Second equipment's API key has its own independent 12/min quota
    other_eq = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": "test_api_key_002"},
        json={**payload_1, "serial": "EQ-TEST-002", "temperature": 3.5},
    )
    assert other_eq.status_code == 200


def test_13_periodic_offline_heartbeat_sweep_10_min_badge_and_offline_rule(client, app, init_database, monkeypatch):
    """
    Verify M2 periodic 60s offline heartbeat sweep:
    1. Flips equipment.status to 'offline' after 10 minutes (600s) of silence even without an alert rule
    2. Fires equipment_offline alert + single email once silence >= rule.duration_seconds (idempotently)
    3. Immediately auto-resolves equipment_offline alert and restores 'operational' upon hardware heartbeat recovery
    """
    from datetime import timedelta

    import app.services.tasks as task_module
    from app import db
    from app.models import Alert, AlertRuleType, AlertStatus, Equipment, EquipmentStatus
    from app.services import sweep_offline_equipment_task
    from app.utils import utc_now
    from tests.conftest import login_user

    emails: list[dict] = []
    monkeypatch.setattr(
        task_module,
        "send_alert_notification_email",
        lambda recipients, alert_data, raise_on_error=False: emails.append(
            {"recipients": list(recipients), "alert_data": dict(alert_data)}
        )
        or True,
    )

    # Bring EQ-TEST-001 online via live telemetry
    assert (
        client.post(
            "/v1/equipments/telemetry",
            headers={"X-API-Key": "test_api_key_001"},
            json={
                "serial": "EQ-TEST-001",
                "temperature": -19.0,
                "pressure": 115.0,
                "door": 0,
                "heater": 0,
                "compressor": 1,
                "fan": 1,
            },
        ).status_code
        == 200
    )

    global_token, _ = login_user(client, "admin@polosanca.com", "admin123")
    with app.app_context():
        eq1 = Equipment.query.filter_by(serial="EQ-TEST-001").first()
        eq1_id = str(eq1.id)
        assert eq1.status == EquipmentStatus.OPERATIONAL

    # Configure a 15-minute (900s) equipment_offline rule on EQ-TEST-001
    rule_resp = client.post(
        "/v1/alert-rules",
        headers=get_auth_headers(global_token),
        json={
            "name": "EQ1 15m Offline SLA",
            "scope": "equipment",
            "scope_id": eq1_id,
            "rule_type": "equipment_offline",
            "duration_seconds": 900,
            "severity": "critical",
        },
    )
    assert rule_resp.status_code == 201

    # 1. At +11 minutes (660s >= 600s default timeout, < 900s rule): badge flips to offline, 0 alerts created
    t_11m = (utc_now() + timedelta(minutes=11)).isoformat()
    sweep_11m = sweep_offline_equipment_task.delay(t_11m).get()
    assert eq1_id in sweep_11m["flipped_offline_ids"]
    assert sweep_11m["created_alert_ids"] == []
    with app.app_context():
        assert db.session.get(Equipment, eq1_id).status == EquipmentStatus.OFFLINE

    # 2. At +16 minutes (960s >= 900s rule): equipment_offline alert fires once + 1 email dispatched
    t_16m = (utc_now() + timedelta(minutes=16)).isoformat()
    sweep_16m = sweep_offline_equipment_task.delay(t_16m).get()
    assert len(sweep_16m["created_alert_ids"]) == 1
    assert len(emails) == 1

    # Re-running at +17 minutes is idempotent (no duplicate open alert or email)
    t_17m = (utc_now() + timedelta(minutes=17)).isoformat()
    sweep_17m = sweep_offline_equipment_task.delay(t_17m).get()
    assert sweep_17m["created_alert_ids"] == []
    assert len(emails) == 1

    # 3. Hardware resumes reporting -> immediate recovery (equipment_offline resolved + status operational)
    assert (
        client.post(
            "/v1/equipments/telemetry",
            headers={"X-API-Key": "test_api_key_001"},
            json={
                "serial": "EQ-TEST-001",
                "temperature": -18.5,
                "pressure": 116.0,
                "door": 0,
                "heater": 0,
                "compressor": 1,
                "fan": 1,
            },
        ).status_code
        == 200
    )

    with app.app_context():
        eq1_after = db.session.get(Equipment, eq1_id)
        assert eq1_after.status == EquipmentStatus.OPERATIONAL
        offline_alert = Alert.query.filter_by(
            equipment_id=eq1_id,
            type=AlertRuleType.EQUIPMENT_OFFLINE,
        ).first()
        assert offline_alert.status == AlertStatus.RESOLVED
        assert offline_alert.resolved_at is not None
