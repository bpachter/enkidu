"""latency — great-circle distance to top internet exchanges + hyperscaler regions.

Sources:
  - PeeringDB (IXP + facility geocodes)
  - Hyperscaler region maps (AWS, Azure, GCP, OCI public lists)
"""
from __future__ import annotations

from ._base import FactorResult, stub_result


def score(site) -> FactorResult:
    return stub_result("latency", "PeeringDB + hyperscaler region maps")
