"""
PROLOGUE
File name: household.py
Description: Route containing server behavior for household creation, joining by code, and listing a user's households.
Programmers: Logan Smith
Creation date: 3/19/26
Revision date: N/A
Preconditions: A client is running and has requested an endpoint in the /household/ folder
Postconditions: A response is returned to the client
Errors: None
Side effects: None
Invariants: None
Known faults: None
"""

# Imports
from flask import Blueprint, request, jsonify
from db.auth.auth_utils import get_current_account_id, decode_bearer_token
from db.db_commands import (create_household, add_account_to_household, get_households_for_account, get_household_by_join_code, is_account_in_household)


# Blueprint for household routes
household_bp = Blueprint("household", __name__)


@household_bp.route("/create", methods=["POST"])
def create_household_route():
    # Require a valid JWT and extract the current account id
    account_id, error = get_current_account_id()
    if error:
        return error

    # Read the request body
    data = request.get_json() or {}

    # Extract the household name from the request
    household_name = data.get("name", "").strip()
    household_join_code = data.get("join_code","").strip()

    # Make sure a household name was provided
    if not household_name:
        return jsonify({"error": "Missing household name"}), 400

    try:
        # Create the household and receive its generated id and join code
        household = create_household(household_name, household_join_code, account_id)

        # The creator is automatically inserted into the membership table as an admin
        add_account_to_household(account_id, household["household_id"], "admin")

        # Include the admin's username so the client always shows it by name
        payload, _ = decode_bearer_token()
        if payload:
            household["admin_name"] = payload.get("username")

        return jsonify({
            "message": "Household created successfully",
            "household": household
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@household_bp.route("/join", methods=["POST"])
def join_household_route():
    # Require a valid JWT and extract the current account id
    account_id, error = get_current_account_id()
    if error:
        return error

    # Read the request body
    data = request.get_json() or {}

    # Extract and normalize the join code
    join_code = data.get("join_code", "").strip().upper()

    # Make sure a join code was provided
    if not join_code:
        return jsonify({"error": "Missing join code"}), 400

    try:
        # Look up the target household using the shareable join code
        household = get_household_by_join_code(join_code)

        # Reject invalid codes
        if not household:
            return jsonify({"error": "Invalid join code"}), 404

        household_id = household["household_id"]

        # Do not insert a duplicate membership row if the user is already in the household
        if is_account_in_household(account_id, household_id):
            return jsonify({
                "message": "Account already belongs to this household",
                "household": household
            }), 200

        # Add the current account as a normal member
        add_account_to_household(account_id, household_id, "member")

        return jsonify({
            "message": "Joined household successfully",
            "household": household
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@household_bp.route("/mine", methods=["GET"])
def get_my_households_route():
    # Require a valid JWT and extract the current account id
    account_id, error = get_current_account_id()
    if error:
        return error

    try:
        # Fetch all households this account belongs to
        households = get_households_for_account(account_id)

        return jsonify({
            "households": households
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
