"""
Maintenance Records Routes
CRUD operations for maintenance records
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime

from app import db
from app.models import MaintenanceRecord, Equipment

maintenance_bp = Blueprint('maintenance', __name__)


@maintenance_bp.route('/equipments/<equipment_id>/maintenance-records', methods=['GET'])
@jwt_required()
def get_maintenance_records(equipment_id):
    """Get maintenance records for an equipment"""
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)

    records = MaintenanceRecord.query.filter_by(equipment_id=equipment_id)\
        .order_by(MaintenanceRecord.performed_at.desc())\
        .paginate(page=page, per_page=limit, error_out=False)

    return jsonify({
        'equipment_id': equipment_id,
        'maintenance_records': [r.to_dict() for r in records.items],
        'pagination': {
            'page': page,
            'limit': limit,
            'total': records.total,
            'total_pages': records.pages
        }
    }), 200


@maintenance_bp.route('/maintenance-records/<record_id>', methods=['GET'])
@jwt_required()
def get_maintenance_record(record_id):
    """Get a specific maintenance record"""
    record = MaintenanceRecord.query.get(record_id)
    if not record:
        return jsonify({'error': 'Maintenance record not found'}), 404

    return jsonify(record.to_dict()), 200


@maintenance_bp.route('/equipments/<equipment_id>/maintenance-records', methods=['POST'])
@jwt_required()
def create_maintenance_record(equipment_id):
    """Create a new maintenance record"""
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data or not data.get('type') or not data.get('description'):
        return jsonify({'error': 'Type and description are required'}), 400

    # Verify equipment exists
    equipment = Equipment.query.get(equipment_id)
    if not equipment:
        return jsonify({'error': 'Equipment not found'}), 404

    record = MaintenanceRecord(
        equipment_id=equipment_id,
        type=data['type'],
        description=data['description'],
        performed_by=data['performed_by'],
        performed_at=datetime.fromisoformat(data['performed_at']) if 'performed_at' in data else datetime.utcnow(),
        notes=data.get('notes'),
        next_maintenance_date=datetime.fromisoformat(data['next_maintenance_date']).date() if 'next_maintenance_date' in data else None,
        created_by=user_id
    )

    db.session.add(record)
    db.session.commit()

    return jsonify(record.to_dict()), 201


@maintenance_bp.route('/maintenance-records/<record_id>', methods=['PATCH'])
@jwt_required()
def update_maintenance_record(record_id):
    """Update a maintenance record"""
    record = MaintenanceRecord.query.get(record_id)
    if not record:
        return jsonify({'error': 'Maintenance record not found'}), 404

    data = request.get_json()

    if 'type' in data:
        record.type = data['type']
    if 'description' in data:
        record.description = data['description']
    if 'notes' in data:
        record.notes = data['notes']
    if 'next_maintenance_date' in data:
        record.next_maintenance_date = datetime.fromisoformat(data['next_maintenance_date']).date()

    db.session.commit()

    return jsonify(record.to_dict()), 200


@maintenance_bp.route('/maintenance-records/<record_id>', methods=['DELETE'])
@jwt_required()
def delete_maintenance_record(record_id):
    """Delete a maintenance record"""
    record = MaintenanceRecord.query.get(record_id)
    if not record:
        return jsonify({'error': 'Maintenance record not found'}), 404

    db.session.delete(record)
    db.session.commit()

    return jsonify({'message': 'Maintenance record deleted'}), 200
