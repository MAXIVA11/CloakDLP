"""Runs once at startup so the console is useful with zero manual setup: no policy to create,
no agent to register by hand. See app/routers/auth.py (local-login) and
app/routers/agents.py (self-register) for the other halves of the zero-config story."""

from app.database import SessionLocal
from app.models import Action, Channel, DataType, DetectionMethod, Policy

DEFAULT_POLICY_NAME = "Credit Card Entry"


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
                "channel. Never blocks — this is an awareness tool, not an enforcement one."
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
