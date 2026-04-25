"""
check_soul_governance.py — Verify SOUL.md governance across the codebase.

Checks:
  1. SOUL.md exists and matches .soul-integrity
  2. Every Python file that builds a system prompt loads the soul
  3. The soul is non-empty (not accidentally cleared)

Run manually or add to CI:
    python tools/check_soul_governance.py

Exit code 0 = all checks pass. Exit code 1 = violations found.
"""

import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
SOUL_PATH = ROOT / "SOUL.md"
INTEGRITY_PATH = ROOT / ".soul-integrity"

VIOLATIONS = []
WARNINGS = []


def fail(msg: str):
    VIOLATIONS.append(msg)
    print(f"  FAIL  {msg}")


def warn(msg: str):
    WARNINGS.append(msg)
    print(f"  WARN  {msg}")


def ok(msg: str):
    print(f"  OK    {msg}")


# ── 1. SOUL.md existence and integrity ───────────────────────────────────────

print("\n[1] SOUL.md integrity")

if not SOUL_PATH.exists():
    fail("SOUL.md not found")
else:
    content = SOUL_PATH.read_text(encoding="utf-8")
    if len(content.strip()) < 500:
        fail(f"SOUL.md suspiciously short ({len(content.strip())} chars) — may have been truncated")
    else:
        ok(f"SOUL.md present ({len(content.strip())} chars)")

    actual = hashlib.sha256(content.encode("utf-8")).hexdigest()

    if not INTEGRITY_PATH.exists():
        warn(".soul-integrity not found — hash cannot be verified")
    else:
        pinned = INTEGRITY_PATH.read_text(encoding="utf-8").strip()
        if actual != pinned:
            fail(
                f"SOUL.md hash mismatch!\n"
                f"    Pinned: {pinned}\n"
                f"    Actual: {actual}\n"
                f"    Run: python tools/update_soul_integrity.py  (only after deliberate review)"
            )
        else:
            ok(f"Hash verified: {actual[:16]}...")


# ── 2. Prompt builders load the soul ─────────────────────────────────────────

print("\n[2] System prompt governance")

# Patterns that indicate a function builds an LLM system prompt
# (must be specific enough to avoid false positives from system_info, demo_prompts, etc.)
PROMPT_BUILDER_PATTERNS = [
    re.compile(r'SYSTEM_TEMPLATE\s*=\s*"""'),           # template string assignment
    re.compile(r'"You are Mithrandir[^"]{0,5}—'),       # persona declaration with em-dash
    re.compile(r"'You are Mithrandir[^']{0,5}—"),
    re.compile(r'def\s+_build_(?:system|local)_prompt'), # our specific builders
    re.compile(r'system_prompt\s*=.*_build_'),           # assignment from builder
]

# Patterns that indicate the soul is loaded
SOUL_LOAD_PATTERNS = [
    re.compile(r'_SOUL'),
    re.compile(r'_load_soul'),
    re.compile(r'SOUL\.md'),
    re.compile(r'soul_content'),
]

py_files = list(ROOT.rglob("*.py"))
py_files = [
    f for f in py_files
    if ".venv" not in str(f)
    and "site-packages" not in str(f)
    and "styletts2_repo" not in str(f)
]

for py_file in sorted(py_files):
    content = py_file.read_text(encoding="utf-8", errors="ignore")
    rel = py_file.relative_to(ROOT)

    has_prompt_builder = any(p.search(content) for p in PROMPT_BUILDER_PATTERNS)
    has_soul_load = any(p.search(content) for p in SOUL_LOAD_PATTERNS)

    if has_prompt_builder:
        if has_soul_load:
            ok(f"{rel} — builds prompts, soul loaded")
        else:
            fail(f"{rel} — builds system prompts but does NOT load SOUL.md")


# ── 3. Summary ────────────────────────────────────────────────────────────────

print(f"\n{'='*60}")
print(f"Violations : {len(VIOLATIONS)}")
print(f"Warnings   : {len(WARNINGS)}")

if VIOLATIONS:
    print("\nFailed checks:")
    for v in VIOLATIONS:
        print(f"  - {v}")
    sys.exit(1)
elif WARNINGS:
    print("\nAll critical checks passed (warnings above).")
    sys.exit(0)
else:
    print("All checks passed.")
    sys.exit(0)
