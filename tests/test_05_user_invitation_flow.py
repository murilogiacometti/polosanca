"""
Test Suite: User Invitation Flow (PRD 5.5)

Tests user invitation process:
1. Admin enters new user email and role
2. System sends invitation email
3. New user clicks invitation link
4. New user creates password and completes profile
5. New user gains access to appropriate dashboards
"""

from tests.conftest import get_auth_headers, login_user


def test_01_company_admin_invites_viewer(client, init_database):
    """
    Test: Company admin invites a viewer to their company

    Flow:
    1. Company admin logs in
    2. Admin enters user email and assigns viewer role
    3. System generates invitation
    4. User is created with pending status
    """
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    response = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(access_token),
        json={"email": "newviewer@testcompany.com", "name": "New Viewer User", "role": "company_viewer"},
    )

    assert response.status_code == 201
    data = response.get_json()

    assert data["success"] is True
    assert "user_id" in data
    assert data["invitation_sent"] is True


def test_02_global_admin_invites_company_admin(client, init_database):
    """
    Test: Global admin invites company admin for a company
    """
    access_token, _ = login_user(client, "admin@polosanca.com", "admin123")

    # Get company ID
    companies = client.get("/v1/companies", headers=get_auth_headers(access_token)).get_json()["companies"]
    company_id = companies[0]["id"]

    response = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(access_token),
        json={
            "email": "newcompanyadmin@testcompany.com",
            "name": "New Company Admin",
            "role": "company_admin",
            "company_id": company_id,
        },
    )

    assert response.status_code == 201
    assert response.get_json()["success"] is True


def test_03_invited_user_appears_in_user_list(client, init_database):
    """
    Test: Invited user appears in company's user list with pending status
    """
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    # Invite user
    invite_response = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(access_token),
        json={"email": "pendinguser@testcompany.com", "name": "Pending User", "role": "company_viewer"},
    )
    user_id = invite_response.get_json()["user_id"]

    # Check user list
    users_response = client.get("/v1/users", headers=get_auth_headers(access_token))

    assert users_response.status_code == 200
    users = users_response.get_json()["users"]

    invited_user = next((u for u in users if u["id"] == user_id), None)
    assert invited_user is not None
    assert invited_user["email"] == "pendinguser@testcompany.com"
    assert invited_user["status"] == "pending"


def test_04_cannot_invite_duplicate_email(client, init_database):
    """
    Test: Cannot invite user with email that already exists
    """
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    # First invitation
    response1 = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(access_token),
        json={"email": "duplicate@testcompany.com", "name": "First User", "role": "company_viewer"},
    )
    assert response1.status_code == 201

    # Attempt duplicate
    response2 = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(access_token),
        json={"email": "duplicate@testcompany.com", "name": "Second User", "role": "company_viewer"},
    )
    assert response2.status_code in [400, 422]


def test_05_company_admin_cannot_invite_to_other_companies(client, init_database):
    """
    Test: Company admin can only invite users to their own company
    """
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    # Create another company (as global admin)
    global_admin_token, _ = login_user(client, "admin@polosanca.com", "admin123")
    other_company = client.post(
        "/v1/companies",
        headers=get_auth_headers(global_admin_token),
        json={"name": "Other Company", "contact_email": "other@company.com", "contact_phone": "555-3000"},
    ).get_json()
    other_company_id = other_company["id"]

    # Attempt to invite to other company
    response = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(access_token),
        json={
            "email": "unauthorized@othercompany.com",
            "name": "Unauthorized User",
            "role": "company_viewer",
            "company_id": other_company_id,
        },
    )

    assert response.status_code == 403


def test_06_invited_user_with_branch_access_restriction(client, init_database):
    """
    Test: Company admin invites viewer with branch access restriction

    Flow:
    1. Admin invites user
    2. Admin specifies restricted branch access
    3. User is created with branch restrictions
    """
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    # Get branch IDs
    branches = client.get("/v1/branches", headers=get_auth_headers(access_token)).get_json()["branches"]
    branch_id = branches[0]["id"]

    response = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(access_token),
        json={
            "email": "restrictedviewer@testcompany.com",
            "name": "Restricted Viewer",
            "role": "company_viewer",
            "branch_access": {"type": "restricted", "branches": [branch_id]},
        },
    )

    assert response.status_code == 201

    # Verify user has branch restrictions
    user_id = response.get_json()["user_id"]
    user_detail = client.get(f"/v1/users/{user_id}", headers=get_auth_headers(access_token))

    user_data = user_detail.get_json()
    assert user_data["branch_access"]["type"] == "restricted"
    assert branch_id in user_data["branch_access"]["branches"]


def test_07_global_admin_invites_global_admin(client, init_database):
    """
    Test: Global admin can invite another global admin
    """
    access_token, _ = login_user(client, "admin@polosanca.com", "admin123")

    response = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(access_token),
        json={"email": "newglobaladmin@polosanca.com", "name": "New Global Admin", "role": "global_admin"},
    )

    assert response.status_code == 201
    user_id = response.get_json()["user_id"]

    # Verify role
    user_detail = client.get(f"/v1/users/{user_id}", headers=get_auth_headers(access_token))
    assert user_detail.get_json()["role"] == "global_admin"


def test_08_company_admin_cannot_invite_global_admin(client, init_database):
    """
    Test: Company admin cannot create global admin users
    """
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    response = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(access_token),
        json={"email": "unauthorized@globaladmin.com", "name": "Unauthorized Global Admin", "role": "global_admin"},
    )

    assert response.status_code == 403


def test_09_viewer_cannot_invite_users(client, init_database):
    """
    Test: Company viewers cannot invite users
    """
    access_token, _ = login_user(client, "viewer@testcompany.com", "viewer123")

    response = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(access_token),
        json={"email": "unauthorized@viewer.com", "name": "Unauthorized Invitation", "role": "company_viewer"},
    )

    assert response.status_code == 403


def test_10_invitation_requires_valid_email_format(client, init_database):
    """
    Test: System validates email format in invitation
    """
    access_token, _ = login_user(client, "admin@testcompany.com", "password123")

    # Invalid email formats
    invalid_emails = ["notanemail", "missing@domain", "@nodomain.com", "spaces in@email.com"]

    for invalid_email in invalid_emails:
        response = client.post(
            "/v1/users/invite",
            headers=get_auth_headers(access_token),
            json={"email": invalid_email, "name": "Test User", "role": "company_viewer"},
        )
        assert response.status_code in [400, 422]


def test_11_admin_resends_invitation_for_pending_user(client, app, init_database):
    """
    PRD 5.5 Step 3:
    Admin calls POST /v1/users/<id>/resend-invitation to rotate 7-day token for a pending user;
    active users return 400 and viewers return 403.
    """
    from app import db
    from app.models import User

    admin_token, _ = login_user(client, "admin@testcompany.com", "password123")
    viewer_token, _ = login_user(client, "viewer@testcompany.com", "viewer123")
    viewer_id = client.get("/v1/auth/me", headers=get_auth_headers(viewer_token)).get_json()["id"]

    invite_resp = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(admin_token),
        json={
            "email": "resendme@testcompany.com",
            "name": "Resend Me",
            "role": "company_viewer",
        },
    )
    assert invite_resp.status_code == 201
    pending_user_id = invite_resp.get_json()["user_id"]

    with app.app_context():
        original_token = db.session.get(User, pending_user_id).invitation_token
        assert original_token is not None

    # Viewer cannot resend invitations
    assert (
        client.post(
            f"/v1/users/{pending_user_id}/resend-invitation",
            headers=get_auth_headers(viewer_token),
        ).status_code
        == 403
    )

    # Active user cannot receive invitation resend (400)
    assert (
        client.post(
            f"/v1/users/{viewer_id}/resend-invitation",
            headers=get_auth_headers(admin_token),
        ).status_code
        == 400
    )

    # Admin resends invitation -> rotates token
    resend_resp = client.post(
        f"/v1/users/{pending_user_id}/resend-invitation",
        headers=get_auth_headers(admin_token),
    )
    assert resend_resp.status_code == 200
    assert resend_resp.get_json()["invitation_sent"] is True

    with app.app_context():
        rotated_token = db.session.get(User, pending_user_id).invitation_token
        assert rotated_token is not None and rotated_token != original_token


def test_12_invited_user_accepts_invitation_and_logs_in(client, app, init_database):
    """
    PRD 5.5 Steps 4-5:
    Invited user redeems 7-day token via POST /v1/users/accept-invitation, sets password,
    transitions status pending -> active, clears single-use token, and logs in.
    """
    from datetime import timedelta

    from app import db
    from app.models import User, UserStatus
    from app.utils import utc_now

    admin_token, _ = login_user(client, "admin@testcompany.com", "password123")
    invite_resp = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(admin_token),
        json={"email": "accept@testcompany.com", "name": "Accept User", "role": "company_viewer"},
    )
    assert invite_resp.status_code == 201
    user_id = invite_resp.get_json()["user_id"]

    with app.app_context():
        token = db.session.get(User, user_id).invitation_token
        assert token is not None

    # Short password (< 8 chars) rejected
    assert (
        client.post(
            "/v1/users/accept-invitation",
            json={"token": token, "password": "short"},
        ).status_code
        == 400
    )

    # Accept invitation with valid password -> 200
    accept_resp = client.post(
        "/v1/users/accept-invitation",
        json={"token": token, "password": "SecurePass123!"},
    )
    assert accept_resp.status_code == 200
    assert accept_resp.get_json()["success"] is True

    with app.app_context():
        activated = db.session.get(User, user_id)
        assert activated.status == UserStatus.ACTIVE
        assert activated.invitation_token is None
        assert activated.invitation_expires_at is None

    # Replaying redeemed token fails (400)
    assert (
        client.post(
            "/v1/users/accept-invitation",
            json={"token": token, "password": "SecurePass123!"},
        ).status_code
        == 400
    )

    # Activated user logs in cleanly
    viewer_token, _ = login_user(client, "accept@testcompany.com", "SecurePass123!")
    me = client.get("/v1/auth/me", headers=get_auth_headers(viewer_token))
    assert me.status_code == 200
    assert me.get_json()["status"] == "active"

    # Expired 7-day invitation token fails with 400
    exp_inv = client.post(
        "/v1/users/invite",
        headers=get_auth_headers(admin_token),
        json={"email": "expired@testcompany.com", "name": "Expired User", "role": "company_viewer"},
    )
    exp_user_id = exp_inv.get_json()["user_id"]
    with app.app_context():
        exp_user = db.session.get(User, exp_user_id)
        exp_tok = exp_user.invitation_token
        exp_user.invitation_expires_at = utc_now() - timedelta(seconds=10)
        db.session.commit()

    assert (
        client.post(
            "/v1/users/accept-invitation",
            json={"token": exp_tok, "password": "SecurePass123!"},
        ).status_code
        == 400
    )


def test_13_users_rbac_tenant_isolation_and_deactivation_revokes_jwt(client, app, init_database):
    """
    Verify M1 users.py RBAC hardening & deactivation token revocation:
    - Company Viewer gets 403 on GET /v1/users, GET/PATCH/DELETE /v1/users/<id>, and POST /v1/users
    - Company Admin gets 403 on another company's user, on Global Admin users, on escalating role to global_admin, and on raw POST /v1/users
    - GET /v1/users supports role & status filters
    - Soft-deactivating a user (DELETE /v1/users/<id>) immediately invalidates their active JWT access & refresh tokens (401)
    """
    import bcrypt

    from app import db
    from app.models import Company, User, UserRole, UserStatus

    global_token, _ = login_user(client, "admin@polosanca.com", "admin123")
    admin_token, _ = login_user(client, "admin@testcompany.com", "password123")
    viewer_token, viewer_refresh = login_user(client, "viewer@testcompany.com", "viewer123")

    global_headers = get_auth_headers(global_token)
    admin_headers = get_auth_headers(admin_token)
    viewer_headers = get_auth_headers(viewer_token)

    with app.app_context():
        global_admin_id = str(User.query.filter_by(email="admin@polosanca.com").first().id)
        viewer_id = str(User.query.filter_by(email="viewer@testcompany.com").first().id)

        other_co = Company(name="Other Tenant Co", contact_email="sec@othertenant.com")
        db.session.add(other_co)
        db.session.flush()
        other_user = User(
            email="user@othertenant.com",
            password_hash=bcrypt.hashpw(b"otherpass123", bcrypt.gensalt()).decode("utf-8"),
            name="Other Tenant User",
            role=UserRole.COMPANY_ADMIN,
            company_id=other_co.id,
            status=UserStatus.ACTIVE,
        )
        db.session.add(other_user)
        db.session.commit()
        other_user_id = str(other_user.id)

    # 1. Viewer forbidden from user-management endpoints
    assert client.get("/v1/users", headers=viewer_headers).status_code == 403
    assert client.get(f"/v1/users/{viewer_id}", headers=viewer_headers).status_code == 403
    assert client.patch(f"/v1/users/{viewer_id}", headers=viewer_headers, json={"name": "Hack"}).status_code == 403
    assert client.delete(f"/v1/users/{viewer_id}", headers=viewer_headers).status_code == 403
    assert (
        client.post(
            "/v1/users",
            headers=viewer_headers,
            json={"email": "x@test.com", "name": "X", "role": "company_viewer", "password": "Password123!"},
        ).status_code
        == 403
    )

    # 2. Company Admin forbidden from cross-tenant & privilege-escalation actions
    assert client.get(f"/v1/users/{other_user_id}", headers=admin_headers).status_code == 403
    assert client.get(f"/v1/users/{global_admin_id}", headers=admin_headers).status_code == 403
    assert client.patch(f"/v1/users/{other_user_id}", headers=admin_headers, json={"name": "Cross"}).status_code == 403
    assert (
        client.patch(f"/v1/users/{global_admin_id}", headers=admin_headers, json={"name": "Escalated"}).status_code
        == 403
    )
    assert (
        client.patch(
            f"/v1/users/{viewer_id}",
            headers=admin_headers,
            json={"role": "global_admin"},
        ).status_code
        == 403
    )
    assert client.delete(f"/v1/users/{other_user_id}", headers=admin_headers).status_code == 403
    assert client.delete(f"/v1/users/{global_admin_id}", headers=admin_headers).status_code == 403
    assert (
        client.post(
            "/v1/users",
            headers=admin_headers,
            json={"email": "raw@testcompany.com", "name": "Raw", "role": "global_admin", "password": "Password123!"},
        ).status_code
        == 403
    )

    # 3. GET /v1/users query filters (role & status)
    filtered = client.get("/v1/users?role=company_viewer&status=active", headers=admin_headers)
    assert filtered.status_code == 200
    assert all(u["role"] == "company_viewer" and u["status"] == "active" for u in filtered.get_json()["users"])

    # 4. Deactivating viewer via DELETE /v1/users/<id> returns 204 and immediately revokes viewer's tokens
    deact = client.delete(f"/v1/users/{viewer_id}", headers=admin_headers)
    assert deact.status_code == 204

    assert client.get("/v1/auth/me", headers=viewer_headers).status_code == 401
    assert (
        client.post(
            "/v1/auth/refresh",
            headers={"Authorization": f"Bearer {viewer_refresh}", "Content-Type": "application/json"},
        ).status_code
        == 401
    )
    assert client.get(f"/v1/users/{viewer_id}", headers=global_headers).get_json()["status"] == "inactive"
