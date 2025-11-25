"""
Branches Routes
CRUD operations for branches
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app import db
from app.models import Branch, User, UserRole

branches_bp = Blueprint('branches', __name__)


@branches_bp.route('', methods=['GET'])
@jwt_required()
def get_branches():
    """Get branches with pagination"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)
    company_id = request.args.get('company_id')

    query = Branch.query

    # Filter by company based on user role
    if user.role == UserRole.GLOBAL_ADMIN:
        if company_id:
            query = query.filter_by(company_id=company_id)
    else:
        query = query.filter_by(company_id=user.company_id)

    branches = query.paginate(page=page, per_page=limit, error_out=False)

    return jsonify({
        'branches': [b.to_dict() for b in branches.items],
        'pagination': {
            'page': page,
            'limit': limit,
            'total': branches.total,
            'total_pages': branches.pages
        }
    }), 200


@branches_bp.route('/<branch_id>', methods=['GET'])
@jwt_required()
def get_branch(branch_id):
    """Get a specific branch"""
    branch = Branch.query.get(branch_id)
    if not branch:
        return jsonify({'error': 'Branch not found'}), 404

    return jsonify(branch.to_dict()), 200


@branches_bp.route('', methods=['POST'])
@jwt_required()
def create_branch():
    """Create a new branch"""
    data = request.get_json()

    if not data or not data.get('name') or not data.get('company_id'):
        return jsonify({'error': 'Name and company_id are required'}), 400

    branch = Branch(
        company_id=data['company_id'],
        name=data['name'],
        address=data.get('address', '')
    )

    db.session.add(branch)
    db.session.commit()

    return jsonify(branch.to_dict()), 201


@branches_bp.route('/<branch_id>', methods=['PATCH'])
@jwt_required()
def update_branch(branch_id):
    """Update a branch"""
    branch = Branch.query.get(branch_id)
    if not branch:
        return jsonify({'error': 'Branch not found'}), 404

    data = request.get_json()

    if 'name' in data:
        branch.name = data['name']
    if 'address' in data:
        branch.address = data['address']

    db.session.commit()

    return jsonify(branch.to_dict()), 200


@branches_bp.route('/<branch_id>', methods=['DELETE'])
@jwt_required()
def delete_branch(branch_id):
    """Delete a branch"""
    branch = Branch.query.get(branch_id)
    if not branch:
        return jsonify({'error': 'Branch not found'}), 404

    db.session.delete(branch)
    db.session.commit()

    return jsonify({'message': 'Branch deleted'}), 200
