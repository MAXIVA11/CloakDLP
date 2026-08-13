"""Runs once at startup so the console is useful with zero manual setup: no policy to create,
no agent to register by hand. See app/routers/auth.py (local-login) and
app/routers/agents.py (self-register) for the other halves of the zero-config story."""

from app.database import SessionLocal
from app.models import Action, Channel, DataType, DetectionMethod, Policy

DEFAULT_POLICY_NAME = "Credit Card Entry"
DEFAULT_PASSWORD_POLICY_NAME = "Login Credential Entry"


def ensure_default_policy() -> None:
    db = SessionLocal()
    try:
        exists = db.query(Policy).filter(Policy.name == DEFAULT_POLICY_NAME).first()
        if exists:
            return

        policy = Policy(
            name=DEFAULT_POLICY_NAME,
            description=(
                "Flags every time a credit card number is entered or transmitted, on any "
                "channel. Starts in flag-only mode; switch the action to Block and turn off "
                "Simulate mode to actually stop it (clears the clipboard, cancels the print "
                "job, rejects the network request, or blocks the form submission, depending "
                "on the channel)."
            ),
            data_type=DataType.credit_card,
            detection_method=DetectionMethod.regex,
            channels=[Channel.network.value, Channel.clipboard.value, Channel.file.value],
            action=Action.flag,
            enabled=True,
            simulate_mode=True,
        )
        db.add(policy)
        db.commit()
    finally:
        db.close()


def ensure_default_password_policy() -> None:
    db = SessionLocal()
    try:
        exists = db.query(Policy).filter(Policy.name == DEFAULT_PASSWORD_POLICY_NAME).first()
        if exists:
            return

        policy = Policy(
            name=DEFAULT_PASSWORD_POLICY_NAME,
            description=(
                "Flags when a password is submitted on a site whose domain looks risky "
                "(newly registered, or a known malware/phishing host). Never inspects or "
                "transmits the password itself, only that one was entered. Browser extension "
                "only - a login form isn't something the desktop agent's clipboard/print/network "
                "channels can meaningfully see. Switch the action to Block to show a "
                "'this looks risky, continue anyway?' confirmation before the login goes "
                "through; leave the risk threshold set (this only ever fires on network-channel "
                "matches, which always carry a domain to score), since an unconditional block "
                "here would stop every login on every site."
            ),
            data_type=DataType.credentials,
            detection_method=DetectionMethod.regex,
            channels=[Channel.network.value],
            action=Action.flag,
            risk_threshold=None,
            enabled=True,
            simulate_mode=True,
        )
        db.add(policy)
        db.commit()
    finally:
        db.close()
