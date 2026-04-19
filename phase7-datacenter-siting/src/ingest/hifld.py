"""HIFLD Open Data — Homeland Infrastructure Foundation-Level Data.

Portal: https://hifld-geoplatform.opendata.arcgis.com

Datasets we use:
  - Electric Power Transmission Lines        (filter: VOLTAGE >= 230)
  - Electric Substations
  - Natural Gas Interstate and Intrastate Pipelines
  - Long-haul Fiber Optic Cables
  - Internet Exchange Points

Real ingest (TODO) downloads each layer as GeoJSON or shapefile, caches
to data/raw/hifld/<layer>/<YYYY-MM-DD>/, parses with geopandas, and
returns either an iterable of (lat, lon) representative points (for line
features we sample at fixed spacing along the geometry) or a GeoDataFrame.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from .. import config


def _cache_dir(layer: str) -> Path:
    d = config.RAW_DIR / "hifld" / layer
    d.mkdir(parents=True, exist_ok=True)
    return d


@lru_cache(maxsize=1)
def transmission_lines_230kv_plus() -> list[tuple[float, float]]:
    """Representative points along ≥230 kV transmission lines.

    Returns an empty list until ingest is implemented. Sampling spacing
    will be ~1 mile so that nearest-neighbor distance has bounded error.
    """
    # TODO: download HIFLD ElectricPowerTransmissionLines, filter VOLTAGE>=230,
    # densify each LineString to ~1-mile spacing, return [(lat, lon), ...]
    return []


@lru_cache(maxsize=1)
def substations() -> list[tuple[float, float, dict]]:
    """Substations as (lat, lon, attrs)."""
    return []


@lru_cache(maxsize=1)
def natgas_pipelines_major() -> list[tuple[float, float]]:
    """Sampled points along interstate gas transmission pipelines (≥20")."""
    return []


@lru_cache(maxsize=1)
def longhaul_fiber() -> list[tuple[float, float]]:
    """Sampled points along long-haul fiber routes."""
    return []


@lru_cache(maxsize=1)
def internet_exchanges() -> list[tuple[float, float, dict]]:
    return []
