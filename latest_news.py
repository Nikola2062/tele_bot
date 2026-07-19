#!/usr/bin/env python3
"""Fetch latest headlines from every news source and print a pretty dump.

    python latest_news.py
    python latest_news.py --fresh   # bypass cache

Requires Node.js 18+ and (on first run) `cd bot && npm install`.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

HUB = Path(__file__).resolve().parent
BOT = HUB / "bot"


def main() -> None:
    npm = shutil.which("npm")
    if not npm:
        sys.exit("ERROR: npm not found ? install Node.js 18+ (https://nodejs.org)")

    if not (BOT / "node_modules").is_dir():
        print("[latest] bot/node_modules missing ? running npm install?")
        subprocess.run([npm, "install"], cwd=BOT, check=True)

    cmd = [npm, "run", "latest", "--", *sys.argv[1:]]
    raise SystemExit(subprocess.call(cmd, cwd=BOT))


if __name__ == "__main__":
    main()
