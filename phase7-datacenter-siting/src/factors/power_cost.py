"""power_cost — wholesale LMP + industrial retail $/kWh.

Sources:
  - EIA-861 (state retail tariffs)
  - ISO/RTO LMP feeds (PJM, ERCOT, MISO, SPP, CAISO, NYISO, ISO-NE)
  - State PUC tariff filings

Sub-score (lower $ = higher score):
  $0.025/kWh blended industrial -> 1.0
  $0.060/kWh                    -> 0.5
  $0.120/kWh                    -> 0.0
"""
from __future__ import annotations

from ..normalize import piecewise
from ._base import FactorResult, stub_result

_ANCHORS = [(0.025, 1.0), (0.040, 0.85), (0.060, 0.5), (0.090, 0.2), (0.120, 0.0)]


def score(site) -> FactorResult:
    # TODO: wire EIA-861 + ISO LMP fetch keyed by state/balancing authority
    return stub_result("power_cost", "EIA-861 + ISO LMP")
