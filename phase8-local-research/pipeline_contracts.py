"""Common contracts for the local Gemma research pipeline.

These structures are shared by data-center and LLM-release workflows.
Validation and export code should treat them as canonical shapes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Confidence = Literal["high", "medium", "low"]


@dataclass
class Citation:
    source_url: str
    archive_url: str = ""
    publisher: str = ""
    published_date: str = ""


@dataclass
class Milestone:
    date: str
    event: str
    citation: Citation


@dataclass
class Conflict:
    field: str
    value_a: str
    source_a: str
    value_b: str
    source_b: str
    note: str = ""


@dataclass
class DataCenterRecord:
    canonical_name: str
    state: str
    county: str = ""
    city: str = ""
    lat: str = ""
    lng: str = ""
    developer: str = ""
    operator: str = ""
    status_current: str = ""
    status_current_date: str = ""
    capacity_mw: str = ""
    investment_usd: str = ""
    water_usage_gpd: str = ""
    acreage: str = ""
    square_footage: str = ""
    status_confidence: Confidence = "low"
    capacity_confidence: Confidence = "low"
    investment_confidence: Confidence = "low"
    citations: dict[str, Citation] = field(default_factory=dict)
    milestones: list[Milestone] = field(default_factory=list)
    conflicts: list[Conflict] = field(default_factory=list)
    notes: str = ""


@dataclass
class LlmReleaseRecord:
    lab_name: str
    model_name: str
    release_date: str
    context_window_tokens: str = "N/A"
    input_cost_usd_per_1m: str = "N/A"
    output_cost_usd_per_1m: str = "N/A"
    throughput_tokens_per_sec: str = "N/A"
    swe_bench_verified_pct: str = "N/A"
    mmlu_pct: str = "N/A"
    weights: Literal["open", "closed", "gated"] = "closed"
    status: Literal["active", "deprecated", "retired"] = "active"
    source_url: str = ""
    notes: str = ""


def has_required_citation(record: DataCenterRecord, field_name: str) -> bool:
    """Return True when a populated field has a paired citation."""
    value = getattr(record, field_name, "")
    if not value:
        return True
    cite = record.citations.get(field_name)
    return bool(cite and cite.source_url)
