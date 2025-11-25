"""
Test Suite: Equipment Registration Flow (PRD 5.3)

Tests equipment registration process:
1. Admin navigates to equipment management
2. Admin adds equipment with details
3. System generates API key
4. Equipment is created and configured
5. Equipment begins sending data
"""

from tests.conftest import get_auth_headers, login_user


def test_01_company_admin_registers_equipment(client, init_database):
    """
    Test: Company admin successfully registers new equipment

    Flow:
    1. Company admin logs in
    2. Admin fills equipment details
    3. System validates serial number uniqueness
    4. System generates API key
    5. Equipment is created
    """
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    # Get branch ID
    branches = client.get("/v1/branches", headers=get_auth_headers(access_token)).get_json()["branches"]
    branch_id = branches[0]["id"]

    # Register equipment
    response = client.post(
        "/v1/equipments",
        headers=get_auth_headers(access_token),
        json={
            "serial": "EQ-REG-TEST-001",
            "type": "freezer",
            "branch_id": branch_id,
            "manufacturer": "CoolTech Industries",
            "model": "CT-X1000",
            "installed_at": "2025-01-15T10:00:00Z",
        },
    )

    assert response.status_code == 201
    data = response.get_json()

    # Verify response
    assert "id" in data
    assert data["serial"] == "EQ-REG-TEST-001"
    assert data["type"] == "freezer"
    assert data["manufacturer"] == "CoolTech Industries"
    assert data["model"] == "CT-X1000"
    assert "api_key" in data
    assert len(data["api_key"]) > 20  # API key should be substantial length
    assert data["status"] == "offline"  # New equipment starts offline


def test_02_equipment_serial_must_be_unique(client, init_database):
    """
    Test: Equipment serial numbers must be unique across system
    """
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    branch_id = client.get("/v1/branches", headers=get_auth_headers(access_token)).get_json()["branches"][0]["id"]

    # Create first equipment
    response1 = client.post(
        "/v1/equipments",
        headers=get_auth_headers(access_token),
        json={
            "serial": "EQ-UNIQUE-001",
            "type": "freezer",
            "branch_id": branch_id,
            "manufacturer": "TestCorp",
            "model": "Model-A",
        },
    )
    assert response1.status_code == 201

    # Attempt duplicate serial
    response2 = client.post(
        "/v1/equipments",
        headers=get_auth_headers(access_token),
        json={
            "serial": "EQ-UNIQUE-001",  # Same serial
            "type": "refrigerator",
            "branch_id": branch_id,
            "manufacturer": "TestCorp",
            "model": "Model-B",
        },
    )
    assert response2.status_code in [400, 422]


def test_03_global_admin_can_register_equipment_for_any_company(client, init_database):
    """
    Test: Global admin can register equipment for any company
    """
    access_token, _ = login_user(client, "admin@polosanca.com", "admin123")

    # Create new company and branch
    company_response = client.post(
        "/v1/companies",
        headers=get_auth_headers(access_token),
        json={"name": "Equipment Test Company", "contact_email": "test@equipment.com", "contact_phone": "555-1000"},
    )
    company_id = company_response.get_json()["id"]

    branch_response = client.post(
        "/v1/branches",
        headers=get_auth_headers(access_token),
        json={"company_id": company_id, "name": "Test Branch", "address": "100 Test St"},
    )
    branch_id = branch_response.get_json()["id"]

    # Register equipment for that company
    response = client.post(
        "/v1/equipments",
        headers=get_auth_headers(access_token),
        json={
            "serial": "EQ-GLOBAL-001",
            "type": "cold_room",
            "branch_id": branch_id,
            "company_id": company_id,
            "manufacturer": "GlobalCorp",
            "model": "GC-2000",
        },
    )

    assert response.status_code == 201


def test_04_equipment_appears_in_list_after_registration(client, init_database):
    """
    Test: Newly registered equipment appears in equipment list
    """
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    branch_id = client.get("/v1/branches", headers=get_auth_headers(access_token)).get_json()["branches"][0]["id"]

    # Register equipment
    register_response = client.post(
        "/v1/equipments",
        headers=get_auth_headers(access_token),
        json={
            "serial": "EQ-LIST-TEST-001",
            "type": "refrigerator",
            "branch_id": branch_id,
            "manufacturer": "TestCorp",
            "model": "TC-100",
        },
    )
    equipment_id = register_response.get_json()["id"]

    # Check equipment list
    list_response = client.get("/v1/equipments", headers=get_auth_headers(access_token))

    assert list_response.status_code == 200
    equipment_list = list_response.get_json()["equipment"]
    assert any(eq["id"] == equipment_id for eq in equipment_list)


def test_05_equipment_details_retrievable(client, init_database):
    """
    Test: Equipment details can be retrieved after registration
    """
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    branch_id = client.get("/v1/branches", headers=get_auth_headers(access_token)).get_json()["branches"][0]["id"]

    # Register equipment
    register_response = client.post(
        "/v1/equipments",
        headers=get_auth_headers(access_token),
        json={
            "serial": "EQ-DETAIL-001",
            "type": "freezer",
            "branch_id": branch_id,
            "manufacturer": "DetailCorp",
            "model": "DT-500",
        },
    )
    equipment_id = register_response.get_json()["id"]

    # Retrieve details
    detail_response = client.get(f"/v1/equipments/{equipment_id}", headers=get_auth_headers(access_token))

    assert detail_response.status_code == 200
    data = detail_response.get_json()
    assert data["id"] == equipment_id
    assert data["serial"] == "EQ-DETAIL-001"
    assert data["manufacturer"] == "DetailCorp"


def test_06_viewer_cannot_register_equipment(client, init_database):
    """
    Test: Company viewers cannot register equipment (authorization check)
    """
    access_token, _ = login_user(client, "viewer@testcompany.com", "viewer123")

    branch_id = client.get("/v1/branches", headers=get_auth_headers(access_token)).get_json()["branches"][0]["id"]

    # Attempt to register equipment
    response = client.post(
        "/v1/equipments",
        headers=get_auth_headers(access_token),
        json={
            "serial": "EQ-FORBIDDEN-001",
            "type": "freezer",
            "branch_id": branch_id,
            "manufacturer": "TestCorp",
            "model": "TC-100",
        },
    )

    assert response.status_code == 403


def test_07_multiple_equipment_types_can_be_registered(client, init_database):
    """
    Test: Different equipment types can be registered
    """
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    branch_id = client.get("/v1/branches", headers=get_auth_headers(access_token)).get_json()["branches"][0]["id"]

    equipment_types = ["freezer", "refrigerator", "cold_room"]

    for i, eq_type in enumerate(equipment_types):
        response = client.post(
            "/v1/equipments",
            headers=get_auth_headers(access_token),
            json={
                "serial": f"EQ-TYPE-{i + 1:03d}",
                "type": eq_type,
                "branch_id": branch_id,
                "manufacturer": "MultiCorp",
                "model": f"MC-{eq_type.upper()}",
            },
        )
        assert response.status_code == 201
        assert response.get_json()["type"] == eq_type


def test_08_admin_rotates_equipment_api_key_and_revokes_old_key(client, init_database):
    """
    PRD 5.3 Steps 7-9:
    Admin rotates equipment API key (POST /v1/equipments/<id>/rotate-api-key):
    - Viewers are rejected with 403
    - Old API key is immediately invalidated (401 on telemetry submission)
    - New API key succeeds (200) and transitions newly registered equipment from offline to operational
    """
    admin_token, _ = login_user(client, "admin@testcompany.com", "password123")
    viewer_token, _ = login_user(client, "viewer@testcompany.com", "viewer123")

    branch_id = client.get("/v1/branches", headers=get_auth_headers(admin_token)).get_json()["branches"][0]["id"]

    reg_resp = client.post(
        "/v1/equipments",
        headers=get_auth_headers(admin_token),
        json={
            "serial": "EQ-ROTATE-001",
            "type": "freezer",
            "branch_id": branch_id,
            "manufacturer": "CoolTech",
            "model": "CT-900",
        },
    )
    assert reg_resp.status_code == 201
    reg_body = reg_resp.get_json()
    eq_id = reg_body["id"]
    old_key = reg_body["api_key"]
    assert reg_body["status"] == "offline"

    # Viewer cannot rotate API key
    assert (
        client.post(
            f"/v1/equipments/{eq_id}/rotate-api-key",
            headers=get_auth_headers(viewer_token),
        ).status_code
        == 403
    )

    # Admin rotates API key
    rot_resp = client.post(
        f"/v1/equipments/{eq_id}/rotate-api-key",
        headers=get_auth_headers(admin_token),
    )
    assert rot_resp.status_code == 200
    new_key = rot_resp.get_json()["api_key"]
    assert new_key != old_key

    telemetry_payload = {
        "serial": "EQ-ROTATE-001",
        "temperature": -18.5,
        "pressure": 115.0,
        "door": 0,
        "heater": 0,
        "compressor": 1,
        "fan": 1,
    }

    # Old key fails with 401
    assert (
        client.post(
            "/v1/equipments/telemetry",
            headers={"X-API-Key": old_key},
            json=telemetry_payload,
        ).status_code
        == 401
    )

    # New key succeeds and transitions equipment from offline -> operational
    ok_resp = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": new_key},
        json=telemetry_payload,
    )
    assert ok_resp.status_code == 200
    eq_after = client.get(f"/v1/equipments/{eq_id}", headers=get_auth_headers(admin_token)).get_json()
    assert eq_after["status"] == "operational"
