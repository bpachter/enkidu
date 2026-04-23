"""CLI entrypoint for the local Gemma research pipeline.

Usage examples:
  python phase8-local-research/run_pipeline.py --domain datacenter --input-file docs/brief.txt
  python phase8-local-research/run_pipeline.py --domain llm --input-file docs/llm_brief.txt
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

from exporters import export_datacenter, export_llm
from local_gemma_client import LocalGemmaClient
from stages import run_discovery, run_normalization, run_qa, run_verification


def _load_source_text(input_file: str | None, input_text: str | None) -> str:
    if input_text:
        return input_text
    if input_file:
        return Path(input_file).read_text(encoding="utf-8")
    return (
        "No source text provided. Provide --input-file or --input-text for best results. "
        "The pipeline will still run but output quality will be low."
    )


def _write_stage(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run local Gemma research pipeline")
    parser.add_argument("--domain", choices=["datacenter", "llm"], required=True)
    parser.add_argument("--input-file", help="Path to source briefing text/notes")
    parser.add_argument("--input-text", help="Inline source text")
    parser.add_argument("--target-count", type=int, default=20)
    parser.add_argument("--out-dir", default="phase8-local-research/output")
    parser.add_argument("--run-id", default=datetime.now().strftime("%Y%m%d_%H%M%S"))
    args = parser.parse_args()

    out_dir = Path(args.out_dir) / args.domain / args.run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    source_text = _load_source_text(args.input_file, args.input_text)
    client = LocalGemmaClient()

    discovery = run_discovery(client, domain=args.domain, source_text=source_text, target_count=args.target_count)
    _write_stage(out_dir / "stage1_discovery.json", discovery.payload)

    verification = run_verification(
        client,
        domain=args.domain,
        source_text=source_text,
        discovery=discovery.payload,
    )
    _write_stage(out_dir / "stage2_verification.json", verification.payload)

    normalized = run_normalization(client, domain=args.domain, verified=verification.payload)
    _write_stage(out_dir / "stage3_normalization.json", normalized.payload)

    qa = run_qa(args.domain, normalized.payload)
    _write_stage(out_dir / "stage4_qa.json", qa.payload)

    records = normalized.payload.get("normalized_records", [])
    if args.domain == "datacenter":
        exports = export_datacenter(records=records, out_dir=out_dir, run_id=args.run_id)
    else:
        exports = export_llm(records=records, out_dir=out_dir, run_id=args.run_id)

    summary = {
        "domain": args.domain,
        "run_id": args.run_id,
        "row_count": len(records),
        "qa": qa.payload,
        "exports": exports,
    }
    _write_stage(out_dir / "summary.json", summary)

    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
