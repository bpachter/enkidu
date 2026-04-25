"""
update_soul_integrity.py — Deliberately re-pin the SOUL.md hash.

Run this ONLY after an intentional, reviewed edit to SOUL.md.
It recomputes the SHA256 and writes it to .soul-integrity so the
server integrity check passes again.

Usage:
    python tools/update_soul_integrity.py [--force]

Without --force it shows the diff between old and new hash and asks
for explicit confirmation before writing.
"""

import argparse
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
SOUL_PATH = ROOT / "SOUL.md"
INTEGRITY_PATH = ROOT / ".soul-integrity"


def compute(path: Path) -> str:
    return hashlib.sha256(path.read_text(encoding="utf-8").encode("utf-8")).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="Skip confirmation prompt")
    args = ap.parse_args()

    if not SOUL_PATH.exists():
        print("ERROR: SOUL.md not found. Nothing to pin.")
        sys.exit(1)

    new_hash = compute(SOUL_PATH)

    old_hash = None
    if INTEGRITY_PATH.exists():
        old_hash = INTEGRITY_PATH.read_text(encoding="utf-8").strip()

    print(f"\nSOUL.md integrity update")
    print(f"  File : {SOUL_PATH}")
    print(f"  Old  : {old_hash or '(none)'}")
    print(f"  New  : {new_hash}")

    if old_hash == new_hash:
        print("\nHash unchanged — nothing to do.")
        return

    if not args.force:
        print(
            "\nThis updates the authoritative soul hash. Only proceed if you have "
            "reviewed the SOUL.md changes and they reflect Ben's deliberate intent."
        )
        confirm = input("Type CONFIRMED to proceed: ").strip()
        if confirm != "CONFIRMED":
            print("Aborted.")
            sys.exit(1)

    INTEGRITY_PATH.write_text(new_hash + "\n", encoding="utf-8")
    print(f"\nWritten: {INTEGRITY_PATH}")
    print("Remember to commit both SOUL.md and .soul-integrity together.")


if __name__ == "__main__":
    main()
