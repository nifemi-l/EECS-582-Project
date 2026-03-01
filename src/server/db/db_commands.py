"""
This file is used to connect to the database and define functions for adding / retreiving data from the database
"""

import psycopg2
from datetime import datetime, timezone
import db_config

DB_HOST = db_config.DB_HOST
DB_NAME = db_config.DB_NAME
DB_USER = db_config.DB_USER
DB_PASSWORD = db_config.DB_PASSWORD

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
        # Return conn instead of None?
        return conn


conn = connect_to_db()

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

def add_account(account_name, household_id, hashed_password, email, last_login=None):
    with conn.cursor() as cursor:
        cursor.execute("""
            INSERT INTO Account (account_name, household_id, hashed_password, email, last_login)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING account_id
        """, (account_name, household_id, hashed_password, email, last_login,))
        account_id = cursor.fetchone()[0]
    conn.commit()
    # Return the account id
    return account_id

def add_feature( household_id, feature_name, feature_type, x_pos, y_pos, z_pos):
    with conn.cursor() as cursor:
        cursor.execute("""
            INSERT INTO Feature (household_id, feature_name, feature_type, x_pos, y_pos, z_pos)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING feature_id
        """, (household_id, feature_name, feature_type, x_pos, y_pos, z_pos,))
        feature_id = cursor.fetchone()[0]
    conn.commit()
    # Return the feature id
    return feature_id


def add_task(new_feature_id, existing_task_name, task_frequency_days, time_last_completed, task_visibility):
    # Ex: add_task(12, "Clean Room", 7, [however timestamp is formatted], "private")
    with conn.cursor() as cursor:
        cursor.execute("""
            INSERT INTO Task (feature_id, task_name, frequency_days, last_completed, visibility)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING task_id
        """, (new_feature_id, existing_task_name, task_frequency_days, time_last_completed, task_visibility,))
        task_id = cursor.fetchone()[0]   
    conn.commit()
    return task_id

"""
Function for updating the time that a task has been completed
"""

def update_task_last_comp_time(task_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            UPDATE Task
            SET last_completed = %s
            WHERE task_id = %s
        """, (datetime.now(timezone.utc), task_id,))
    

"""
Functions for retrieving specific data from the database
"""

# Test adding data into the database

"""
household_id = add_household("SampleHousehold")
account_id = add_account("John Doe", household_id, "hashed_password_123", "john.doe@example.com")
feature_id = add_feature(household_id, "Kitchen Sink", "Test Kitchen Type", 1.0, 4.0, 5.0)
task_id = add_task(feature_id, "Wash Dishes", 1, datetime.now(timezone.utc), "private")
"""
"""
print("Added data successfully!")
"""


# Functions to retrieve data from the database

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

"""
print()
print("Testing base data retrieval functions:")
print("Household:", get_household_by_id(3))
print("Account:", get_account_by_id(3))
print("Feature:", get_feature_by_id(2))
print("Task:", get_task_by_id(2))
"""
