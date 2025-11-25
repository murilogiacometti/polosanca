"""
Test Suite: Maintenance Logbook Flow (PRD 5.11)

Tests equipment maintenance logbook CRUD, denormalized Equipment date synchronization, and RBAC:
1. Admin logs maintenance record (performed_by, type, description, next_maintenance_date) and syncs Equipment dates
2. Viewers read maintenance history for permitted branches, while restricted viewers and viewers attempting writes get 403
3. Updating or deleting maintenance records recalculates Equipment.last_maintenance_date & next_maintenance_date
4. Cross-tenant Company Admins are blocked with 403 Forbidden
"""

from app import db
from app.models import Branch, Company, Equipment, EquipmentType
from app.utils import hash_api_key
from tests.conftest import get_auth_headers, login_user


def test_01_admin_logs_maintenance_and_syncs_equipment_summary_dates(client, init_database):
    """
    PRD 5.11 Steps 1-3:
    Company Admin logs maintenance activity; Equipment detail reflects last_maintenance_date and next_maintenance_date.
    """
    admin_token, _ = login_user(client, "admin@testcompany.com", "password123")
    headers = get_auth_headers(admin_token)

    eq_list = client.get("/v1/equipments?search=EQ-TEST-001", headers=headers).get_json()["equipment"]
    eq_id = eq_list[0]["id"]
    assert eq_list[0]["last_maintenance_date"] is None
    assert eq_list[0]["next_maintenance_date"] is None

    create_resp = client.post(
        f"/v1/equipments/{eq_id}/maintenance-records",
        headers=headers,
        json={
            "type": "routine_inspection",
            "description": "Cleaned condenser fins and verified door gasket seal",
            "performed_by": "Carlos Silva (RefriTech)",
            "performed_at": "2026-10-15T14:30:00Z",
            "notes": "All pressures nominal",
            "next_maintenance_date": "2027-01-15",
        },
    )
    assert create_resp.status_code == 201
    record = create_resp.get_json()
    assert record["type"] == "routine_inspection"
    assert record["performed_by"] == "Carlos Silva (RefriTech)"
    assert record["next_maintenance_date"] == "2027-01-15"

    updated_eq = client.get(f"/v1/equipments/{eq_id}", headers=headers).get_json()
    assert updated_eq["last_maintenance_date"] == "2026-10-15"
    assert updated_eq["next_maintenance_date"] == "2027-01-15"


def test_02_viewers_read_accessible_maintenance_history_but_cannot_mutate(client, init_database):
    """
    PRD 5.11 Step 4:
    Full Viewer reads all company equipment maintenance; Restricted Viewer only reads assigned branch;
    Viewers cannot create, update, or delete maintenance records (403).
    """
    admin_token, _ = login_user(client, "admin@testcompany.com", "password123")
    viewer_token, _ = login_user(client, "viewer@testcompany.com", "viewer123")
    restricted_token, _ = login_user(client, "restricted@testcompany.com", "restricted123")

    eqs = {
        e["serial"]: e["id"]
        for e in client.get("/v1/equipments", headers=get_auth_headers(admin_token)).get_json()["equipment"]
    }
    eq1_id = eqs["EQ-TEST-001"]  # Main Branch (assigned to restricted viewer)
    eq2_id = eqs["EQ-TEST-002"]  # Secondary Branch (unassigned)

    r1 = client.post(
        f"/v1/equipments/{eq1_id}/maintenance-records",
        headers=get_auth_headers(admin_token),
        json={
            "type": "repair",
            "description": "Replaced evaporator fan blade",
            "performed_by": "Tech 1",
        },
    ).get_json()
    r2 = client.post(
        f"/v1/equipments/{eq2_id}/maintenance-records",
        headers=get_auth_headers(admin_token),
        json={
            "type": "part_replacement",
            "description": "Replaced door hinge",
            "performed_by": "Tech 2",
        },
    ).get_json()

    # Full viewer can read both
    assert (
        client.get(
            f"/v1/equipments/{eq1_id}/maintenance-records",
            headers=get_auth_headers(viewer_token),
        ).status_code
        == 200
    )
    assert (
        client.get(
            f"/v1/equipments/{eq2_id}/maintenance-records",
            headers=get_auth_headers(viewer_token),
        ).status_code
        == 200
    )

    # Restricted viewer can read EQ-TEST-001, forbidden on EQ-TEST-002
    assert (
        client.get(
            f"/v1/equipments/{eq1_id}/maintenance-records",
            headers=get_auth_headers(restricted_token),
        ).status_code
        == 200
    )
    assert (
        client.get(
            f"/v1/maintenance-records/{r1['id']}",
            headers=get_auth_headers(restricted_token),
        ).status_code
        == 200
    )
    assert (
        client.get(
            f"/v1/equipments/{eq2_id}/maintenance-records",
            headers=get_auth_headers(restricted_token),
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"/v1/maintenance-records/{r2['id']}",
            headers=get_auth_headers(restricted_token),
        ).status_code
        == 403
    )

    # Viewer write attempts return 403
    assert (
        client.post(
            f"/v1/equipments/{eq1_id}/maintenance-records",
            headers=get_auth_headers(viewer_token),
            json={"type": "repair", "description": "x", "performed_by": "y"},
        ).status_code
        == 403
    )
    assert (
        client.patch(
            f"/v1/maintenance-records/{r1['id']}",
            headers=get_auth_headers(viewer_token),
            json={"notes": "tamper"},
        ).status_code
        == 403
    )
    assert (
        client.delete(
            f"/v1/maintenance-records/{r1['id']}",
            headers=get_auth_headers(viewer_token),
        ).status_code
        == 403
    )


def test_03_updating_and_deleting_maintenance_records_resyncs_equipment_dates(client, init_database):
    """
    PRD 5.11 Steps 3-4:
    PATCH and DELETE on maintenance records deterministically resync Equipment.last_maintenance_date
    and next_maintenance_date from the latest remaining record.
    """
    admin_token, _ = login_user(client, "admin@testcompany.com", "password123")
    headers = get_auth_headers(admin_token)
    eq_id = client.get("/v1/equipments?search=EQ-TEST-001", headers=headers).get_json()["equipment"][0]["id"]

    older = client.post(
        f"/v1/equipments/{eq_id}/maintenance-records",
        headers=headers,
        json={
            "type": "routine_inspection",
            "description": "Q3 check",
            "performed_by": "Tech A",
            "performed_at": "2026-07-01T10:00:00Z",
            "next_maintenance_date": "2026-10-01",
        },
    ).get_json()
    newer = client.post(
        f"/v1/equipments/{eq_id}/maintenance-records",
        headers=headers,
        json={
            "type": "emergency_fix",
            "description": "Compressor relay swap",
            "performed_by": "Tech B",
            "performed_at": "2026-11-01T10:00:00Z",
            "next_maintenance_date": "2027-02-01",
        },
    ).get_json()

    # Equipment reflects newer record
    eq = client.get(f"/v1/equipments/{eq_id}", headers=headers).get_json()
    assert eq["last_maintenance_date"] == "2026-11-01"
    assert eq["next_maintenance_date"] == "2027-02-01"

    # PATCH newer record's next_maintenance_date -> Equipment updates
    patch_resp = client.patch(
        f"/v1/maintenance-records/{newer['id']}",
        headers=headers,
        json={"next_maintenance_date": "2027-03-15", "notes": "Extended interval"},
    )
    assert patch_resp.status_code == 200
    eq = client.get(f"/v1/equipments/{eq_id}", headers=headers).get_json()
    assert eq["next_maintenance_date"] == "2027-03-15"

    # DELETE newer record -> Equipment rolls back to older record's dates
    del_newer = client.delete(f"/v1/maintenance-records/{newer['id']}", headers=headers)
    assert del_newer.status_code == 200
    eq = client.get(f"/v1/equipments/{eq_id}", headers=headers).get_json()
    assert eq["last_maintenance_date"] == "2026-07-01"
    assert eq["next_maintenance_date"] == "2026-10-01"

    # DELETE older record -> Equipment dates clear to None
    assert client.delete(f"/v1/maintenance-records/{older['id']}", headers=headers).status_code == 200
    eq = client.get(f"/v1/equipments/{eq_id}", headers=headers).get_json()
    assert eq["last_maintenance_date"] is None
    assert eq["next_maintenance_date"] is None


def test_04_cross_tenant_isolation_on_maintenance_records(client, app, init_database):
    """Company Admin cannot view or log maintenance records for another tenant's equipment."""
    with app.app_context():
        other_co = Company(name="Other Maint Co", contact_email="maint@other.com")
        db.session.add(other_co)
        db.session.flush()
        other_branch = Branch(company_id=other_co.id, name="Remote Branch", address="1 Remote Way")
        db.session.add(other_branch)
        db.session.flush()
        other_eq = Equipment(
            serial="EQ-MAINT-OTHER",
            type=EquipmentType.FREEZER,
            company_id=other_co.id,
            branch_id=other_branch.id,
            api_key=hash_api_key("maint_other_key"),
        )
        db.session.add(other_eq)
        db.session.commit()
        other_eq_id = str(other_eq.id)

    admin_token, _ = login_user(client, "admin@testcompany.com", "password123")
    headers = get_auth_headers(admin_token)

    assert client.get(f"/v1/equipments/{other_eq_id}/maintenance-records", headers=headers).status_code == 403
    assert (
        client.post(
            f"/v1/equipments/{other_eq_id}/maintenance-records",
            headers=headers,
            json={"type": "repair", "description": "Cross-tenant attempt", "performed_by": "Hacker"},
        ).status_code
        == 403
    )
