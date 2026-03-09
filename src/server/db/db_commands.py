"""
PROLOGUE
File name: db_commands.py
Description: Handles database connectivity and defines functions for inserting, updating, and retrieving data from the PostgreSQL database.
Programmer: Blake Carlson
Creation date: 2/22/26
Revision date: 
Preconditions: Environment variables for database credentials are defined in .env; PostgreSQL database is running and accessible.
Postconditions: A database connection is established and utility functions are available for performing CRUD operations on Household, Account, Feature, and Chore relations.
Errors: Database connection may fail due to invalid credentials, unreachable host, or server-side errors; SQL execution errors may occur if schema constraints are violated.
Side effects: Opens a persistent database connection; commits transactions for insert/update operations; prints connection status to stdout.
Invariants: SQL statements use parameterized queries to prevent injection.
Known faults: Uses a single global database connection which may not scale for concurrent production environments.
"""

"""
This file is used to connect to the database and define functions for adding / retreiving data from the database
"""

import psycopg2
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


def add_chore(new_feature_id, existing_chore_name, chore_frequency_days, time_last_completed, chore_visibility):
    # Ex: add_chore(12, "Clean Room", 7, [however timestamp is formatted], "private")
    with conn.cursor() as cursor:
        cursor.execute("""
            INSERT INTO Chore (feature_id, chore_name, frequency_days, last_completed, visibility)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING chore_id
        """, (new_feature_id, existing_chore_name, chore_frequency_days, time_last_completed, chore_visibility,))
        chore_id = cursor.fetchone()[0]
    conn.commit()
    return chore_id

# Add a role for an account in a household
# Is a separate relation because there is a many-to-many relationship between accounts and households
    # For example, an account could be a member of multiple households
    # But a household also can have multiple accounts associated with it
        # The primary key is a composite of the household and account ids
def add_account_role(account_id, household_id, role):
    with conn.cursor() as cursor:
        cursor.execute("""
            INSERT INTO AccountRole (account_id, household_id, role)
            VALUES (%s, %s, %s)
        """, (account_id, household_id, role,))
    conn.commit()

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

# Retrieve data for a chore by its chore id
def get_chore_by_id(chore_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT * FROM Chore
            WHERE chore_id = %s
        """, (chore_id,))
        chore = cursor.fetchone()
    return chore

# Get all chores associated with a specific feature by its id.
def get_chores_by_feature_id(feature_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT * FROM Chore
            WHERE feature_id = %s
        """, (feature_id,))
        chores = cursor.fetchall()
    return chores

# Use the account id to get all the roles that account has (to get the households the account is associated with)
def get_account_roles_by_account_id(account_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT household_id, role
            FROM AccountRole
            WHERE account_id = %s
        """, (account_id,))
        roles = cursor.fetchall()
    return roles

# Use the household id to get all the roles for that household (to get all the accounts in the household)
def get_account_roles_by_household_id(household_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT account_id, role
            FROM AccountRole
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

# Use the household id to get all of its chores
    # A join between the Chore and Feature relations is needed to make the connection between the Household id and the chores
def get_household_chores(household_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT *
            FROM Chore
            JOIN Feature ON Chore.feature_id = Feature.feature_id
            WHERE Feature.household_id = %s
        """, (household_id,))
        chores = cursor.fetchall()
    return chores

"""
Functions for updating data
"""

def update_chore_last_comp_time(chore_id):
    with conn.cursor() as cursor:
        cursor.execute("""
            UPDATE Chore
            SET last_completed = %s
            WHERE chore_id = %s
        """, (datetime.now(timezone.utc), chore_id,))


# Update the last login time for an account
def update_account_last_login(account_id: int):
    with conn.cursor() as cursor:
        cursor.execute("""
            UPDATE Account
            SET last_login = %s
            WHERE account_id = %s
        """, (datetime.now(timezone.utc), account_id,))
    conn.commit()

# Update feature coordinates
def update_feature_coordinates(feature_id, x_pos, y_pos, z_pos):
    with conn.cursor() as cursor:
        cursor.execute("""
            UPDATE Feature
            SET x_pos = %s, y_pos = %s, z_pos = %s
            WHERE feature_id = %s
        """, (x_pos, y_pos, z_pos, feature_id,))
    conn.commit()
