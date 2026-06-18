from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    woohoo_consumer_key: str = Field(alias="WOOHOO_CONSUMER_KEY")
    woohoo_consumer_secret: str = Field(alias="WOOHOO_CONSUMER_SECRET")
    woohoo_username: str = Field(alias="WOOHOO_USERNAME")
    woohoo_password: str = Field(alias="WOOHOO_PASSWORD")
    woohoo_base_url: str = Field(
        default="https://sandbox.woohoo.in",
        alias="WOOHOO_BASE_URL",
    )
    woohoo_auth_mode: str = Field(default="oauth2", alias="WOOHOO_AUTH_MODE")
    woohoo_oauth2_verify_url: str = Field(default="", alias="WOOHOO_OAUTH2_VERIFY_URL")
    woohoo_oauth2_token_url: str = Field(default="", alias="WOOHOO_OAUTH2_TOKEN_URL")
    woohoo_request_signature_header: str = Field(
        default="signature",
        alias="WOOHOO_REQUEST_SIGNATURE_HEADER",
    )
    woohoo_signature_json_pretty: bool = Field(
        default=False,
        alias="WOOHOO_SIGNATURE_JSON_PRETTY",
    )
    woohoo_request_timeout: int = Field(default=60, alias="WOOHOO_REQUEST_TIMEOUT")
    woohoo_max_retries: int = Field(default=3, alias="WOOHOO_MAX_RETRIES")

    database_url: str = Field(alias="DATABASE_URL")

    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    @property
    def sqlalchemy_database_url(self) -> str:
        url = self.database_url
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+psycopg2://", 1)
        if url.startswith("postgresql://") and "+psycopg2" not in url:
            return url.replace("postgresql://", "postgresql+psycopg2://", 1)
        return url

    @property
    def base_url(self) -> str:
        return self.woohoo_base_url.rstrip("/")

    @property
    def oauth2_verify_url(self) -> str:
        if self.woohoo_oauth2_verify_url.strip():
            return self.woohoo_oauth2_verify_url.strip()
        return f"{self.base_url}/oauth2/verify"

    @property
    def oauth2_token_url(self) -> str:
        raw = self.woohoo_oauth2_token_url.strip() or f"{self.base_url}/oauth2/token"
        return raw.replace("/oauth/token", "/oauth2/token")

    @property
    def uses_oauth2(self) -> bool:
        return self.woohoo_auth_mode.strip().lower() == "oauth2"


@lru_cache
def get_settings() -> Settings:
    return Settings()
