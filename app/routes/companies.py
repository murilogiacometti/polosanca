"""
Companies Routes
CRUD operations for companies
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app import db
from app.models import Company, User, UserRole

companies_bp = Blueprint('companies', __name__)


@companies_bp.route('', methods=['GET'])
@jwt_required()
def get_companies():
    """Get all companies with pagination"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    # Only Global Admins can view all companies
    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({'error': 'Forbidden'}), 403

    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)

    companies = Company.query.paginate(
        page=page,
        per_page=limit,
        error_out=False
    )

    return jsonify({
        'companies': [c.to_dict() for c in companies.items],
        'pagination': {
            'page': page,
            'limit': limit,
            'total': companies.total,
            'total_pages': companies.pages
        }
    }), 200


@companies_bp.route('/<company_id>', methods=['GET'])
@jwt_required()
def get_company(company_id):
    """Get a specific company"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    company = Company.query.get(company_id)
    if not company:
        return jsonify({'error': 'Company not found'}), 404

    # Global Admin can view any company, others can only view their own
    if user.role != UserRole.GLOBAL_ADMIN and str(user.company_id) != company_id:
        return jsonify({'error': 'Forbidden'}), 403

    return jsonify(company.to_dict()), 200


@companies_bp.route('', methods=['POST'])
@jwt_required()
def create_company():
    """Create a new company (Global Admin only)"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({'error': 'Forbidden'}), 403

    data = request.get_json()

    if not data or not data.get('name'):
        return jsonify({'error': 'Company name is required'}), 400

    company = Company(
        name=data['name'],
        contact_email=data.get('contact_email'),
        contact_phone=data.get('contact_phone')
    )

    db.session.add(company)
    db.session.commit()

    return jsonify(company.to_dict()), 201


@companies_bp.route('/<company_id>', methods=['PATCH'])
@jwt_required()
def update_company(company_id):
    """Update a company (Global Admin only)"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({'error': 'Forbidden'}), 403

    company = Company.query.get(company_id)
    if not company:
        return jsonify({'error': 'Company not found'}), 404

    data = request.get_json()

    if 'name' in data:
        company.name = data['name']
    if 'contact_email' in data:
        company.contact_email = data['contact_email']
    if 'contact_phone' in data:
        company.contact_phone = data['contact_phone']
    if 'status' in data:
        company.status = data['status']

    db.session.commit()

    return jsonify(company.to_dict()), 200


@companies_bp.route('/<company_id>', methods=['DELETE'])
@jwt_required()
def delete_company(company_id):
    """Delete a company (Global Admin only)"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({'error': 'Forbidden'}), 403

    company = Company.query.get(company_id)
    if not company:
        return jsonify({'error': 'Company not found'}), 404

    db.session.delete(company)
    db.session.commit()

    return jsonify({'message': 'Company deleted'}), 200
