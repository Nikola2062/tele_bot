#!/usr/bin/env python3
"""Telegram Hub supervisor ? run the whole hub with one command.

    python main.py \
        --telegram-token 123456:ABC... \
        --dhl-key <dhl-api-key> \
        --openrouter-key sk-or-... \
        --chat-id 123456789

Every flag falls back to the same-named env var (or .env in this directory),
so after filling .env it is just:

    python main.py

It starts three children and restarts any that crash (exponential backoff):
  [bot]    bot/     ? the interactive Telegram bot (Node, via `npm start`)
  [dhl]    dhl/     ? DHL parcel watcher   (skipped if no DHL key)
  [papers] papers/  ? daily papers digest  (skipped if no LLM key / chat id)

One-time setup:
    pip install -r requirements.txt        # python deps (dhl + papers)
    cd bot && npm install                  # bot deps (done automatically if missing)

Requirements: Python 3.10+, Node.js 18+. Ctrl-C stops everything cleanly.
"""
from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

HUB = Path(__file__).resolve().parent
DATA = HUB / "data"

stop = threading.Event()
procs: dict[str, subprocess.Popen] = {}
procs_lock = threading.Lock()


def load_dotenv(path: Path) -> None:
    """Tiny .env loader (no dependency): KEY=VALUE lines, # comments; never overrides real env."""
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Run the Telegram Hub (bot + dhl + papers) as one process tree.",
        epilog="Flags fall back to env vars / .env: TELEGRAM_BOT_TOKEN, DHL_API_KEY, "
        "OPENROUTER_API_KEY, DEEPSEEK_API_KEY, TELEGRAM_CHAT_ID, LLM_MODEL.",
    )
    p.add_argument("--telegram-token", default=None, help="Bot token from @BotFather (required)")
    p.add_argument("--dhl-key", default=None, help="DHL Shipment Tracking API key")
    p.add_argument("--openrouter-key", default=None, help="OpenRouter key for paper summaries")
    p.add_argument("--deepseek-key", default=None, help="DeepSeek key for paper summaries")
    p.add_argument("--chat-id", default=None, help="Chat id(s) receiving the papers digest")
    p.add_argument("--model", default=None, help="LLM model override, e.g. poolside/laguna-xs-2.1:free")
    p.add_argument("--check", action="store_true", help="Validate config and exit without starting anything")
    return p.parse_args()


def build_env(args: argparse.Namespace) -> dict[str, str]:
    """Merge CLI flags over env/.env and pin the shared data paths for all children."""
    overrides = {
        "TELEGRAM_BOT_TOKEN": args.telegram_token,
        "DHL_API_KEY": args.dhl_key,
        "OPENROUTER_API_KEY": args.openrouter_key,
        "DEEPSEEK_API_KEY": args.deepseek_key,
        "TELEGRAM_CHAT_ID": args.chat_id,
        "LLM_MODEL": args.model,
    }
    env = dict(os.environ)
    env.update({k: v for k, v in overrides.items() if v})
    env.update(
        {
            "DATA_DIR": str(DATA),
            "DATABASE_PATH": str(DATA / "cache.db"),
            "PARCELS_FILE": str(DATA / "parcels.json"),
            "DHL_STATE_FILE": str(DATA / "dhl_state.json"),
            "SENT_PAPERS_FILE": str(DATA / "sent_papers.json"),
            "SUBSCRIPTIONS_FILE": str(DATA / "subscriptions.json"),
            "NEWS_STATE_FILE": str(DATA / "news_digest_state.json"),
        }
    )
    return env


def plan_services(env: dict[str, str]) -> list[tuple[str, list[str], Path]]:
    """Decide what runs. Missing optional credentials skip a service with a warning."""
    if not env.get("TELEGRAM_BOT_TOKEN"):
        sys.exit("ERROR: TELEGRAM_BOT_TOKEN is required (--telegram-token, env, or .env)")
    npm = shutil.which("npm")
    if not npm:
        sys.exit("ERROR: npm not found ? the bot needs Node.js 18+ (https://nodejs.org)")

    services = [("bot", [npm, "start"], HUB / "bot")]

    if env.get("DHL_API_KEY"):
        services.append(("dhl", [sys.executable, "main.py", "--daemon"], HUB / "dhl"))
    else:
        print("WARN: no DHL_API_KEY ? [dhl] parcel watcher will not run", file=sys.stderr)

    if not (env.get("OPENROUTER_API_KEY") or env.get("DEEPSEEK_API_KEY")):
        print("WARN: no OPENROUTER_API_KEY/DEEPSEEK_API_KEY ? [papers] digest will not run", file=sys.stderr)
    elif not env.get("TELEGRAM_CHAT_ID"):
        print("WARN: no TELEGRAM_CHAT_ID ? [papers] digest has no target chat, not running", file=sys.stderr)
    else:
        services.append(("papers", [sys.executable, "-m", "src.main", "--schedule"], HUB / "papers"))
    return services


def check_python_deps() -> None:
    missing = []
    for module, pkg in (("requests", "requests"), ("openai", "openai"), ("fpdf", "fpdf2"), ("dotenv", "python-dotenv")):
        try:
            __import__(module)
        except ImportError:
            missing.append(pkg)
    if missing:
        sys.exit(f"ERROR: missing python packages: {', '.join(missing)}\nRun:  pip install -r {HUB / 'requirements.txt'}")


def ensure_bot_deps() -> None:
    if not (HUB / "bot" / "node_modules").is_dir():
        print("[hub] bot/node_modules missing ? running npm install (one-time)?")
        subprocess.run(["npm", "install"], cwd=HUB / "bot", check=True)


def run_service(name: str, cmd: list[str], cwd: Path, env: dict[str, str]) -> None:
    """Run one child forever: stream its output with a [name] prefix, restart on crash."""
    failures = 0
    while not stop.is_set():
        started = time.monotonic()
        proc = subprocess.Popen(
            cmd, cwd=cwd, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
        )
        with procs_lock:
            procs[name] = proc
        print(f"[hub] started [{name}] pid={proc.pid}")
        assert proc.stdout is not None
        for line in proc.stdout:
            print(f"[{name}] {line}", end="")
        proc.wait()
        if stop.is_set():
            return
        # Crashed. A child that survived 5 minutes gets a fresh backoff counter.
        failures = 1 if time.monotonic() - started > 300 else failures + 1
        delay = min(60, 5 * 2 ** (failures - 1))
        print(f"[hub] [{name}] exited with code {proc.returncode}; restarting in {delay}s", file=sys.stderr)
        if stop.wait(delay):
            return


def shutdown(signum, _frame) -> None:
    print(f"\n[hub] received signal {signum}, stopping?")
    stop.set()
    with procs_lock:
        for name, proc in procs.items():
            if proc.poll() is None:
                proc.terminate()


def main() -> None:
    load_dotenv(HUB / ".env")
    args = parse_args()
    env = build_env(args)
    services = plan_services(env)

    if args.check:
        print("Config OK. Would start: " + ", ".join(name for name, _, _ in services))
        return

    check_python_deps()
    ensure_bot_deps()
    DATA.mkdir(exist_ok=True)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    threads = [
        threading.Thread(target=run_service, args=(name, cmd, cwd, env), name=name, daemon=True)
        for name, cmd, cwd in services
    ]
    for t in threads:
        t.start()
    print(f"[hub] running {len(threads)} service(s): {', '.join(t.name for t in threads)} ? Ctrl-C to stop")

    while any(t.is_alive() for t in threads):
        time.sleep(1)

    # Give children a moment to die, then force-kill stragglers.
    deadline = time.monotonic() + 10
    with procs_lock:
        for proc in procs.values():
            try:
                proc.wait(timeout=max(0.1, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                proc.kill()
    print("[hub] stopped")


if __name__ == "__main__":
    main()
