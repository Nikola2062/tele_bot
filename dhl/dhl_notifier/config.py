"""Data classes + small CLI parsing helpers.

All configuration is now supplied via command-line arguments to ``main.py``.
This module just defines the shapes and the parsers for the two non-trivial
argument formats (``--poll-times`` and ``--parcel``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Parcel:
    tracking_number: str
    nickname: str | None = None
    service: str | None = None


@dataclass
class Channel:
    kind: str                          # 'telegram' | 'email' | 'whatsapp'
    target: str                        # chat_id / email / phone


@dataclass
class AppConfig:
    dhl_api_key: str
    dhl_api_base: str
    poll_interval_sec: int
    # List of (hour, minute) clock times in local TZ; empty means "use interval".
    poll_times: list[tuple[int, int]]
    state_file: Path
    parcels: list[Parcel] = field(default_factory=list)
    channels: list[Channel] = field(default_factory=list)

    # --- per-channel secrets ---
    telegram_bot_token: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_starttls: bool = True
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_from: str = ""


def parse_times(raw: str) -> list[tuple[int, int]]:
    """Parse 'HH:MM,HH:MM,...' into a sorted list of (hour, minute) tuples."""
    out: list[tuple[int, int]] = []
    for item in (raw or "").split(","):
        item = item.strip()
        if not item:
            continue
        try:
            hh, mm = item.split(":")
            h, m = int(hh), int(mm)
        except ValueError as e:
            raise SystemExit(f"--poll-times: invalid time {item!r}, expected HH:MM") from e
        if not (0 <= h < 24 and 0 <= m < 60):
            raise SystemExit(f"--poll-times: out-of-range time {item!r}")
        out.append((h, m))
    return sorted(set(out))


def parse_parcel(raw: str) -> Parcel:
    """Parse ``tracking_number[:nickname[:service]]`` into a Parcel."""
    parts = raw.split(":", 2)
    tracking_number = parts[0].strip()
    if not tracking_number:
        raise SystemExit(f"--parcel: missing tracking number in {raw!r}")
    nickname = parts[1].strip() if len(parts) > 1 and parts[1].strip() else None
    service = parts[2].strip() if len(parts) > 2 and parts[2].strip() else None
    return Parcel(tracking_number=tracking_number, nickname=nickname, service=service)
