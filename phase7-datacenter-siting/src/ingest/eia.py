"""EIA — U.S. Energy Information Administration.

API: https://www.eia.gov/opendata/  (requires free API key, EIA_API_KEY env)

Datasets:
  - Form 860 — generators, plant locations, capacities, prime movers
  - Form 861 — utility retail sales/revenue (industrial $/kWh by state)
  - Form 930 — hourly balancing-authority generation mix + interchange
"""
from __future__ import annotations

import os

EIA_API_KEY = os.environ.get("EIA_API_KEY", "")


def industrial_retail_price_usd_per_kwh(state: str) -> float | None:
    """Trailing-12mo industrial retail price for `state`. None if unknown."""
    return None


def balancing_authority_carbon_intensity(ba_code: str) -> float | None:
    """gCO2/kWh for the given balancing authority. None if unknown."""
    return None
