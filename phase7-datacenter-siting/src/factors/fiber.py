"""fiber — long-haul fiber proximity, route diversity, peering distance.

Sources:
  - HIFLD Long-haul Fiber Optic
  - FCC Form 477 broadband deployment
  - PeeringDB (IXPs and carrier-neutral facilities)
  - State DOT fiber inventories where public

Sub-score:
  Combines (a) distance to nearest long-haul route, (b) count of distinct
  routes within 5 mi (proxy for diversity), (c) distance to nearest
  carrier-neutral peering facility.

Kill criterion:
  No long-haul route within 25 miles.
"""
from __future__ import annotations

from ..ingest import hifld
from ..normalize import piecewise
from ._base import FactorResult, stub_result

_DIST_ANCHORS = [(0.0, 1.0), (1.0, 0.95), (5.0, 0.7), (15.0, 0.35), (25.0, 0.1), (50.0, 0.0)]


def score(site) -> FactorResult:
    routes = hifld.longhaul_fiber()
    if not routes:
        return stub_result("fiber", "HIFLD Long-haul Fiber")
    from ..geo import nearest_distance_mi

    dist_mi = nearest_distance_mi(site.lat, site.lon, routes)
    if dist_mi is None:
        return stub_result("fiber", "HIFLD Long-haul Fiber")
    sub = piecewise(dist_mi, _DIST_ANCHORS)
    kill = dist_mi > 25.0
    return FactorResult(
        sub_score=sub,
        kill=kill,
        provenance={
            "source": "HIFLD Long-haul Fiber",
            "nearest_distance_mi": round(dist_mi, 3),
            "kill_threshold_mi": 25.0,
        },
    )
