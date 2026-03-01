"""
Apply the DDL statements from ddl.sql file to the database.
Should be run to setup the database schema

Remove DDL can also be used to drop all the tables and completely reset the database
"""

import psycopg2
import db_commands

conn = db_commands.connect_to_db()

def apply_ddl():
    with open("ddl.sql", "r") as f:
        ddl_statements = f.read()

    with conn.cursor() as cursor:
        cursor.execute(ddl_statements)

    conn.commit()
    print("DDL applied successfully")

def remove_ddl():
    with conn.cursor() as cursor:
        cursor.execute("""
            DROP SCHEMA public CASCADE;
            CREATE SCHEMA public;
        """)

remove_ddl()
apply_ddl()
