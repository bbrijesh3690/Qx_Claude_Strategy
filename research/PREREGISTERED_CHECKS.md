# Pre-registered Checks for the Next Capture

These are written down before the data exists. They are descriptive checks,
not hypotheses, and they use no budget. They run on a capture that does not
overlap `qx_capture_20260914T1829` or `qx_capture_20260914T1929`.

## T1: Do large jumps land on minute :00? (from round 3, post hoc)

- **Jump:** a bar with a continuous seam and |ln(close / prev close)| > 8 × that
  asset's median non-zero absolute 1m close-to-close log move. The previous bar
  must be exactly 1 minute earlier.
- **Statistic:** the count of jumps whose bar opens at minute :00, against
  Binomial(n, 1/60).
- **Pass (worth pursuing):** one-sided p < 0.01 **and** at least 5 jumps on :00.
  Otherwise the round-3 observation (3 of 19) is treated as noise.

## R1: Do shocks re-sync the OTC price to the real rate? (the source's (i) and (iii))

This needs 1m OHLC for the platform's **non-OTC** versions of the captured
pairs, over the same minutes. Weekday sessions only; shocks while real FX is
closed are excluded.

- **Shock:** as in `ROUND2_MEASUREMENTS.md` C, i.e. above max(0.2%, 15 × median).
- **(i) Landing:** the share of shocks whose post-shock OTC close is within 0.1%
  of the real close at the same minute, against the share whose pre-shock close
  (bar i−1) is within 0.1%.
- **(iii) Pre-shock gap:** |OTC − real| / real over the 30 bars before each
  shock, against its distribution over all non-shock minutes.
- **Pass (worth pursuing):** (i) shows landing in at least 2 of every 3 shocks
  and at least twice the pre-shock share, with at least 6 evaluable shocks.
  **Or** (iii) puts the pre-shock gap above the 95th percentile of the
  unconditional distribution in at least 2 of every 3 shocks.
- **Stop rule, agreed in advance:** if R1 does not pass, the program stops
  (the source's recommendation, 2026-09-15).
