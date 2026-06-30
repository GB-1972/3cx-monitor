from typing import Any

from pydantic import BaseModel, Field, HttpUrl


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str


class InstallationCreate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=200)
    base_url: HttpUrl
    client_id: str = Field(min_length=1, max_length=200)
    client_secret: str = Field(min_length=1)
    enabled: bool = True


class InstallationUpdate(BaseModel):
    customer_name: str | None = Field(default=None, min_length=1, max_length=200)
    base_url: HttpUrl | None = None
    client_id: str | None = Field(default=None, min_length=1, max_length=200)
    client_secret: str | None = Field(default=None, min_length=1)
    enabled: bool | None = None


class InstallationOut(BaseModel):
    id: int
    customer_name: str
    base_url: str
    client_id: str
    enabled: bool


class SnapshotOut(BaseModel):
    installation_id: int
    customer_name: str
    base_url: str
    status: str
    message: str
    checked_at: str | None
    data: dict[str, Any]

