"""
PROLOGUE
File name: main.py
Description: Entry point for the Flask backend server; initializes the Flask app, configures middleware (CORS), and registers route blueprints (authentication endpoints).
Programmer: Logan Smith
Creation date: 3/1/26
Revision date: 
Preconditions: Python environment is configured with required dependencies; .env contains valid DB credentials; auth blueprint exists in server/db/auth/auth.py.
Postconditions: Flask server is started and listening on the configured host/port; API endpoints (e.g., /auth/*) are available to client requests.
Errors: Server may fail to start if dependencies are missing, port is in use, or route modules raise import/runtime errors.
Side effects: Network port is opened for incoming HTTP requests; server logs are written to stdout; CORS headers may be applied to responses.
Invariants: None
Known faults: None
"""

# Imports
from flask import Flask
from db.auth.auth import auth_bp
from routes import routes_bp
from flask_cors import CORS

# Initialize Flask app and configure CORS
app = Flask(__name__)
CORS(app)

# Register blueprints for route handling
app.register_blueprint(auth_bp, url_prefix="/auth")
app.register_blueprint(routes_bp, url_prefix="/api")

# Main entry point to start the Flask server
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)