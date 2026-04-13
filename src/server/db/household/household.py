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
from db.db_commands import (create_household, add_account_to_household, get_households_for_account, get_household_by_join_code, is_account_in_household, get_account_role_in_household, remove_account_from_household, get_members_for_household, transfer_admin_in_household, update_household, regenerate_join_code, delete_household)


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

    # Make sure a household name was provided
    if not household_name:
        return jsonify({"error": "Missing household name"}), 400

    try:
        # Create the household and receive its generated id and join code
        household = create_household(household_name, account_id)

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


@household_bp.route("/leave", methods=["POST"])
def leave_household_route():
    # Require a valid JWT and extract the current account id
    account_id, error = get_current_account_id()
    if error:
        return error

    data = request.get_json() or {}
    household_id = data.get("household_id")

    if not household_id:
        return jsonify({"error": "Missing household_id"}), 400

    try:
        # Verify the caller is actually a member of this household
        if not is_account_in_household(account_id, household_id):
            return jsonify({"error": "You are not a member of this household"}), 403

        # Admins must transfer ownership before they can leave
        role = get_account_role_in_household(account_id, household_id)
        if role == "admin":
            return jsonify({"error": "Admins must transfer ownership before leaving"}), 403

        remove_account_from_household(account_id, household_id)
        return jsonify({"message": "Left household successfully"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@household_bp.route("/<int:household_id>/remove_member", methods=["POST"])
def remove_member_route(household_id):
    account_id, error = get_current_account_id()
    if error:
        return error

    # Only admins can remove other members
    role = get_account_role_in_household(account_id, household_id)
    if role != "admin":
        return jsonify({"error": "Only admins can remove members"}), 403

    data = request.get_json() or {}
    target_account_id = data.get("account_id")
    if not target_account_id:
        return jsonify({"error": "Missing account_id"}), 400
    if target_account_id == account_id:
        return jsonify({"error": "Use the leave endpoint to remove yourself"}), 400

    try:
        if not is_account_in_household(target_account_id, household_id):
            return jsonify({"error": "Account is not in this household"}), 404
        remove_account_from_household(target_account_id, household_id)
        return jsonify({"message": "Member removed successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@household_bp.route("/<int:household_id>/transfer_admin", methods=["POST"])
def transfer_admin_route(household_id):
    account_id, error = get_current_account_id()
    if error:
        return error

    # Only the current admin can transfer the role
    role = get_account_role_in_household(account_id, household_id)
    if role != "admin":
        return jsonify({"error": "Only the current admin can transfer admin status"}), 403

    data = request.get_json() or {}
    target_account_id = data.get("account_id")
    if not target_account_id:
        return jsonify({"error": "Missing account_id"}), 400
    if target_account_id == account_id:
        return jsonify({"error": "You are already the admin"}), 400

    try:
        if not is_account_in_household(target_account_id, household_id):
            return jsonify({"error": "Account is not in this household"}), 404
        transfer_admin_in_household(target_account_id, household_id)
        return jsonify({"message": "Admin transferred successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@household_bp.route("/<int:household_id>/members", methods=["GET"])
def get_household_members_route(household_id):
    # Require a valid JWT and extract the current account id
    account_id, error = get_current_account_id()
    if error:
        return error

    # Only members of the household can see its member list
    if not is_account_in_household(account_id, household_id):
        return jsonify({"error": "Access denied"}), 403

    try:
        members = get_members_for_household(household_id)
        return jsonify({"members": members}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@household_bp.route("/<int:household_id>/update_name", methods=["PATCH"])
def update_household_name_route(household_id):
    account_id, error = get_current_account_id()
    if error:
        return error

    role = get_account_role_in_household(account_id, household_id)
    if role != "admin":
        return jsonify({"error": "Only admins can update the household name"}), 403

    data = request.get_json() or {}
    new_name = data.get("name", "").strip()
    if not new_name:
        return jsonify({"error": "Missing household name"}), 400

    try:
        household = update_household(household_id, new_name)
        return jsonify({"message": "Household name updated", "household": household}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@household_bp.route("/<int:household_id>/regenerate_code", methods=["POST"])
def regenerate_code_route(household_id):
    account_id, error = get_current_account_id()
    if error:
        return error

    role = get_account_role_in_household(account_id, household_id)
    if role != "admin":
        return jsonify({"error": "Only admins can regenerate the join code"}), 403

    try:
        household = regenerate_join_code(household_id)
        return jsonify({"message": "Join code regenerated", "household": household}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@household_bp.route("/<int:household_id>", methods=["DELETE"])
def delete_household_route(household_id):
    account_id, error = get_current_account_id()
    if error:
        return error

    role = get_account_role_in_household(account_id, household_id)
    if role != "admin":
        return jsonify({"error": "Only admins can delete a household"}), 403

    try:
        delete_household(household_id)
        return jsonify({"message": "Household deleted"}), 200
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