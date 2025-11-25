"""
Initialize database via Alembic migrations and idempotently seed demo data.
"""

import bcrypt
import psycopg2
from flask_migrate import upgrade
from psycopg2 import sql
from sqlalchemy.engine import make_url

from app import create_app, db
from app.models import (
    Branch,
    BranchAccessType,
    Company,
    Equipment,
    EquipmentType,
    User,
    UserBranchAccess,
    UserRole,
    UserStatus,
)
from app.utils import hash_api_key


def ensure_database_exists(db_uri: str) -> None:
    """Create the target PostgreSQL database if it does not exist yet."""
    url = make_url(db_uri)
    if not url.drivername.startswith("postgresql"):
        return

    target_db = url.database
    conn = psycopg2.connect(
        dbname="postgres",
        user=url.username,
        password=url.password,
        host=url.host or "localhost",
        port=url.port or 5432,
    )
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target_db,))
            if cur.fetchone() is None:
                cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(target_db)))
                print(f"Created PostgreSQL database: {target_db}")
    finally:
        conn.close()


def _upsert_demo_user(
    email: str, password: str, name: str, role: UserRole, company_id=None, branch_access_type=BranchAccessType.FULL
) -> User:
    user = User.query.filter_by(email=email).first()
    if user is None:
        pw_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        user = User(
            email=email,
            password_hash=pw_hash,
            name=name,
            role=role,
            company_id=company_id,
            status=UserStatus.ACTIVE,
            branch_access_type=branch_access_type,
        )
        db.session.add(user)
        db.session.flush()
    return user


def init_database(app=None) -> None:
    app = app or create_app()
    ensure_database_exists(app.config["SQLALCHEMY_DATABASE_URI"])

    with app.app_context():
        # Apply Alembic migrations instead of destructive drop_all()/create_all()
        upgrade(revision="head")

        company = Company.query.filter_by(name="Test Company").first()
        if company is None:
            company = Company(
                name="Test Company",
                contact_email="contact@testcompany.com",
                contact_phone="123-456-7890",
            )
            db.session.add(company)
            db.session.flush()

        main_branch = Branch.query.filter_by(company_id=company.id, name="Main Branch").first()
        if main_branch is None:
            main_branch = Branch(
                company_id=company.id,
                name="Main Branch",
                address="123 Test Street",
                manager_contact="Carlos Silva — (16) 99999-0101",
            )
            db.session.add(main_branch)
            db.session.flush()

        secondary_branch = Branch.query.filter_by(company_id=company.id, name="Secondary Branch").first()
        if secondary_branch is None:
            secondary_branch = Branch(
                company_id=company.id,
                name="Secondary Branch",
                address="456 Test Avenue",
                manager_contact="Mariana Costa — (16) 99999-0202",
            )
            db.session.add(secondary_branch)
            db.session.flush()

        _upsert_demo_user("admin@polosanca.com", "admin123", "Global Admin", UserRole.GLOBAL_ADMIN)
        _upsert_demo_user(
            "admin@testcompany.com", "password123", "Company Admin", UserRole.COMPANY_ADMIN, company_id=company.id
        )
        _upsert_demo_user(
            "viewer@testcompany.com", "viewer123", "Company Viewer", UserRole.COMPANY_VIEWER, company_id=company.id
        )
        restricted = _upsert_demo_user(
            "restricted@testcompany.com",
            "restricted123",
            "Restricted Viewer",
            UserRole.COMPANY_VIEWER,
            company_id=company.id,
            branch_access_type=BranchAccessType.RESTRICTED,
        )
        if not UserBranchAccess.query.filter_by(user_id=restricted.id, branch_id=main_branch.id).first():
            db.session.add(UserBranchAccess(user_id=restricted.id, branch_id=main_branch.id))

        if not Equipment.query.filter_by(serial="EQ-TEST-001").first():
            db.session.add(
                Equipment(
                    serial="EQ-TEST-001",
                    type=EquipmentType.FREEZER,
                    company_id=company.id,
                    branch_id=main_branch.id,
                    manufacturer="TestCorp",
                    model="TC-100",
                    api_key=hash_api_key("test_api_key_001"),
                )
            )
        if not Equipment.query.filter_by(serial="EQ-TEST-002").first():
            db.session.add(
                Equipment(
                    serial="EQ-TEST-002",
                    type=EquipmentType.REFRIGERATOR,
                    company_id=company.id,
                    branch_id=secondary_branch.id,
                    manufacturer="TestCorp",
                    model="TC-200",
                    api_key=hash_api_key("test_api_key_002"),
                )
            )

        db.session.commit()

        print("Database migrated to head and demo data seeded idempotently!")
        print("\nDemo accounts:")
        print("1. Global Admin:       admin@polosanca.com / admin123")
        print("2. Company Admin:      admin@testcompany.com / password123")
        print("3. Company Viewer:     viewer@testcompany.com / viewer123")
        print("4. Restricted Viewer:  restricted@testcompany.com / restricted123")


if __name__ == "__main__":
    init_database()
