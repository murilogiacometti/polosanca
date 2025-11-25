"""
Telemetry Routes
Equipment telemetry submission and retrieval
"""
from flask import Blueprint, request, jsonify
from datetime import datetime

from app import db
from app.models import Telemetry, Equipment

telemetry_bp = Blueprint('telemetry', __name__)


@telemetry_bp.route('/equipments/telemetry', methods=['POST'])
def submit_telemetry():
    """Equipment submits telemetry data (API key auth)"""
    data = request.get_json()
    api_key = request.headers.get('X-API-Key')

    if not api_key or not data or not data.get('serial'):
        return jsonify({'error': 'Invalid request'}), 400

    # Validate equipment and API key
    equipment = Equipment.query.filter_by(serial=data['serial'], api_key=api_key).first()

    if not equipment:
        return jsonify({'error': 'Invalid serial or API key'}), 401

    # Create telemetry record
    telemetry = Telemetry(
        time=datetime.utcnow(),
        equipment_id=equipment.id,
        temperature=data.get('temperature'),
        pressure=data.get('pressure'),
        door=data.get('door'),
        heater=data.get('heater'),
        compressor=data.get('compressor'),
        fan=data.get('fan')
    )

    # Update equipment last seen
    equipment.last_seen_at = datetime.utcnow()

    db.session.add(telemetry)
    db.session.commit()

    return jsonify({
        'success': True,
        'timestamp': telemetry.time.isoformat()
    }), 201


@telemetry_bp.route('/equipments/<equipment_id>/telemetry', methods=['GET'])
def get_telemetry(equipment_id):
    """Get telemetry data for an equipment"""
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 100, type=int)
    limit = min(limit, 1000)  # Max 1000

    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    query = Telemetry.query.filter_by(equipment_id=equipment_id)

    if start_date:
        query = query.filter(Telemetry.time >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(Telemetry.time <= datetime.fromisoformat(end_date))

    query = query.order_by(Telemetry.time.desc())

    telemetry = query.paginate(page=page, per_page=limit, error_out=False)

    return jsonify({
        'equipment_id': equipment_id,
        'data': [t.to_dict() for t in telemetry.items],
        'pagination': {
            'page': page,
            'limit': limit,
            'total': telemetry.total,
            'total_pages': telemetry.pages
        }
    }), 200
