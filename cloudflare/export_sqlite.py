"""Export the live SQLite schema's data for import into a fresh D1 database."""

import argparse
import sqlite3
from pathlib import Path

TABLES = ("categories", "canteens", "dishes", "users", "ratings", "review_photos", "reports", "admin_actions", "rating_history", "feedback")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.output.suffix != ".sql":
        parser.error("output must have a .sql extension")
    with sqlite3.connect(args.database.resolve().as_uri() + "?mode=ro", uri=True) as db:
        db.execute("BEGIN")
        if db.execute("PRAGMA foreign_key_check").fetchone():
            raise SystemExit("Source database contains broken foreign keys")
        for table in ("canteens", "dishes", "ratings"):
            if db.execute(f"SELECT 1 FROM {table} WHERE length(photo) > 1500000").fetchone():
                raise SystemExit(f"{table} contains a photo larger than 1.5 MB")
        with args.output.open("x", encoding="utf-8", newline="\n") as output:
            for table in TABLES:
                columns = [row[1] for row in db.execute(f"PRAGMA table_info({table})")]
                if not columns:
                    continue
                expressions = ", ".join(
                    "quote(X'')" if table == "review_photos" and column == "photo"
                    else "NULL" if column in {"token", "photo", "avatar"}
                    else f'quote("{column}")' for column in columns
                )
                for row in db.execute(f"SELECT {expressions} FROM {table} ORDER BY id"):
                    values = ", ".join(value if value is not None else "NULL" for value in row)
                    output.write(f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({values});\n")
                for column in ("photo", "avatar"):
                    if column not in columns:
                        continue
                    for item_id, photo in db.execute(f"SELECT id, {column} FROM {table} WHERE {column} IS NOT NULL"):
                        for offset in range(0, len(photo), 40_000):
                            chunk = photo[offset:offset + 40_000].hex()
                            output.write(
                                f"UPDATE {table} SET {column}=CAST(COALESCE({column}, X'') || X'{chunk}' AS BLOB) "
                                f"WHERE id={item_id};\n"
                            )


if __name__ == "__main__":
    main()
