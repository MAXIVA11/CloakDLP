import secrets
import sys
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _data_dir() -> Path:
    # Packaged (frozen) deployments write next to nothing predictable via CWD; a Windows
    # Service's working directory isn't guaranteed; so use a fixed, writable location instead.
    if getattr(sys, "frozen", False):
        import os

        base = Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / "CloakDLP"
        base.mkdir(parents=True, exist_ok=True)
        return base
    return Path(__file__).resolve().parent.parent


def _default_jwt_secret() -> str:
    # Never ship a hardcoded default secret in a packaged build; forgeable auth tokens.
    # Generate one on first run and persist it so restarts keep working sessions valid.
    secret_path = _data_dir() / "jwt_secret.key"
    if secret_path.exists():
        return secret_path.read_text().strip()

    secret = secrets.token_hex(32)
    secret_path.write_text(secret)
    return secret


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = f"sqlite:///{_data_dir() / 'cloakdlp.db'}"
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 12
    cors_origins: list[str] = ["http://localhost:3000"]
    host: str = "127.0.0.1"
    port: int = 8123
    # Set once the browser extension is actually published (see browser-extension/README.md) -
    # left blank until then so the console doesn't point people at a store listing that isn't
    # live yet. The install prompt only renders when this is non-empty.
    extension_store_url: str = ""

    def model_post_init(self, __context) -> None:
        if not self.jwt_secret:
            self.jwt_secret = _default_jwt_secret()


settings = Settings()
