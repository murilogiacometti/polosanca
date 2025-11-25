"""
Users Routes
CRUD operations for users
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
import bcrypt

from app import db
from app.models import User, UserRole, UserBranchAccess

users_bp = Blueprint('users', __name__)


@users_bp.route('', methods=['GET'])
@jwt_required()
def get_users():
    """Get users with pagination"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)

    query = User.query

    # Filter by company based on user role
    if user.role != UserRole.GLOBAL_ADMIN:
        query = query.filter_by(company_id=user.company_id)

    users = query.paginate(page=page, per_page=limit, error_out=False)

    return jsonify({
        'users': [u.to_dict() for u in users.items],
        'pagination': {
            'page': page,
            'limit': limit,
            'total': users.total,
            'total_pages': users.pages
        }
    }), 200


@users_bp.route('/<user_id>', methods=['GET'])
@jwt_required()
def get_user(user_id):
    """Get a specific user"""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    return jsonify(user.to_dict()), 200


@users_bp.route('', methods=['POST'])
@jwt_required()
def create_user():
    """Create a new user"""
    data = request.get_json()

    if not data or not data.get('email') or not data.get('name') or not data.get('role'):
        return jsonify({'error': 'Email, name, and role are required'}), 400

    # Hash password
    password = data.get('password', 'changeme')
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    user = User(
        email=data['email'],
        password_hash=password_hash,
        name=data['name'],
        role=data['role'],
        company_id=data.get('company_id'),
        branch_access_type=data.get('branch_access_type', 'full')
    )

    db.session.add(user)
    db.session.flush()

    # Add branch restrictions if specified
    if data.get('branch_access_type') == 'restricted' and data.get('branch_ids'):
        for branch_id in data['branch_ids']:
            access = UserBranchAccess(user_id=user.id, branch_id=branch_id)
            db.session.add(access)

    db.session.commit()

    return jsonify(user.to_dict()), 201


@users_bp.route('/<user_id>', methods=['PATCH'])
@jwt_required()
def update_user(user_id):
    """Update a user"""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json()

    if 'name' in data:
        user.name = data['name']
    if 'email' in data:
        user.email = data['email']
    if 'role' in data:
        user.role = data['role']
    if 'status' in data:
        user.status = data['status']

    db.session.commit()

    return jsonify(user.to_dict()), 200


@users_bp.route('/<user_id>', methods=['DELETE'])
@jwt_required()
def delete_user(user_id):
    """Delete a user"""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    db.session.delete(user)
    db.session.commit()

    return jsonify({'message': 'User deleted'}), 200
