"""
Test Suite: User Login and Authentication Flow (PRD 5.1)

Tests the complete authentication flow including:
- User login with valid credentials
- User login with invalid credentials
- Token refresh
- User logout
- Accessing protected resources with tokens
"""
import pytest
from tests.conftest import login_user, get_auth_headers


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
    response = client.post(
        '/v1/auth/login',
        json={
            'email': 'admin@polosanca.com',
            'password': 'admin123'
        }
    )

    assert response.status_code == 200
    data = response.get_json()

    # Verify response contains required fields
    assert 'access_token' in data
    assert 'refresh_token' in data
    assert 'user' in data

    # Verify user data
    user_data = data['user']
    assert user_data['email'] == 'admin@polosanca.com'
    assert user_data['name'] == 'Global Admin'
    assert user_data['role'] == 'global_admin'
    assert user_data['status'] == 'active'
    assert 'last_login_at' in user_data

    # Verify tokens are non-empty strings
    assert isinstance(data['access_token'], str)
    assert len(data['access_token']) > 0
    assert isinstance(data['refresh_token'], str)
    assert len(data['refresh_token']) > 0


def test_02_user_login_with_invalid_password(client, init_database):
    """
    Test login failure with invalid password

    Flow:
    1. User enters valid email but wrong password
    2. System returns 401 error
    3. Error message indicates invalid credentials
    """
    response = client.post(
        '/v1/auth/login',
        json={
            'email': 'admin@polosanca.com',
            'password': 'wrongpassword'
        }
    )

    assert response.status_code == 401
    data = response.get_json()
    assert 'error' in data
    assert 'Invalid email or password' in data['error']


def test_03_user_login_with_invalid_email(client, init_database):
    """
    Test login failure with non-existent email
    """
    response = client.post(
        '/v1/auth/login',
        json={
            'email': 'nonexistent@example.com',
            'password': 'anypassword'
        }
    )

    assert response.status_code == 401
    data = response.get_json()
    assert 'error' in data
    assert 'Invalid email or password' in data['error']


def test_04_user_login_missing_credentials(client, init_database):
    """
    Test login failure when credentials are missing
    """
    # Missing password
    response = client.post(
        '/v1/auth/login',
        json={
            'email': 'admin@polosanca.com'
        }
    )
    assert response.status_code == 400

    # Missing email
    response = client.post(
        '/v1/auth/login',
        json={
            'password': 'admin123'
        }
    )
    assert response.status_code == 400

    # Empty request
    response = client.post(
        '/v1/auth/login',
        json={}
    )
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
    access_token, _ = login_user(client, 'admin@polosanca.com', 'admin123')

    # Access protected endpoint
    response = client.get(
        '/v1/auth/me',
        headers=get_auth_headers(access_token)
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data['email'] == 'admin@polosanca.com'
    assert data['name'] == 'Global Admin'


def test_06_access_protected_resource_without_token(client, init_database):
    """
    Test that protected resources require authentication

    Flow:
    1. User attempts to access protected resource without token
    2. System returns 401 error
    """
    response = client.get('/v1/auth/me')

    assert response.status_code == 401
    data = response.get_json()
    assert 'error' in data


def test_07_access_protected_resource_with_invalid_token(client, init_database):
    """
    Test that invalid tokens are rejected
    """
    response = client.get(
        '/v1/auth/me',
        headers={
            'Authorization': 'Bearer invalid_token_here',
            'Content-Type': 'application/json'
        }
    )

    assert response.status_code == 401
    data = response.get_json()
    assert 'error' in data


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
    access_token, refresh_token = login_user(client, 'admin@polosanca.com', 'admin123')

    # Refresh the access token
    response = client.post(
        '/v1/auth/refresh',
        headers={
            'Authorization': f'Bearer {refresh_token}',
            'Content-Type': 'application/json'
        }
    )

    assert response.status_code == 200
    data = response.get_json()
    assert 'access_token' in data
    assert isinstance(data['access_token'], str)
    assert len(data['access_token']) > 0

    # Verify the new access token works
    response = client.get(
        '/v1/auth/me',
        headers=get_auth_headers(data['access_token'])
    )
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
    access_token, _ = login_user(client, 'admin@polosanca.com', 'admin123')

    # Logout
    response = client.post(
        '/v1/auth/logout',
        headers=get_auth_headers(access_token)
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data['message'] == 'Logged out successfully'


def test_10_logout_without_token(client, init_database):
    """
    Test that logout requires authentication
    """
    response = client.post('/v1/auth/logout')

    assert response.status_code == 401
    data = response.get_json()
    assert 'error' in data


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
    response = client.post(
        '/v1/auth/login',
        json={'email': 'admin@polosanca.com', 'password': 'admin123'}
    )
    assert response.status_code == 200
    assert response.get_json()['user']['role'] == 'global_admin'

    # Company Admin
    response = client.post(
        '/v1/auth/login',
        json={'email': 'admin@testcompany.com', 'password': 'password123'}
    )
    assert response.status_code == 200
    assert response.get_json()['user']['role'] == 'company_admin'

    # Company Viewer
    response = client.post(
        '/v1/auth/login',
        json={'email': 'viewer@testcompany.com', 'password': 'viewer123'}
    )
    assert response.status_code == 200
    assert response.get_json()['user']['role'] == 'company_viewer'


def test_12_inactive_user_cannot_login(client, init_database):
    """
    Test that inactive users cannot log in

    This tests the status check in the auth flow
    """
    from app import db
    from app.models import User, UserStatus

    # Create an inactive user
    import bcrypt
    password_hash = bcrypt.hashpw('test123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    with client.application.app_context():
        inactive_user = User(
            email='inactive@test.com',
            password_hash=password_hash,
            name='Inactive User',
            role='company_viewer',
            status=UserStatus.INACTIVE
        )
        db.session.add(inactive_user)
        db.session.commit()

    # Attempt login
    response = client.post(
        '/v1/auth/login',
        json={'email': 'inactive@test.com', 'password': 'test123'}
    )

    assert response.status_code == 403
    data = response.get_json()
    assert 'error' in data
    assert 'inactive' in data['error'].lower()
