"""Entry point for the packaged build (PyInstaller). Local dev uses `uvicorn app.main:app`
directly instead; this only exists so the packaged exe has something to run."""

import uvicorn

from app.config import settings
from app.main import app

if __name__ == "__main__":
    uvicorn.run(app, host=settings.host, port=settings.port, log_level="info")
