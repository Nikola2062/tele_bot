#!/usr/bin/env python3
"""Strip installed packages and local junk so the tree is ready to push to GitHub.

    python clean.py           # delete artifacts
    python clean.py --dry-run # show what would be removed

Removes: node_modules, .venv/venv, dist, __pycache__, *.pyc, .DS_Store,
runtime caches under data/, logs/, out/, and stray local state files.
Does NOT touch source, lockfiles, .env.example, or .git.
.env is left in place (already gitignored) - delete it yourself if needed.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

HUB = Path(__file__).resolve().parent

DIR_NAMES = {
    "node_modules",
    ".venv",
    "venv",
    "dist",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    "logs",
    "out",
}

FILE_NAMES = {".DS_Store", "Thumbs.db"}
FILE_SUFFIXES = {".pyc", ".pyo", ".log"}

EXTRA_PATHS = [
    "dhl/state.json",
    "bot/test-cache.db",
]

# Wipe contents but keep the directory (+ .gitkeep)
WIPE_DIR_CONTENTS = [
    "data",
    "papers/state",
]

SKIP_DIR_NAMES = {".git"}


def should_skip(path: Path) -> bool:
    return any(part in SKIP_DIR_NAMES for part in path.parts)


def collect_targets() -> list[Path]:
    targets: list[Path] = []

    for path in HUB.rglob("*"):
        if should_skip(path):
            continue
        if path.is_dir() and path.name in DIR_NAMES:
            targets.append(path)
        elif path.is_file() and (path.name in FILE_NAMES or path.suffix in FILE_SUFFIXES):
            targets.append(path)

    for rel in EXTRA_PATHS:
        p = HUB / rel
        if p.exists():
            targets.append(p)

    for rel in WIPE_DIR_CONTENTS:
        directory = HUB / rel
        if not directory.is_dir():
            continue
        for child in directory.iterdir():
            if child.name == ".gitkeep":
                continue
            targets.append(child)

    uniq = sorted(set(targets), key=lambda p: (len(p.parts), str(p)))
    pruned: list[Path] = []
    for p in uniq:
        if any(p != q and q in p.parents for q in pruned):
            continue
        pruned.append(p)
    return pruned


def remove(path: Path, dry_run: bool) -> None:
    rel = path.relative_to(HUB) if path.is_relative_to(HUB) else path
    if dry_run:
        kind = "dir " if path.is_dir() else "file"
        print(f"  would remove {kind}  {rel}")
        return
    if path.is_dir():
        shutil.rmtree(path)
    elif path.exists():
        path.unlink()
    print(f"  removed  {rel}")


def ensure_placeholders() -> None:
    for rel in WIPE_DIR_CONTENTS:
        directory = HUB / rel
        directory.mkdir(parents=True, exist_ok=True)
        gitkeep = directory / ".gitkeep"
        if not gitkeep.exists():
            gitkeep.touch()


def main() -> None:
    parser = argparse.ArgumentParser(description="Remove installed packages / local junk for a clean GitHub push.")
    parser.add_argument("--dry-run", action="store_true", help="List targets without deleting")
    args = parser.parse_args()

    targets = collect_targets()
    if not targets:
        print("Nothing to clean - already tidy.")
        return

    print(f"{'Dry-run: would remove' if args.dry_run else 'Removing'} {len(targets)} path(s) under {HUB.name}/:\n")
    for path in targets:
        remove(path, args.dry_run)

    if not args.dry_run:
        ensure_placeholders()

    print("\nDone." + (" (dry-run - nothing deleted)" if args.dry_run else " Ready to commit / push."))
    if (HUB / ".env").exists():
        print("Note: .env is still present (gitignored). Delete it manually if you do not want it on this machine.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
