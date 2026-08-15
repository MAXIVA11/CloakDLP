import secrets

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_loopback
from app.models import User
from app.schemas import Token, UserOut
from app.security import create_access_token, hash_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

LOCAL_USER_EMAIL = "local-admin@cloakdlp.local"


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/local-login", response_model=Token, dependencies=[Depends(require_loopback)])
def local_login(db: Session = Depends(get_db)):
    """Zero-config sign-in for the console's own machine: anyone who can reach this API on
    127.0.0.1 already has whatever access they need (they're sitting at the keyboard, or they
    are the agent/tray app running as the same user); no password to set or remember. Gets or
    creates the single local admin account. Not available over any non-loopback binding."""
    user = db.query(User).filter(User.email == LOCAL_USER_EMAIL).first()
    if user is None:
        user = User(email=LOCAL_USER_EMAIL, hashed_password=hash_password(secrets.token_urlsafe(32)))
        db.add(user)
        db.commit()
        db.refresh(user)
    return Token(access_token=create_access_token(user.id))
