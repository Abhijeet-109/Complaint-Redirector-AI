from sqlalchemy import inspect
from backend.Database.connection import engine


def inspect_database():
    inspector = inspect(engine)

    for table in inspector.get_table_names():
        print(f"\n========== {table} ==========")

        for column in inspector.get_columns(table):
            print({
                "name": column["name"],
                "type": str(column["type"]),
                "nullable": column["nullable"],
                "default": column.get("default"),
                "identity": column.get("identity"),
                "computed": column.get("computed"),
            })

    print("\n========== SEQUENCES ==========")

    with engine.connect() as connection:
        sequences = connection.exec_driver_sql("""
            SELECT sequence_name
            FROM information_schema.sequences
            WHERE sequence_schema = current_schema()
            ORDER BY sequence_name
        """).scalars().all()

        for sequence in sequences:
            print(sequence)


if __name__ == "__main__":
    inspect_database()