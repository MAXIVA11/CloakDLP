import io
import socket
import sys
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.bootstrap import DEFAULT_PASSWORD_POLICY_NAME, DEFAULT_POLICY_NAME
from app.config import settings
from app.database import get_db
from app.deps import get_current_agent, get_current_user, require_loopback
from app.models import Agent, AgentKind, AgentStatus, DataType, Incident, Policy
from app.schemas import (
    AgentHeartbeat,
    AgentOut,
    AgentRegister,
    AgentRegisterOut,
    ChannelStatus,
    ExtensionStatus,
    WorkstationStatus,
)
from app.security import generate_agent_api_key, hash_api_key

router = APIRouter(prefix="/api/agents", tags=["agents"])

# An agent that hasn't heartbeaten within this window reads as offline, regardless of what its
# last-persisted `status` says. `status` only ever gets set to "online" (on heartbeat) and never
# flips back on its own if the process dies or the extension gets uninstalled; recency is the
# only signal that's actually trustworthy.
ONLINE_THRESHOLD = timedelta(minutes=10)


def _is_online(agent: Agent) -> bool:
    if agent.last_heartbeat is None:
        return False
    last = agent.last_heartbeat
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - last < ONLINE_THRESHOLD


def _agent_out(agent: Agent, db: Session) -> AgentOut:
    return AgentOut(
        id=agent.id,
        hostname=agent.hostname,
        status=agent.status,
        online=_is_online(agent),
        kind=agent.kind,
        policy_version=agent.policy_version,
        last_heartbeat=agent.last_heartbeat,
        # Lets a paired client (desktop agent, browser extension) notice a policy change without
        # ever re-registering: self-register only runs once, at first pairing, so a client that
        # cached the policy id it got back then would otherwise never learn the console's
        # current default changed - disabled, replaced, or just edited - no matter how long it
        # stayed paired. Every heartbeat carries the live answer instead.
        default_credit_card_policy_id=_default_credit_card_policy_id(db),
        default_password_policy_id=_default_password_policy_id(db),
    )


def _channel_status(agent: Agent | None) -> ChannelStatus:
    if agent is None:
        return ChannelStatus(installed=False, online=False)
    return ChannelStatus(
        installed=True,
        online=_is_online(agent),
        last_heartbeat=agent.last_heartbeat,
        policy_version=agent.policy_version,
    )


def _default_policy_id(db: Session, data_type: DataType, preferred_name: str) -> str | None:
    policy = (
        db.query(Policy)
        .filter(Policy.data_type == data_type, Policy.enabled.is_(True))
        .order_by((Policy.name != preferred_name).asc(), Policy.created_at.asc())
        .first()
    )
    return policy.id if policy else None


def _default_credit_card_policy_id(db: Session) -> str | None:
    return _default_policy_id(db, DataType.credit_card, DEFAULT_POLICY_NAME)


def _default_password_policy_id(db: Session) -> str | None:
    return _default_policy_id(db, DataType.credentials, DEFAULT_PASSWORD_POLICY_NAME)


@router.get("", response_model=list[AgentOut], dependencies=[Depends(get_current_user)])
def list_agents(db: Session = Depends(get_db)):
    agents = db.query(Agent).order_by(Agent.hostname).all()
    return [_agent_out(a, db) for a in agents]


def _pick_representative(db: Session, kind: AgentKind) -> Agent | None:
    # Prefer whichever agent of this kind is actually reporting in (most recent heartbeat) over
    # whichever happens to have the newest row; a stale manually-registered test/junk agent
    # with no heartbeat shouldn't outrank the real one just because it was created later.
    return (
        db.query(Agent)
        .filter(Agent.kind == kind)
        .order_by(Agent.last_heartbeat.is_(None), Agent.last_heartbeat.desc(), Agent.created_at.desc())
        .first()
    )


@router.get("/workstation", response_model=WorkstationStatus, dependencies=[Depends(get_current_user)])
def workstation_status(db: Session = Depends(get_db)):
    """CloakDLP only ever runs on one machine per install; the console binds to loopback, so
    there's no such thing as a 'fleet' here. This collapses the two independent reporters (the
    desktop agent and the browser extension) into a single per-workstation view instead of
    making the user reconcile a table of oddly-named rows themselves."""
    native = _pick_representative(db, AgentKind.native)
    extension = _pick_representative(db, AgentKind.browser_extension)
    hostname = native.hostname if native else (extension.hostname if extension else None)
    return WorkstationStatus(
        hostname=hostname,
        desktop_agent=_channel_status(native),
        browser_extension=_channel_status(extension),
        extension_store_url=settings.extension_store_url,
    )


@router.delete("/{agent_id}", status_code=204, dependencies=[Depends(get_current_user)])
def delete_agent(agent_id: str, db: Session = Depends(get_db)):
    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    # Incident.agent_id is NOT NULL, and incident history is the one thing this whole app
    # exists to preserve; silently nulling it out (SQLAlchemy's default when a relationship
    # has no cascade configured) would just crash with an IntegrityError, and cascading the
    # delete would destroy real incident history for a merely-stale agent record. Neither is
    # acceptable, so this blocks with a clear reason instead.
    has_incidents = db.query(Incident.id).filter(Incident.agent_id == agent_id).first() is not None
    if has_incidents:
        raise HTTPException(
            status_code=409,
            detail="This agent has incident history and can't be removed. Resolve or ignore its "
            "incidents first, or wait for it to re-pair under a fresh record instead.",
        )
    db.delete(agent)
    db.commit()


@router.post("/register", response_model=AgentRegisterOut, dependencies=[Depends(get_current_user)])
def register_agent(payload: AgentRegister, db: Session = Depends(get_db)):
    existing = db.query(Agent).filter(Agent.hostname == payload.hostname, Agent.kind == payload.kind).first()
    if existing:
        raise HTTPException(status_code=400, detail="An agent of this kind is already registered for this hostname")
    api_key = generate_agent_api_key()
    agent = Agent(hostname=payload.hostname, api_key_hash=hash_api_key(api_key), status=AgentStatus.offline, kind=payload.kind)
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return AgentRegisterOut(
        id=agent.id,
        hostname=agent.hostname,
        api_key=api_key,
        default_credit_card_policy_id=_default_credit_card_policy_id(db),
        default_password_policy_id=_default_password_policy_id(db),
    )


@router.get("/extension-status", response_model=ExtensionStatus, dependencies=[Depends(get_current_user)])
def extension_status(db: Session = Depends(get_db)):
    installed = db.query(Agent).filter(Agent.kind == AgentKind.browser_extension).first() is not None
    return ExtensionStatus(installed=installed, store_url=settings.extension_store_url)


def _extension_zip_path() -> Path | None:
    # installer/build.ps1 puts the prebuilt zip at ..\extension\ next to console\, agent\,
    # tray\ under Program Files; a sibling of the directory the packaged exe runs from.
    base_dir = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parents[2]
    packaged = base_dir.parent / "extension" / "CloakDLP-browser-extension.zip"
    return packaged if packaged.is_file() else None


def _extension_source_dir() -> Path | None:
    # Dev fallback: the repo's own browser-extension/ directory, zipped on the fly, so this
    # endpoint works without running the packaging script first.
    base_dir = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parents[2]
    source = base_dir.parent / "browser-extension"
    return source if source.is_dir() else None


@router.get("/extension-download", dependencies=[Depends(require_loopback)])
def extension_download():
    # Loopback-only rather than user-authenticated: this is a plain <a href download> link, and
    # simple link navigation doesn't carry the Authorization header a fetch() call would. The
    # payload is just the extension's own public source, nothing sensitive; same trust
    # boundary as everything else that's loopback-gated for zero-friction access.
    zip_path = _extension_zip_path()
    if zip_path is not None:
        return FileResponse(zip_path, media_type="application/zip", filename="CloakDLP-browser-extension.zip")

    source_dir = _extension_source_dir()
    if source_dir is None:
        raise HTTPException(status_code=404, detail="Extension source not found")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in source_dir.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(source_dir))
    buffer.seek(0)
    headers = {"Content-Disposition": 'attachment; filename="CloakDLP-browser-extension.zip"'}
    return StreamingResponse(buffer, media_type="application/zip", headers=headers)


@router.post("/self-register", response_model=AgentRegisterOut, dependencies=[Depends(require_loopback)])
def self_register_agent(payload: AgentRegister, db: Session = Depends(get_db)):
    """Zero-config pairing: the agent calls this on first startup instead of requiring an
    operator to register it from the console and paste an API key into a config file. Loopback
    only; only something running on this same machine can reach it, which is also why the
    hostname it registers under is computed here rather than trusted from the payload: self-
    register is always called from this machine, by definition, so the desktop agent and the
    browser extension both land on the console's own hostname and group together as one
    workstation instead of the extension's placeholder string showing up as a stranger. Idempotent
    per (hostname, kind): if this host already has an agent record of that kind (e.g. credentials
    were lost after a reinstall), issues a fresh API key for it rather than erroring, since we
    can't recover the old one from its stored hash anyway."""
    hostname = socket.gethostname()
    agent = db.query(Agent).filter(Agent.hostname == hostname, Agent.kind == payload.kind).first()
    api_key = generate_agent_api_key()
    if agent is None:
        agent = Agent(hostname=hostname, api_key_hash=hash_api_key(api_key), status=AgentStatus.offline, kind=payload.kind)
        db.add(agent)
    else:
        agent.api_key_hash = hash_api_key(api_key)
    db.commit()
    db.refresh(agent)
    return AgentRegisterOut(
        id=agent.id,
        hostname=agent.hostname,
        api_key=api_key,
        default_credit_card_policy_id=_default_credit_card_policy_id(db),
        default_password_policy_id=_default_password_policy_id(db),
    )


@router.post("/heartbeat", response_model=AgentOut)
def heartbeat(
    payload: AgentHeartbeat,
    agent: Agent = Depends(get_current_agent),
    db: Session = Depends(get_db),
):
    agent.status = AgentStatus.online
    agent.last_heartbeat = datetime.now(timezone.utc)
    if payload.policy_version:
        agent.policy_version = payload.policy_version
    db.commit()
    db.refresh(agent)
    return _agent_out(agent, db)
