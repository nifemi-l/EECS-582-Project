"""
PROLOGUE
File name: routes.py
Description: Flask blueprint for task, household, and account CRUD operations.
Programmers: Delroy Wright, some code from Nifemi Lawal
Creation date: 3/11/26
Revision date: 3/29/26
    - Added error handling and validation for all routes.
Preconditions: db_commands.py contains necessary CRUD functions.
Postconditions: Flask routes are available for managing tasks, households, and users.
"""

from flask import Blueprint, request, jsonify
from db.db_commands import (
    add_task, update_task, delete_task, get_task_by_id,
    add_household, update_household, delete_household, get_household_by_id,
    add_account, update_account, delete_account, get_account_by_id,
    add_feature, update_feature, delete_feature, get_feature_by_id,
    get_features_with_tasks, update_task_last_comp_time
)
from db.auth.auth_utils import get_current_account_id

routes_bp = Blueprint("routes", __name__)

# --- Feature Routes ---
# feature_type, positions, and icon are optional since the list view doesn't always send them
@routes_bp.route("/feature", methods=["POST"])
def create_feature():
    _, error = get_current_account_id()
    if error:
        return error
    data = request.get_json()
    try:
        feature_id = add_feature(
            data["household_id"],
            data["feature_name"],
            data.get("feature_type", ""),
            data.get("x_pos", 0),
            data.get("y_pos", 0),
            data.get("z_pos", 0),
            data.get("icon", "home-outline")
        )
        return jsonify({"feature_id": feature_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# Using keyword args so we only update the fields the client actually sent
# e.g. a rename only sends feature_name, a 3D move only sends x/y/z
@routes_bp.route("/feature/<int:feature_id>", methods=["PUT"])
def edit_feature(feature_id):
    _, error = get_current_account_id()
    if error:
        return error
    data = request.get_json()
    try:
        update_feature(
            feature_id,
            feature_name=data.get("feature_name"),
            feature_type=data.get("feature_type"),
            x_pos=data.get("x_pos"),
            y_pos=data.get("y_pos"),
            z_pos=data.get("z_pos"),
            icon=data.get("icon")
        )
        return jsonify({"message": "Feature updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@routes_bp.route("/feature/<int:feature_id>", methods=["DELETE"])
def remove_feature(feature_id):
    _, error = get_current_account_id()
    if error:
        return error
    try:
        delete_feature(feature_id)
        return jsonify({"message": "Feature deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# Fetch all features (with their tasks nested inside) for a given household
# This is the main endpoint the list view hits when it loads
# Example response: [{ "feature_id": 1, "household_id": 1, "feature_name": "Kitchen", "feature_type": "room", "x_pos": 0, "y_pos": 0, "z_pos": 0, "icon": "home-outline", "tasks": [{ "task_id": 1, "feature_id": 1, "task_name": "Clean the kitchen", "frequency_days": 7, "last_completed": null, "visibility": "household", "created_by_account_id": 1, "icon": "clipboard-text-outline" }, ...] }, ...]
@routes_bp.route("/household/<int:household_id>/features", methods=["GET"])
def get_household_features_route(household_id):
    _, error = get_current_account_id()
    if error:
        return error
    try:
        features = get_features_with_tasks(household_id)
        return jsonify(features), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# --- Task Routes ---
# icon defaults to clipboard if not sent --> list view always sends one though
@routes_bp.route("/task", methods=["POST"])
def create_task():
    _, error = get_current_account_id()
    if error:
        return error
    data = request.get_json()
    try:
        task_id = add_task(
            data["feature_id"],
            data["task_name"],
            data["frequency_days"],
            data.get("last_completed"),
            data["visibility"],
            data.get("created_by_account_id"),
            data.get("icon", "clipboard-text-outline")
        )
        return jsonify({"task_id": task_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@routes_bp.route("/task/<int:task_id>", methods=["PUT"])
def edit_task(task_id):
    _, error = get_current_account_id()
    if error:
        return error
    data = request.get_json()
    try:
        update_task(
            task_id,
            data["task_name"],
            data["frequency_days"],
            data["visibility"]
        )
        return jsonify({"message": "Task updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@routes_bp.route("/task/<int:task_id>", methods=["DELETE"])
def remove_task(task_id):
    _, error = get_current_account_id()
    if error:
        return error
    try:
        delete_task(task_id)
        return jsonify({"message": "Task deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# Mark a task as done --> sets last_completed to right now
# The list view calls this when you tap the green check button on a task
@routes_bp.route("/task/<int:task_id>/complete", methods=["POST"])
def complete_task(task_id):
    _, error = get_current_account_id()
    if error:
        return error
    try:
        update_task_last_comp_time(task_id)
        return jsonify({"message": "Task marked complete"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# --- Household Routes ---
@routes_bp.route("/household", methods=["POST"])
def create_household():
    _, error = get_current_account_id()
    if error:
        return error
    data = request.get_json()
    try:
        household_id = add_household(data["household_name"])
        return jsonify({"household_id": household_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@routes_bp.route("/household/<int:household_id>", methods=["PUT"])
def edit_household(household_id):
    _, error = get_current_account_id()
    if error:
        return error
    data = request.get_json()
    try:
        update_household(household_id, data["household_name"])
        return jsonify({"message": "Household updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@routes_bp.route("/household/<int:household_id>", methods=["DELETE"])
def remove_household(household_id):
    _, error = get_current_account_id()
    if error:
        return error
    try:
        delete_household(household_id)
        return jsonify({"message": "Household deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# --- User/Account Routes ---
@routes_bp.route("/user/<int:account_id>", methods=["PUT"])
def edit_user(account_id):
    _, error = get_current_account_id()
    if error:
        return error
    data = request.get_json()
    try:
        update_account(account_id, data["account_name"], data["email"])
        return jsonify({"message": "User updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@routes_bp.route("/user/<int:account_id>", methods=["DELETE"])
def remove_user(account_id):
    _, error = get_current_account_id()
    if error:
        return error
    try:
        delete_account(account_id)
        return jsonify({"message": "User deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400