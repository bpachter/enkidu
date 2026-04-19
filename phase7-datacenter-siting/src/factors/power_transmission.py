"""power_transmission — distance to ≥230 kV transmission + substation MW headroom.

Sources:
  - HIFLD Transmission Lines (https://hifld-geoplatform.opendata.arcgis.com)
  - HIFLD Electric Substations
  - FERC Form 715 (planning models)
  - ISO/RTO interconnection queues (PJM, ERCOT, MISO, SPP, CAISO, NYISO, ISO-NE)

Sub-score:
  Distance-to-line component (piecewise):
      0 mi  -> 1.0
      1 mi  -> 0.95
      5 mi  -> 0.75
      15 mi -> 0.30
     30 mi  -> 0.0
  Penalize when ISO queue at the nearest POI is congested.

Kill criterion:
  No ≥230 kV line within 15 miles (configurable in kill_criteria.json).
"""
from __future__ import annotations

from ..ingest import hifld
from ..normalize import piecewise
from ._base import FactorResult, stub_result

_DIST_ANCHORS = [(0.0, 1.0), (1.0, 0.95), (5.0, 0.75), (15.0, 0.30), (30.0, 0.0)]


def score(site) -> FactorResult:
    lines = hifld.transmission_lines_230kv_plus()
    if not lines:
        return stub_result("power_transmission", "HIFLD Transmission Lines")

    from ..geo import nearest_distance_mi

    points = ((lat, lon) for lat, lon in lines)
    dist_mi = nearest_distance_mi(site.lat, site.lon, points)
    if dist_mi is None:
        return stub_result("power_transmission", "HIFLD Transmission Lines")

    sub = piecewise(dist_mi, _DIST_ANCHORS)
    kill = dist_mi > 15.0
    return FactorResult(
        sub_score=sub,
        kill=kill,
        provenance={
            "source": "HIFLD Transmission Lines (≥230 kV)",
            "nearest_distance_mi": round(dist_mi, 3),
            "kill_threshold_mi": 15.0,
        },
    )
