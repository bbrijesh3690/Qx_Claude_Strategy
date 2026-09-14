# Temporary Patterns ("Quotex runs a pattern for a while")

Owner's question, 2026-09-15: does the feed run a pattern for a period of
time? Weekly averages would wash out a pattern that comes and goes, so this
scan looks window by window. Tool: `tools/regime-scan.mjs`. Train window of
`qx_capture_20260914T1929` only; no budget spent.

## Method

1. **Windows.** Each asset's gap-free data is cut into non-overlapping 30-,
   60- and 120-minute windows (2,033 / 1,014 / 505 windows). Each window
   measures:
   - trend vs reversal: lag-1 autocorrelation;
   - candle-colour runs: z-score (streaky or alternating);
   - colour predictability from the previous 2 candles: entropy gain, in bits;
   - volatility, relative to that asset's own average.
2. **Chance baseline.** Each asset's real 1-minute moves are shuffled into
   random order 100 times. Sizes stay the same; any timing pattern is
   destroyed. A pattern is real only if the real data is more extreme than
   the shuffles.
3. **Persistence.** Does a window's pattern carry into the next window?
   A pattern that stops as soon as it's detectable can't be traded.
4. **Also checked:** re-used price paths (identical 20-bar shapes or exact
   10-bar tick moves, within or across assets), and whether assets move
   together in the same minute.

## The scan was checked before it was believed

| Validation | Result |
| :--- | :--- |
| Synthetic data with planted hour-long patterns (20% trending, 20% alternating, 70% strength) | **Detected** at all three window sizes; e.g. windows with extreme colour runs 30% vs 1.2% by chance |
| Synthetic pure random walk | **Nothing detected** |
| One copied hour of price path planted in another asset | **Detected** (21 repeated shapes, 51 exact paths; 0 before planting) |
| Planted volatility regimes (20% of hours at 2× volatility) | **Detected** at all window sizes (p = 0.01) |

The first run on real data had a bug: volatility was pooled across assets whose
typical moves differ about 15×, so it measured the gap between assets, not
calm/wild stretches. It was fixed before the results below.

## Results on real data

p = the share of the 100 shuffles at least as extreme as the real data.
"Beats chance" means p ≤ 0.01.

| Measure | 30 min | 60 min | 120 min |
| :--- | :--- | :--- | :--- |
| Spread of trend/reversal across windows | 0.172 vs 0.173, p 0.61 | 0.125 vs 0.125, p 0.47 | 0.088 vs 0.089, p 0.62 |
| Windows with extreme colour runs | 1.2% vs 1.1%, p 0.33 | 1.5% vs 1.2%, p 0.26 | 0.8% vs 1.2%, p 0.90 |
| Colour predictability from last 2 candles | 0.091 vs 0.091, p 0.55 | 0.040 vs 0.040, p 0.82 | 0.018 vs 0.019, p 0.88 |
| Trend/reversal carries into next window | −0.026, p 0.76 | −0.009, p 0.55 | −0.041, p 0.81 |
| Colour pattern carries into next window | +0.007, p 0.30 | −0.058, p 0.97 | −0.092, p 0.99 |
| Spread of volatility across windows | p 0.44 | p 0.93 | p 0.91 |
| Volatility carries into next window | p 0.90 | p 0.67 | p 0.77 |

**Re-used price paths:** 0 repeated 20-bar shapes and 0 exact 10-bar paths
across 60,946 windows, the same as the shuffled data.

**Assets moving together:** all 36 pairs have same-minute correlations within
±0.028, where chance sd is 0.012. None exceed 3 sd.

## What this establishes

1. **No temporary directional patterns** at 30 minutes to 2 hours, on any
   measure. Real windows are exactly as streaky, alternating and predictable
   as shuffled ones. The same scan finds planted patterns easily.
2. **No persistence.** Nothing that appears in one window carries into the
   next. The two largest persistence values are *negative* (−0.058 and −0.092),
   in the direction that trading couldn't use, and not significant across 21
   looks.
3. **Constant volatility.** There are no calm or wild stretches, which even a
   simple realistic generator usually has. Each asset's 1-minute moves look
   like independent draws from one fixed distribution, plus rare shock jumps.
4. **No replayed paths and no shared driver** across assets.

**Bottom line:** within these 5.4 days, what looks like a pattern on the
chart has the same shape as random order. If Quotex does switch patterns,
the switching is either shorter than 30 minutes, which the earlier lag-1
check at 1 minute also rules out, or it doesn't occur in this data.

## Limits

- **5.4 days, 9 assets, one period.** A pattern that runs for days, or only on
  certain days, would need a longer capture.
- **Windows start at fixed clock times.** A pattern shorter than the window and
  misaligned with it is diluted. The 30-minute windows and the 1-minute lag
  check (ρ₁ ≈ 0) cover much of that range.
- **Only these measures were tested.** A pattern visible in some other
  statistic isn't excluded. Any such idea must be stated precisely before it's
  checked, then tested the same way: real data against shuffled.
