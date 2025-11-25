"""
Equipments Routes
CRUD operations for equipment
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
import secrets

from app import db
from app.models import Equipment, User, UserRole

equipments_bp = Blueprint('equipments', __name__)


@equipments_bp.route('', methods=['GET'])
@jwt_required()
def get_equipments():
    """Get equipment with pagination"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)
    branch_id = request.args.get('branch_id')
    status = request.args.get('status')

    query = Equipment.query

    # Filter by company based on user role
    if user.role != UserRole.GLOBAL_ADMIN:
        query = query.filter_by(company_id=user.company_id)

    if branch_id:
        query = query.filter_by(branch_id=branch_id)
    if status:
        query = query.filter_by(status=status)

    equipments = query.paginate(page=page, per_page=limit, error_out=False)

    return jsonify({
        'equipments': [e.to_dict() for e in equipments.items],
        'pagination': {
            'page': page,
            'limit': limit,
            'total': equipments.total,
            'total_pages': equipments.pages
        }
    }), 200


@equipments_bp.route('/<equipment_id>', methods=['GET'])
@jwt_required()
def get_equipment(equipment_id):
    """Get a specific equipment"""
    equipment = Equipment.query.get(equipment_id)
    if not equipment:
        return jsonify({'error': 'Equipment not found'}), 404

    return jsonify(equipment.to_dict()), 200


@equipments_bp.route('', methods=['POST'])
@jwt_required()
def create_equipment():
    """Create new equipment"""
    data = request.get_json()

    if not data or not data.get('serial') or not data.get('type') or not data.get('branch_id'):
        return jsonify({'error': 'Serial, type, and branch_id are required'}), 400

    # Generate API key
    api_key = secrets.token_urlsafe(32)

    equipment = Equipment(
        serial=data['serial'],
        type=data['type'],
        branch_id=data['branch_id'],
        company_id=data['company_id'],
        manufacturer=data.get('manufacturer'),
        model=data.get('model'),
        api_key=api_key
    )

    db.session.add(equipment)
    db.session.commit()

    result = equipment.to_dict()
    result['api_key'] = api_key  # Return API key only on creation

    return jsonify(result), 201


@equipments_bp.route('/<equipment_id>', methods=['PATCH'])
@jwt_required()
def update_equipment(equipment_id):
    """Update equipment"""
    equipment = Equipment.query.get(equipment_id)
    if not equipment:
        return jsonify({'error': 'Equipment not found'}), 404

    data = request.get_json()

    if 'manufacturer' in data:
        equipment.manufacturer = data['manufacturer']
    if 'model' in data:
        equipment.model = data['model']
    if 'status' in data:
        equipment.status = data['status']

    db.session.commit()

    return jsonify(equipment.to_dict()), 200


@equipments_bp.route('/<equipment_id>', methods=['DELETE'])
@jwt_required()
def delete_equipment(equipment_id):
    """Delete equipment"""
    equipment = Equipment.query.get(equipment_id)
    if not equipment:
        return jsonify({'error': 'Equipment not found'}), 404

    db.session.delete(equipment)
    db.session.commit()

    return jsonify({'message': 'Equipment deleted'}), 200
