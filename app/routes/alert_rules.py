"""
Alert Rules Routes
CRUD operations for alert rules (Global Admin only)
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app import db
from app.models import AlertRule, User, UserRole

alert_rules_bp = Blueprint('alert_rules', __name__)


@alert_rules_bp.route('', methods=['GET'])
@jwt_required()
def get_alert_rules():
    """Get all alert rules with pagination"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({'error': 'Forbidden'}), 403

    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)

    alert_rules = AlertRule.query.paginate(page=page, per_page=limit, error_out=False)

    return jsonify({
        'alert_rules': [ar.to_dict() for ar in alert_rules.items],
        'pagination': {
            'page': page,
            'limit': limit,
            'total': alert_rules.total,
            'total_pages': alert_rules.pages
        }
    }), 200


@alert_rules_bp.route('/<rule_id>', methods=['GET'])
@jwt_required()
def get_alert_rule(rule_id):
    """Get a specific alert rule"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({'error': 'Forbidden'}), 403

    alert_rule = AlertRule.query.get(rule_id)
    if not alert_rule:
        return jsonify({'error': 'Alert rule not found'}), 404

    return jsonify(alert_rule.to_dict()), 200


@alert_rules_bp.route('', methods=['POST'])
@jwt_required()
def create_alert_rule():
    """Create a new alert rule"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({'error': 'Forbidden'}), 403

    data = request.get_json()

    if not data or not data.get('name') or not data.get('rule_type'):
        return jsonify({'error': 'Name and rule_type are required'}), 400

    alert_rule = AlertRule(
        name=data['name'],
        description=data.get('description'),
        rule_type=data['rule_type'],
        threshold_value=data.get('threshold_value'),
        comparison_operator=data['comparison_operator'],
        duration_seconds=data.get('duration_seconds', 300),
        severity=data['severity'],
        message_template=data['message_template'],
        scope=data['scope'],
        scope_id=data.get('scope_id'),
        created_by=user_id
    )

    db.session.add(alert_rule)
    db.session.commit()

    return jsonify(alert_rule.to_dict()), 201


@alert_rules_bp.route('/<rule_id>', methods=['PATCH'])
@jwt_required()
def update_alert_rule(rule_id):
    """Update an alert rule"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({'error': 'Forbidden'}), 403

    alert_rule = AlertRule.query.get(rule_id)
    if not alert_rule:
        return jsonify({'error': 'Alert rule not found'}), 404

    data = request.get_json()

    if 'name' in data:
        alert_rule.name = data['name']
    if 'description' in data:
        alert_rule.description = data['description']
    if 'threshold_value' in data:
        alert_rule.threshold_value = data['threshold_value']
    if 'is_active' in data:
        alert_rule.is_active = data['is_active']

    db.session.commit()

    return jsonify(alert_rule.to_dict()), 200


@alert_rules_bp.route('/<rule_id>', methods=['DELETE'])
@jwt_required()
def delete_alert_rule(rule_id):
    """Delete an alert rule"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    if user.role != UserRole.GLOBAL_ADMIN:
        return jsonify({'error': 'Forbidden'}), 403

    alert_rule = AlertRule.query.get(rule_id)
    if not alert_rule:
        return jsonify({'error': 'Alert rule not found'}), 404

    db.session.delete(alert_rule)
    db.session.commit()

    return jsonify({'message': 'Alert rule deleted'}), 200
