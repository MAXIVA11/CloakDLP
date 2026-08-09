from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models import Action, AgentStatus, Channel, DataType, DetectionMethod, IncidentStatus


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
    target_scope: dict = {}
    enabled: bool = True
    simulate_mode: bool = True


class PolicyCreate(PolicyBase):
    pass


class PolicyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    data_type: DataType | None = None
    detection_method: DetectionMethod | None = None
    channels: list[Channel] | None = None
    action: Action | None = None
    target_scope: dict | None = None
    enabled: bool | None = None
    simulate_mode: bool | None = None


class PolicyOut(PolicyBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime
    updated_at: datetime


# --- Agent ---

class AgentRegister(BaseModel):
    hostname: str


class AgentRegisterOut(BaseModel):
    id: str
    hostname: str
    api_key: str  # returned once, plaintext, at registration time only


class AgentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    hostname: str
    status: AgentStatus
    policy_version: str
    last_heartbeat: datetime | None


class AgentHeartbeat(BaseModel):
    policy_version: str = ""


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
    confidence: float
    redacted_snippet: str
    rule_id: str
    source_identifier: str
    status: IncidentStatus
    timestamp: datetime
    extra: dict


class IncidentStatusUpdate(BaseModel):
    status: IncidentStatus


# --- Dashboard ---

class ChannelBreakdown(BaseModel):
    channel: Channel
    count: int


class DashboardStats(BaseModel):
    blocked_today: int
    flagged_today: int
    logged_today: int
    active_policies: int
    agents_online: int
    agents_total: int
    false_positive_rate: float
    channel_breakdown: list[ChannelBreakdown]
