from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models import (
    Action,
    AgentKind,
    AgentStatus,
    Channel,
    DataType,
    DetectionMethod,
    EdmFieldType,
    IncidentStatus,
    RiskThreshold,
)


# --- Auth ---

class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: str
    created_at: datetime


# --- Policy ---

class PolicyBase(BaseModel):
    name: str
    description: str = ""
    data_type: DataType
    detection_method: DetectionMethod
    channels: list[Channel]
    action: Action
    # Only meaningful when action == block; see Policy.risk_threshold in models.py.
    risk_threshold: RiskThreshold | None = None
    target_scope: dict = {}
    enabled: bool = True
    edm_dataset_id: str | None = None
    fingerprint_dataset_id: str | None = None


class PolicyCreate(PolicyBase):
    pass


class PolicyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    data_type: DataType | None = None
    detection_method: DetectionMethod | None = None
    channels: list[Channel] | None = None
    action: Action | None = None
    risk_threshold: RiskThreshold | None = None
    target_scope: dict | None = None
    enabled: bool | None = None
    edm_dataset_id: str | None = None
    fingerprint_dataset_id: str | None = None


class PolicyOut(PolicyBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime
    updated_at: datetime


# --- Agent ---

class AgentRegister(BaseModel):
    hostname: str
    kind: AgentKind = AgentKind.native


class AgentRegisterOut(BaseModel):
    id: str
    hostname: str
    api_key: str  # returned once, plaintext, at registration time only
    default_credit_card_policy_id: str | None = None
    default_password_policy_id: str | None = None


class AgentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    hostname: str
    status: AgentStatus
    online: bool
    kind: AgentKind
    policy_version: str
    last_heartbeat: datetime | None
    # Computed fresh by _agent_out() on every call, not persisted on Agent itself. The heartbeat
    # response is what actually matters here - it's how a paired client learns the console's
    # current default policy changed; list_agents() gets the same value along for free but the
    # console UI doesn't use it.
    default_credit_card_policy_id: str | None = None
    default_password_policy_id: str | None = None


class AgentHeartbeat(BaseModel):
    policy_version: str = ""


class ExtensionStatus(BaseModel):
    installed: bool
    store_url: str


class ChannelStatus(BaseModel):
    installed: bool
    online: bool
    last_heartbeat: datetime | None = None
    policy_version: str = ""


class WorkstationStatus(BaseModel):
    hostname: str | None
    desktop_agent: ChannelStatus
    browser_extension: ChannelStatus
    extension_store_url: str


# --- Incident ---

class IncidentCreate(BaseModel):
    policy_id: str
    channel: Channel
    action_taken: Action
    confidence: float = 1.0
    redacted_snippet: str
    rule_id: str
    source_identifier: str = ""
    extra: dict = {}


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    policy_id: str
    agent_id: str
    channel: Channel
    action_taken: Action
    # Derived from action_taken (== "block"); the channel that reported this incident reads
    # this synchronously to decide whether to actually clear the clipboard, cancel the print
    # job, reject the network request, or block the form submission.
    blocked: bool
    confidence: float
    redacted_snippet: str
    rule_id: str
    source_identifier: str
    status: IncidentStatus
    timestamp: datetime
    extra: dict


class IncidentStatusUpdate(BaseModel):
    status: IncidentStatus


# --- EDM ---

class EdmDatasetCreate(BaseModel):
    name: str
    field_type: EdmFieldType
    values: list[str]


class EdmDatasetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    field_type: EdmFieldType
    value_count: int
    created_at: datetime


class EdmDetectionSet(BaseModel):
    id: str
    field_type: EdmFieldType
    salt: str
    hashes: list[str]


# --- Fingerprints ---

class FingerprintDatasetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    source_filename: str
    created_at: datetime


class FingerprintDetectionSet(BaseModel):
    id: str
    name: str
    ctph_hash: str


# --- Dashboard ---

class ChannelBreakdown(BaseModel):
    channel: Channel
    count: int


class DashboardStats(BaseModel):
    blocked_today: int
    logged_today: int
    active_policies: int
    agents_online: int
    agents_total: int
    false_positive_rate: float
    channel_breakdown: list[ChannelBreakdown]


# --- Site risk ---

class RiskCheckOut(BaseModel):
    domain: str
    score: int
    level: str
    reason: str
