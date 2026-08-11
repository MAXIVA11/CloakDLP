"""Domain risk scoring for card-entry incidents. Both data sources are free and need no API
key or account: the URLhaus malware/phishing hostname blocklist (abuse.ch, no signup) and raw
WHOIS domain-age lookups (python-whois, queries the WHOIS protocol directly). Results are
cached in memory; a fresh process re-fetches the blocklist and re-queries WHOIS for domains it
hasn't seen since restart, which is an acceptable tradeoff for how infrequently a personal
install restarts versus how often the same handful of shopping sites get charged again.
"""

import logging
import time
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone

logger = logging.getLogger("cloakdlp.risk_scoring")

URLHAUS_HOSTFILE_URL = "https://urlhaus.abuse.ch/downloads/hostfile/"
BLOCKLIST_TTL_SECONDS = 6 * 60 * 60  # 6 hours
DOMAIN_CACHE_TTL_SECONDS = 24 * 60 * 60  # 24 hours


@dataclass
class RiskResult:
    score: int  # 0-100, higher = riskier
    level: str  # "low" | "medium" | "high" | "unknown"
    reason: str


_blocklist: set[str] = set()
_blocklist_fetched_at: float = 0.0
_domain_cache: dict[str, tuple[float, RiskResult]] = {}


def _refresh_blocklist() -> None:
    global _blocklist, _blocklist_fetched_at
    if time.time() - _blocklist_fetched_at < BLOCKLIST_TTL_SECONDS:
        return
    try:
        req = urllib.request.Request(URLHAUS_HOSTFILE_URL, headers={"User-Agent": "CloakDLP/0.1"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read().decode("utf-8", errors="ignore")
        hosts = set()
        for line in data.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) >= 2:
                hosts.add(parts[1].lower())
        _blocklist = hosts
        _blocklist_fetched_at = time.time()
    except Exception:
        # Offline, or abuse.ch is unreachable; degrade to WHOIS-only scoring rather than fail.
        pass


def _check_blocklist(domain: str) -> RiskResult | None:
    _refresh_blocklist()
    if domain.lower() in _blocklist:
        return RiskResult(score=100, level="high", reason="listed on the URLhaus malware/phishing blocklist")
    return None


def _check_domain_age(domain: str) -> RiskResult:
    try:
        import whois  # imported lazily: pulls in a fair bit for a rarely-hit code path

        record = whois.whois(domain)
        creation = record.creation_date
        if isinstance(creation, list):
            creation = creation[0] if creation else None
        if creation is None:
            return RiskResult(score=50, level="unknown", reason="couldn't determine domain registration age")

        if creation.tzinfo is None:
            creation = creation.replace(tzinfo=timezone.utc)
        age_days = (datetime.now(timezone.utc) - creation).days

        if age_days < 30:
            return RiskResult(score=80, level="high", reason=f"domain registered {age_days} day(s) ago")
        if age_days < 180:
            return RiskResult(score=50, level="medium", reason=f"domain registered {age_days} day(s) ago")
        if age_days < 365:
            return RiskResult(score=30, level="medium", reason=f"domain is under a year old ({age_days} days)")
        years = age_days // 365
        return RiskResult(score=10, level="low", reason=f"domain has an established history (~{years} year(s) old)")
    except Exception as exc:
        # Swallowing broadly is intentional; a WHOIS failure degrades to "unknown" rather than
        # ever blocking incident ingestion; but logging *why* matters: WHOIS runs from inside
        # the Windows Service process, which can have different outbound network permissions
        # (firewall rules, AV policy) than an interactive user session, so failures here can be
        # invisible unless they're actually written down somewhere.
        logger.warning("WHOIS lookup failed for %s: %s: %s", domain, type(exc).__name__, exc)
        return RiskResult(score=50, level="unknown", reason="WHOIS lookup failed or unsupported for this domain")


def score_domain(domain: str) -> RiskResult:
    domain = domain.lower().strip()

    cached = _domain_cache.get(domain)
    if cached and time.time() - cached[0] < DOMAIN_CACHE_TTL_SECONDS:
        return cached[1]

    result = _check_blocklist(domain) or _check_domain_age(domain)
    _domain_cache[domain] = (time.time(), result)
    return result
