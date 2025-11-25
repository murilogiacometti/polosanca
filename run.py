"""
Application Entry Point
Run the Flask application
"""

import os

from app import create_app

# Create application instance
app = create_app()

if __name__ == "__main__":
    # Get configuration
    debug = app.config.get("DEBUG", False)
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", 5000))

    app.run(host=host, port=port, debug=debug)
