from datetime import timezone

from sqlalchemy import DateTime, TypeDecorator, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class UTCDateTime(TypeDecorator):
    """SQLite doesn't actually preserve timezone info across a round trip; every value this
    app ever writes is UTC (via datetime.now(timezone.utc)), but reading it back gives a naive
    datetime with the right wall-clock value and no tzinfo. FastAPI then serializes that naive
    value with no 'Z'/offset suffix, and the browser's Date parser treats a timezone-less ISO
    string as *local* time rather than UTC; so every "last seen"/timestamp in the UI reads off
    by however many hours the user's local timezone is offset from UTC. Reattaching UTC tzinfo
    on read fixes the JSON serialization at the source, for every datetime column at once."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
