from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SCOPES = {
    "BROWSER_LIST_REQUEST": "browser.discovery",
    "PROFILE_LIST_REQUEST": "profile.discovery",
    "HISTORY_QUERY": "history.read",
    "LOGIN_INVENTORY_QUERY": "login.inventory",
    "TRAFFIC_STATS_REQUEST": "traffic.aggregate",
    "CONNECTIONS_QUERY": "traffic.connections",
    "HTTP_EVENTS_QUERY": "traffic.http",
}
RESPONSES = dict(
    zip(
        SCOPES,
        [
            "BROWSER_LIST_RESPONSE",
            "PROFILE_LIST_RESPONSE",
            "HISTORY_RESPONSE",
            "LOGIN_INVENTORY_RESPONSE",
            "TRAFFIC_STATS_RESPONSE",
            "CONNECTIONS_RESPONSE",
            "HTTP_EVENTS_RESPONSE",
        ],
        strict=True,
    )
)


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Credentials(Strict):
    email: str = Field(
        min_length=3, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    )
    password: str = Field(min_length=12, max_length=256)


class PairStart(Strict):
    display_name: str = Field(min_length=1, max_length=120)
    operating_system: Literal["linux", "windows", "darwin", "macos"]
    architecture: str = Field(min_length=1, max_length=32)
    public_key: str = Field(min_length=32, max_length=4096)


class PairApprove(Strict):
    code: str = Field(min_length=8, max_length=16)
    scopes: list[str] = Field(min_length=1, max_length=7)


class PairPoll(Strict):
    pairing_id: str = Field(max_length=36)
    poll_token: str = Field(max_length=128)


class QueryParams(Strict):
    browser_id: str | None = Field(default=None, max_length=128)
    profile_id: str | None = Field(default=None, max_length=128)
    search: str = Field(default="", max_length=200)
    page: int = Field(default=1, strict=True, ge=1, le=100000)
    page_size: int = Field(default=50, strict=True, ge=1, le=200)
    cursor: str | None = Field(default=None, min_length=1, max_length=2048)
    stream: bool = Field(default=False, strict=True)
    sample_count: int | None = Field(default=None, strict=True, ge=1, le=20)
    interval_ms: int | None = Field(default=None, strict=True, ge=1000, le=5000)
    start: datetime | None = None
    end: datetime | None = None
    sort: Literal["asc", "desc"] = "desc"


class Query(Strict):
    type: Literal[
        "BROWSER_LIST_REQUEST",
        "PROFILE_LIST_REQUEST",
        "HISTORY_QUERY",
        "LOGIN_INVENTORY_QUERY",
        "TRAFFIC_STATS_REQUEST",
        "CONNECTIONS_QUERY",
        "HTTP_EVENTS_QUERY",
    ]
    params: QueryParams = Field(default_factory=QueryParams)


class EmailInput(Strict):
    email: str = Field(max_length=254)


class TokenInput(Strict):
    token: str = Field(max_length=128)


class ResetInput(TokenInput):
    password: str = Field(min_length=12, max_length=256)


class ScopeUpdate(Strict):
    scopes: list[str] = Field(max_length=7)


class MonitoringUpdate(Strict):
    paused: bool = Field(strict=True)
