# Telegram Hub

Three formerly standalone projects merged into one service behind a
**single Telegram bot token**:

| Module | Path | What it does |
|---|---|---|
| News bot | `bot/` | Interactive Telegram bot (TypeScript / telegraf). 15+ trending-news sources, SQLite cache ? and the parcel `/track` commands. |
| DHL watcher | `dhl/` | Python worker. Polls the DHL Shipment Tracking API twice a day for every parcel registered via `/track`, pushes new events to the chat that registered it. |
| Papers digest | `papers/` | Python worker. Daily Hugging Face trending-papers digest (LLM summaries via OpenRouter or DeepSeek, PDF issue) to a configured chat. |

Each module keeps its original standalone README inside its subdirectory.

## Architecture

Only the **bot** long-polls Telegram (`getUpdates`) ? running two pollers on
one token breaks with 409 errors. The two Python workers never poll; they only
*send* messages via the Bot API (`sendMessage`) using the same token.

All three share `./data`:

| File | Written by | Read by |
|---|---|---|
| `parcels.json` | bot (`/track`, `/untrack`), dhl (`delivered` flag) | dhl (fresh each poll cycle) |
| `dhl_state.json` | dhl | dhl (event dedup hashes) |
| `sent_papers.json` | papers | papers (dedup of sent papers) |
| `subscriptions.json` | bot (`/subscribe`, `/unsubscribe`) | bot (news-digest scheduler) |
| `news_digest_state.json` | bot | bot (per-chat headline dedup) |
| `cache.db` | bot | bot (SQLite news cache) |

All JSON files are written atomically (temp file + rename), so cross-process
reads never see a half-written file.

`parcels.json` schema:

```json
{
  "parcels": [
    {
      "tracking_number": "00340434161094015902",
      "chat_id": 123456789,
      "label": "shoes",
      "added_at": "2026-07-18T10:00:00.000Z",
      "delivered": false
    }
  ]
}
```

## Bot commands

- `/sources`, `/latest <source>`, `/world`, `/all`, `/stats` ? news features (or just type a source name, e.g. `weibo`)
- `/world` ? curated digest from international broadcasters (Tagesschau/ARD, ZDF, DW en/de/zh, BBC World, BBC Chinese) instead of the Chinese trending/hot-search lists
- `/subscribe [HH:MM]` ? opt this chat into a **daily news digest** pushed at `HH:MM` Europe/Berlin (default `08:00`). One coalesced HTML digest across every implemented source, grouped into 🌍 World (BBC, DW, ARD/Tagesschau, ZDF), 💻 Tech & Dev (Hacker News, GitHub, Product Hunt, V2EX, 掘金, IT之家) and 🇨🇳 China trending (微博, 知乎, 抖音, 百度, 今日头条, 澎湃, 哔哩哔哩, …) ? each in its original language, with the RSS teaser under each broadcaster headline, deduped per chat so you only see headlines new since your last digest.
- `/unsubscribe`, `/mydigest` ? stop / show this chat's digest subscription
- `/digestnow` ? send the news digest right now (respects the per-chat dedup)

**Optional LLM clustering.** If `OPENROUTER_API_KEY` is set, the digest adds a
"Top stories" section that groups the same event across sources (e.g. one story
carried by 抖音 + 百度 + BBC becomes a single line with all three links) and
summarizes it. Model defaults to `poolside/laguna-s-2.1:free` (override with
`DIGEST_LLM_MODEL`). Fully opt-in and fail-safe: no key, or any API error, and
the digest falls back to the plain grouped layout ? nothing breaks.
- `/track <tracking_number> [label?]` ? register a DHL parcel (8?40 alphanumeric chars); updates arrive in the chat that ran the command
- `/untrack <tracking_number>` ? stop tracking (only your own chat's parcels)
- `/parcels` ? list your parcels with label and delivered status
- `/help` ? full command list

`/all` (or `/latest all`) fetches every implemented source and sends a short
pretty-formatted digest per source (top 5 headlines each).

When a parcel reaches *delivered*, the DHL worker sends a final
"delivered ? tracking stopped" message and stops polling it.

## Run it

```bash
pip install -r requirements.txt   # one-time: python deps for dhl + papers
cp .env.example .env              # one-time: fill in your keys
python main.py                    # starts bot + dhl + papers
```

### Daily news digest (scheduled push)

The news digest is an **in-process scheduler inside the `bot` service** (not a
separate process/cron) — so it only fires while `python main.py` is running.
Keep the hub alive (nohup / tmux / systemd); a missed slot is skipped, not
caught up.

The digest is pushed automatically **one hour after the papers digest** — this
is **on by default** and fires as long as `TELEGRAM_CHAT_ID` is set. Nothing to
enable; just run the hub:

```bash
python main.py --openrouter-key sk-or-...   # --openrouter-key is optional (enables clustering)
```

To **disable** it (or change the offset/target), set in the hub's environment:

```bash
echo 'DIGEST_AUTO=false' >> .env    # or Environment=DIGEST_AUTO=false in your systemd unit
```

Every run is traced to **`data/digest.log`** (Europe/Berlin). Check the first
line after a restart to confirm it's armed:

```bash
tail -f data/digest.log
# ✅ scheduler started — auto push ARMED at 11:00 to <chat>; N subscription(s)
# ❌ scheduler started — auto push DISABLED (set DIGEST_AUTO=true and TELEGRAM_CHAT_ID); ...
```

The log also records each `FIRE`, `run end` (delivered count + layout), the
`next run` time, and any `ERROR` — so a silent day is traceable: no log file =
hub wasn't running; `DISABLED` = flag/chat missing; `ARMED` but no `FIRE` at the
scheduled time = process wasn't alive then.

Chats can also opt in individually with `/subscribe [HH:MM]` regardless of
`DIGEST_AUTO`.

### Dump all latest news (CLI)

```bash
python latest_news.py             # pretty-print every source to the terminal
python latest_news.py --fresh     # bypass cache
```

### Clean before pushing to GitHub

```bash
python clean.py --dry-run         # preview
python clean.py                   # remove node_modules, .venv, dist, caches, ...
```

Requires Python 3.10+ and Node.js 18+ (`main.py` / `latest_news.py` run
`npm install` for the bot automatically on first start). Credentials can also
be passed as parameters instead of `.env`:

```bash
python main.py \
  --telegram-token 123456:ABC... \
  --dhl-key <dhl-api-key> \
  --openrouter-key sk-or-... \
  --chat-id <your-chat-id>
```

The supervisor prefixes each service's logs (`[bot]`, `[dhl]`, `[papers]`),
restarts a service if it crashes (exponential backoff), skips a service with
a warning when its credential is missing, and stops everything on Ctrl-C.
`python main.py --check` validates the config without starting anything.

### Run a single service by hand (debugging)

```bash
cd bot && npm install && npm start            # needs TELEGRAM_BOT_TOKEN in bot/.env

# dhl worker (env-configured daemon; --once for a single cycle)
cd dhl && DHL_API_KEY=... TELEGRAM_BOT_TOKEN=... PARCELS_FILE=../data/parcels.json \
  DHL_STATE_FILE=../data/dhl_state.json python main.py --daemon

# papers worker
cd papers && python -m src.main --schedule   # reads papers/.env or env vars
```

The DHL worker's original CLI-args mode (`python main.py --dhl-api-key ? --parcel ?`)
still works unchanged for one-off manual tracking.

## Environment variables

Copy `.env.example` ? `.env` at the hub root.

| Variable | Used by | Required | Notes |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | all | yes | One token from @BotFather for the whole hub |
| `DHL_API_KEY` | dhl | yes | developer.dhl.com Shipment Tracking key (free tier: 250 calls/day) |
| `OPENROUTER_API_KEY` | papers, bot | one of the two | Paper summaries via OpenRouter; also enables **news-digest clustering** (a "Top stories" section grouping the same story across sources). Optional for the bot — without it the digest still sends, plain |
| `DEEPSEEK_API_KEY` | papers | one of the two | Summaries via DeepSeek (`deepseek-chat`). Wins when both keys are set, unless `LLM_PROVIDER` says otherwise |
| `TELEGRAM_CHAT_ID` | papers, bot | yes | Papers digest target chat(s), comma-separated; also the default target for the auto news digest. Parcel updates ignore this ? they go to the chat that ran `/track`. |
| `LLM_PROVIDER` | papers | no | Force `openrouter` or `deepseek` when both keys are set |
| `LLM_MODEL` | papers | no | Model override for either provider, e.g. `poolside/laguna-xs-2.1:free` |
| `DHL_POLL_TIMES` | dhl | no | Default `06:00,18:00` (Europe/Berlin) |
| `SCHEDULE_HOUR` / `SCHEDULE_MINUTE` | papers, bot | no | Papers digest time, default 10:00 (Europe/Berlin). The auto news digest is derived from this + `DIGEST_AFTER_PAPERS_MIN` |
| `DIGEST_AUTO` | bot | no | Automatic news digest to `TELEGRAM_CHAT_ID`, **on by default**; set `false` to disable. See *Daily news digest* above |
| `DIGEST_AFTER_PAPERS_MIN` | bot | no | Minutes after the papers digest to push the news digest (default `60` = one hour) |
| `DIGEST_AUTO_CHAT_ID` | bot | no | Override the auto-digest target chat(s) (default: `TELEGRAM_CHAT_ID`) |
| `DIGEST_LLM_MODEL` | bot | no | Clustering model override (default `poolside/laguna-s-2.1:free`) |
| `PAPERS_PER_DAY`, `MIN_UPVOTES`, `DEEPSEEK_MODEL` | papers | no | Selection / legacy model tuning |
| `LOG_LEVEL` | bot | no | `info` (default) or `debug` |
| `DATA_DIR`, `DATABASE_PATH`, `PARCELS_FILE`, `DHL_STATE_FILE`, `SENT_PAPERS_FILE`, `SUBSCRIPTIONS_FILE`, `NEWS_STATE_FILE`, `DIGEST_LOG_FILE` | all | no | Defaults under `./data` (incl. the digest run log `digest.log`); `main.py` pins these for all children |
