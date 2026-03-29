"""
File name: run_sql.py
Description: Quick utility script to run SQL directly on the database.
Programmer: Nifemi Lawal
Creation date: 3/29/26
Revision date:
    - 
Preconditions: The database must be running and the .env file must be set up correctly.
Postconditions: The SQL statement is executed successfully.
Errors: If the database cannot be connected to, an error message is printed and the program exits.
Side effects: None
Example: (Run from src/server/)
    python3 db/run_sql.py "ALTER TABLE Feature ADD COLUMN icon VARCHAR(50) DEFAULT 'home-outline'"
"""

import sys
import os

# need this so python can find db_commands in the same folder
sys.path.insert(0, os.path.dirname(__file__))
import db_commands

def run_sql(sql):
    conn = db_commands.connect_to_db()
    if not conn:
        print("Couldn't connect to the database. Check your .env file.")
        sys.exit(1)

    try:
        with conn.cursor() as cursor:
            cursor.execute(sql)

            # if we got rows back (like from a SELECT), print them out
            if cursor.description:
                columns = [desc[0] for desc in cursor.description]
                rows = cursor.fetchall()
                print(" | ".join(columns))
                print("-" * (len(" | ".join(columns))))
                for row in rows:
                    print(" | ".join(str(val) for val in row))
                print(f"\n({len(rows)} row{'s' if len(rows) != 1 else ''})")
            else:
                # not a SELECT, so just commit and move on
                conn.commit()
                print("Done, statement ran successfully")
    except Exception as e:
        conn.rollback()
        print(f"Something went wrong: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("You need to pass a SQL statement as an argument")
        print("Example: python db/run_sql.py \"ALTER TABLE Feature ADD COLUMN icon VARCHAR(50) DEFAULT 'home-outline'\"")
        sys.exit(1)

    sql = sys.argv[1]
    run_sql(sql)
