from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Agent, User
from app.security import decode_access_token, verify_api_key

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

LOOPBACK_HOSTS = {"127.0.0.1", "::1"}


def require_loopback(request: Request) -> None:
    # CloakDLP is a personal, single-user tool: the console binds to 127.0.0.1 by default, so
    # "the request came from this machine" is the trust boundary for the zero-config flows
    # (local auto-login, agent self-registration) — nothing to type, nothing to copy-paste.
    client_host = request.client.host if request.client else None
    if client_host not in LOOPBACK_HOSTS:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Loopback only")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user_id = decode_access_token(token)
    if user_id is None:
        raise credentials_error
    user = db.get(User, user_id)
    if user is None:
        raise credentials_error
    return user


def get_current_agent(
    x_agent_id: str = Header(...),
    x_api_key: str = Header(...),
    db: Session = Depends(get_db),
) -> Agent:
    agent = db.get(Agent, x_agent_id)
    if agent is None or not verify_api_key(x_api_key, agent.api_key_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid agent credentials")
    return agent
