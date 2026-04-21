"""
PROLOGUE
File name: routes.py
Description: Flask blueprint for task, household, and account CRUD operations.
Programmers: Delroy Wright, some code from Nifemi Lawal, some from Jack Bauer
Creation date: 3/11/26
Revision date: 3/29/26
    - Added error handling and validation for all routes.
    - 4/16/26: Add 3D scale, rotation support
    - 4/20/26: Add route to clear feature position data
Preconditions: db_commands.py contains necessary CRUD functions.
Postconditions: Flask routes are available for managing tasks, households, and users.
"""

from flask import Blueprint, request, jsonify
from db.db_commands import (
    add_task, get_latest_env_data, update_task, delete_task, get_task_by_id,
    add_household, update_household, delete_household, get_household_by_id,
    add_account, update_account, delete_account, get_account_by_id,
    add_feature, update_feature, delete_feature, get_feature_by_id,
    get_features_with_tasks, update_task_last_comp_time,
    is_account_in_household, get_household_id_for_task,
    add_room, get_rooms_for_household, get_room_by_id, update_room, delete_room,
    set_null_feature_position,
)
from db.auth.auth_utils import get_current_account_id

routes_bp = Blueprint("routes", __name__)

# --- Feature Routes ---
# feature_type, positions, and icon are optional since the list view doesn't always send them
@routes_bp.route("/feature", methods=["POST"])
def create_feature():
    account_id, error = get_current_account_id()
    if error:
        return error
    data = request.get_json()
    household_id = data.get("household_id")
    if not is_account_in_household(account_id, household_id):
        return jsonify({"error": "Access denied"}), 403
    try:
        room_id = data.get("room_id")
        if room_id is not None:
            rm = get_room_by_id(room_id)
            if not rm or rm[1] != household_id:
                return jsonify({"error": "Invalid room_id"}), 400
        feature_id = add_feature(
            household_id,
            data["feature_name"],
            data.get("feature_type", ""),
            data.get("x_pos", None),
            data.get("y_pos", None),
            data.get("z_pos", None),
            data.get("icon", "home-outline"),
            room_id,
        )
        return jsonify({"feature_id": feature_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# Using keyword args so we only update the fields the client actually sent
# e.g. a rename only sends feature_name, a 3D move only sends x/y/z
@routes_bp.route("/feature/<int:feature_id>", methods=["PUT"])
def edit_feature(feature_id):
    account_id, error = get_current_account_id()
    if error:
        return error
    feature = get_feature_by_id(feature_id)
    if not feature or not is_account_in_household(account_id, feature[1]):
        return jsonify({"error": "Access denied"}), 403
    data = request.get_json() or {}
    try:
        uf_kwargs = dict(
            feature_name=data.get("feature_name"),
            feature_type=data.get("feature_type"),
            x_pos=data.get("x_pos"),
            y_pos=data.get("y_pos"),
            z_pos=data.get("z_pos"),
            icon=data.get("icon"),
            scale=data.get("scale"),
            rotation_y=data.get("rotation_y"),
        )
        if "room_id" in data:
            rid = data.get("room_id")
            if rid is not None:
                rm = get_room_by_id(rid)
                if not rm or rm[1] != feature[1]:
                    return jsonify({"error": "Invalid room_id"}), 400
            uf_kwargs["room_id"] = rid
        update_feature(feature_id, **uf_kwargs)
        return jsonify({"message": "Feature updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    
# Clear a feature's position data so that is becomes NULL in the database
@routes_bp.route("/feature/position/<int:feature_id>", methods=["DELETE"])
def clear_feature_position(feature_id):
    account_id, error = get_current_account_id()
    if error:
        return error
    feature = get_feature_by_id(feature_id)
    if not feature or not is_account_in_household(account_id, feature[1]):
        return jsonify({"error": "Access denied"}), 403
    try:
        set_null_feature_position(feature_id)
        return jsonify({"message": "Feature position data cleared successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@routes_bp.route("/feature/<int:feature_id>", methods=["DELETE"])
def remove_feature(feature_id):
    account_id, error = get_current_account_id()
    if error:
        return error
    feature = get_feature_by_id(feature_id)
    if not feature or not is_account_in_household(account_id, feature[1]):
        return jsonify({"error": "Access denied"}), 403
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
    account_id, error = get_current_account_id()
    if error:
        return error
    if not is_account_in_household(account_id, household_id):
        return jsonify({"error": "Access denied"}), 403
    try:
        features = get_features_with_tasks(household_id)
        return jsonify(features), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@routes_bp.route("/household/<int:household_id>/rooms", methods=["GET"])
def list_household_rooms(household_id):
    account_id, error = get_current_account_id()
    if error:
        return error
    if not is_account_in_household(account_id, household_id):
        return jsonify({"error": "Access denied"}), 403
    try:
        rooms = get_rooms_for_household(household_id)
        return jsonify(rooms), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@routes_bp.route("/household/<int:household_id>/rooms", methods=["POST"])
def create_household_room(household_id):
    account_id, error = get_current_account_id()
    if error:
        return error
    if not is_account_in_household(account_id, household_id):
        return jsonify({"error": "Access denied"}), 403
    data = request.get_json() or {}
    if not data.get("room_name"):
        return jsonify({"error": "room_name is required"}), 400
    try:
        room_id = add_room(household_id, data["room_name"], data.get("accent_color"))
        return jsonify({"room_id": room_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@routes_bp.route("/room/<int:room_id>", methods=["PUT"])
def edit_room_route(room_id):
    account_id, error = get_current_account_id()
    if error:
        return error
    row = get_room_by_id(room_id)
    if not row or not is_account_in_household(account_id, row[1]):
        return jsonify({"error": "Access denied"}), 403
    data = request.get_json() or {}
    try:
        kwargs = {}
        if "room_name" in data:
            kwargs["room_name"] = data["room_name"]
        if "accent_color" in data:
            kwargs["accent_color"] = data["accent_color"]
        if not kwargs:
            return jsonify({"error": "No fields to update"}), 400
        update_room(room_id, **kwargs)
        return jsonify({"message": "Room updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@routes_bp.route("/room/<int:room_id>", methods=["DELETE"])
def remove_room_route(room_id):
    account_id, error = get_current_account_id()
    if error:
        return error
    row = get_room_by_id(room_id)
    if not row or not is_account_in_household(account_id, row[1]):
        return jsonify({"error": "Access denied"}), 403
    try:
        delete_room(room_id)
        return jsonify({"message": "Room deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# --- Task Routes ---
# icon defaults to clipboard if not sent --> list view always sends one though
@routes_bp.route("/task", methods=["POST"])
def create_task():
    account_id, error = get_current_account_id()
    if error:
        return error
    data = request.get_json()
    feature = get_feature_by_id(data.get("feature_id"))
    if not feature or not is_account_in_household(account_id, feature[1]):
        return jsonify({"error": "Access denied"}), 403
    try:
        task_id = add_task(
            data["feature_id"],
            data["task_name"],
            data["frequency_days"],
            data.get("last_completed"),
            data["visibility"],
            account_id,
            data.get("icon", "clipboard-text-outline")
        )
        return jsonify({"task_id": task_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@routes_bp.route("/task/<int:task_id>", methods=["PUT"])
def edit_task(task_id):
    account_id, error = get_current_account_id()
    if error:
        return error
    household_id = get_household_id_for_task(task_id)
    if not household_id or not is_account_in_household(account_id, household_id):
        return jsonify({"error": "Access denied"}), 403
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
    account_id, error = get_current_account_id()
    if error:
        return error
    household_id = get_household_id_for_task(task_id)
    if not household_id or not is_account_in_household(account_id, household_id):
        return jsonify({"error": "Access denied"}), 403
    try:
        delete_task(task_id)
        return jsonify({"message": "Task deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# Mark a task as done --> sets last_completed to right now
# The list view calls this when you tap the green check button on a task
@routes_bp.route("/task/<int:task_id>/complete", methods=["POST"])
def complete_task(task_id):
    account_id, error = get_current_account_id()
    if error:
        return error
    household_id = get_household_id_for_task(task_id)
    if not household_id or not is_account_in_household(account_id, household_id):
        return jsonify({"error": "Access denied"}), 403
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
    account_id, error = get_current_account_id()
    if error:
        return error
    if not is_account_in_household(account_id, household_id):
        return jsonify({"error": "Access denied"}), 403
    data = request.get_json()
    try:
        update_household(household_id, data["household_name"])
        return jsonify({"message": "Household updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@routes_bp.route("/household/<int:household_id>", methods=["DELETE"])
def remove_household(household_id):
    account_id, error = get_current_account_id()
    if error:
        return error
    if not is_account_in_household(account_id, household_id):
        return jsonify({"error": "Access denied"}), 403
    try:
        delete_household(household_id)
        return jsonify({"message": "Household deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# --- User/Account Routes ---
@routes_bp.route("/user/<int:account_id>", methods=["PUT"])
def edit_user(account_id):
    caller_id, error = get_current_account_id()
    if error:
        return error
    if caller_id != account_id:
        return jsonify({"error": "Access denied"}), 403
    data = request.get_json()
    try:
        update_account(account_id, data["account_name"], data["email"])
        return jsonify({"message": "User updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@routes_bp.route("/user/<int:account_id>", methods=["DELETE"])
def remove_user(account_id):
    caller_id, error = get_current_account_id()
    if error:
        return error
    if caller_id != account_id:
        return jsonify({"error": "Access denied"}), 403
    try:
        delete_account(account_id)
        return jsonify({"message": "User deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# --- Sensor Data Route for querying household sensor data ---
@routes_bp.route("/sensor-data/<int:household_id>", methods=["GET"])
def get_sensor_data(household_id):
    try:
        data = get_latest_env_data(household_id)
        return jsonify({
            "temperature" : data[0],
            "humidity" : data[1]
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400
