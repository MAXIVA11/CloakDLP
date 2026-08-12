import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Enum, ForeignKey, JSON, String, Boolean, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, UTCDateTime


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Channel(str, enum.Enum):
    file = "file"
    clipboard = "clipboard"
    print = "print"
    network = "network"


class Action(str, enum.Enum):
    block = "block"
    flag = "flag"
    log = "log"


class DetectionMethod(str, enum.Enum):
    regex = "regex"
    edm = "edm"
    fingerprint = "fingerprint"


class DataType(str, enum.Enum):
    credit_card = "credit_card"
    ssn = "ssn"
    api_key = "api_key"
    private_key = "private_key"
    edm_dataset = "edm_dataset"
    fingerprint_doc = "fingerprint_doc"


class IncidentStatus(str, enum.Enum):
    open = "open"
    false_positive = "false_positive"
    resolved = "resolved"


class AgentStatus(str, enum.Enum):
    online = "online"
    offline = "offline"


class AgentKind(str, enum.Enum):
    native = "native"
    browser_extension = "browser_extension"


class EdmFieldType(str, enum.Enum):
    email = "email"
    number = "number"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String, default="")
    data_type: Mapped[DataType] = mapped_column(Enum(DataType))
    detection_method: Mapped[DetectionMethod] = mapped_column(Enum(DetectionMethod))
    channels: Mapped[list] = mapped_column(JSON, default=list)  # list[Channel value]
    action: Mapped[Action] = mapped_column(Enum(Action))
    target_scope: Mapped[dict] = mapped_column(JSON, default=dict)  # {"users": [...], "groups": [...], "devices": [...]}
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    simulate_mode: Mapped[bool] = mapped_column(Boolean, default=True)
    # Only meaningful when data_type == edm_dataset; which reference dataset this policy checks against.
    edm_dataset_id: Mapped[str | None] = mapped_column(ForeignKey("edm_datasets.id"), nullable=True)
    # Only meaningful when data_type == fingerprint_doc; which reference document this policy checks against.
    fingerprint_dataset_id: Mapped[str | None] = mapped_column(ForeignKey("fingerprint_datasets.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now, onupdate=_now)

    incidents: Mapped[list["Incident"]] = relationship(back_populates="policy")


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    # Not unique on its own: the desktop agent and the browser extension both self-register
    # under the same machine hostname (see self_register_agent) so the console can group them
    # as one workstation. Uniqueness is per (hostname, kind) instead; enforced at the
    # application level in agents.py, not here, since SQLite can't cheaply swap a column's
    # unique index on an already-deployed database.
    hostname: Mapped[str] = mapped_column(String, index=True)
    api_key_hash: Mapped[str] = mapped_column(String)
    status: Mapped[AgentStatus] = mapped_column(Enum(AgentStatus), default=AgentStatus.offline)
    kind: Mapped[AgentKind] = mapped_column(Enum(AgentKind), default=AgentKind.native)
    policy_version: Mapped[str] = mapped_column(String, default="")
    last_heartbeat: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)

    incidents: Mapped[list["Incident"]] = relationship(back_populates="agent")


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    policy_id: Mapped[str] = mapped_column(ForeignKey("policies.id"))
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"))
    channel: Mapped[Channel] = mapped_column(Enum(Channel))
    action_taken: Mapped[Action] = mapped_column(Enum(Action))
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    redacted_snippet: Mapped[str] = mapped_column(String)
    rule_id: Mapped[str] = mapped_column(String)
    source_identifier: Mapped[str] = mapped_column(String, default="")  # e.g. file path, redacted
    status: Mapped[IncidentStatus] = mapped_column(Enum(IncidentStatus), default=IncidentStatus.open)
    timestamp: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)
    extra: Mapped[dict] = mapped_column(JSON, default=dict)

    policy: Mapped["Policy"] = relationship(back_populates="incidents")
    agent: Mapped["Agent"] = relationship(back_populates="incidents")

    @property
    def blocked(self) -> bool:
        # action_taken is always the server-computed effective action (see
        # routers/incidents.py::_effective_action) - "block" only appears here when the
        # matching policy actually says to block AND isn't in simulate mode, so this is a
        # plain derived flag, not a second source of truth to keep in sync.
        return self.action_taken == Action.block


class EdmDataset(Base):
    __tablename__ = "edm_datasets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String)
    field_type: Mapped[EdmFieldType] = mapped_column(Enum(EdmFieldType))
    salt: Mapped[str] = mapped_column(String)
    # SHA-256(salt + normalized_value) for every ingested value. Raw values are never stored -
    # they're hashed once at ingestion time and discarded.
    hashes: Mapped[list] = mapped_column(JSON, default=list)
    value_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)


class FingerprintDataset(Base):
    __tablename__ = "fingerprint_datasets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String)
    # CTPH fuzzy hash of the reference document, "blockSize:sigB:sig2B". The raw document
    # content is hashed once at upload and discarded; never stored.
    ctph_hash: Mapped[str] = mapped_column(String)
    source_filename: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)
