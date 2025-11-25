"""
Test Suite: Branch Access Restriction Flow (PRD 5.6)

Tests branch-level access control:
1. Company admin restricting viewer to specific branches
2. Restricted viewers only see assigned branches
3. Modifying branch access permissions
"""
import pytest
from tests.conftest import login_user, get_auth_headers


def test_01_company_admin_restricts_viewer_to_specific_branch(client, init_database):
    """
    Test: Company admin restricts viewer to specific branches

    Flow:
    1. Company admin navigates to user management
    2. Admin selects viewer
    3. Admin enables "Restrict to specific branches"
    4. Admin selects one or more branches
    5. System updates user permissions
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # Get branches
    branches = client.get(
        '/v1/branches',
        headers=get_auth_headers(access_token)
    ).get_json()['branches']
    branch_id = branches[0]['id']

    # Invite user with branch restriction
    invite_response = client.post(
        '/v1/users/invite',
        headers=get_auth_headers(access_token),
        json={
            'email': 'restricted@test.com',
            'name': 'Restricted User',
            'role': 'company_viewer',
            'branch_access': {
                'type': 'restricted',
                'branches': [branch_id]
            }
        }
    )

    assert invite_response.status_code == 201
    user_id = invite_response.get_json()['user_id']

    # Verify restriction
    user_detail = client.get(
        f'/v1/users/{user_id}',
        headers=get_auth_headers(access_token)
    ).get_json()

    assert user_detail['branch_access']['type'] == 'restricted'
    assert len(user_detail['branch_access']['branches']) == 1


def test_02_restricted_viewer_only_sees_assigned_branches(client, init_database):
    """
    Test: Restricted viewer only sees their assigned branches

    Flow:
    1. Restricted viewer logs in
    2. Viewer sees only assigned branches in branch list
    3. Other branches are filtered out
    """
    # Login as restricted viewer
    access_token, _ = login_user(client, 'restricted@testcompany.com', 'restricted123')

    # Get branches (should only see assigned branch)
    response = client.get(
        '/v1/branches',
        headers=get_auth_headers(access_token)
    )

    assert response.status_code == 200
    branches = response.get_json()['branches']

    # Should only see one branch (the assigned one)
    assert len(branches) == 1


def test_03_restricted_viewer_only_sees_equipment_from_assigned_branches(client, init_database):
    """
    Test: Restricted viewer only sees equipment from assigned branches
    """
    # Login as restricted viewer
    access_token, _ = login_user(client, 'restricted@testcompany.com', 'restricted123')

    # Get equipment
    response = client.get(
        '/v1/equipments',
        headers=get_auth_headers(access_token)
    )

    assert response.status_code == 200
    equipment_list = response.get_json()['equipment']

    # Get allowed branches
    branches = client.get(
        '/v1/branches',
        headers=get_auth_headers(access_token)
    ).get_json()['branches']
    allowed_branch_ids = [b['id'] for b in branches]

    # All equipment should belong to allowed branches
    for eq in equipment_list:
        assert eq['branch_id'] in allowed_branch_ids


def test_04_full_access_viewer_sees_all_branches(client, init_database):
    """
    Test: Viewer with full access sees all company branches
    """
    # Login as full access viewer
    access_token, _ = login_user(client, 'viewer@testcompany.com', 'viewer123')

    # Get branches
    response = client.get(
        '/v1/branches',
        headers=get_auth_headers(access_token)
    )

    assert response.status_code == 200
    branches = response.get_json()['branches']

    # Should see all branches (at least 2 in test data)
    assert len(branches) >= 2


def test_05_company_admin_modifies_viewer_branch_access(client, init_database):
    """
    Test: Company admin can modify viewer's branch access

    Flow:
    1. Admin selects viewer with branch restrictions
    2. Admin adds or removes branches
    3. Admin saves changes
    4. Viewer's access updates immediately
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # Get user list
    users = client.get(
        '/v1/users',
        headers=get_auth_headers(access_token)
    ).get_json()['users']

    # Find restricted user
    restricted_user = next((u for u in users if u['email'] == 'restricted@testcompany.com'), None)
    assert restricted_user is not None

    # Get all branches
    branches = client.get(
        '/v1/branches',
        headers=get_auth_headers(access_token)
    ).get_json()['branches']

    # Update to add second branch
    response = client.patch(
        f'/v1/users/{restricted_user["id"]}',
        headers=get_auth_headers(access_token),
        json={
            'branch_access': {
                'type': 'restricted',
                'branches': [branches[0]['id'], branches[1]['id']]
            }
        }
    )

    assert response.status_code == 200

    # Verify update
    updated_user = client.get(
        f'/v1/users/{restricted_user["id"]}',
        headers=get_auth_headers(access_token)
    ).get_json()

    assert len(updated_user['branch_access']['branches']) == 2


def test_06_company_admin_changes_viewer_from_restricted_to_full_access(client, init_database):
    """
    Test: Admin can change viewer from restricted to full access
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # Get restricted user
    users = client.get(
        '/v1/users',
        headers=get_auth_headers(access_token)
    ).get_json()['users']

    restricted_user = next((u for u in users if u['email'] == 'restricted@testcompany.com'), None)

    # Change to full access
    response = client.patch(
        f'/v1/users/{restricted_user["id"]}',
        headers=get_auth_headers(access_token),
        json={
            'branch_access': {
                'type': 'full'
            }
        }
    )

    assert response.status_code == 200

    # Verify change
    updated_user = client.get(
        f'/v1/users/{restricted_user["id"]}',
        headers=get_auth_headers(access_token)
    ).get_json()

    assert updated_user['branch_access']['type'] == 'full'


def test_07_restricted_branch_access_requires_at_least_one_branch(client, init_database):
    """
    Test: System validates that restricted access must have at least one branch
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # Attempt to create restricted user with no branches
    response = client.post(
        '/v1/users/invite',
        headers=get_auth_headers(access_token),
        json={
            'email': 'invalid@test.com',
            'name': 'Invalid Restricted User',
            'role': 'company_viewer',
            'branch_access': {
                'type': 'restricted',
                'branches': []  # Empty list
            }
        }
    )

    assert response.status_code in [400, 422]


def test_08_dashboard_automatically_filters_for_restricted_viewer(client, init_database):
    """
    Test: Dashboard automatically filters data for restricted viewers

    Flow:
    1. Restricted viewer logs in
    2. Dashboard shows only accessible data
    3. All views respect branch restrictions
    """
    # Login as restricted viewer
    access_token, _ = login_user(client, 'restricted@testcompany.com', 'restricted123')

    # Get dashboard data (equipment, branches, alerts)
    equipment = client.get(
        '/v1/equipments',
        headers=get_auth_headers(access_token)
    ).get_json()['equipment']

    branches = client.get(
        '/v1/branches',
        headers=get_auth_headers(access_token)
    ).get_json()['branches']

    allowed_branch_ids = [b['id'] for b in branches]

    # Verify all equipment belongs to allowed branches
    for eq in equipment:
        assert eq['branch_id'] in allowed_branch_ids


def test_09_restricted_viewer_cannot_access_other_branch_equipment_details(client, init_database):
    """
    Test: Restricted viewer cannot access details of equipment in non-assigned branches
    """
    # Login as company admin to get equipment from other branch
    admin_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    all_equipment = client.get(
        '/v1/equipments',
        headers=get_auth_headers(admin_token)
    ).get_json()['equipment']

    # Login as restricted viewer
    restricted_token, _ = login_user(client, 'restricted@testcompany.com', 'restricted123')

    # Get viewer's allowed branches
    allowed_branches = client.get(
        '/v1/branches',
        headers=get_auth_headers(restricted_token)
    ).get_json()['branches']
    allowed_branch_ids = [b['id'] for b in allowed_branches]

    # Find equipment not in allowed branches
    restricted_equipment = next((eq for eq in all_equipment if eq['branch_id'] not in allowed_branch_ids), None)

    if restricted_equipment:
        # Attempt to access restricted equipment
        response = client.get(
            f'/v1/equipments/{restricted_equipment["id"]}',
            headers=get_auth_headers(restricted_token)
        )

        # Should be forbidden or not found
        assert response.status_code in [403, 404]


def test_10_company_admin_assigns_multiple_branches_to_viewer(client, init_database):
    """
    Test: Admin can assign multiple branches to a single viewer

    Flow:
    1. Admin creates viewer with multiple branch access
    2. Viewer sees equipment from all assigned branches
    3. Viewer cannot see equipment from other branches
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # Get branches
    branches = client.get(
        '/v1/branches',
        headers=get_auth_headers(access_token)
    ).get_json()['branches']

    # Create viewer with access to first two branches
    invite_response = client.post(
        '/v1/users/invite',
        headers=get_auth_headers(access_token),
        json={
            'email': 'multipleaccess@test.com',
            'name': 'Multiple Access User',
            'role': 'company_viewer',
            'branch_access': {
                'type': 'restricted',
                'branches': [branches[0]['id'], branches[1]['id']]
            }
        }
    )

    assert invite_response.status_code == 201

    # Verify access
    user_id = invite_response.get_json()['user_id']
    user_detail = client.get(
        f'/v1/users/{user_id}',
        headers=get_auth_headers(access_token)
    ).get_json()

    assert len(user_detail['branch_access']['branches']) == 2
