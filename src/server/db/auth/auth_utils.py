"""
PROLOGUE
File name: auth_utils.py
Description: Shared helper functions for validating JWT bearer tokens and retrieving the current account id.
Programmers: Logan Smith
Creation date: 3/19/26
Revision date: N/A
Preconditions: Request includes Authorization header in the format "Bearer <token>"
Postconditions: Returns decoded token payload or an error response
Errors: None
Side effects: None
Invariants: None
Known faults: None
"""

# Imports
from flask import request, jsonify
import jwt
import os

# JWT configuration must match auth.py
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"


def get_token_from_header():
    # Read the Authorization header from the incoming request
    auth_header = request.headers.get("Authorization", "")

    # Make sure the header is in the expected Bearer token format
    if not auth_header.startswith("Bearer "):
        return None

    # Extract the raw token string after "Bearer "
    return auth_header.split(" ", 1)[1].strip()


def decode_bearer_token():
    # Pull the JWT token from the Authorization header
    token = get_token_from_header()

    # Return a 401-style error payload if the token is missing
    if not token:
        return None, (jsonify({"error": "Missing bearer token"}), 401)

    try:
        # Decode and validate the JWT token
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return payload, None

    except jwt.ExpiredSignatureError:
        # Token is well-formed but expired
        return None, (jsonify({"error": "Token has expired"}), 401)

    except jwt.InvalidTokenError:
        # Token is malformed or signed incorrectly
        return None, (jsonify({"error": "Invalid token"}), 401)


def get_current_account_id():
    # Decode the JWT and extract the current authenticated account id
    payload, error = decode_bearer_token()

    # Stop early if token validation failed
    if error:
        return None, error

    # Pull account_id from the decoded payload
    account_id = payload.get("account_id")

    # Make sure the token actually contains an account id
    if not account_id:
        return None, (jsonify({"error": "Token missing account id"}), 401)

    return account_id, None