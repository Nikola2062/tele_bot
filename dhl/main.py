"""Personal DHL tracking notifier.

All configuration is passed as command-line arguments. There is no .env and
no config.yaml — credentials, parcels, and channels are all parameters.

Minimum usage:

    python main.py \
        --dhl-api-key YOUR_KEY \
        --parcel 00340434498966949578:卡航 \
        --telegram-bot-token YOUR_TOKEN \
        --telegram-chat-id -5260572875

Add ``--once`` for a single poll cycle.

Telegram-Hub daemon mode (env-configured, parcels come from the shared
registry written by the hub bot):

    python main.py --daemon           # poll at $DHL_POLL_TIMES forever
    python main.py --daemon --once    # single poll cycle then exit

See ``dhl_notifier/daemon.py`` for the environment variables it reads.
"""

from __future__ import annotations

import argparse
import signal
import sys
import time
from datetime import datetime, time as dtime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

# Poll schedule is always interpreted in German local time so DST flips
# (CET ↔ CEST) don't shift the 06:00 / 18:00 wakeups by an hour.
BERLIN_TZ = ZoneInfo("Europe/Berlin")

from dhl_notifier.config import (
    AppConfig,
    Channel,
    Parcel,
    parse_parcel,
    parse_times,
)
from dhl_notifier.dhl import DHLClient, DHLError, DHLNotFound, DHLRateLimited, Event
from dhl_notifier.notifiers import EventLine, Update, dispatch
from dhl_notifier.state import StateStore, event_hash


_stop = False


def _handle_sig(signum, frame):  # noqa: ARG001
    global _stop
    _stop = True
    print("\nstopping after current poll...")


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


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
    """Pick events the user hasn't been notified about yet.

    First time we see a parcel: emit only the *latest* event (avoid spamming
    the whole history). Subsequent runs: emit every event whose hash is new.
    """
    if not events:
        return []
    if not parcel_known:
        return [events[-1]]
    return [e for e in events if event_hash(e) not in known]


def _make_update(p: Parcel, events: list[Event]) -> Update:
    return Update(
        tracking_number=p.tracking_number,
        nickname=p.nickname,
        events=[
            EventLine(
                occurred_at=ev.occurred_at,
                status_text=ev.status_text,
                location=ev.location,
            )
            for ev in events
        ],
    )


def poll_once(cfg: AppConfig, client: DHLClient, store: StateStore) -> None:
    for p in cfg.parcels:
        print(f"[{_now()}] polling {p.tracking_number} ({p.nickname or '-'})")
        try:
            events = client.get_events(p.tracking_number, service=p.service)
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

        first_run = store.is_first_run(p.tracking_number)
        known = store.known_hashes(p.tracking_number)
        new_events = diff_new_events(not first_run, known, events)

        if not new_events:
            print("  no new events")
            continue

        latest_status = events[-1].status_text if events else None

        print(f"  {len(new_events)} new event(s):")
        for ev in new_events:
            ts = ev.occurred_at.strftime("%Y-%m-%d %H:%M UTC")
            print(f"     - {ts} | {ev.status_text} | {ev.location or '-'}")

        u = _make_update(p, new_events)
        dispatch(cfg, u)

        store.record(
            p.tracking_number,
            new_hashes=[event_hash(e) for e in new_events],
            last_status=latest_status,
        )
        store.save()


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Personal DHL tracking notifier (all config via CLI args).",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )

    p.add_argument("--once", action="store_true", help="single poll cycle then exit")
    p.add_argument(
        "--daemon",
        action="store_true",
        help="Telegram-Hub daemon mode: env-configured (DHL_API_KEY, "
             "TELEGRAM_BOT_TOKEN, DHL_POLL_TIMES, PARCELS_FILE, DHL_STATE_FILE), "
             "parcels come from the shared registry; all other CLI args are ignored",
    )

    # DHL
    p.add_argument("--dhl-api-key", required=True, help="DHL Shipment Tracking API key")
    p.add_argument(
        "--dhl-api-base",
        default="https://api-eu.dhl.com",
        help="DHL API base URL (use https://api-test.dhl.com for sandbox)",
    )

    # Polling
    p.add_argument(
        "--poll-times",
        default="",
        help="comma-separated local clock times to poll (HH:MM,HH:MM). "
             "If empty, --poll-interval-sec is used.",
    )
    p.add_argument(
        "--poll-interval-sec",
        type=int,
        default=86400,
        help="fallback poll interval in seconds when --poll-times is empty",
    )
    p.add_argument(
        "--state-file",
        type=Path,
        default=Path("state.json"),
        help="path to the state JSON file (auto-created on first run)",
    )

    # Parcels (repeatable)
    p.add_argument(
        "--parcel",
        action="append",
        default=[],
        metavar="TRACKING[:NICKNAME[:SERVICE]]",
        help="parcel to track; pass --parcel multiple times for several parcels",
    )

    # Telegram
    p.add_argument("--telegram-bot-token", default="", help="Telegram bot token from @BotFather")
    p.add_argument(
        "--telegram-chat-id",
        action="append",
        default=[],
        help="Telegram chat ID to notify (repeatable)",
    )

    # Email / SMTP
    p.add_argument(
        "--email-to",
        action="append",
        default=[],
        help="email recipient address (repeatable)",
    )
    p.add_argument("--smtp-host", default="")
    p.add_argument("--smtp-port", type=int, default=587)
    p.add_argument("--smtp-username", default="")
    p.add_argument("--smtp-password", default="")
    p.add_argument("--smtp-from", default="", help='e.g. "DHL Notifier <notify@example.com>"')
    p.add_argument(
        "--smtp-starttls",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="use STARTTLS (default on); pass --no-smtp-starttls to disable",
    )

    # WhatsApp / Twilio
    p.add_argument(
        "--whatsapp-to",
        action="append",
        default=[],
        help="WhatsApp recipient in E.164 format, e.g. +491701234567 (repeatable)",
    )
    p.add_argument("--twilio-account-sid", default="")
    p.add_argument("--twilio-auth-token", default="")
    p.add_argument(
        "--twilio-whatsapp-from",
        default="",
        help='Twilio WhatsApp sender, e.g. "whatsapp:+14155238886"',
    )

    return p


def build_config(args: argparse.Namespace) -> AppConfig:
    if not args.parcel:
        raise SystemExit("at least one --parcel is required")

    parcels = [parse_parcel(s) for s in args.parcel]

    channels: list[Channel] = []
    for cid in args.telegram_chat_id:
        channels.append(Channel("telegram", str(cid)))
    for addr in args.email_to:
        channels.append(Channel("email", str(addr)))
    for num in args.whatsapp_to:
        channels.append(Channel("whatsapp", str(num)))

    if not channels:
        raise SystemExit(
            "no notification channel configured: pass at least one of "
            "--telegram-chat-id / --email-to / --whatsapp-to"
        )

    # Sanity-check that the secrets behind each channel are present.
    if any(c.kind == "telegram" for c in channels) and not args.telegram_bot_token:
        raise SystemExit("--telegram-chat-id given but --telegram-bot-token is missing")
    if any(c.kind == "email" for c in channels) and not args.smtp_host:
        raise SystemExit("--email-to given but --smtp-host is missing")
    if any(c.kind == "whatsapp" for c in channels) and not (
        args.twilio_account_sid and args.twilio_auth_token and args.twilio_whatsapp_from
    ):
        raise SystemExit(
            "--whatsapp-to given but Twilio credentials are incomplete "
            "(need --twilio-account-sid, --twilio-auth-token, --twilio-whatsapp-from)"
        )

    return AppConfig(
        dhl_api_key=args.dhl_api_key,
        dhl_api_base=args.dhl_api_base,
        poll_interval_sec=args.poll_interval_sec,
        poll_times=parse_times(args.poll_times),
        state_file=args.state_file,
        parcels=parcels,
        channels=channels,
        telegram_bot_token=args.telegram_bot_token,
        smtp_host=args.smtp_host,
        smtp_port=args.smtp_port,
        smtp_username=args.smtp_username,
        smtp_password=args.smtp_password,
        smtp_from=args.smtp_from,
        smtp_starttls=args.smtp_starttls,
        twilio_account_sid=args.twilio_account_sid,
        twilio_auth_token=args.twilio_auth_token,
        twilio_whatsapp_from=args.twilio_whatsapp_from,
    )


def main() -> int:
    # Hub daemon mode is env-configured and registry-driven; it has its own
    # (tiny) argument handling, so route before the classic CLI parser whose
    # --dhl-api-key/--parcel arguments are mandatory.
    if "--daemon" in sys.argv[1:]:
        from dhl_notifier.daemon import main as daemon_main

        return daemon_main(sys.argv[1:])

    args = build_parser().parse_args()
    cfg = build_config(args)

    client = DHLClient(base_url=cfg.dhl_api_base, api_key=cfg.dhl_api_key)
    store = StateStore(cfg.state_file)

    signal.signal(signal.SIGINT, _handle_sig)
    signal.signal(signal.SIGTERM, _handle_sig)

    if cfg.poll_times:
        sched = (
            "at "
            + ", ".join(f"{h:02d}:{m:02d}" for h, m in cfg.poll_times)
            + " Europe/Berlin"
        )
    else:
        sched = f"every {cfg.poll_interval_sec}s"
    print(
        f"DHL notifier ready: {len(cfg.parcels)} parcel(s), "
        f"{len(cfg.channels)} channel(s), {sched}"
    )

    if args.once:
        poll_once(cfg, client, store)
        return 0

    while not _stop:
        poll_once(cfg, client, store)
        if _stop:
            break
        if cfg.poll_times:
            when = next_scheduled(datetime.now(BERLIN_TZ), cfg.poll_times)
            print(f"  next poll scheduled at {when.strftime('%Y-%m-%d %H:%M %Z')}")
            _sleep_until(when)
        else:
            for _ in range(cfg.poll_interval_sec):
                if _stop:
                    break
                time.sleep(1)

    return 0


if __name__ == "__main__":
    sys.exit(main())
