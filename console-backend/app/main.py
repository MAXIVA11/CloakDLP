import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.bootstrap import ensure_default_policy
from app.config import settings
from app.database import Base, engine
from app.migrations import run_migrations
from app.routers import agents, auth, dashboard, edm, fingerprints, incidents, policies, ws

Base.metadata.create_all(bind=engine)
run_migrations()
ensure_default_policy()

app = FastAPI(title="CloakDLP Console API", version="0.1.0")

# Only needed for local dev, where the frontend (npm run dev, port 3000) and backend run as
# separate origins. The packaged app serves the frontend from the same origin as the API, so it
# needs no CORS at all; and shipping this permissively in the packaged build was a real bug:
# any other local process bound to port 3000 could read authenticated responses (including
# local-login's token) via a credentialed cross-origin fetch. No CORS middleware means the
# browser's default same-origin policy applies, which is exactly what the packaged app wants.
if not getattr(sys, "frozen", False):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth.router)
app.include_router(policies.router)
app.include_router(agents.router)
app.include_router(incidents.router)
app.include_router(edm.router)
app.include_router(fingerprints.router)
app.include_router(dashboard.router)
app.include_router(ws.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serves the console frontend's static export (console-frontend/out/, copied to static/ by the
# packaging script) so a single packaged process serves both the API and the UI; no Node.js
# runtime needed on the install target. Not present in normal backend-only dev; mount is a no-op
# then. Registered last so /api/* and /ws/* are always matched first.
_base_dir = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent
_static_dir = _base_dir / "static"
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
