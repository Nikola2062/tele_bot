# DHL Tracking Notifier (personal)

A small Python script that polls the DHL Shipment Tracking API for your
parcels and pings you on **Telegram**, **Email**, and/or **WhatsApp**
whenever the status changes.

- One process. No database. No Docker. **No config files** — every
  credential and setting is passed on the command line.
- State is a plain `state.json` file so you only get notified once per event.

## 1. Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Requires Python 3.10+.

## 2. Run

Pass everything as CLI parameters. The only required values are the DHL
API key, at least one `--parcel`, and at least one notification target.

Minimal Telegram example:

```bash
python main.py \
  --dhl-api-key YOUR_DHL_KEY \
  --parcel 00340434498966949578:卡航 \
  --parcel 00340434498966949561:卡航 \
  --telegram-bot-token YOUR_BOT_TOKEN \
  --telegram-chat-id -5260572875 \
  --poll-times 06:00,18:00
```

Single cycle (useful for cron / testing):

```bash
python main.py --once --dhl-api-key ... --parcel ... --telegram-bot-token ... --telegram-chat-id ...
```

## 3. Parameters

### DHL
- `--dhl-api-key` (required) — free key from [developer.dhl.com](https://developer.dhl.com/).
- `--dhl-api-base` — defaults to `https://api-eu.dhl.com`. Use
  `https://api-test.dhl.com` for the sandbox.

### Parcels
- `--parcel TRACKING[:NICKNAME[:SERVICE]]` — repeatable. Examples:
  - `--parcel 00340434498966949578` — bare tracking number.
  - `--parcel 00340434498966949578:卡航` — with a nickname.
  - `--parcel 00340434498966949578:卡航:parcel-de` — with a DHL service hint.

### Polling
- `--poll-times 06:00,18:00` — fixed clock times in **Europe/Berlin**
  (handles CET ↔ CEST). Recommended.
- `--poll-interval-sec 86400` — fallback when `--poll-times` is empty.
- `--state-file state.json` — where to persist seen-event hashes.

### Telegram
- `--telegram-bot-token` — token from [@BotFather](https://t.me/BotFather).
- `--telegram-chat-id` — repeatable. Numeric chat ID. To find yours,
  message the bot once and open
  `https://api.telegram.org/bot<TOKEN>/getUpdates`.

### Email (SMTP)
- `--email-to` — repeatable recipient address.
- `--smtp-host`, `--smtp-port` (587), `--smtp-username`, `--smtp-password`,
  `--smtp-from`, `--smtp-starttls` / `--no-smtp-starttls`.

### WhatsApp (Twilio sandbox)
- `--whatsapp-to` — repeatable E.164 number, e.g. `+491701234567`.
- `--twilio-account-sid`, `--twilio-auth-token`, `--twilio-whatsapp-from`
  (e.g. `whatsapp:+14155238886`).

Run `python main.py --help` for the full list with defaults.

## 4. Console output

```
DHL notifier ready: 2 parcel(s), 1 channel(s), at 06:00, 18:00
[2026-05-14 10:00:01] polling 00340434161094020156 (Amazon order)
  1 new event(s):
     - 2026-05-14 08:12 UTC | In transit | Hamburg, DE
  [telegram] -> 123456789: ok
[2026-05-14 10:00:02] polling 1234567890 (Test parcel)
  no new events
```

Ctrl-C stops the loop cleanly after the current cycle.

### Run on a schedule (no daemon)

If you'd rather not keep a long-running process, drop a cron line and
keep the credentials in the cron environment or a wrapper script with
restricted permissions:

```cron
*/15 * * * * /path/to/.venv/bin/python /path/to/main.py --once \
  --dhl-api-key "$DHL_KEY" \
  --parcel 00340434498966949578:卡航 \
  --telegram-bot-token "$TG_TOKEN" \
  --telegram-chat-id -5260572875 >> notifier.log 2>&1
```

## 5. How it avoids duplicates

For each tracking number, `state.json` stores a SHA-256 hash of every
event the script has already seen (timestamp + status + location +
description). On the next poll, any event whose hash isn't in the set is
treated as new.

The very first time a parcel is seen, only the **latest** event is
emitted so you don't get spammed with the entire history.

## 6. Files

```
DHL_Tracking/
├── main.py                    # CLI entry point + polling loop
├── requirements.txt
├── dhl_notifier/
│   ├── config.py              # data classes + CLI value parsers
│   ├── dhl.py                 # DHL API client (requests)
│   ├── state.py               # state.json read/write
│   └── notifiers.py           # Telegram / Email / WhatsApp senders
└── state.json                 # created on first run
```

## 7. Notes / limits

- The DHL free tier has a daily quota. The recommended
  `--poll-times 06:00,18:00` makes 2 calls per parcel per day — well
  within free-tier limits. Add more times if you want finer granularity.
- Only the **official** DHL API is used. No scraping.
- `state.json` is rewritten atomically (`.tmp` + `os.replace`) so a
  crash mid-write can't corrupt it.
- Credentials live in your shell history / process arguments now. On a
  shared machine, prefer a wrapper script that reads from a
  permissions-restricted file and forwards via CLI args, or use your
  process manager's secret store.
