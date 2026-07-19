"""DHL Shipment Tracking - Unified API client.

Single endpoint:
    GET {base}/track/shipments?trackingNumber=...&service=...&language=en
    headers: DHL-API-Key: <key>

Docs: https://developer.dhl.com/api-reference/shipment-tracking
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

import requests


@dataclass(frozen=True)
class Event:
    occurred_at: datetime
    status_text: str
    status_code: str | None
    description: str | None
    location: str | None
    raw: dict[str, Any]


class DHLError(Exception):
    pass


class DHLNotFound(DHLError):
    pass


class DHLRateLimited(DHLError):
    pass


class DHLClient:
    def __init__(self, *, base_url: str, api_key: str, timeout: float = 15.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self._session = requests.Session()
        self._session.headers.update(
            {"DHL-API-Key": api_key, "Accept": "application/json"}
        )

    def get_events(
        self,
        tracking_number: str,
        *,
        service: str | None = None,
        language: str = "en",
    ) -> list[Event]:
        params: dict[str, str] = {
            "trackingNumber": tracking_number,
            "language": language,
        }
        if service:
            params["service"] = service

        resp = self._session.get(
            f"{self.base_url}/track/shipments",
            params=params,
            timeout=self.timeout,
        )

        if resp.status_code == 404:
            raise DHLNotFound(f"no shipment for {tracking_number}")
        if resp.status_code == 429:
            raise DHLRateLimited(
                f"rate limited; retry-after={resp.headers.get('Retry-After')}"
            )
        if not resp.ok:
            raise DHLError(f"DHL HTTP {resp.status_code}: {resp.text[:300]}")

        body = resp.json() or {}
        shipments = body.get("shipments") or []
        if not shipments:
            raise DHLNotFound(f"empty response for {tracking_number}")

        events_raw = shipments[0].get("events") or []
        events: list[Event] = []
        for ev in events_raw:
            ts = ev.get("timestamp")
            try:
                occurred_at = (
                    datetime.fromisoformat(ts.replace("Z", "+00:00")) if ts else None
                )
            except (ValueError, AttributeError):
                occurred_at = None
            if not occurred_at:
                continue

            addr = (ev.get("location") or {}).get("address") or {}
            location = (
                ", ".join(
                    p for p in (addr.get("addressLocality"), addr.get("countryCode")) if p
                )
                or None
            )

            # DHL returns three status fields per event:
            #   - description : human-readable sentence (best for display)
            #   - status      : carrier-specific text or short code (e.g. "VA")
            #   - statusCode  : canonical pre-transit | transit | delivered | failure | unknown
            # Prefer the most descriptive one available.
            description = ev.get("description")
            raw_status = ev.get("status")
            status_code = ev.get("statusCode")
            status_text = (
                description
                or (raw_status if raw_status and len(str(raw_status)) > 3 else None)
                or (status_code or "update").replace("-", " ").capitalize()
            )

            events.append(
                Event(
                    occurred_at=occurred_at,
                    status_text=str(status_text),
                    status_code=status_code,
                    description=description,
                    location=location,
                    raw=ev,
                )
            )

        events.sort(key=lambda e: e.occurred_at)
        return events
