"""Persist 'last seen event hashes' in a single JSON file.

Layout:
    {
      "<tracking_number>": {
        "seen_hashes": ["abc...", "def..."],
        "last_status": "In transit",
        "updated_at": "2026-05-14T10:00:00+00:00"
      }
    }
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from dhl_notifier.dhl import Event


def event_hash(ev: Event) -> str:
    blob = "|".join(
        (
            ev.occurred_at.isoformat(),
            ev.status_code or "",
            ev.status_text or "",
            ev.location or "",
            ev.description or "",
        )
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


class StateStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._data: dict[str, dict] = self._load()

    def _load(self) -> dict[str, dict]:
        if not self.path.exists():
            return {}
        try:
            return json.loads(self.path.read_text() or "{}")
        except json.JSONDecodeError:
            return {}

    def save(self) -> None:
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(self._data, indent=2, sort_keys=True))
        os.replace(tmp, self.path)              # atomic on POSIX

    def known_hashes(self, tracking_number: str) -> set[str]:
        return set(self._data.get(tracking_number, {}).get("seen_hashes", []))

    def is_first_run(self, tracking_number: str) -> bool:
        return tracking_number not in self._data

    def record(
        self,
        tracking_number: str,
        *,
        new_hashes: list[str],
        last_status: str | None,
    ) -> None:
        entry = self._data.setdefault(
            tracking_number,
            {"seen_hashes": [], "last_status": None, "updated_at": None},
        )
        seen = set(entry.get("seen_hashes", []))
        seen.update(new_hashes)
        # Keep the file small: only the most recent ~200 hashes per parcel.
        entry["seen_hashes"] = list(seen)[-200:]
        if last_status:
            entry["last_status"] = last_status
        entry["updated_at"] = datetime.now(timezone.utc).isoformat()
