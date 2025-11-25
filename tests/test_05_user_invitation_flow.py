"""
Test Suite: User Invitation Flow (PRD 5.5)

Tests user invitation process:
1. Admin enters new user email and role
2. System sends invitation email
3. New user clicks invitation link
4. New user creates password and completes profile
5. New user gains access to appropriate dashboards
"""
import pytest
from tests.conftest import login_user, get_auth_headers


def test_01_company_admin_invites_viewer(client, init_database):
    """
    Test: Company admin invites a viewer to their company

    Flow:
    1. Company admin logs in
    2. Admin enters user email and assigns viewer role
    3. System generates invitation
    4. User is created with pending status
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    response = client.post(
        '/v1/users/invite',
        headers=get_auth_headers(access_token),
        json={
            'email': 'newviewer@testcompany.com',
            'name': 'New Viewer User',
            'role': 'company_viewer'
        }
    )

    assert response.status_code == 201
    data = response.get_json()

    assert data['success'] is True
    assert 'user_id' in data
    assert data['invitation_sent'] is True


def test_02_global_admin_invites_company_admin(client, init_database):
    """
    Test: Global admin invites company admin for a company
    """
    access_token, _ = login_user(client, 'admin@polosanca.com', 'admin123')

    # Get company ID
    companies = client.get(
        '/v1/companies',
        headers=get_auth_headers(access_token)
    ).get_json()['companies']
    company_id = companies[0]['id']

    response = client.post(
        '/v1/users/invite',
        headers=get_auth_headers(access_token),
        json={
            'email': 'newcompanyadmin@testcompany.com',
            'name': 'New Company Admin',
            'role': 'company_admin',
            'company_id': company_id
        }
    )

    assert response.status_code == 201
    assert response.get_json()['success'] is True


def test_03_invited_user_appears_in_user_list(client, init_database):
    """
    Test: Invited user appears in company's user list with pending status
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # Invite user
    invite_response = client.post(
        '/v1/users/invite',
        headers=get_auth_headers(access_token),
        json={
            'email': 'pendinguser@testcompany.com',
            'name': 'Pending User',
            'role': 'company_viewer'
        }
    )
    user_id = invite_response.get_json()['user_id']

    # Check user list
    users_response = client.get(
        '/v1/users',
        headers=get_auth_headers(access_token)
    )

    assert users_response.status_code == 200
    users = users_response.get_json()['users']

    invited_user = next((u for u in users if u['id'] == user_id), None)
    assert invited_user is not None
    assert invited_user['email'] == 'pendinguser@testcompany.com'
    assert invited_user['status'] == 'pending'


def test_04_cannot_invite_duplicate_email(client, init_database):
    """
    Test: Cannot invite user with email that already exists
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # First invitation
    response1 = client.post(
        '/v1/users/invite',
        headers=get_auth_headers(access_token),
        json={
            'email': 'duplicate@testcompany.com',
            'name': 'First User',
            'role': 'company_viewer'
        }
    )
    assert response1.status_code == 201

    # Attempt duplicate
    response2 = client.post(
        '/v1/users/invite',
        headers=get_auth_headers(access_token),
        json={
            'email': 'duplicate@testcompany.com',
            'name': 'Second User',
            'role': 'company_viewer'
        }
    )
    assert response2.status_code in [400, 422]


def test_05_company_admin_cannot_invite_to_other_companies(client, init_database):
    """
    Test: Company admin can only invite users to their own company
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # Create another company (as global admin)
    global_admin_token, _ = login_user(client, 'admin@polosanca.com', 'admin123')
    other_company = client.post(
        '/v1/companies',
        headers=get_auth_headers(global_admin_token),
        json={
            'name': 'Other Company',
            'contact_email': 'other@company.com',
            'contact_phone': '555-3000'
        }
    ).get_json()
    other_company_id = other_company['id']

    # Attempt to invite to other company
    response = client.post(
        '/v1/users/invite',
        headers=get_auth_headers(access_token),
        json={
            'email': 'unauthorized@othercompany.com',
            'name': 'Unauthorized User',
            'role': 'company_viewer',
            'company_id': other_company_id
        }
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
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # Get branch IDs
    branches = client.get(
        '/v1/branches',
        headers=get_auth_headers(access_token)
    ).get_json()['branches']
    branch_id = branches[0]['id']

    response = client.post(
        '/v1/users/invite',
        headers=get_auth_headers(access_token),
        json={
            'email': 'restrictedviewer@testcompany.com',
            'name': 'Restricted Viewer',
            'role': 'company_viewer',
            'branch_access': {
                'type': 'restricted',
                'branches': [branch_id]
            }
        }
    )

    assert response.status_code == 201

    # Verify user has branch restrictions
    user_id = response.get_json()['user_id']
    user_detail = client.get(
        f'/v1/users/{user_id}',
        headers=get_auth_headers(access_token)
    )

    user_data = user_detail.get_json()
    assert user_data['branch_access']['type'] == 'restricted'
    assert branch_id in user_data['branch_access']['branches']


def test_07_global_admin_invites_global_admin(client, init_database):
    """
    Test: Global admin can invite another global admin
    """
    access_token, _ = login_user(client, 'admin@polosanca.com', 'admin123')

    response = client.post(
        '/v1/users/invite',
        headers=get_auth_headers(access_token),
        json={
            'email': 'newglobaladmin@polosanca.com',
            'name': 'New Global Admin',
            'role': 'global_admin'
        }
    )

    assert response.status_code == 201
    user_id = response.get_json()['user_id']

    # Verify role
    user_detail = client.get(
        f'/v1/users/{user_id}',
        headers=get_auth_headers(access_token)
    )
    assert user_detail.get_json()['role'] == 'global_admin'


def test_08_company_admin_cannot_invite_global_admin(client, init_database):
    """
    Test: Company admin cannot create global admin users
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    response = client.post(
        '/v1/users/invite',
        headers=get_auth_headers(access_token),
        json={
            'email': 'unauthorized@globaladmin.com',
            'name': 'Unauthorized Global Admin',
            'role': 'global_admin'
        }
    )

    assert response.status_code == 403


def test_09_viewer_cannot_invite_users(client, init_database):
    """
    Test: Company viewers cannot invite users
    """
    access_token, _ = login_user(client, 'viewer@testcompany.com', 'viewer123')

    response = client.post(
        '/v1/users/invite',
        headers=get_auth_headers(access_token),
        json={
            'email': 'unauthorized@viewer.com',
            'name': 'Unauthorized Invitation',
            'role': 'company_viewer'
        }
    )

    assert response.status_code == 403


def test_10_invitation_requires_valid_email_format(client, init_database):
    """
    Test: System validates email format in invitation
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # Invalid email formats
    invalid_emails = [
        'notanemail',
        'missing@domain',
        '@nodomain.com',
        'spaces in@email.com'
    ]

    for invalid_email in invalid_emails:
        response = client.post(
            '/v1/users/invite',
            headers=get_auth_headers(access_token),
            json={
                'email': invalid_email,
                'name': 'Test User',
                'role': 'company_viewer'
            }
        )
        assert response.status_code in [400, 422]
