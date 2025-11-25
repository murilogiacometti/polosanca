"""
Test Configuration and Fixtures
Provides common fixtures and utilities for end-to-end API tests
"""
import pytest
from app import create_app, db
from app.models import (
    User, Company, Branch, Equipment, UserBranchAccess,
    UserRole, UserStatus, EquipmentType, BranchAccessType
)
import bcrypt


@pytest.fixture(scope='session')
def app():
    """Create application instance for testing"""
    import os
    # Set test database URL using same credentials as dev
    if 'TEST_DATABASE_URL' not in os.environ:
        os.environ['TEST_DATABASE_URL'] = 'postgresql://murilog@localhost:5432/polosanca_test'
    os.environ['FLASK_ENV'] = 'testing'
    app = create_app('testing')
    return app


@pytest.fixture(scope='function')
def client(app):
    """Create test client"""
    return app.test_client()


@pytest.fixture(scope='function')
def init_database(app):
    """Initialize test database with clean state"""
    with app.app_context():
        # Drop and recreate all tables
        db.drop_all()
        db.create_all()

        # Create test data
        _create_test_data()

        yield db

        # Cleanup after test
        db.session.remove()
        db.drop_all()


def _create_test_data():
    """Create initial test data"""
    # Create test company
    company = Company(
        name="Test Company",
        contact_email="contact@testcompany.com",
        contact_phone="123-456-7890"
    )
    db.session.add(company)
    db.session.flush()

    # Create test branch
    branch = Branch(
        company_id=company.id,
        name="Main Branch",
        address="123 Test Street"
    )
    db.session.add(branch)
    db.session.flush()

    # Create second branch for testing branch access restrictions
    branch2 = Branch(
        company_id=company.id,
        name="Secondary Branch",
        address="456 Test Avenue"
    )
    db.session.add(branch2)
    db.session.flush()

    # Create test users
    # 1. Global Admin
    admin_password = bcrypt.hashpw('admin123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    admin = User(
        email="admin@polosanca.com",
        password_hash=admin_password,
        name="Global Admin",
        role=UserRole.GLOBAL_ADMIN,
        status=UserStatus.ACTIVE
    )
    db.session.add(admin)

    # 2. Company Admin
    company_admin_password = bcrypt.hashpw('password123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    company_admin = User(
        email="admin@testcompany.com",
        password_hash=company_admin_password,
        name="Company Admin",
        role=UserRole.COMPANY_ADMIN,
        company_id=company.id,
        status=UserStatus.ACTIVE
    )
    db.session.add(company_admin)

    # 3. Company Viewer (Full Access)
    viewer_password = bcrypt.hashpw('viewer123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    viewer = User(
        email="viewer@testcompany.com",
        password_hash=viewer_password,
        name="Company Viewer",
        role=UserRole.COMPANY_VIEWER,
        company_id=company.id,
        status=UserStatus.ACTIVE,
        branch_access_type=BranchAccessType.FULL
    )
    db.session.add(viewer)

    # 4. Branch-Restricted Viewer
    restricted_viewer_password = bcrypt.hashpw('restricted123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    restricted_viewer = User(
        email="restricted@testcompany.com",
        password_hash=restricted_viewer_password,
        name="Restricted Viewer",
        role=UserRole.COMPANY_VIEWER,
        company_id=company.id,
        status=UserStatus.ACTIVE,
        branch_access_type=BranchAccessType.RESTRICTED
    )
    db.session.add(restricted_viewer)
    db.session.flush()

    # Assign branch to restricted viewer
    branch_access = UserBranchAccess(
        user_id=restricted_viewer.id,
        branch_id=branch.id
    )
    db.session.add(branch_access)

    # Create test equipment
    equipment = Equipment(
        serial="EQ-TEST-001",
        type=EquipmentType.FREEZER,
        company_id=company.id,
        branch_id=branch.id,
        manufacturer="TestCorp",
        model="TC-100",
        api_key="test_api_key_001"
    )
    db.session.add(equipment)

    # Create equipment in second branch
    equipment2 = Equipment(
        serial="EQ-TEST-002",
        type=EquipmentType.REFRIGERATOR,
        company_id=company.id,
        branch_id=branch2.id,
        manufacturer="TestCorp",
        model="TC-200",
        api_key="test_api_key_002"
    )
    db.session.add(equipment2)

    db.session.commit()


def login_user(client, email, password):
    """Helper function to login and get access token"""
    response = client.post(
        '/v1/auth/login',
        json={'email': email, 'password': password}
    )
    assert response.status_code == 200
    data = response.get_json()
    return data['access_token'], data['refresh_token']


def get_auth_headers(access_token):
    """Helper function to create authorization headers"""
    return {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
