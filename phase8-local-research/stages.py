"""Stage definitions for the local Gemma research pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from local_gemma_client import LocalGemmaClient


@dataclass
class StageResult:
    stage: str
    payload: dict[str, Any]


def run_discovery(client: LocalGemmaClient, domain: str, source_text: str, target_count: int) -> StageResult:
    system_prompt = (
        "You are a strict research planner. Return JSON only. "
        "Do not include markdown, prose, or code fences."
    )
    user_prompt = (
        f"Domain: {domain}.\\n"
        f"Target count: {target_count}.\\n"
        "Given the source text below, produce candidate targets with minimum fields:\\n"
        "targets: [{name, state, city, status, rationale, seed_sources:[url1,url2]}].\\n"
        "If a value is unknown, use an empty string.\\n"
        "Source text:\\n"
        f"{source_text}"
    )
    payload = client.chat_json(system_prompt=system_prompt, user_prompt=user_prompt, options={"temperature": 0.1})
    payload.setdefault("targets", [])
    return StageResult(stage="discovery", payload=payload)


def run_verification(client: LocalGemmaClient, domain: str, source_text: str, discovery: dict[str, Any]) -> StageResult:
    system_prompt = (
        "You are a strict fact verification assistant. Return JSON only. "
        "Keep unsupported fields blank."
    )
    user_prompt = (
        f"Domain: {domain}.\\n"
        "Input targets are below. Verify and enrich using only provided source text.\\n"
        "Return JSON with key verified_records. Each record must include:\\n"
        "name, state, county, city, developer, operator, status_current, status_current_date,\\n"
        "capacity_mw, investment_usd, source_url, notes, confidence.\\n"
        "Discovery targets:\\n"
        f"{discovery}\\n\\n"
        "Source text:\\n"
        f"{source_text}"
    )
    payload = client.chat_json(system_prompt=system_prompt, user_prompt=user_prompt, options={"temperature": 0.0})
    payload.setdefault("verified_records", [])
    return StageResult(stage="verification", payload=payload)


def run_normalization(client: LocalGemmaClient, domain: str, verified: dict[str, Any]) -> StageResult:
    system_prompt = "You normalize records into stable machine-readable schema. Return JSON only."
    if domain == "datacenter":
        schema_hint = (
            "normalized_records: [{canonical_name,state,county,city,lat,lng,developer,operator,"
            "status_current,status_current_date,capacity_mw,investment_usd,water_usage_gpd,acreage,"
            "square_footage,status_confidence,capacity_confidence,investment_confidence,source_url,notes}]"
        )
    else:
        schema_hint = (
            "normalized_records: [{lab_name,model_name,release_date,context_window_tokens,"
            "input_cost_usd_per_1m,output_cost_usd_per_1m,throughput_tokens_per_sec,"
            "swe_bench_verified_pct,mmlu_pct,weights,status,source_url,notes}]"
        )

    user_prompt = (
        f"Domain: {domain}.\\n"
        f"Normalize verified_records into this schema exactly: {schema_hint}.\\n"
        "Use N/A for unknown numeric-like values in llm domain.\\n"
        "Verified records:\\n"
        f"{verified}"
    )
    payload = client.chat_json(system_prompt=system_prompt, user_prompt=user_prompt, options={"temperature": 0.0})
    payload.setdefault("normalized_records", [])
    return StageResult(stage="normalization", payload=payload)


def run_qa(domain: str, normalized: dict[str, Any]) -> StageResult:
    records = normalized.get("normalized_records", [])
    issues: list[dict[str, str]] = []

    for idx, rec in enumerate(records):
        source_url = str(rec.get("source_url", "")).strip()
        if not source_url:
            issues.append({"row": str(idx), "issue": "missing_source_url"})

        if domain == "datacenter":
            if rec.get("capacity_mw") and not source_url:
                issues.append({"row": str(idx), "issue": "capacity_without_source"})
            if rec.get("investment_usd") and not source_url:
                issues.append({"row": str(idx), "issue": "investment_without_source"})
        else:
            release_date = str(rec.get("release_date", ""))
            if len(release_date) != 10:
                issues.append({"row": str(idx), "issue": "release_date_not_iso"})

    return StageResult(
        stage="qa",
        payload={
            "row_count": len(records),
            "issue_count": len(issues),
            "issues": issues,
        },
    )
