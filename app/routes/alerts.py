"""
Alerts Routes
Alert management and acknowledgment
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime

from app import db
from app.models import Alert, Equipment, User

alerts_bp = Blueprint('alerts', __name__)


@alerts_bp.route('', methods=['GET'])
@jwt_required()
def get_alerts():
    """Get alerts with filtering and pagination"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)
    branch_id = request.args.get('branch_id')
    status = request.args.get('status')
    severity = request.args.get('severity')

    query = Alert.query.join(Equipment)

    # Filter by company
    if user.role.value != 'global_admin':
        query = query.filter(Equipment.company_id == user.company_id)

    if branch_id:
        query = query.filter(Equipment.branch_id == branch_id)
    if status:
        query = query.filter(Alert.status == status)
    if severity:
        query = query.filter(Alert.severity == severity)

    query = query.order_by(Alert.created_at.desc())

    alerts = query.paginate(page=page, per_page=limit, error_out=False)

    return jsonify({
        'alerts': [a.to_dict() for a in alerts.items],
        'pagination': {
            'page': page,
            'limit': limit,
            'total': alerts.total,
            'total_pages': alerts.pages
        }
    }), 200


@alerts_bp.route('/<alert_id>', methods=['GET'])
@jwt_required()
def get_alert(alert_id):
    """Get a specific alert"""
    alert = Alert.query.get(alert_id)
    if not alert:
        return jsonify({'error': 'Alert not found'}), 404

    return jsonify(alert.to_dict()), 200


@alerts_bp.route('/<alert_id>/acknowledge', methods=['PATCH'])
@jwt_required()
def acknowledge_alert(alert_id):
    """Acknowledge an alert"""
    user_id = get_jwt_identity()
    data = request.get_json()

    alert = Alert.query.get(alert_id)
    if not alert:
        return jsonify({'error': 'Alert not found'}), 404

    alert.status = 'acknowledged'
    alert.acknowledged_at = datetime.utcnow()
    alert.acknowledged_by = user_id
    alert.acknowledgment_notes = data.get('notes')

    db.session.commit()

    return jsonify(alert.to_dict()), 200


@alerts_bp.route('/<alert_id>/resolve', methods=['PATCH'])
@jwt_required()
def resolve_alert(alert_id):
    """Resolve an alert"""
    alert = Alert.query.get(alert_id)
    if not alert:
        return jsonify({'error': 'Alert not found'}), 404

    alert.status = 'resolved'
    alert.resolved_at = datetime.utcnow()

    db.session.commit()

    return jsonify(alert.to_dict()), 200
