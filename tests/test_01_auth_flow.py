"""
Test Suite: User Login and Authentication Flow (PRD 5.1)

Tests the complete authentication flow including:
- User login with valid credentials
- User login with invalid credentials
- Token refresh
- User logout
- Accessing protected resources with tokens
"""

from tests.conftest import get_auth_headers, login_user


def test_01_user_login_with_valid_credentials(client, init_database):
    """
    Test successful login with valid credentials

    Flow:
    1. User navigates to login page
    2. User enters email and password
    3. System validates credentials
    4. System generates JWT tokens
    5. System updates last login timestamp
    6. User receives tokens and user data
    """
    response = client.post("/v1/auth/login", json={"email": "admin@polosanca.com", "password": "admin123"})

    assert response.status_code == 200
    data = response.get_json()

    # Verify response contains required fields
    assert "access_token" in data
    assert "refresh_token" in data
    assert "user" in data

    # Verify user data
    user_data = data["user"]
    assert user_data["email"] == "admin@polosanca.com"
    assert user_data["name"] == "Global Admin"
    assert user_data["role"] == "global_admin"
    assert user_data["status"] == "active"
    assert "last_login_at" in user_data

    # Verify tokens are non-empty strings
    assert isinstance(data["access_token"], str)
    assert len(data["access_token"]) > 0
    assert isinstance(data["refresh_token"], str)
    assert len(data["refresh_token"]) > 0


def test_02_user_login_with_invalid_password(client, init_database):
    """
    Test login failure with invalid password

    Flow:
    1. User enters valid email but wrong password
    2. System returns 401 error
    3. Error message indicates invalid credentials
    """
    response = client.post("/v1/auth/login", json={"email": "admin@polosanca.com", "password": "wrongpassword"})

    assert response.status_code == 401
    data = response.get_json()
    assert "error" in data
    assert "Invalid email or password" in data["error"]


def test_03_user_login_with_invalid_email(client, init_database):
    """
    Test login failure with non-existent email
    """
    response = client.post("/v1/auth/login", json={"email": "nonexistent@example.com", "password": "anypassword"})

    assert response.status_code == 401
    data = response.get_json()
    assert "error" in data
    assert "Invalid email or password" in data["error"]


def test_04_user_login_missing_credentials(client, init_database):
    """
    Test login failure when credentials are missing
    """
    # Missing password
    response = client.post("/v1/auth/login", json={"email": "admin@polosanca.com"})
    assert response.status_code == 400

    # Missing email
    response = client.post("/v1/auth/login", json={"password": "admin123"})
    assert response.status_code == 400

    # Empty request
    response = client.post("/v1/auth/login", json={})
    assert response.status_code == 400


def test_05_access_protected_resource_with_token(client, init_database):
    """
    Test accessing protected resources with valid access token

    Flow:
    1. User logs in and receives access token
    2. User accesses protected resource with token in Authorization header
    3. System validates token and grants access
    """
    # Login first
    access_token, _ = login_user(client, "admin@polosanca.com", "admin123")

    # Access protected endpoint
    response = client.get("/v1/auth/me", headers=get_auth_headers(access_token))

    assert response.status_code == 200
    data = response.get_json()
    assert data["email"] == "admin@polosanca.com"
    assert data["name"] == "Global Admin"


def test_06_access_protected_resource_without_token(client, init_database):
    """
    Test that protected resources require authentication

    Flow:
    1. User attempts to access protected resource without token
    2. System returns 401 error
    """
    response = client.get("/v1/auth/me")

    assert response.status_code == 401
    data = response.get_json()
    assert "error" in data


def test_07_access_protected_resource_with_invalid_token(client, init_database):
    """
    Test that invalid tokens are rejected
    """
    response = client.get(
        "/v1/auth/me", headers={"Authorization": "Bearer invalid_token_here", "Content-Type": "application/json"}
    )

    assert response.status_code == 401
    data = response.get_json()
    assert "error" in data


def test_08_token_refresh(client, init_database):
    """
    Test refreshing access token using refresh token

    Flow:
    1. User logs in and receives both access and refresh tokens
    2. User sends refresh token to refresh endpoint
    3. System validates refresh token
    4. System issues new access token
    """
    # Login first
    access_token, refresh_token = login_user(client, "admin@polosanca.com", "admin123")

    # Refresh the access token
    response = client.post(
        "/v1/auth/refresh", headers={"Authorization": f"Bearer {refresh_token}", "Content-Type": "application/json"}
    )

    assert response.status_code == 200
    data = response.get_json()
    assert "access_token" in data
    assert isinstance(data["access_token"], str)
    assert len(data["access_token"]) > 0

    # Verify the new access token works
    response = client.get("/v1/auth/me", headers=get_auth_headers(data["access_token"]))
    assert response.status_code == 200


def test_09_user_logout(client, init_database):
    """
    Test user logout

    Flow:
    1. User logs in and receives access token
    2. User calls logout endpoint with access token
    3. System returns success message
    4. Token is invalidated (client-side)
    """
    # Login first
    access_token, _ = login_user(client, "admin@polosanca.com", "admin123")

    # Logout
    response = client.post("/v1/auth/logout", headers=get_auth_headers(access_token))

    assert response.status_code == 200
    data = response.get_json()
    assert data["message"] == "Logged out successfully"

    # Reusing the revoked access token must immediately fail with 401
    reused = client.get(
        "/v1/auth/me",
        headers=get_auth_headers(access_token),
    )
    assert reused.status_code == 401


def test_10_logout_without_token(client, init_database):
    """
    Test that logout requires authentication
    """
    response = client.post("/v1/auth/logout")

    assert response.status_code == 401
    data = response.get_json()
    assert "error" in data


def test_11_multiple_user_roles_login(client, init_database):
    """
    Test that different user roles can all log in successfully

    Flow:
    1. Test login for Global Admin
    2. Test login for Company Admin
    3. Test login for Company Viewer
    4. Verify each gets correct role in response
    """
    # Global Admin
    response = client.post("/v1/auth/login", json={"email": "admin@polosanca.com", "password": "admin123"})
    assert response.status_code == 200
    assert response.get_json()["user"]["role"] == "global_admin"

    # Company Admin
    response = client.post("/v1/auth/login", json={"email": "admin@testcompany.com", "password": "password123"})
    assert response.status_code == 200
    assert response.get_json()["user"]["role"] == "company_admin"

    # Company Viewer
    response = client.post("/v1/auth/login", json={"email": "viewer@testcompany.com", "password": "viewer123"})
    assert response.status_code == 200
    assert response.get_json()["user"]["role"] == "company_viewer"


def test_12_inactive_user_cannot_login(client, init_database):
    """
    Test that inactive users cannot log in

    This tests the status check in the auth flow
    """
    # Create an inactive user
    import bcrypt

    from app import db
    from app.models import Company, User, UserStatus

    password_hash = bcrypt.hashpw(b"test123", bcrypt.gensalt()).decode("utf-8")

    with client.application.app_context():
        company = Company.query.first()
        inactive_user = User(
            email="inactive@test.com",
            password_hash=password_hash,
            name="Inactive User",
            role="company_viewer",
            company_id=company.id,
            status=UserStatus.INACTIVE,
        )
        db.session.add(inactive_user)
        db.session.commit()

    # Attempt login
    response = client.post("/v1/auth/login", json={"email": "inactive@test.com", "password": "test123"})

    assert response.status_code == 403
    data = response.get_json()
    assert "error" in data
    assert "inactive" in data["error"].lower()


def test_13_password_reset_flow(client, app, init_database):
    """
    PRD 5.1 Step 4:
    User requests password reset token via POST /v1/auth/forgot-password and resets password.
    Verifies anti-enumeration, 1-hour expiry check, password length validation, and single-use token clearing.
    """
    from datetime import timedelta

    from app import db
    from app.models import User
    from app.utils import utc_now

    # Non-existent email returns 200 OK to prevent email enumeration
    unknown_resp = client.post(
        "/v1/auth/forgot-password",
        json={"email": "doesnotexist@polosanca.com"},
    )
    assert unknown_resp.status_code == 200
    assert unknown_resp.get_json()["success"] is True

    # Active user requests password reset
    forgot_resp = client.post(
        "/v1/auth/forgot-password",
        json={"email": "viewer@testcompany.com"},
    )
    assert forgot_resp.status_code == 200
    assert forgot_resp.get_json()["success"] is True

    with app.app_context():
        viewer = User.query.filter_by(email="viewer@testcompany.com").first()
        reset_token = viewer.password_reset_token
        assert reset_token is not None
        assert viewer.password_reset_expires_at is not None

    # Password shorter than 8 characters -> 400
    short_resp = client.post(
        "/v1/auth/reset-password",
        json={"token": reset_token, "new_password": "short"},
    )
    assert short_resp.status_code == 400

    # Invalid token -> 400
    bad_token_resp = client.post(
        "/v1/auth/reset-password",
        json={"token": "invalid-token-value", "new_password": "NewViewerPass99!"},
    )
    assert bad_token_resp.status_code == 400

    # Valid reset -> 200, clears token, updates password
    reset_resp = client.post(
        "/v1/auth/reset-password",
        json={"token": reset_token, "new_password": "NewViewerPass99!"},
    )
    assert reset_resp.status_code == 200
    assert reset_resp.get_json()["success"] is True

    # Replaying the single-use token -> 400
    replay_resp = client.post(
        "/v1/auth/reset-password",
        json={"token": reset_token, "new_password": "AnotherNewPass99!"},
    )
    assert replay_resp.status_code == 400

    # Old password fails (401), new password succeeds (200)
    assert (
        client.post(
            "/v1/auth/login",
            json={"email": "viewer@testcompany.com", "password": "viewer123"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/v1/auth/login",
            json={"email": "viewer@testcompany.com", "password": "NewViewerPass99!"},
        ).status_code
        == 200
    )

    # Expired token -> 400
    client.post("/v1/auth/forgot-password", json={"email": "viewer@testcompany.com"})
    with app.app_context():
        viewer = User.query.filter_by(email="viewer@testcompany.com").first()
        expired_tok = viewer.password_reset_token
        viewer.password_reset_expires_at = utc_now() - timedelta(minutes=1)
        db.session.commit()

    expired_resp = client.post(
        "/v1/auth/reset-password",
        json={"token": expired_tok, "new_password": "YetAnotherPass99!"},
    )
    assert expired_resp.status_code == 400


def test_14_self_service_profile_and_change_password(client, init_database):
    """Verify PATCH /v1/auth/me and POST /v1/auth/change-password self-service flows."""
    token, _ = login_user(client, "viewer@testcompany.com", "viewer123")
    headers = get_auth_headers(token)

    # Empty name rejected
    assert client.patch("/v1/auth/me", headers=headers, json={"name": "   "}).status_code == 400

    # Valid profile name update
    me_patch = client.patch("/v1/auth/me", headers=headers, json={"name": "Updated Viewer Name"})
    assert me_patch.status_code == 200
    assert me_patch.get_json()["name"] == "Updated Viewer Name"

    # Wrong current_password -> 401; short new_password -> 400
    assert (
        client.post(
            "/v1/auth/change-password",
            headers=headers,
            json={"current_password": "wrongpassword", "new_password": "ValidNewPass123!"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/v1/auth/change-password",
            headers=headers,
            json={"current_password": "viewer123", "new_password": "short"},
        ).status_code
        == 400
    )

    # Valid password change -> 200
    chg = client.post(
        "/v1/auth/change-password",
        headers=headers,
        json={"current_password": "viewer123", "new_password": "ChangedViewerPass123!"},
    )
    assert chg.status_code == 200
    assert chg.get_json()["success"] is True

    # Can log in with new password
    assert (
        client.post(
            "/v1/auth/login",
            json={"email": "viewer@testcompany.com", "password": "ChangedViewerPass123!"},
        ).status_code
        == 200
    )


def test_15_login_rate_limiting_enforces_10_per_minute(client, init_database):
    """Verify /v1/auth/login rate limits brute-force attempts after 10 requests/minute per IP (429)."""
    for _ in range(10):
        resp = client.post(
            "/v1/auth/login",
            json={"email": "admin@polosanca.com", "password": "wrongpassword"},
        )
        assert resp.status_code == 401

    throttled = client.post(
        "/v1/auth/login",
        json={"email": "admin@polosanca.com", "password": "wrongpassword"},
    )
    assert throttled.status_code == 429
    assert throttled.get_json()["error"] == "Too Many Requests"
