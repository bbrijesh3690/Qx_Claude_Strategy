# Phase 1 — Null Baselines

Run 2026-09-15 with harness v0.1.4, `node harness/bin/qx.js nulls`.

- **Dataset:** `data/qx_capture_20260914T1929.json`, sha256 `23bd8f5c7f0bc012…`
- **Series:** 9 OTC, all passing integrity. USD/PHP is split at its verified gap.
- **Train window:** bars before **2026-09-12 10:24 UTC**. The holdout starts
  there and **has not been looked at**.
- **Payout:** 90%, so break-even is **52.6%**.
- **Real pairs:** none captured, so nothing here applies to them.

## Pooled OTC, train window

Rates exclude ties. Trades never overlap (one open position per asset).

| Expiry | Null | Decided | Rate | 95% CI | EV/trade |
| :--- | :--- | ---: | ---: | :--- | ---: |
| 1m | always CALL | 60,377 | 49.8% | 49.4–50.2 | −5.4% |
| 1m | always PUT | 60,377 | 50.2% | 49.8–50.6 | −4.6% |
| 1m | random | 60,377 | 49.8% | 49.4–50.2 | −5.4% |
| 5m | always CALL | 12,149 | 49.3% | 48.4–50.2 | −6.4% |
| 5m | always PUT | 12,149 | 50.7% | 49.8–51.6 | −3.6% |
| 5m | random | 12,149 | 50.2% | 49.3–51.0 | −4.7% |
| 15m | always CALL | 4,054 | 49.3% | 47.8–50.8 | −6.3% |
| 15m | always PUT | 4,054 | 50.7% | 49.2–52.2 | −3.7% |
| 15m | random | 4,054 | 50.4% | 48.9–52.0 | −4.2% |

Share of flat (tie) outcomes: 1.2% at 1m, 0.5% at 5m, 0.3% at 15m.

## Up-move rate per asset, train window

Intervals are computed on non-overlapping windows.

| Series | 1m | 5m | 15m |
| :--- | :--- | :--- | :--- |
| AUD/NZD | 49.6% [48.4–50.8] | 48.1% [45.5–50.8] | 47.6% [42.9–52.2] |
| GBP/NZD | 51.0% [49.8–52.2] | 51.5% [48.9–54.2] | 53.3% [48.7–58.0] |
| NZD/CHF | 49.3% [48.1–50.5] | 49.1% [46.4–51.7] | 49.2% [44.4–53.7] |
| NZD/USD | 49.4% [48.3–50.5] | 48.5% [46.0–51.0] | 46.6% [42.4–50.9] |
| USD/BDT | 49.5% [48.3–50.8] | 50.6% [47.8–53.2] | 49.3% [44.8–54.1] |
| USD/BRL | 50.0% [48.8–51.2] | 50.1% [47.4–52.8] | 49.8% [45.2–54.6] |
| USD/IDR | 49.3% [48.1–50.5] | 48.3% [45.7–51.0] | 48.8% [44.1–53.4] |
| USD/MXN | 50.3% [49.1–51.5] | 50.0% [47.4–52.7] | 50.0% [45.4–54.6] |
| USD/PHP | 49.8% [48.6–51.0] | 48.5% [45.8–51.2] | 48.2% [43.4–52.7] |

## What this establishes

1. **For this data, "nothing" is 50%.** Every pooled null's interval contains
   50%. None of the 27 per-asset cells excludes 50%. No asset has a direction
   drift that a hypothesis could borrow and call an edge. The matched null
   still applies to every hypothesis result, but on this data it will sit
   near 50%.
2. **Break-even, not the null, is the binding hurdle.** At 90% the gap
   between nothing and profitable is 2.6 points. The best-looking null
   (always PUT, 50.7%) still loses 3.6% per trade.
3. **Ties barely matter.** At most 1.2% of outcomes are flat.
4. **The sample is a single week of broker-generated OTC data.** Train covers
   about 4.5 days, with 4,054 non-overlapping 15m trades pooled. That is
   ample for screening a 75% edge (71 trades for a 20-test family), but it is
   one regime. A survivor must also hold on the holdout, and then forward.

## A rule for Phase 2, recorded now

These tables are the only exploratory look at the train window. Hypotheses
must come from a stated mechanism, **not from mining this week of bars for
patterns**. A pattern found by searching this data and then "confirmed" on
the same data is the 19:00 mirage again. If exploration is ever needed, it
has to use a separate capture that is never screened on.
