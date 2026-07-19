"""Telegram-Hub daemon mode: env-configured, registry-driven polling.

The Node bot (Telegram_Hub/bot) writes the parcel registry via /track:

    {
      "parcels": [
        {
          "tracking_number": "00340434161094015902",
          "chat_id": 123456789,
          "label": "shoes" | null,
          "added_at": "2026-07-18T10:00:00.000Z",
          "delivered": false
        }
      ]
    }

This daemon reloads that registry fresh at every scheduled poll, polls the
DHL API once per active (non-delivered) parcel, notifies the parcel's own
chat_id on new events, and flips ``delivered`` in the registry (atomic
write) when a parcel arrives, sending a final "tracking stopped" message.

Configuration is environment-only:

    DHL_API_KEY         required ? DHL Shipment Tracking API key
    TELEGRAM_BOT_TOKEN  required ? same bot token the Node bot uses
    DHL_API_BASE        default https://api-eu.dhl.com
    DHL_POLL_TIMES      default "06:00,18:00" (Europe/Berlin, HH:MM,HH:MM)
    PARCELS_FILE        default ../data/parcels.json
    DHL_STATE_FILE      default ../data/dhl_state.json

The classic CLI-args mode of main.py is untouched; ``python main.py --daemon``
routes here. Pass ``--once`` too for a single poll cycle (useful with cron).
"""

from __future__ import annotations

import json
import os
import signal
import time
from datetime import datetime, time as dtime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from dhl_notifier.config import AppConfig, parse_times
from dhl_notifier.dhl import DHLClient, DHLError, DHLNotFound, DHLRateLimited, Event
from dhl_notifier.notifiers import EventLine, Update, send_telegram, send_telegram_text
from dhl_notifier.state import StateStore, event_hash

BERLIN_TZ = ZoneInfo("Europe/Berlin")

# Free tier is 250 calls/day: poll only at DHL_POLL_TIMES and pause between parcels.
PER_PARCEL_SLEEP_SEC = 3.0

_stop = False


def _handle_sig(signum, frame):  # noqa: ARG001
    global _stop
    _stop = True
    print("\nstopping after current poll...")


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


# --------------------------- scheduling (mirrors main.py) ---------------------


def next_scheduled(now: datetime, times: list[tuple[int, int]]) -> datetime:
    """Earliest datetime in ``times`` strictly after ``now`` (local tz)."""
    today = now.date()
    candidates = [
        datetime.combine(today, dtime(h, m), tzinfo=now.tzinfo) for h, m in times
    ]
    candidates += [
        datetime.combine(today + timedelta(days=1), dtime(h, m), tzinfo=now.tzinfo)
        for h, m in times
    ]
    return min(c for c in candidates if c > now)


def _sleep_until(when: datetime) -> None:
    """Sleep until ``when`` in 1-second steps so Ctrl-C is responsive."""
    while not _stop:
        remaining = (when - datetime.now(when.tzinfo)).total_seconds()
        if remaining <= 0:
            return
        time.sleep(min(remaining, 1.0))


def diff_new_events(parcel_known: bool, known: set[str], events: list[Event]) -> list[Event]:
    """First time we see a parcel: only the latest event (avoid history spam)."""
    if not events:
        return []
    if not parcel_known:
        return [events[-1]]
    return [e for e in events if event_hash(e) not in known]


# --------------------------- parcels.json registry ----------------------------


def load_registry(path: Path) -> dict:
    """Read the shared registry; tolerate a missing or half-formed file."""
    if not path.exists():
        return {"parcels": []}
    try:
        data = json.loads(path.read_text() or "{}")
    except json.JSONDecodeError:
        return {"parcels": []}
    if not isinstance(data, dict) or not isinstance(data.get("parcels"), list):
        return {"parcels": []}
    return data


def save_registry(path: Path, data: dict) -> None:
    """Atomic write (tmp + rename) ? the Node bot reads/writes this file too."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n")
    os.replace(tmp, path)


def active_parcels(registry: dict) -> list[dict]:
    return [
        p
        for p in registry.get("parcels", [])
        if p.get("tracking_number") and not p.get("delivered")
    ]


def mark_delivered(path: Path, tracking_number: str) -> None:
    """Re-load fresh before flipping the flag so bot-side edits aren't clobbered."""
    registry = load_registry(path)
    changed = False
    for p in registry.get("parcels", []):
        if p.get("tracking_number") == tracking_number and not p.get("delivered"):
            p["delivered"] = True
            changed = True
    if changed:
        save_registry(path, registry)


# --------------------------- daemon config ------------------------------------


def config_from_env() -> tuple[AppConfig, Path]:
    dhl_api_key = os.environ.get("DHL_API_KEY", "")
    telegram_bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not dhl_api_key:
        raise SystemExit("daemon mode: DHL_API_KEY env var is required")
    if not telegram_bot_token:
        raise SystemExit("daemon mode: TELEGRAM_BOT_TOKEN env var is required")

    poll_times = parse_times(os.environ.get("DHL_POLL_TIMES", "06:00,18:00"))
    if not poll_times:
        raise SystemExit("daemon mode: DHL_POLL_TIMES must contain at least one HH:MM")

    parcels_file = Path(os.environ.get("PARCELS_FILE", "../data/parcels.json"))
    state_file = Path(os.environ.get("DHL_STATE_FILE", "../data/dhl_state.json"))

    cfg = AppConfig(
        dhl_api_key=dhl_api_key,
        dhl_api_base=os.environ.get("DHL_API_BASE", "https://api-eu.dhl.com"),
        poll_interval_sec=0,
        poll_times=poll_times,
        state_file=state_file,
        telegram_bot_token=telegram_bot_token,
    )
    return cfg, parcels_file


# --------------------------- poll cycle ----------------------------------------


def _make_update(entry: dict, events: list[Event]) -> Update:
    return Update(
        tracking_number=entry["tracking_number"],
        nickname=entry.get("label") or None,
        events=[
            EventLine(
                occurred_at=ev.occurred_at,
                status_text=ev.status_text,
                location=ev.location,
            )
            for ev in events
        ],
    )


def poll_cycle(cfg: AppConfig, parcels_file: Path, client: DHLClient, store: StateStore) -> None:
    registry = load_registry(parcels_file)
    parcels = active_parcels(registry)
    if not parcels:
        print(f"[{_now()}] no active parcels in {parcels_file}")
        return

    for i, entry in enumerate(parcels):
        if _stop:
            return
        if i > 0:
            time.sleep(PER_PARCEL_SLEEP_SEC)

        tn = entry["tracking_number"]
        chat_id = str(entry.get("chat_id", "")).strip()
        label = entry.get("label") or "-"
        print(f"[{_now()}] polling {tn} ({label})")

        if not chat_id:
            print("  skipped: no chat_id in registry entry")
            continue

        try:
            events = client.get_events(tn)
        except DHLNotFound:
            print("  not found yet, will retry next cycle")
            continue
        except DHLRateLimited as e:
            print(f"  rate limited: {e}; sleeping 60s")
            time.sleep(60)
            continue
        except DHLError as e:
            print(f"  DHL error: {e}")
            continue
        except Exception as e:
            print(f"  unexpected error: {e}")
            continue

        first_run = store.is_first_run(tn)
        known = store.known_hashes(tn)
        new_events = diff_new_events(not first_run, known, events)

        latest = events[-1] if events else None
        delivered = bool(latest and latest.status_code == "delivered")

        if new_events:
            print(f"  {len(new_events)} new event(s):")
            for ev in new_events:
                ts = ev.occurred_at.strftime("%Y-%m-%d %H:%M UTC")
                print(f"     - {ts} | {ev.status_text} | {ev.location or '-'}")
            try:
                send_telegram(cfg, chat_id, _make_update(entry, new_events))
                print(f"  [telegram] -> {chat_id}: ok")
            except Exception as e:
                print(f"  [telegram] -> {chat_id}: FAILED ({e})")

            store.record(
                tn,
                new_hashes=[event_hash(e) for e in new_events],
                last_status=latest.status_text if latest else None,
            )
            store.save()
        else:
            print("  no new events")

        if delivered:
            name = entry.get("label") or tn
            try:
                send_telegram_text(
                    cfg, chat_id, f"? {name} ({tn}) delivered ? tracking stopped."
                )
                print(f"  [telegram] -> {chat_id}: delivered notice ok")
            except Exception as e:
                print(f"  [telegram] -> {chat_id}: delivered notice FAILED ({e})")
            mark_delivered(parcels_file, tn)
            print("  marked delivered in registry")


# --------------------------- entry point ----------------------------------------


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else []
    once = "--once" in argv

    cfg, parcels_file = config_from_env()
    client = DHLClient(base_url=cfg.dhl_api_base, api_key=cfg.dhl_api_key)
    store = StateStore(cfg.state_file)

    signal.signal(signal.SIGINT, _handle_sig)
    signal.signal(signal.SIGTERM, _handle_sig)

    sched = ", ".join(f"{h:02d}:{m:02d}" for h, m in cfg.poll_times)
    print(
        f"DHL daemon ready: registry={parcels_file}, state={cfg.state_file}, "
        f"polling at {sched} Europe/Berlin"
    )

    if once:
        poll_cycle(cfg, parcels_file, client, store)
        return 0

    while not _stop:
        when = next_scheduled(datetime.now(BERLIN_TZ), cfg.poll_times)
        print(f"  next poll scheduled at {when.strftime('%Y-%m-%d %H:%M %Z')}")
        _sleep_until(when)
        if _stop:
            break
        poll_cycle(cfg, parcels_file, client, store)

    return 0
