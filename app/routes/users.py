"""
Users Routes
CRUD operations for users
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
import bcrypt
import secrets
import re

from app import db
from app.models import User, UserRole, UserStatus, UserBranchAccess, BranchAccessType

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

    # Return user with branch access info
    user_dict = user.to_dict()
    if user.branch_access_type == BranchAccessType.RESTRICTED:
        branch_accesses = UserBranchAccess.query.filter_by(user_id=user.id).all()
        user_dict['branch_access'] = {
            'type': user.branch_access_type.value,
            'branches': [str(ba.branch_id) for ba in branch_accesses]
        }
    else:
        user_dict['branch_access'] = {
            'type': user.branch_access_type.value
        }

    return jsonify(user_dict), 200


@users_bp.route('/invite', methods=['POST'])
@jwt_required()
def invite_user():
    """
    Invite a new user to the system

    Authorization:
    - Global admins can invite anyone to any company
    - Company admins can only invite to their own company
    - Company admins cannot create global admins
    - Viewers cannot invite users
    """
    # Get requesting user
    requesting_user_id = get_jwt_identity()
    requesting_user = User.query.get(requesting_user_id)

    if not requesting_user:
        return jsonify({'error': 'User not found'}), 404

    # Check if user has permission to invite
    if requesting_user.role == UserRole.COMPANY_VIEWER:
        return jsonify({'error': 'You do not have permission to invite users'}), 403

    # Get request data
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Request body is required'}), 400

    # Validate required fields
    if not data.get('email'):
        return jsonify({'error': 'Email is required'}), 400

    if not data.get('name'):
        return jsonify({'error': 'Name is required'}), 400

    if not data.get('role'):
        return jsonify({'error': 'Role is required'}), 400

    # Validate email format
    email = data['email'].strip().lower()
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_pattern, email):
        return jsonify({'error': 'Invalid email format'}), 400

    # Check for duplicate email
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({'error': 'A user with this email already exists'}), 400

    # Validate role
    try:
        invited_role = UserRole(data['role'])
    except ValueError:
        return jsonify({'error': 'Invalid role'}), 400

    # Authorization checks based on requesting user role
    if requesting_user.role == UserRole.COMPANY_ADMIN:
        # Company admins cannot invite global admins
        if invited_role == UserRole.GLOBAL_ADMIN:
            return jsonify({'error': 'You cannot invite global administrators'}), 403

        # Company admins can only invite to their own company
        company_id = data.get('company_id', requesting_user.company_id)
        if company_id != requesting_user.company_id:
            return jsonify({'error': 'You can only invite users to your own company'}), 403
    else:
        # Global admins must specify company_id for non-global-admin roles
        if invited_role != UserRole.GLOBAL_ADMIN and not data.get('company_id'):
            return jsonify({'error': 'company_id is required for non-global-admin roles'}), 400

        company_id = data.get('company_id')

    # Generate invitation token
    invitation_token = secrets.token_urlsafe(32)
    invitation_expires_at = datetime.utcnow() + timedelta(days=7)  # Token valid for 7 days

    # Generate temporary password (user will set their own via invitation)
    temp_password = secrets.token_urlsafe(16)
    password_hash = bcrypt.hashpw(temp_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    # Create user with PENDING status
    new_user = User(
        email=email,
        password_hash=password_hash,
        name=data['name'],
        role=invited_role,
        company_id=company_id,
        status=UserStatus.PENDING,
        invitation_token=invitation_token,
        invitation_expires_at=invitation_expires_at
    )

    # Handle branch access restrictions
    branch_access = data.get('branch_access', {})
    if branch_access:
        access_type = branch_access.get('type', 'full')
        try:
            new_user.branch_access_type = BranchAccessType(access_type)
        except ValueError:
            return jsonify({'error': 'Invalid branch access type'}), 400

        # Validate branch restrictions
        if access_type == 'restricted':
            branch_ids = branch_access.get('branches', [])
            if not branch_ids or len(branch_ids) == 0:
                return jsonify({'error': 'At least one branch must be assigned for restricted access'}), 400

    db.session.add(new_user)
    db.session.flush()

    # Add branch access restrictions if specified
    if branch_access and branch_access.get('type') == 'restricted':
        branch_ids = branch_access.get('branches', [])
        for branch_id in branch_ids:
            access = UserBranchAccess(user_id=new_user.id, branch_id=branch_id)
            db.session.add(access)

    db.session.commit()

    # In production, send invitation email here
    # send_invitation_email(new_user.email, invitation_token)

    return jsonify({
        'success': True,
        'user_id': str(new_user.id),
        'invitation_sent': True,
        'message': 'User invitation sent successfully'
    }), 201


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

    # Handle branch access updates
    if 'branch_access' in data:
        branch_access = data['branch_access']
        access_type = branch_access.get('type')

        if access_type:
            try:
                user.branch_access_type = BranchAccessType(access_type)
            except ValueError:
                return jsonify({'error': 'Invalid branch access type'}), 400

            # Update branch restrictions
            if access_type == 'restricted':
                branch_ids = branch_access.get('branches', [])
                if not branch_ids:
                    return jsonify({'error': 'At least one branch must be assigned for restricted access'}), 400

                # Remove existing branch accesses
                UserBranchAccess.query.filter_by(user_id=user.id).delete()

                # Add new branch accesses
                for branch_id in branch_ids:
                    access = UserBranchAccess(user_id=user.id, branch_id=branch_id)
                    db.session.add(access)
            elif access_type == 'full':
                # Remove all branch restrictions for full access
                UserBranchAccess.query.filter_by(user_id=user.id).delete()

    db.session.commit()

    # Return updated user with branch access info
    user_dict = user.to_dict()
    if user.branch_access_type == BranchAccessType.RESTRICTED:
        branch_accesses = UserBranchAccess.query.filter_by(user_id=user.id).all()
        user_dict['branch_access'] = {
            'type': user.branch_access_type.value,
            'branches': [str(ba.branch_id) for ba in branch_accesses]
        }
    else:
        user_dict['branch_access'] = {
            'type': user.branch_access_type.value
        }

    return jsonify(user_dict), 200


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
