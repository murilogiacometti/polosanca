"""
Test Suite: Company Onboarding Flow (PRD 5.2)

Tests the complete company onboarding process:
1. Global admin creates new company
2. Global admin adds first company admin user
3. Company admin receives invitation email
4. Company admin sets password and logs in
5. Company admin adds branches
6. Global admin or company admin adds equipment to branches
7. Company admin invites additional users
"""

from tests.conftest import get_auth_headers, login_user


def test_01_global_admin_creates_company(client, init_database):
    """
    Test: Global admin creates a new company

    Flow:
    1. Global admin logs in
    2. Global admin creates new company with required details
    3. System validates and creates company
    4. Company appears in companies list
    """
    # Login as global admin
    access_token, _ = login_user(client, "admin@polosanca.com", "admin123")

    # Create new company
    response = client.post(
        "/v1/companies",
        headers=get_auth_headers(access_token),
        json={
            "name": "New Restaurant Chain",
            "contact_email": "contact@newrestaurant.com",
            "contact_phone": "+1-555-0100",
        },
    )

    assert response.status_code == 201
    data = response.get_json()
    assert "id" in data
    assert data["name"] == "New Restaurant Chain"
    assert data["contact_email"] == "contact@newrestaurant.com"
    assert data["status"] == "active"

    company_id = data["id"]

    # Verify company appears in list
    response = client.get("/v1/companies", headers=get_auth_headers(access_token))

    assert response.status_code == 200
    companies = response.get_json()["companies"]
    assert any(c["id"] == company_id for c in companies)


def test_02_company_admin_cannot_create_company(client, init_database):
    """
    Test: Company admins cannot create new companies (authorization check)
    """
    # Login as company admin
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    # Attempt to create company
    response = client.post(
        "/v1/companies",
        headers=get_auth_headers(access_token),
        json={"name": "Unauthorized Company", "contact_email": "test@test.com", "contact_phone": "123-456-7890"},
    )

    # Should be forbidden
    assert response.status_code == 403


def test_03_global_admin_invites_company_admin(client, init_database):
    """
    Test: Global admin invites first company admin user

    Flow:
    1. Global admin creates company (from test_01)
    2. Global admin invites user as company admin for that company
    3. System generates invitation
    4. User appears in users list with pending status
    """
    # Login as global admin
    access_token, _ = login_user(client, "admin@polosanca.com", "admin123")

    # Create company first
    company_response = client.post(
        "/v1/companies",
        headers=get_auth_headers(access_token),
        json={
            "name": "Test Onboarding Company",
            "contact_email": "contact@onboarding.com",
            "contact_phone": "555-1234",
        },
    )
    company_id = company_response.get_json()["id"]

    # Invite company admin
    response = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(access_token),
        json={
            "email": "newadmin@onboarding.com",
            "name": "New Company Admin",
            "role": "company_admin",
            "company_id": company_id,
        },
    )

    assert response.status_code == 201
    data = response.get_json()
    assert data["success"] is True
    assert "user_id" in data
    assert data["invitation_sent"] is True


def test_04_company_admin_adds_branch(client, init_database):
    """
    Test: Company admin adds branch to their company

    Flow:
    1. Company admin logs in
    2. Company admin creates new branch
    3. Branch is associated with their company
    4. Branch appears in branches list
    """
    # Login as company admin
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    # Create branch
    response = client.post(
        "/v1/branches",
        headers=get_auth_headers(access_token),
        json={"name": "New Downtown Location", "address": "789 Main Street, City, State 12345"},
    )

    assert response.status_code == 201
    data = response.get_json()
    assert "id" in data
    assert data["name"] == "New Downtown Location"
    assert data["address"] == "789 Main Street, City, State 12345"
    assert "company_id" in data

    branch_id = data["id"]

    # Verify branch appears in list
    response = client.get("/v1/branches", headers=get_auth_headers(access_token))

    assert response.status_code == 200
    branches = response.get_json()["branches"]
    assert any(b["id"] == branch_id for b in branches)


def test_05_company_admin_adds_equipment_to_branch(client, init_database):
    """
    Test: Company admin adds equipment to a branch

    Flow:
    1. Company admin logs in
    2. Company admin creates new equipment assigned to a branch
    3. Equipment is created with API key
    4. Equipment appears in equipment list
    """
    # Login as company admin
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    # Get first branch
    branches_response = client.get("/v1/branches", headers=get_auth_headers(access_token))
    branch_id = branches_response.get_json()["branches"][0]["id"]

    # Add equipment
    response = client.post(
        "/v1/equipments",
        headers=get_auth_headers(access_token),
        json={
            "serial": "EQ-ONBOARD-001",
            "type": "freezer",
            "branch_id": branch_id,
            "manufacturer": "CoolTech",
            "model": "CT-500",
        },
    )

    assert response.status_code == 201
    data = response.get_json()
    assert "id" in data
    assert data["serial"] == "EQ-ONBOARD-001"
    assert data["type"] == "freezer"
    assert "api_key" in data  # System generates API key


def test_06_company_admin_invites_additional_users(client, init_database):
    """
    Test: Company admin invites additional users to their company

    Flow:
    1. Company admin logs in
    2. Company admin invites viewer user
    3. System sends invitation
    4. User appears in company's user list
    """
    # Login as company admin
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    # Invite viewer
    response = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(access_token),
        json={"email": "newviewer@testcompany.com", "name": "New Viewer", "role": "company_viewer"},
    )

    assert response.status_code == 201
    data = response.get_json()
    assert data["success"] is True
    assert "user_id" in data

    # Verify user in company's user list
    response = client.get("/v1/users", headers=get_auth_headers(access_token))

    assert response.status_code == 200
    users = response.get_json()["users"]
    assert any(u["email"] == "newviewer@testcompany.com" for u in users)


def test_07_complete_onboarding_flow_end_to_end(client, init_database):
    """
    Test: Complete end-to-end onboarding flow

    Full scenario from start to finish:
    1. Global admin creates company
    2. Global admin invites company admin
    3. Company admin adds multiple branches
    4. Company admin adds equipment to branches
    5. Company admin invites viewers
    6. Verify all entities are properly connected
    """
    # Step 1: Global admin creates company
    global_admin_token, _ = login_user(client, "admin@polosanca.com", "admin123")

    company_response = client.post(
        "/v1/companies",
        headers=get_auth_headers(global_admin_token),
        json={"name": "Full Onboarding Test Co", "contact_email": "contact@fulltest.com", "contact_phone": "555-9999"},
    )
    assert company_response.status_code == 201
    company_id = company_response.get_json()["id"]

    # Step 2: Global admin invites company admin
    invite_response = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(global_admin_token),
        json={
            "email": "fulltest@admin.com",
            "name": "Full Test Admin",
            "role": "company_admin",
            "company_id": company_id,
        },
    )
    assert invite_response.status_code == 201

    # Note: In real flow, company admin would set password via invitation link
    # For testing, we'll use global admin to add branches and equipment

    # Step 3: Add multiple branches
    branch_ids = []
    for i in range(3):
        branch_response = client.post(
            "/v1/branches",
            headers=get_auth_headers(global_admin_token),
            json={"company_id": company_id, "name": f"Branch {i + 1}", "address": f"{100 + i} Test Street"},
        )
        assert branch_response.status_code == 201
        branch_ids.append(branch_response.get_json()["id"])

    # Step 4: Add equipment to each branch
    for i, branch_id in enumerate(branch_ids):
        equipment_response = client.post(
            "/v1/equipments",
            headers=get_auth_headers(global_admin_token),
            json={
                "serial": f"EQ-FULL-{i + 1:03d}",
                "type": "freezer" if i % 2 == 0 else "refrigerator",
                "branch_id": branch_id,
                "company_id": company_id,
                "manufacturer": "TestCorp",
                "model": f"Model-{i + 1}",
            },
        )
        assert equipment_response.status_code == 201

    # Step 5: Verify company has all entities
    company_detail = client.get(f"/v1/companies/{company_id}", headers=get_auth_headers(global_admin_token))
    assert company_detail.status_code == 200

    # Verify branches count
    branches_list = client.get(f"/v1/branches?company_id={company_id}", headers=get_auth_headers(global_admin_token))
    assert len(branches_list.get_json()["branches"]) == 3

    # Verify equipment count
    equipment_list = client.get(f"/v1/equipments?company_id={company_id}", headers=get_auth_headers(global_admin_token))
    assert len(equipment_list.get_json()["equipment"]) == 3


def test_08_company_name_must_be_unique(client, init_database):
    """
    Test: Company names must be unique in the system
    """
    # Login as global admin
    access_token, _ = login_user(client, "admin@polosanca.com", "admin123")

    # Create first company
    response1 = client.post(
        "/v1/companies",
        headers=get_auth_headers(access_token),
        json={"name": "Unique Company Name", "contact_email": "contact1@test.com", "contact_phone": "555-0001"},
    )
    assert response1.status_code == 201

    # Attempt to create company with same name
    response2 = client.post(
        "/v1/companies",
        headers=get_auth_headers(access_token),
        json={"name": "Unique Company Name", "contact_email": "contact2@test.com", "contact_phone": "555-0002"},
    )
    assert response2.status_code in [400, 422]  # Validation error
    data = response2.get_json()
    assert "error" in data or "message" in data


def test_09_invited_company_admin_redeems_token_to_complete_onboarding(client, app, init_database):
    """
    PRD 5.2 Step 4:
    Invited first Company Admin redeems 7-day token via POST /v1/users/accept-invitation,
    logs in with their new password, updates company profile, and creates their company's first branch.
    """
    from app import db
    from app.models import User

    global_token, _ = login_user(client, "admin@polosanca.com", "admin123")
    co_resp = client.post(
        "/v1/companies",
        headers=get_auth_headers(global_token),
        json={"name": "Self-Serve Co", "contact_email": "ops@selfserve.com"},
    )
    assert co_resp.status_code == 201
    co_id = co_resp.get_json()["id"]

    inv_resp = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(global_token),
        json={"email": "owner@selfserve.com", "name": "Owner", "role": "company_admin", "company_id": co_id},
    )
    assert inv_resp.status_code == 201
    user_id = inv_resp.get_json()["user_id"]

    with app.app_context():
        token = db.session.get(User, user_id).invitation_token
        assert token is not None

    accept = client.post(
        "/v1/users/accept-invitation",
        json={"token": token, "password": "NewAdminPass123!"},
    )
    assert accept.status_code == 200
    assert accept.get_json()["success"] is True

    # Redeemed Company Admin logs in, updates own company contact phone (status remains Global Admin only), and creates first branch
    owner_token, _ = login_user(client, "owner@selfserve.com", "NewAdminPass123!")
    owner_headers = get_auth_headers(owner_token)

    assert (
        client.patch(
            f"/v1/companies/{co_id}",
            headers=owner_headers,
            json={"contact_phone": "+55-16-3333-4444"},
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/v1/companies/{co_id}",
            headers=owner_headers,
            json={"status": "inactive"},
        ).status_code
        == 403
    )

    branch_resp = client.post(
        "/v1/branches",
        headers=owner_headers,
        json={"name": "HQ Branch", "address": "Av. São Carlos, 1000"},
    )
    assert branch_resp.status_code == 201
    assert branch_resp.get_json()["company_id"] == co_id
