"""
PROLOGUE
File name: auth.py
Description: Route contining server behavior for authentication - login, register, etc.
Programmer: Logan Smith
Creation date: 3/1/26
Revision date: 
Preconditions: A client is running and has requested an endpoint in the /api/auth/ folder
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
"""

# Imports
from flask import Blueprint, request, jsonify
from passlib.context import CryptContext
from db.db_commands import add_account, get_account_by_email, update_account_last_login

# Blueprint for auth routes
auth_bp = Blueprint("auth", __name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Resgister route for creating new accounts
@auth_bp.route("/register", methods=["POST"])
def register():

    # Get the JSON data from the request body
    data = request.get_json()

    # Extract fields from the request body
    account_name = data.get("username")
    email = data.get("email")
    password = data.get("password")

    # Make sure all required fields are present [account_name, email, password]
    if not account_name or not email or not password:
        return jsonify({"error": "Missing required fields"}), 400

    # Password hashing using bcrypt via passlib
    password_bytes = password.encode("utf-8")[:72] # Truncate to 72 bytes -> bcrypt max length
    hashed_password = pwd_context.hash(password_bytes) # Hash the password using bcrypt

    try:       
        # Add the account to the database and get the new account id
        account_id = add_account(account_name, hashed_password, email)
        return jsonify({"account_id": account_id}), 201
    
    except Exception as e:  
        # Log the error and return a generic error message to the client
        return jsonify({"error": str(e)}), 500
    

# Login route for authenticating users
@auth_bp.route("/login", methods=["POST"])
def login():

    # Get the JSON data from the request body
    data = request.get_json()

    # Extract fields from the request body
    email = data.get("email")
    password = data.get("password")

    # Make sure all required fields are present [email, password]
    if not email or not password:
        return jsonify({"error": "Missing email or password"}), 400

    # Fetch the account from the database using the provided email
    account = get_account_by_email(email)

    # If no account is found with the provided email, return an error
    if not account:
        return jsonify({"error": "Invalid credentials"}), 401

    # Unpack the account information (account_id, account_name, hashed_password, email_db)
    account_id, account_name, hashed_password, email_db = account

    # Compare password hashes using passlib's verify function, which handles bcrypt hashing
    if not pwd_context.verify(password, hashed_password):
        return jsonify({"error": "Invalid credentials"}), 401
    
    # Only runs if password is correct, update last login time in the database
    update_account_last_login(account_id)

    return jsonify({
        "message": "Login successful",
        "account_id": account_id,
        "username": account_name
    }), 200