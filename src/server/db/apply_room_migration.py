"""
Apply incremental Room / Feature.room_id schema (no wipe).

Run from repo root with PYTHONPATH pointing at server, or from src/server:

    cd src/server
    python3 db/apply_room_migration.py

Requires the same .env / DB credentials as db_commands.py.
"""

from __future__ import annotations

import os
import re
import sys

# Same pattern as run_sql.py
sys.path.insert(0, os.path.dirname(__file__))
import db_commands  # noqa: E402


def _load_statements(sql_path: str) -> list[str]:
    raw = open(sql_path, "r", encoding="utf-8").read()
    # strip full-line - comments
    lines = []
    for line in raw.splitlines():
        stripped = line.strip()
        if stripped.startswith("--"):
            continue
        lines.append(line)
    body = "\n".join(lines)
    parts = [p.strip() for p in body.split(";")]
    return [p for p in parts if p]


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    sql_path = os.path.join(here, "migrate_room_incremental.sql")
    if not os.path.isfile(sql_path):
        print(f"Missing {sql_path}", file=sys.stderr)
        sys.exit(1)

    statements = _load_statements(sql_path)
    conn = db_commands.connect_to_db()
    if not conn:
        print("Couldn't connect to the database. Check your .env file.", file=sys.stderr)
        sys.exit(1)

    try:
        with conn.cursor() as cur:
            for i, stmt in enumerate(statements, start=1):
                preview = re.sub(r"\s+", " ", stmt)[:72]
                print(f"[{i}/{len(statements)}] {preview}…")
                cur.execute(stmt + ";")
        conn.commit()
        print("Room migration applied successfully (committed).")
    except Exception as e:
        conn.rollback()
        print(f"Migration failed, rolled back: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
