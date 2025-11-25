"""
Test Suite: Branch Management Flow (PRD 5.10)

Tests branch management operations:
1. Company admin creates and manages branches
2. Admin adds branches with details
3. Admin views and filters by branch
4. Admin edits branch information
5. Admin handles branch deletion
"""
import pytest
from tests.conftest import login_user, get_auth_headers


def test_01_company_admin_creates_branch(client, init_database):
    """
    Test: Company admin successfully creates a new branch

    Flow:
    1. Company admin logs in
    2. Admin clicks "Add Branch"
    3. Admin fills in branch details
    4. System validates and creates branch
    5. Branch appears in branch list
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    response = client.post(
        '/v1/branches',
        headers=get_auth_headers(access_token),
        json={
            'name': 'Westside Branch',
            'address': '456 West Avenue, Downtown, ST 12345'
        }
    )

    assert response.status_code == 201
    data = response.get_json()

    assert 'id' in data
    assert data['name'] == 'Westside Branch'
    assert data['address'] == '456 West Avenue, Downtown, ST 12345'
    assert 'company_id' in data
    assert 'created_at' in data


def test_02_branch_appears_in_list_after_creation(client, init_database):
    """
    Test: Newly created branch appears in branches list
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # Create branch
    create_response = client.post(
        '/v1/branches',
        headers=get_auth_headers(access_token),
        json={
            'name': 'Eastside Branch',
            'address': '789 East Street'
        }
    )
    branch_id = create_response.get_json()['id']

    # List branches
    list_response = client.get(
        '/v1/branches',
        headers=get_auth_headers(access_token)
    )

    assert list_response.status_code == 200
    branches = list_response.get_json()['branches']
    assert any(b['id'] == branch_id for b in branches)


def test_03_company_admin_updates_branch_information(client, init_database):
    """
    Test: Company admin can update branch details

    Flow:
    1. Admin selects existing branch
    2. Admin updates branch information
    3. System saves changes
    4. Updated information is reflected
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # Get existing branch
    branches = client.get(
        '/v1/branches',
        headers=get_auth_headers(access_token)
    ).get_json()['branches']
    branch_id = branches[0]['id']

    # Update branch
    response = client.patch(
        f'/v1/branches/{branch_id}',
        headers=get_auth_headers(access_token),
        json={
            'name': 'Updated Branch Name',
            'address': 'Updated Address 123'
        }
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data['name'] == 'Updated Branch Name'
    assert data['address'] == 'Updated Address 123'


def test_04_company_admin_views_branch_details(client, init_database):
    """
    Test: Admin can view branch details including equipment count
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # Get branch list
    branches = client.get(
        '/v1/branches',
        headers=get_auth_headers(access_token)
    ).get_json()['branches']

    assert len(branches) > 0
    branch = branches[0]

    # Get detailed view
    response = client.get(
        f'/v1/branches/{branch["id"]}',
        headers=get_auth_headers(access_token)
    )

    assert response.status_code == 200
    data = response.get_json()
    assert 'id' in data
    assert 'name' in data
    assert 'address' in data
    assert 'equipment_count' in data


def test_05_branch_name_must_be_unique_within_company(client, init_database):
    """
    Test: Branch names must be unique within a company
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # Create first branch
    response1 = client.post(
        '/v1/branches',
        headers=get_auth_headers(access_token),
        json={
            'name': 'Unique Branch',
            'address': 'Address 1'
        }
    )
    assert response1.status_code == 201

    # Attempt duplicate name
    response2 = client.post(
        '/v1/branches',
        headers=get_auth_headers(access_token),
        json={
            'name': 'Unique Branch',
            'address': 'Address 2'
        }
    )
    assert response2.status_code in [400, 422]


def test_06_deleting_branch_with_equipment_requires_reassignment(client, init_database):
    """
    Test: Cannot delete branch with equipment without handling equipment first

    Flow:
    1. Admin attempts to delete branch with equipment
    2. System warns about assigned equipment
    3. Admin must reassign equipment before deletion
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # Get branch with equipment
    branches = client.get(
        '/v1/branches',
        headers=get_auth_headers(access_token)
    ).get_json()['branches']

    # Find branch with equipment
    branch_with_equipment = None
    for branch in branches:
        equipments = client.get(
            f'/v1/equipments?branch_id={branch["id"]}',
            headers=get_auth_headers(access_token)
        ).get_json()['equipment']

        if len(equipments) > 0:
            branch_with_equipment = branch
            break

    if branch_with_equipment:
        # Attempt to delete branch with equipment
        response = client.delete(
            f'/v1/branches/{branch_with_equipment["id"]}',
            headers=get_auth_headers(access_token)
        )

        # Should fail or warn
        assert response.status_code in [400, 409, 422]


def test_07_empty_branch_can_be_deleted(client, init_database):
    """
    Test: Branch without equipment can be deleted
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # Create new empty branch
    create_response = client.post(
        '/v1/branches',
        headers=get_auth_headers(access_token),
        json={
            'name': 'Temporary Branch',
            'address': 'Temporary Address'
        }
    )
    branch_id = create_response.get_json()['id']

    # Delete empty branch
    delete_response = client.delete(
        f'/v1/branches/{branch_id}',
        headers=get_auth_headers(access_token)
    )

    assert delete_response.status_code in [200, 204]

    # Verify branch is deleted
    list_response = client.get(
        '/v1/branches',
        headers=get_auth_headers(access_token)
    )
    branches = list_response.get_json()['branches']
    assert not any(b['id'] == branch_id for b in branches)


def test_08_global_admin_can_manage_any_company_branches(client, init_database):
    """
    Test: Global admin can manage branches for any company
    """
    access_token, _ = login_user(client, 'admin@polosanca.com', 'admin123')

    # Create company
    company_response = client.post(
        '/v1/companies',
        headers=get_auth_headers(access_token),
        json={
            'name': 'Branch Test Company',
            'contact_email': 'branch@test.com',
            'contact_phone': '555-2000'
        }
    )
    company_id = company_response.get_json()['id']

    # Create branch for that company
    branch_response = client.post(
        '/v1/branches',
        headers=get_auth_headers(access_token),
        json={
            'company_id': company_id,
            'name': 'Test Branch',
            'address': '100 Test Road'
        }
    )

    assert branch_response.status_code == 201


def test_09_viewer_cannot_create_or_modify_branches(client, init_database):
    """
    Test: Company viewers cannot create or modify branches
    """
    access_token, _ = login_user(client, 'viewer@testcompany.com', 'viewer123')

    # Attempt to create branch
    create_response = client.post(
        '/v1/branches',
        headers=get_auth_headers(access_token),
        json={
            'name': 'Unauthorized Branch',
            'address': 'Unauthorized Address'
        }
    )
    assert create_response.status_code == 403

    # Attempt to update existing branch
    branches = client.get(
        '/v1/branches',
        headers=get_auth_headers(access_token)
    ).get_json()['branches']

    if len(branches) > 0:
        update_response = client.patch(
            f'/v1/branches/{branches[0]["id"]}',
            headers=get_auth_headers(access_token),
            json={'name': 'Updated Name'}
        )
        assert update_response.status_code == 403


def test_10_company_admin_filters_equipment_by_branch(client, init_database):
    """
    Test: Admin can filter dashboard views by branch

    Flow:
    1. Admin views branches list
    2. Admin selects specific branch
    3. Equipment list filters to show only that branch's equipment
    """
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    # Get branches
    branches = client.get(
        '/v1/branches',
        headers=get_auth_headers(access_token)
    ).get_json()['branches']

    branch_id = branches[0]['id']

    # Filter equipment by branch
    equipment_response = client.get(
        f'/v1/equipments?branch_id={branch_id}',
        headers=get_auth_headers(access_token)
    )

    assert equipment_response.status_code == 200
    equipment_list = equipment_response.get_json()['equipment']

    # All equipment should belong to the specified branch
    for eq in equipment_list:
        assert eq['branch_id'] == branch_id
