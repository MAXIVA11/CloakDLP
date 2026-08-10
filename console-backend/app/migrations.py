"""Base.metadata.create_all() only creates tables that don't exist yet — it never alters an
existing table when a newer model version adds a column. Upgrading over an existing cloakdlp.db
without this patches nothing, and every query touching the changed table starts 500ing (this is
exactly how the AgentKind pivot broke installs upgrading from before it: "no such column:
agents.kind"). This scans the ORM models against the on-disk schema at startup and adds any
missing columns before the app starts serving requests.
"""

import enum

from sqlalchemy import inspect, text

from app.database import Base, engine


def run_migrations() -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue  # brand-new table — create_all() already handled it
            existing_columns = {col["name"] for col in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                col_type = column.type.compile(dialect=engine.dialect)
                ddl = f"ALTER TABLE {table.name} ADD COLUMN {column.name} {col_type}"
                default_sql = _literal_default(column)
                if default_sql is not None:
                    ddl += f" DEFAULT {default_sql}"
                conn.execute(text(ddl))

        _drop_stale_unique_index(conn, "agents", "ix_agents_hostname")


def _drop_stale_unique_index(conn, table_name: str, index_name: str) -> None:
    """agents.hostname used to be unique on its own; it's now unique per (hostname, kind) so
    the desktop agent and browser extension can share a hostname and group as one workstation.
    create_all() never touches an index that already exists under this name, so an install that
    predates that change is stuck with the old UNIQUE index forever unless it's dropped and
    recreated here — otherwise the extension's self-register call 500s the moment it tries to
    reuse the desktop agent's hostname."""
    row = conn.execute(
        text("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=:t AND name=:n"),
        {"t": table_name, "n": index_name},
    ).fetchone()
    if row is None or row[0] is None or "UNIQUE" not in row[0].upper():
        return
    conn.execute(text(f"DROP INDEX {index_name}"))
    conn.execute(text(f"CREATE INDEX {index_name} ON {table_name} (hostname)"))


def _literal_default(column) -> str | None:
    """SQLite backfills existing rows with the ALTER TABLE ... DEFAULT value, which is exactly
    what's needed here (e.g. every pre-existing agent becomes kind='native', the only kind that
    existed before this column did). Only scalar column defaults translate to SQL literals —
    callables (uuid/timestamp generators) have nothing meaningful to backfill with, so those
    columns come back NULL on old rows rather than guessing."""
    default = column.default
    if default is None or default.is_callable:
        return None
    value = default.arg
    if isinstance(value, enum.Enum):
        value = value.value
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    return None
