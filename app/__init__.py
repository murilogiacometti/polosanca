"""
Flask Application Factory
Creates and configures the Flask application instance
"""
from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_socketio import SocketIO
from config import get_config

# Initialize extensions (but don't bind to app yet)
db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
socketio = SocketIO()


def create_app(config_name=None):
    """
    Application factory function

    Args:
        config_name: Configuration to use (development, testing, production)
                     If None, uses FLASK_ENV environment variable

    Returns:
        Configured Flask application instance
    """
    app = Flask(__name__)

    # Load configuration
    if config_name:
        from config import config
        app.config.from_object(config[config_name])
    else:
        app.config.from_object(get_config())

    # Initialize extensions with app
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)

    # Initialize CORS
    CORS(app, origins=app.config['CORS_ORIGINS'])

    # Initialize SocketIO
    socketio.init_app(
        app,
        message_queue=app.config['SOCKETIO_MESSAGE_QUEUE'],
        async_mode=app.config['SOCKETIO_ASYNC_MODE'],
        cors_allowed_origins=app.config['CORS_ORIGINS']
    )

    # Register error handlers
    register_error_handlers(app)

    # Register blueprints
    register_blueprints(app)

    # JWT callbacks
    configure_jwt(app)

    # Health check endpoint
    @app.route('/health')
    def health_check():
        return jsonify({
            'status': 'healthy',
            'environment': app.config.get('ENV', 'unknown')
        })

    return app


def register_blueprints(app):
    """Register all Flask blueprints"""
    from app.routes.auth import auth_bp
    from app.routes.companies import companies_bp
    from app.routes.branches import branches_bp
    from app.routes.users import users_bp
    from app.routes.equipments import equipments_bp
    from app.routes.telemetry import telemetry_bp
    from app.routes.alerts import alerts_bp
    from app.routes.alert_rules import alert_rules_bp
    from app.routes.maintenance import maintenance_bp

    # Register with /v1/ prefix
    app.register_blueprint(auth_bp, url_prefix='/v1/auth')
    app.register_blueprint(companies_bp, url_prefix='/v1/companies')
    app.register_blueprint(branches_bp, url_prefix='/v1/branches')
    app.register_blueprint(users_bp, url_prefix='/v1/users')
    app.register_blueprint(equipments_bp, url_prefix='/v1/equipments')
    app.register_blueprint(telemetry_bp, url_prefix='/v1')
    app.register_blueprint(alerts_bp, url_prefix='/v1/alerts')
    app.register_blueprint(alert_rules_bp, url_prefix='/v1/alert-rules')
    app.register_blueprint(maintenance_bp, url_prefix='/v1')


def register_error_handlers(app):
    """Register global error handlers"""

    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({
            'error': 'Bad Request',
            'message': str(error)
        }), 400

    @app.errorhandler(401)
    def unauthorized(error):
        return jsonify({
            'error': 'Unauthorized',
            'message': 'Authentication required'
        }), 401

    @app.errorhandler(403)
    def forbidden(error):
        return jsonify({
            'error': 'Forbidden',
            'message': 'You do not have permission to access this resource'
        }), 403

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({
            'error': 'Not Found',
            'message': 'The requested resource was not found'
        }), 404

    @app.errorhandler(500)
    def internal_error(error):
        app.logger.error(f'Internal server error: {error}')
        return jsonify({
            'error': 'Internal Server Error',
            'message': 'An unexpected error occurred'
        }), 500


def configure_jwt(app):
    """Configure JWT callbacks"""

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({
            'error': 'Token Expired',
            'message': 'The token has expired'
        }), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        return jsonify({
            'error': 'Invalid Token',
            'message': 'Token verification failed'
        }), 401

    @jwt.unauthorized_loader
    def missing_token_callback(error):
        return jsonify({
            'error': 'Authorization Required',
            'message': 'Request does not contain a valid token'
        }), 401
