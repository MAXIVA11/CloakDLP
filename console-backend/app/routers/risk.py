import asyncio

from fastapi import APIRouter, Depends, Query

from app.deps import get_current_agent
from app.models import Agent
from app.risk_scoring import score_domain
from app.schemas import RiskCheckOut

router = APIRouter(prefix="/api/risk", tags=["risk"])


@router.get("/check", response_model=RiskCheckOut)
async def check_domain_risk(domain: str = Query(...), agent: Agent = Depends(get_current_agent)):
    # A standalone lookup, not tied to any incident: the browser extension calls this on every
    # top-frame navigation, before the user has typed anything, so it can warn on a risky site
    # up front rather than only after a card number was already caught mid-submission. Reuses
    # score_domain()'s existing URLhaus + WHOIS-age scoring and its 24h in-memory cache, so this
    # costs nothing extra beyond what the incident-time risk lookup already pays for.
    result = await asyncio.to_thread(score_domain, domain)
    return RiskCheckOut(domain=domain.lower().strip(), score=result.score, level=result.level, reason=result.reason)
