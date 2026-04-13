"""
performance_tracker.py — Compute actual returns on logged QV signals

Pulls historical price data from yfinance for every logged snapshot and
computes return vs SPY benchmark over 30/90/180/365-day horizons.

This is how you find out if the model has alpha — or if you've been
running an expensive coin flip.

Usage:
    python performance_tracker.py             # Update all returns
    python performance_tracker.py --report    # Print full performance report
    python performance_tracker.py --summary   # One-line summary (for Telegram /performance)
"""

import sys
import sqlite3
import datetime
import argparse
from pathlib import Path
from typing import Optional

_HERE = Path(__file__).parent
_DB_PATH = _HERE / "signals.db"

HORIZONS = [30, 90, 180, 365]   # calendar days


# ---------------------------------------------------------------------------
# Price fetching
# ---------------------------------------------------------------------------

def _fetch_price(ticker: str, target_date: str, tolerance_days: int = 5) -> Optional[float]:
    """
    Get the closing price for ticker on or just after target_date.
    Returns None if yfinance can't find data.
    """
    try:
        import yfinance as yf
        dt = datetime.date.fromisoformat(target_date)
        end = dt + datetime.timedelta(days=tolerance_days + 1)
        hist = yf.download(ticker, start=dt.isoformat(), end=end.isoformat(),
                           progress=False, auto_adjust=True)
        if hist.empty:
            return None
        # Get 'Close' column (handles MultiIndex from yfinance)
        close = hist["Close"]
        if hasattr(close, "iloc"):
            val = close.iloc[0]
            if hasattr(val, "item"):  # numpy scalar
                val = val.item()
            return float(val) if val == val else None  # NaN check
        return None
    except Exception:
        return None


def _fetch_price_range(ticker: str, start: str, end: str) -> Optional[float]:
    """Get most recent price between start and end dates."""
    try:
        import yfinance as yf
        hist = yf.download(ticker, start=start, end=end,
                           progress=False, auto_adjust=True)
        if hist.empty:
            return None
        close = hist["Close"]
        val = close.iloc[-1]
        if hasattr(val, "item"):
            val = val.item()
        return float(val) if val == val else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Return computation
# ---------------------------------------------------------------------------

def update_returns(verbose: bool = True) -> dict:
    """
    For every logged signal snapshot, compute returns at each horizon.
    Skips records that are already computed and up-to-date.

    Returns summary dict with total_updated count.
    """
    conn = sqlite3.connect(str(_DB_PATH))

    snapshots = conn.execute(
        "SELECT DISTINCT snapshot_dt FROM signal_snapshots ORDER BY snapshot_dt"
    ).fetchall()

    if not snapshots:
        conn.close()
        return {"updated": 0, "message": "No signal snapshots found. Run signal_logger.py first."}

    today = datetime.date.today()
    total_updated = 0

    for (snap_dt,) in snapshots:
        snap_date = datetime.date.fromisoformat(snap_dt)
        tickers = conn.execute(
            "SELECT ticker FROM signal_snapshots WHERE snapshot_dt = ? ORDER BY rank",
            (snap_dt,)
        ).fetchall()

        for (ticker,) in tickers:
            # Fetch entry price (price on signal date)
            entry_price = _fetch_price(ticker, snap_dt)
            spy_entry = _fetch_price("SPY", snap_dt)
            if entry_price is None:
                continue  # can't compute without entry price

            for horizon in HORIZONS:
                exit_date = snap_date + datetime.timedelta(days=horizon)

                # If horizon hasn't passed yet, compute return-to-date
                if exit_date > today:
                    # Return to current date
                    exit_price = _fetch_price_range(
                        ticker,
                        (today - datetime.timedelta(days=3)).isoformat(),
                        (today + datetime.timedelta(days=1)).isoformat()
                    )
                    spy_exit = _fetch_price_range(
                        "SPY",
                        (today - datetime.timedelta(days=3)).isoformat(),
                        (today + datetime.timedelta(days=1)).isoformat()
                    )
                    is_final = False
                else:
                    # Horizon has passed — use actual exit price
                    exit_price = _fetch_price(ticker, exit_date.isoformat())
                    spy_exit = _fetch_price("SPY", exit_date.isoformat())
                    is_final = True

                if exit_price is None:
                    continue

                ret = (exit_price - entry_price) / entry_price
                spy_ret = ((spy_exit - spy_entry) / spy_entry) if (spy_exit and spy_entry) else None
                alpha = (ret - spy_ret) if spy_ret is not None else None

                try:
                    conn.execute("""
                        INSERT OR REPLACE INTO return_records
                        (snapshot_dt, ticker, price_entry, price_current, price_exit,
                         horizon_days, return_pct, spy_return_pct, alpha_pct, last_updated)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        snap_dt, ticker,
                        entry_price,
                        exit_price if not is_final else None,
                        exit_price if is_final else None,
                        horizon,
                        ret, spy_ret, alpha,
                        today.isoformat()
                    ))
                    total_updated += 1
                except Exception:
                    pass

        conn.commit()
        if verbose:
            print(f"  Updated returns for snapshot {snap_dt}")

    conn.close()
    return {"updated": total_updated}


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def _get_report_data() -> list[dict]:
    """Return all return records with snapshot metadata."""
    conn = sqlite3.connect(str(_DB_PATH))
    rows = conn.execute("""
        SELECT r.snapshot_dt, r.ticker, ss.rank, ss.sector,
               r.horizon_days, r.return_pct, r.spy_return_pct, r.alpha_pct,
               r.price_entry, r.price_exit, r.price_current
        FROM return_records r
        JOIN signal_snapshots ss ON r.snapshot_dt = ss.snapshot_dt AND r.ticker = ss.ticker
        ORDER BY r.snapshot_dt, r.horizon_days, ss.rank
    """).fetchall()
    conn.close()
    cols = ["snapshot_dt", "ticker", "rank", "sector", "horizon_days",
            "return_pct", "spy_return_pct", "alpha_pct",
            "price_entry", "price_exit", "price_current"]
    return [dict(zip(cols, r)) for r in rows]


def performance_report() -> str:
    """
    Generate a full performance report across all snapshots and horizons.
    """
    data = _get_report_data()
    if not data:
        return "No return data yet. Run: python performance_tracker.py (to update returns first)"

    lines = ["=" * 60, "QV SIGNAL PERFORMANCE REPORT", "=" * 60]

    # Group by horizon
    from collections import defaultdict
    by_horizon: dict[int, list] = defaultdict(list)
    for r in data:
        if r["return_pct"] is not None:
            by_horizon[r["horizon_days"]].append(r)

    for horizon in sorted(by_horizon.keys()):
        records = by_horizon[horizon]
        returns = [r["return_pct"] for r in records if r["return_pct"] is not None]
        spy_returns = [r["spy_return_pct"] for r in records if r["spy_return_pct"] is not None]
        alphas = [r["alpha_pct"] for r in records if r["alpha_pct"] is not None]

        if not returns:
            continue

        avg_ret = sum(returns) / len(returns)
        avg_spy = sum(spy_returns) / len(spy_returns) if spy_returns else None
        avg_alpha = sum(alphas) / len(alphas) if alphas else None
        win_rate = sum(1 for r in returns if r > 0) / len(returns)
        beat_spy = sum(1 for a in alphas if a > 0) / len(alphas) if alphas else None

        lines.append(f"\n{horizon}-Day Horizon ({len(records)} positions):")
        lines.append(f"  Avg return:    {avg_ret:+.1%}")
        if avg_spy is not None:
            lines.append(f"  Avg SPY:       {avg_spy:+.1%}")
        if avg_alpha is not None:
            lines.append(f"  Avg alpha:     {avg_alpha:+.1%}")
        lines.append(f"  Win rate:      {win_rate:.0%} (positive return)")
        if beat_spy is not None:
            lines.append(f"  Beat SPY:      {beat_spy:.0%} of positions")

    # Best and worst performers
    all_returns = [(r["ticker"], r["snapshot_dt"], r["return_pct"], r["horizon_days"])
                   for r in data if r["return_pct"] is not None and r["horizon_days"] == 365]
    if all_returns:
        all_returns.sort(key=lambda x: x[2], reverse=True)
        lines.append("\nTop 5 picks (365-day):")
        for ticker, dt, ret, _ in all_returns[:5]:
            lines.append(f"  {ticker} ({dt}): {ret:+.1%}")
        lines.append("\nBottom 5 picks (365-day):")
        for ticker, dt, ret, _ in all_returns[-5:]:
            lines.append(f"  {ticker} ({dt}): {ret:+.1%}")

    lines.append("\n" + "=" * 60)
    return "\n".join(lines)


def performance_summary() -> str:
    """
    One-line summary suitable for Telegram /performance command.
    Returns the most actionable metric: avg alpha at best available horizon.
    """
    data = _get_report_data()
    if not data:
        return "No return data yet. Signals need time to mature."

    from collections import defaultdict
    by_horizon: dict[int, list] = defaultdict(list)
    for r in data:
        if r["return_pct"] is not None and r["alpha_pct"] is not None:
            by_horizon[r["horizon_days"]].append(r)

    parts = []
    for horizon in sorted(by_horizon.keys()):
        records = by_horizon[horizon]
        if len(records) < 3:
            continue
        alphas = [r["alpha_pct"] for r in records if r["alpha_pct"] is not None]
        if not alphas:
            continue
        avg_alpha = sum(alphas) / len(alphas)
        beat_rate = sum(1 for a in alphas if a > 0) / len(alphas)
        parts.append(f"{horizon}d: {avg_alpha:+.1%} alpha, {beat_rate:.0%} beat SPY ({len(records)} picks)")

    if not parts:
        snapshots = list(set(r["snapshot_dt"] for r in data))
        return f"Tracking {len(snapshots)} snapshot(s), returns still maturing."

    return "QV signal performance: " + " | ".join(parts)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", action="store_true", help="Print full performance report")
    parser.add_argument("--summary", action="store_true", help="Print one-line summary")
    args = parser.parse_args()

    if args.summary:
        print(performance_summary())
        sys.exit(0)

    if args.report:
        print(performance_report())
        sys.exit(0)

    # Default: update returns
    print("Updating return records...")
    result = update_returns(verbose=True)
    print(f"\nDone. Updated {result['updated']} return records.")
    print("\nPerformance summary:")
    print(performance_summary())
