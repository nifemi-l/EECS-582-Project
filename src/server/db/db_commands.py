"""
PROLOGUE
File name: db_commands.py
Description: Handles database connectivity and defines functions for inserting, updating, and retrieving data from the PostgreSQL database.
Programmers: Blake Carlson, Logan Smith, some by Jack Bauer
Creation date: 2/22/26
Revision date: 
    - 3/19/26: Added create_household, make_household_join_code, add_account_to_household, get_household_by_join_code, is_account_in_household, and get_households_for_account
    - 4/10/26: Added get_account_role_in_household, remove_account_from_household, get_members_for_household, and transfer_admin_in_household
    - 4/16/26: Add 3D scale, rotation support
    - 4/20/26: Add method to clear feature position data
Preconditions: Environment variables for database credentials are defined in .env; PostgreSQL database is running and accessible.
Postconditions: A database connection is established and utility functions are available for performing CRUD operations on Household, Account, Feature, and Task relations.
Errors: Database connection may fail due to invalid credentials, unreachable host, or server-side errors; SQL execution errors may occur if schema constraints are violated.
Side effects: Opens a persistent database connection; commits transactions for insert/update operations; prints connection status to stdout.
Invariants: SQL statements use parameterized queries to prevent injection.
Known faults: Uses a single global database connection which may not scale for concurrent production environments.
"""

"""
This file is used to connect to the database and define functions for adding / retreiving data from the database
"""

import psycopg2
import random
import string
from datetime import datetime, timezone
from dotenv import load_dotenv
import os

load_dotenv()

DB_HOST = os.environ["DB_HOST"]
DB_NAME = os.environ["DB_NAME"]
DB_USER = os.environ["DB_USER"]
DB_PASSWORD = os.environ["DB_PASSWORD"]
DB_PORT = int(os.environ.get("DB_PORT", "5432"))

def connect_to_db():
    """Establish a connection to the PostgreSQL database."""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
        print("DB connection successful")
        return conn
    except Exception as e:
        print(f"DB connection failure: {e}")
        return None


conn = connect_to_db()

# Sentinel: omit room_id from UPDATE Feature when not passed (vs. explicit NULL to unassign)
_FEATURE_ROOM_ID_UNSET = object()
_ROOM_FIELD_UNSET = object()


"""
Functions for adding data to the database
"""

def add_household(household_name):
    # Ex: add_household("Johnson Family")
    with conn.cursor() as cursor:
        cursor.execute("""
            INSERT INTO Household (household_name)
            VALUES (%s)
            RETURNING household_id
        """, (household_name,))
        household_id = cursor.fetchone()[0]

    conn.commit()
    # Return the id, can be used or not
    return household_id

def add_account(account_name: str, hashed_password: str, email: str):
    with conn.cursor() as cursor:
        cursor.execute("""
            INSERT INTO Account (account_name, hashed_password, email)
            VALUES (%s, %s, %s)
            RETURNING account_id
        """, (account_name, hashed_password, email))
        account_id = cursor.fetchone()[0]
    conn.commit()
    return account_id

    # Ex: add_feature(1, "Kitchen", "room", 0, 0, 0, "silverware-fork-knife")
    # icon param is optional, defaults to the generic home icon
def add_feature(household_id, feature_name, feature_type, x_pos, y_pos, z_pos, icon='home-outline', room_id=None):
    with conn.cursor() as cursor:
        cursor.execute("""
            INSERT INTO Feature (household_id, feature_name, feature_type, x_pos, y_pos, z_pos, icon, room_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING feature_id
        """, (household_id, feature_name, feature_type, x_pos, y_pos, z_pos, icon, room_id))
        feature_id = cursor.fetchone()[0]
    conn.commit()
    return feature_id


def add_room(household_id, room_name, accent_color=None):
    name = (room_name or "").strip()
    if not name:
        raise ValueError("room_name is required")
    with conn.cursor() as cursor:
        cursor.execute("""
            INSERT INTO Room (household_id, room_name, accent_color)
            VALUES (%s, %s, %s)
            RETURNING room_id
        """, (household_id, name, accent_color))
        room_id = cursor.fetchone()[0]
    conn.commit()
    return room_id


def get_room_by_id(room_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT room_id, household_id, room_name, accent_color
            FROM Room
            WHERE room_id = %s
        """, (room_id,))
        return cursor.fetchone()


def get_rooms_for_household(household_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT room_id, household_id, room_name, accent_color
            FROM Room
            WHERE household_id = %s
            ORDER BY room_id ASC
        """, (household_id,))
        rows = cursor.fetchall()
    return [
        {
            "room_id": r[0],
            "household_id": r[1],
            "room_name": r[2],
            "accent_color": r[3],
        }
        for r in rows
    ]


def update_room(room_id, room_name=_ROOM_FIELD_UNSET, accent_color=_ROOM_FIELD_UNSET):
    sets = []
    params = []
    if room_name is not _ROOM_FIELD_UNSET:
        sets.append("room_name = %s")
        params.append((room_name or "").strip() or "Room")
    if accent_color is not _ROOM_FIELD_UNSET:
        sets.append("accent_color = %s")
        params.append(accent_color)
    if not sets:
        return
    params.append(room_id)
    with conn.cursor() as cursor:
        cursor.execute(
            f"UPDATE Room SET {', '.join(sets)} WHERE room_id = %s",
            tuple(params),
        )
    conn.commit()


def delete_room(room_id):
    with conn.cursor() as cursor:
        cursor.execute("DELETE FROM Room WHERE room_id = %s", (room_id,))
    conn.commit()


# icon param is optional, defaults to clipboard icon
def add_task(feature_id, task_name, frequency_days, last_completed, visibility, created_by_account_id, icon='clipboard-text-outline'):
    with conn.cursor() as cursor:
        cursor.execute("""
            INSERT INTO Task (feature_id, task_name, frequency_days, last_completed, visibility, created_by_account_id, icon)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING task_id
        """, (feature_id, task_name, frequency_days, last_completed, visibility, created_by_account_id, icon))
        task_id = cursor.fetchone()[0]
    conn.commit()
    return task_id

# Add a role for an account in a household
# Is a separate relation because there is a many-to-many relationship between accounts and households
    # For example, an account could be a member of multiple households
    # But a household also can have multiple accounts associated with it
        # The primary key is a composite of the household and account ids
def add_account_role(account_id, household_id, role):
    with conn.cursor() as cursor:
        cursor.execute("""
            INSERT INTO HouseholdMember (account_id, household_id, role)
            VALUES (%s, %s, %s)
        """, (account_id, household_id, role,))
    conn.commit()

# Generate a unique join code for households
def make_household_join_code(length=8):
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choices(alphabet, k=length))

# Create a new household and store the join code, maker included
def create_household(household_name, creator_account_id=None):
    with conn.cursor() as cursor:
        while True:
            join_code = make_household_join_code(8)
            try:
                cursor.execute("""
                    INSERT INTO Household (household_name, join_code, created_by_account_id)
                    VALUES (%s, %s, %s)
                    RETURNING household_id, household_name, join_code, created_by_account_id, created_at, updated_at
                """, (household_name, join_code, creator_account_id))
                row = cursor.fetchone()
                break
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                continue

    conn.commit()
    return {
        "household_id": row[0],
        "household_name": row[1],
        "join_code": row[2],
        "created_by_account_id": row[3],
        "created_at": row[4],
        "updated_at": row[5],
    }

# Add the account to the household membership table
def add_account_to_household(account_id, household_id, role):
    add_account_role(account_id, household_id, role)

# Retrieve a household row by its join code
def get_household_by_join_code(join_code):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT household_id, household_name, join_code, created_by_account_id, created_at, updated_at
            FROM Household
            WHERE join_code = %s
        """, (join_code,))
        row = cursor.fetchone()

    if not row:
        return None

    return {
        "household_id": row[0],
        "household_name": row[1],
        "join_code": row[2],
        "created_by_account_id": row[3],
        "created_at": row[4],
        "updated_at": row[5],
    }

# Check membership existence to avoid duplicate enrollments
def is_account_in_household(account_id, household_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT 1 FROM HouseholdMember
            WHERE account_id = %s AND household_id = %s
        """, (account_id, household_id))
        result = cursor.fetchone()
    return bool(result)

# Return the role an account holds in a specific household, or None if not a member
def get_account_role_in_household(account_id, household_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT role FROM HouseholdMember
            WHERE account_id = %s AND household_id = %s
        """, (account_id, household_id))
        row = cursor.fetchone()
    return row[0] if row else None

# Remove an account from a household's membership table
def remove_account_from_household(account_id, household_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            DELETE FROM HouseholdMember
            WHERE account_id = %s AND household_id = %s
        """, (account_id, household_id))
    conn.commit()

# Transfer admin role in a household: old admin becomes a member, target becomes admin
def transfer_admin_in_household(new_admin_account_id, household_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            UPDATE HouseholdMember SET role = 'member'
            WHERE household_id = %s AND role = 'admin'
        """, (household_id,))
        cursor.execute("""
            UPDATE HouseholdMember SET role = 'admin'
            WHERE account_id = %s AND household_id = %s
        """, (new_admin_account_id, household_id))
    conn.commit()

# Return all members of a household with their name, role, and joined_at date
def get_members_for_household(household_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT a.account_id, a.account_name, hm.role, hm.joined_at
            FROM HouseholdMember hm
            JOIN Account a ON hm.account_id = a.account_id
            WHERE hm.household_id = %s
            ORDER BY
                CASE WHEN hm.role = 'admin' THEN 0 ELSE 1 END,
                hm.joined_at ASC
        """, (household_id,))
        rows = cursor.fetchall()
    return [
        {
            "account_id": row[0],
            "account_name": row[1],
            "role": row[2],
            "joined_at": row[3].isoformat() if row[3] else None,
        }
        for row in rows
    ]

# Resolve a task_id to its household_id by joining through Feature
# Used by routes to check household membership before mutating a task
def get_household_id_for_task(task_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT f.household_id
            FROM Task t
            JOIN Feature f ON t.feature_id = f.feature_id
            WHERE t.task_id = %s
        """, (task_id,))
        row = cursor.fetchone()
    return row[0] if row else None

# Retrieve household summaries for a member account
def get_households_for_account(account_id):
    with conn.cursor() as cursor:
        query = """
            SELECT
                h.household_id,
                h.household_name,
                h.join_code,
                hm_current.role,
                admin_account.account_name,
                h.created_at,
                h.updated_at
            FROM Household AS h
            JOIN HouseholdMember AS hm_current
                ON h.household_id = hm_current.household_id
            LEFT JOIN HouseholdMember AS hm_admin
                ON h.household_id = hm_admin.household_id AND hm_admin.role = 'admin'
            LEFT JOIN Account AS admin_account
                ON hm_admin.account_id = admin_account.account_id
            WHERE hm_current.account_id = %s
            ORDER BY h.household_id
        """
        cursor.execute(query, (account_id,))
        rows = cursor.fetchall()

    households = []

    for row in rows:
        household = {
            "household_id": row[0],
            "household_name": row[1],
            "join_code": row[2],
            "role": row[3],
            "admin_name": row[4],
            "created_at": row[5],
            "updated_at": row[6],
        }
        households.append(household)

    return households

"""
Functions for retrieving specific data from the database
"""

# Retrieve data for a household by its household id
def get_household_by_id(household_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT * FROM Household
            WHERE household_id = %s
        """, (household_id,))
        household = cursor.fetchone()
    return household

# Retrieve data for an account by its account id
def get_account_by_id(account_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT * FROM Account
            WHERE account_id = %s
        """, (account_id,))
        account = cursor.fetchone()
    return account

# Retrieve data for an account by its email
def get_account_by_email(email: str):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT account_id, account_name, hashed_password, email
            FROM Account
            WHERE email = %s
        """, (email,))
        account = cursor.fetchone()
    return account

# Retrieve data for a feature by its feature id
def get_feature_by_id(feature_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT * FROM Feature
            WHERE feature_id = %s
        """, (feature_id,))
        feature = cursor.fetchone()
    return feature

# Retrieve data for a task by its task id
def get_task_by_id(task_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT * FROM Task
            WHERE task_id = %s
        """, (task_id,))
        task = cursor.fetchone()
    return task

# Get all tasks associated with a specific feature by its id.
def get_tasks_by_feature_id(feature_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT * FROM Task
            WHERE feature_id = %s
        """, (feature_id,))
        tasks = cursor.fetchall()
    return tasks

# Use the account id to get all the roles that account has (to get the households the account is associated with)
def get_account_roles_by_account_id(account_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT household_id, role
            FROM HouseholdMember
            WHERE account_id = %s
        """, (account_id,))
        roles = cursor.fetchall()
    return roles

# Use the household id to get all the roles for that household (to get all the accounts in the household)
def get_account_roles_by_household_id(household_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT account_id, role
            FROM HouseholdMember
            WHERE household_id = %s
        """, (household_id,))
        roles = cursor.fetchall()
    return roles

# Use the household id to get all of its features
def get_household_features(household_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT * FROM Feature
            WHERE household_id = %s
        """, (household_id,))
        features = cursor.fetchall()
    return features

# Use the household id to get all of its tasks
    # A join between the Task and Feature relations is needed to make the connection between the Household id and the tasks
def get_household_tasks(household_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT *
            FROM Task
            JOIN Feature ON Task.feature_id = Feature.feature_id
            WHERE Feature.household_id = %s
        """, (household_id,))
        tasks = cursor.fetchall()
    return tasks

# Get all features for a household, and nest each feature's tasks inside it as a list of dicts
# This is the main query the list view uses on load -- gives us everything we need in one call
# Returns a list like: [{ "feature_id": 1, "feature_name": "Kitchen", ..., "tasks": [{ ... }, ...] }, ...]
def get_features_with_tasks(household_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT feature_id, household_id, feature_name, feature_type,
                   x_pos, y_pos, z_pos, icon, room_id, scale, rotation_y
            FROM Feature
            WHERE household_id = %s
            ORDER BY feature_id ASC
        """, (household_id,))
        features = cursor.fetchall()
    result = []
    for f in features:
        feature_dict = {
            "feature_id": f[0],
            "household_id": f[1],
            "feature_name": f[2],
            "feature_type": f[3],
            "x_pos": f[4],
            "y_pos": f[5],
            "z_pos": f[6],
            "icon": f[7] or "home-outline",
            "room_id": f[8],
            "scale": f[9],
            "rotation_y": f[10],
            "tasks": [],
        }
        tasks = get_tasks_by_feature_id(f[0])
        for t in tasks:
            # Convert last_completed to ISO string so JSON serialization doesn't choke on datetime
            feature_dict["tasks"].append({
                "task_id": t[0],
                "feature_id": t[1],
                "task_name": t[2],
                "frequency_days": t[3],
                "last_completed": t[4].isoformat() if t[4] else None,
                "visibility": t[5],
                "created_by_account_id": t[6],
                "icon": t[7] if len(t) > 7 else "clipboard-text-outline",
            })
        result.append(feature_dict)
    return result


# Get the most recent environmental data readings from the Enviro+ sensor
def get_latest_env_data(household_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT temperature_C, relative_humidity, recorded_at
            FROM EnvironmentalData
            WHERE household_id = %s
            ORDER BY recorded_at DESC
            LIMIT 1
            """, (household_id,))
        return cursor.fetchone()

# Deletes all environmental data related to a household over 1 day old to keep the db efficient
def delete_old_env_data_by_household_id(household_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            DELETE FROM EnvironmentalData
            WHERE household_id = %s
            AND recorded_at < NOW() - INTERVAL '1 day';)
        """, (household_id,))
        conn.commit()

"""
Functions for updating data
"""

# Mark a task as completed right now -- sets last_completed to current UTC time
# Called when the user taps the check button on a task in the list view
def update_task_last_comp_time(task_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            UPDATE Task
            SET last_completed = %s
            WHERE task_id = %s
        """, (datetime.now(timezone.utc), task_id,))
    conn.commit()


# Update the last login time for an account
def update_account_last_login(account_id: int):
    with conn.cursor() as cursor:
        cursor.execute("""
            UPDATE Account
            SET last_login = %s
            WHERE account_id = %s
        """, (datetime.now(timezone.utc), account_id,))
    conn.commit()

# Update any combination of feature fields (only the params passed in get changed)
# This way the list view can rename a feature without touching positions, and
# the 3D view can move a feature without touching the name
def update_feature(
    feature_id,
    feature_name=None,
    feature_type=None,
    x_pos=None,
    y_pos=None,
    z_pos=None,
    icon=None,
    room_id=_FEATURE_ROOM_ID_UNSET,
    scale=None,
    rotation_y=None,
):
    # Build the SET clause dynamically based on which args were actually provided
    sets = []
    params = []
    if feature_name is not None:
        sets.append("feature_name = %s")
        params.append(feature_name)
    if feature_type is not None:
        sets.append("feature_type = %s")
        params.append(feature_type)
    if x_pos is not None:
        sets.append("x_pos = %s")
        params.append(x_pos)
    if y_pos is not None:
        sets.append("y_pos = %s")
        params.append(y_pos)
    if z_pos is not None:
        sets.append("z_pos = %s")
        params.append(z_pos)
    if icon is not None:
        sets.append("icon = %s")
        params.append(icon)
    if room_id is not _FEATURE_ROOM_ID_UNSET:
        sets.append("room_id = %s")
        params.append(room_id)
    if scale is not None:
        sets.append("scale = %s")
        params.append(scale)
    if rotation_y is not None:
        sets.append("rotation_y = %s")
        params.append(rotation_y)
    if not sets:
        return
    # feature_id goes at the end for the WHERE clause
    params.append(feature_id)
    with conn.cursor() as cursor:
        cursor.execute(
            f"UPDATE Feature SET {', '.join(sets)} WHERE feature_id = %s",
            tuple(params)
        )
    conn.commit()

# Set feature position data to NULL
def set_null_feature_position(feature_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            UPDATE Feature
            SET x_pos = %s, y_pos = %s, z_pos = %s
            WHERE feature_id = %s
        """, (None, None, None, feature_id))
    conn.commit()

"""
Functions for deleting data
"""

def delete_task(task_id):
    with conn.cursor() as cursor:
        cursor.execute("DELETE FROM Task WHERE task_id = %s", (task_id,))
    conn.commit()

def delete_feature(feature_id):
    with conn.cursor() as cursor:
        cursor.execute("DELETE FROM Feature WHERE feature_id = %s", (feature_id,))
    conn.commit()

def delete_household(household_id):
    with conn.cursor() as cursor:
        cursor.execute("DELETE FROM Household WHERE household_id = %s", (household_id,))
    conn.commit()

def delete_account(account_id):
    with conn.cursor() as cursor:
        cursor.execute("DELETE FROM Account WHERE account_id = %s", (account_id,))
    conn.commit()

"""
Additional update functions
"""

def update_household(household_id, household_name):
    with conn.cursor() as cursor:
        cursor.execute("""
            UPDATE Household
            SET household_name = %s, updated_at = NOW()
            WHERE household_id = %s
            RETURNING household_id, household_name, join_code, updated_at
        """, (household_name, household_id,))
        row = cursor.fetchone()
    conn.commit()
    if not row:
        return None
    return {"household_id": row[0], "household_name": row[1], "join_code": row[2], "updated_at": row[3]}

def regenerate_join_code(household_id):
    with conn.cursor() as cursor:
        while True:
            new_code = make_household_join_code(8)
            try:
                cursor.execute("""
                    UPDATE Household
                    SET join_code = %s, updated_at = NOW()
                    WHERE household_id = %s
                    RETURNING household_id, household_name, join_code, updated_at
                """, (new_code, household_id,))
                row = cursor.fetchone()
                conn.commit()
                break
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                continue
    return {"household_id": row[0], "household_name": row[1], "join_code": row[2], "updated_at": row[3]}

# Update task details (name, frequency, visibility, and icon are optional so we don't overwrite them if not provided)
def update_task(task_id, task_name, frequency_days, visibility, icon=None):
    with conn.cursor() as cursor:
        if icon is not None:
            cursor.execute("""
                UPDATE Task
                SET task_name = %s, frequency_days = %s, visibility = %s, icon = %s
                WHERE task_id = %s
            """, (task_name, frequency_days, visibility, icon, task_id))
        else:
            cursor.execute("""
                UPDATE Task
                SET task_name = %s, frequency_days = %s, visibility = %s
                WHERE task_id = %s
            """, (task_name, frequency_days, visibility, task_id))
    conn.commit()

def update_account(account_id, account_name, email):
    with conn.cursor() as cursor:
        cursor.execute("""
            UPDATE Account
            SET account_name = %s, email = %s
            WHERE account_id = %s
        """, (account_name, email, account_id,))
    conn.commit()