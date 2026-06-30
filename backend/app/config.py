from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    admin_username: str = "admin"
    admin_password: str = "change-this-password"
    app_secret_key: str = "dev-only-change-me"
    database_url: str = "sqlite:///./data/app.db"
    poll_interval_seconds: int = 30
    request_timeout_seconds: float = 12.0
    cors_origins: str = "http://localhost:5173,http://localhost:8088"
    seed_installation_enabled: bool = False
    seed_installation_customer_name: str = ""
    seed_installation_base_url: str = ""
    seed_installation_client_id: str = ""
    seed_installation_client_secret: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
