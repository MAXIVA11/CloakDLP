from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import agents, auth, dashboard, edm, fingerprints, incidents, policies, ws

Base.metadata.create_all(bind=engine)

app = FastAPI(title="CloakDLP Console API", version="0.1.0")

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
