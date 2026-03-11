"""
PROLOGUE
File name: routes.py
Description: Flask blueprint for task, household, and account CRUD operations.
Programmer: Delroy Wright
Creation date: 3/11/26
Preconditions: db_commands.py contains necessary CRUD functions.
Postconditions: Flask routes are available for managing tasks, households, and users.
"""

from flask import Blueprint, request, jsonify
from db.db_commands import (
    add_task, update_task, delete_task, get_task_by_id,
    add_household, update_household, delete_household, get_household_by_id,
    add_account, update_account, delete_account, get_account_by_id,
    add_feature, update_feature, delete_feature, get_feature_by_id
)

routes_bp = Blueprint("routes", __name__)

# --- Feature Routes ---
@routes_bp.route("/feature", methods=["POST"])
def create_feature():
    data = request.get_json()
    try:
        feature_id = add_feature(
            data["household_id"],
            data["feature_name"],
            data["feature_type"],
            data["x_pos"],
            data["y_pos"],
            data["z_pos"]
        )
        return jsonify({"feature_id": feature_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@routes_bp.route("/feature/<int:feature_id>", methods=["PUT"])
def edit_feature(feature_id):
    data = request.get_json()
    try:
        update_feature(
            feature_id,
            data["feature_name"],
            data["feature_type"],
            data["x_pos"],
            data["y_pos"],
            data["z_pos"]
        )
        return jsonify({"message": "Feature updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@routes_bp.route("/feature/<int:feature_id>", methods=["DELETE"])
def remove_feature(feature_id):
    try:
        delete_feature(feature_id)
        return jsonify({"message": "Feature deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# --- Task Routes ---
@routes_bp.route("/task", methods=["POST"])
def create_task():
    data = request.get_json()
    try:
        task_id = add_task(
            data["feature_id"],
            data["task_name"],
            data["frequency_days"],
            data.get("last_completed"),
            data["visibility"],
            data.get("created_by_account_id")
        )
        return jsonify({"task_id": task_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@routes_bp.route("/task/<int:task_id>", methods=["PUT"])
def edit_task(task_id):
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
    try:
        delete_task(task_id)
        return jsonify({"message": "Task deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# --- Household Routes ---
@routes_bp.route("/household", methods=["POST"])
def create_household():
    data = request.get_json()
    try:
        household_id = add_household(data["household_name"])
        return jsonify({"household_id": household_id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@routes_bp.route("/household/<int:household_id>", methods=["PUT"])
def edit_household(household_id):
    data = request.get_json()
    try:
        update_household(household_id, data["household_name"])
        return jsonify({"message": "Household updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@routes_bp.route("/household/<int:household_id>", methods=["DELETE"])
def remove_household(household_id):
    try:
        delete_household(household_id)
        return jsonify({"message": "Household deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# --- User/Account Routes ---
@routes_bp.route("/user/<int:account_id>", methods=["PUT"])
def edit_user(account_id):
    data = request.get_json()
    try:
        update_account(account_id, data["account_name"], data["email"])
        return jsonify({"message": "User updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@routes_bp.route("/user/<int:account_id>", methods=["DELETE"])
def remove_user(account_id):
    try:
        delete_account(account_id)
        return jsonify({"message": "User deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400
