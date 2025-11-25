"""
Initialize database and create test data
"""
from app import create_app, db
from app.models import User, Company, Branch, UserRole, UserStatus
import bcrypt

app = create_app()

with app.app_context():
    # Drop all tables and recreate
    db.drop_all()
    db.create_all()

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

    # 3. Company Viewer
    viewer_password = bcrypt.hashpw('viewer123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    viewer = User(
        email="viewer@testcompany.com",
        password_hash=viewer_password,
        name="Company Viewer",
        role=UserRole.COMPANY_VIEWER,
        company_id=company.id,
        status=UserStatus.ACTIVE
    )
    db.session.add(viewer)

    db.session.commit()

    print("✅ Database initialized successfully!")
    print("\nTest users created:")
    print("1. Global Admin:")
    print("   Email: admin@polosanca.com")
    print("   Password: admin123")
    print("\n2. Company Admin:")
    print("   Email: admin@testcompany.com")
    print("   Password: password123")
    print("\n3. Company Viewer:")
    print("   Email: viewer@testcompany.com")
    print("   Password: viewer123")
