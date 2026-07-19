"""Three small senders: Telegram, Email (SMTP), WhatsApp (Twilio).

Each sender receives one ``Update`` per parcel containing *all* new events
since the last poll, so a single parcel always produces one message.
Failures in one channel never block the others.
"""

from __future__ import annotations

import smtplib
from dataclasses import dataclass
from datetime import datetime
from email.message import EmailMessage

import requests

from dhl_notifier.config import AppConfig


@dataclass(frozen=True)
class EventLine:
    occurred_at: datetime
    status_text: str
    location: str | None

    @property
    def time_str(self) -> str:
        return self.occurred_at.strftime("%Y-%m-%d %H:%M UTC")


@dataclass(frozen=True)
class Update:
    tracking_number: str
    nickname: str | None
    events: list[EventLine]              # one or more new events, oldest first

    @property
    def label(self) -> str:
        return self.nickname or self.tracking_number

    @property
    def latest(self) -> EventLine:
        return self.events[-1]

    @property
    def track_url(self) -> str:
        return (
            "https://www.dhl.com/global-en/home/tracking.html"
            f"?tracking-id={self.tracking_number}"
        )


# ----------------------------- Telegram --------------------------------------

_MD2_SPECIAL = r"_*[]()~`>#+-=|{}.!\\"


def _md2(s: str | None) -> str:
    """Escape every character MarkdownV2 considers special."""
    if not s:
        return ""
    return "".join(("\\" + ch) if ch in _MD2_SPECIAL else ch for ch in s)


def render_telegram(u: Update) -> str:
    lines: list[str] = []
    lines.append("*DHL Tracking Update*")
    lines.append("")
    lines.append(f"*Package:* {_md2(u.label)}")
    lines.append(f"*ID:* `{_md2(u.tracking_number)}`")
    lines.append("")
    lines.append(f"*Latest status:* {_md2(u.latest.status_text)}")
    lines.append("")
    lines.append("*New events:*")
    for ev in u.events:
        loc = f" \\({_md2(ev.location)}\\)" if ev.location else ""
        lines.append(f"• {_md2(ev.time_str)} — {_md2(ev.status_text)}{loc}")
    return "\n".join(lines)


def send_telegram(cfg: AppConfig, chat_id: str, u: Update) -> None:
    if not cfg.telegram_bot_token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN not set")

    resp = requests.post(
        f"https://api.telegram.org/bot{cfg.telegram_bot_token}/sendMessage",
        json={
            "chat_id": chat_id,
            "text": render_telegram(u),
            "parse_mode": "MarkdownV2",
            "disable_web_page_preview": True,
        },
        timeout=15,
    )
    if not resp.ok or not resp.json().get("ok"):
        raise RuntimeError(f"telegram {resp.status_code}: {resp.text[:300]}")


def send_telegram_text(cfg: AppConfig, chat_id: str, text: str) -> None:
    """Plain-text Telegram message (no MarkdownV2 escaping headaches)."""
    if not cfg.telegram_bot_token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN not set")

    resp = requests.post(
        f"https://api.telegram.org/bot{cfg.telegram_bot_token}/sendMessage",
        json={
            "chat_id": chat_id,
            "text": text,
            "disable_web_page_preview": True,
        },
        timeout=15,
    )
    if not resp.ok or not resp.json().get("ok"):
        raise RuntimeError(f"telegram {resp.status_code}: {resp.text[:300]}")


# ----------------------------- Email (SMTP) ----------------------------------


def render_email_subject(u: Update) -> str:
    location = f" ({u.latest.location})" if u.latest.location else ""
    return f"[DHL] {u.label} — {u.latest.status_text}{location}"


def render_email_body(u: Update) -> str:
    lines = [
        "DHL Tracking Update",
        "===================",
        "",
        f"Package: {u.label}",
        f"ID:      {u.tracking_number}",
        "",
        "New events:",
    ]
    for ev in u.events:
        loc = f" ({ev.location})" if ev.location else ""
        lines.append(f"  • {ev.time_str} — {ev.status_text}{loc}")
    lines += ["", f"Track live: {u.track_url}", ""]
    return "\n".join(lines)


def send_email(cfg: AppConfig, to: str, u: Update) -> None:
    if not cfg.smtp_host:
        raise RuntimeError("SMTP_HOST not set")

    msg = EmailMessage()
    msg["From"] = cfg.smtp_from or cfg.smtp_username
    msg["To"] = to
    msg["Subject"] = render_email_subject(u)
    msg.set_content(render_email_body(u))

    with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=20) as s:
        s.ehlo()
        if cfg.smtp_starttls:
            s.starttls()
            s.ehlo()
        if cfg.smtp_username:
            s.login(cfg.smtp_username, cfg.smtp_password)
        s.send_message(msg)


# ----------------------------- WhatsApp (Twilio) -----------------------------


def render_whatsapp(u: Update) -> str:
    lines = [
        "*DHL Tracking Update*",
        "",
        f"Package: {u.label}",
        f"ID: {u.tracking_number}",
        "",
        "New events:",
    ]
    for ev in u.events:
        loc = f" ({ev.location})" if ev.location else ""
        lines.append(f"• {ev.time_str} — {ev.status_text}{loc}")
    return "\n".join(lines)


def send_whatsapp(cfg: AppConfig, to: str, u: Update) -> None:
    if not (
        cfg.twilio_account_sid and cfg.twilio_auth_token and cfg.twilio_whatsapp_from
    ):
        raise RuntimeError("Twilio WhatsApp credentials not set")

    to_full = to if to.startswith("whatsapp:") else f"whatsapp:{to}"
    resp = requests.post(
        f"https://api.twilio.com/2010-04-01/Accounts/{cfg.twilio_account_sid}/Messages.json",
        data={"From": cfg.twilio_whatsapp_from, "To": to_full, "Body": render_whatsapp(u)},
        auth=(cfg.twilio_account_sid, cfg.twilio_auth_token),
        timeout=20,
    )
    if not resp.ok:
        raise RuntimeError(f"twilio {resp.status_code}: {resp.text[:300]}")


# ----------------------------- Router ----------------------------------------


def dispatch(cfg: AppConfig, u: Update) -> None:
    """Send `u` over every configured channel. Failures are logged, not raised."""
    for ch in cfg.channels:
        try:
            if ch.kind == "telegram":
                send_telegram(cfg, ch.target, u)
            elif ch.kind == "email":
                send_email(cfg, ch.target, u)
            elif ch.kind == "whatsapp":
                send_whatsapp(cfg, ch.target, u)
            else:
                raise RuntimeError(f"unknown channel kind: {ch.kind}")
            print(f"  [{ch.kind}] -> {ch.target}: ok")
        except Exception as e:
            print(f"  [{ch.kind}] -> {ch.target}: FAILED ({e})")
