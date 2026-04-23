"""CSV and JSON exporters for phase 8 outputs."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from pipeline_contracts import DataCenterRecord, LlmReleaseRecord


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _as_str(value: Any, default: str = "") -> str:
    if value is None:
        return default
    return str(value)


def export_datacenter(records: list[dict[str, Any]], out_dir: Path, run_id: str) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)

    normalized: list[DataCenterRecord] = []
    for rec in records:
        normalized.append(
            DataCenterRecord(
                canonical_name=_as_str(rec.get("canonical_name")),
                state=_as_str(rec.get("state")),
                county=_as_str(rec.get("county")),
                city=_as_str(rec.get("city")),
                lat=_as_str(rec.get("lat")),
                lng=_as_str(rec.get("lng")),
                developer=_as_str(rec.get("developer")),
                operator=_as_str(rec.get("operator")),
                status_current=_as_str(rec.get("status_current")),
                status_current_date=_as_str(rec.get("status_current_date")),
                capacity_mw=_as_str(rec.get("capacity_mw")),
                investment_usd=_as_str(rec.get("investment_usd")),
                water_usage_gpd=_as_str(rec.get("water_usage_gpd")),
                acreage=_as_str(rec.get("acreage")),
                square_footage=_as_str(rec.get("square_footage")),
                status_confidence=_as_str(rec.get("status_confidence"), "low") or "low",
                capacity_confidence=_as_str(rec.get("capacity_confidence"), "low") or "low",
                investment_confidence=_as_str(rec.get("investment_confidence"), "low") or "low",
                notes=_as_str(rec.get("notes")),
            )
        )

    csv_path = out_dir / f"datacenter_research_local_{run_id}.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "canonical_name",
            "state",
            "county",
            "city",
            "lat",
            "lng",
            "developer",
            "operator",
            "status_current",
            "status_current_date",
            "capacity_mw",
            "investment_usd",
            "water_usage_gpd",
            "acreage",
            "square_footage",
            "status_confidence",
            "capacity_confidence",
            "investment_confidence",
            "notes",
        ])
        for r in normalized:
            writer.writerow([
                r.canonical_name,
                r.state,
                r.county,
                r.city,
                r.lat,
                r.lng,
                r.developer,
                r.operator,
                r.status_current,
                r.status_current_date,
                r.capacity_mw,
                r.investment_usd,
                r.water_usage_gpd,
                r.acreage,
                r.square_footage,
                r.status_confidence,
                r.capacity_confidence,
                r.investment_confidence,
                r.notes,
            ])

    # Avalon seed format for quick ingest/adaptation.
    avalon_path = out_dir / f"avalon_sites_seed_local_{run_id}.csv"
    with avalon_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["site_id", "lat", "lon", "state", "developer", "operator", "status_current"])
        for idx, r in enumerate(normalized, start=1):
            site_id = r.canonical_name or f"SITE-{idx:03d}"
            writer.writerow([site_id, r.lat, r.lng, r.state, r.developer, r.operator, r.status_current])

    json_path = out_dir / f"datacenter_research_local_{run_id}.json"
    _write_json(json_path, {"records": [r.__dict__ for r in normalized]})

    return {
        "csv": str(csv_path),
        "json": str(json_path),
        "avalon_seed_csv": str(avalon_path),
    }


def export_llm(records: list[dict[str, Any]], out_dir: Path, run_id: str) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)

    normalized: list[LlmReleaseRecord] = []
    for rec in records:
        normalized.append(
            LlmReleaseRecord(
                lab_name=_as_str(rec.get("lab_name")),
                model_name=_as_str(rec.get("model_name")),
                release_date=_as_str(rec.get("release_date")),
                context_window_tokens=_as_str(rec.get("context_window_tokens"), "N/A") or "N/A",
                input_cost_usd_per_1m=_as_str(rec.get("input_cost_usd_per_1m"), "N/A") or "N/A",
                output_cost_usd_per_1m=_as_str(rec.get("output_cost_usd_per_1m"), "N/A") or "N/A",
                throughput_tokens_per_sec=_as_str(rec.get("throughput_tokens_per_sec"), "N/A") or "N/A",
                swe_bench_verified_pct=_as_str(rec.get("swe_bench_verified_pct"), "N/A") or "N/A",
                mmlu_pct=_as_str(rec.get("mmlu_pct"), "N/A") or "N/A",
                weights=_as_str(rec.get("weights"), "closed") or "closed",
                status=_as_str(rec.get("status"), "active") or "active",
                source_url=_as_str(rec.get("source_url")),
                notes=_as_str(rec.get("notes")),
            )
        )

    csv_path = out_dir / f"llm_releases_local_{run_id}.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "lab_name",
            "model_name",
            "release_date",
            "context_window_tokens",
            "input_cost_usd_per_1m",
            "output_cost_usd_per_1m",
            "throughput_tokens_per_sec",
            "swe_bench_verified_pct",
            "mmlu_pct",
            "weights",
            "status",
            "source_url",
            "notes",
        ])
        for r in normalized:
            writer.writerow([
                r.lab_name,
                r.model_name,
                r.release_date,
                r.context_window_tokens,
                r.input_cost_usd_per_1m,
                r.output_cost_usd_per_1m,
                r.throughput_tokens_per_sec,
                r.swe_bench_verified_pct,
                r.mmlu_pct,
                r.weights,
                r.status,
                r.source_url,
                r.notes,
            ])

    json_path = out_dir / f"llm_releases_local_{run_id}.json"
    _write_json(json_path, {"records": [r.__dict__ for r in normalized]})

    return {
        "csv": str(csv_path),
        "json": str(json_path),
    }
