# Phase 2, round 3: Fable 5.1 response (ran the tests on the raw captures)

Relayed by the owner on 2026-09-15 and recorded as received. The prompt is in
`phase2-round3-data.md`. Tool-progress narration is condensed into the first
paragraph; the results are verbatim.

---

Structure is clear. First step: build a filtered dataset containing only bars before the cutoff, so nothing downstream can touch the held-out set. Main capture is one gap-free segment per asset (~4.6–5.4 days). Cross-check is clean: 100% identical on every overlapping bar. 106 h001 trades and 53 h002 fires — exactly your counts, so the harness matches your loader. The 106 trades collapse to 31 excursions (one of them 15 trades long); first-trade-per-excursion is 13/31, and at excursion level it's 13 up vs 13 down.

All four tests ran on the pre-cutoff bars only (each asset is a single gap-free segment there, 6.6–7.8k bars). My harness reproduced your h001 (106 trades) and h002 (53 fires) counts exactly, so we're on the same loader semantics.

**0. Cross-check**

| Asset | Overlapping bars | Identical OHLC |
|---|---|---|
| All 9 assets | 5,447–6,793 each | 100.0% (max field difference 0) |

The two exports agree bar-for-bar; the capture is self-consistent.

**A. h001 excursions**

| Metric | Wins / n | Rate | 95% Wilson |
|---|---|---|---|
| All decided trades (0 ties) | 43 / 106 | 40.6% | 31.7–50.1 |
| CALL | 28 / 66 | 42.4% | 31.2–54.4 |
| PUT | 15 / 40 | 37.5% | 24.2–53.0 |
| First trade of each excursion | 13 / 31 | 41.9% | 26.4–59.2 |
| — first-trade CALL | 8 / 18 | 44.4% | 24.6–66.3 |
| — first-trade PUT | 5 / 13 | 38.5% | 17.7–64.5 |

31 excursions, mean 3.4 trades each; sizes 1×11, 2×6, 3×2, 4×2, 5×4, 6×3, 7×1, 9×1, 15×1. At excursion level: 13 net-winning, 13 net-losing, 5 split. The 15-trade excursion is USD/MXN (8/28 = 28.6% for that asset), which is also the asset with VR(240) = 1.27; NZD/CHF 7/21, NZD/USD 10/18, AUD/NZD 5/11, USD/BDT 5/12 account for most of the rest. By day: 30%, 47%, 34%, 52%, 50%.

**B. h002 clip fingerprint**

Tick per asset: 1e-5 for the five NZD/MXN/BRL pairs, 0.001 for USD/BDT and USD/PHP, 0.01 for USD/IDR.

| Asset | Fires | 0.5σ (ticks, median) | Touch spread (ticks) min / med / max | Spread ÷ 0.5σ (median) | Pinned (≤1 tick) | 8σ guard nulls |
|---|---|---|---|---|---|---|
| AUD/NZD | 8 | 39 | 18 / 32 / 36 | 0.77 | 0 | 11.4% |
| USD/BRL | 6 | 8 | 6 / 7 / 8 | 0.90 | 0 | 11.5% |
| GBP/NZD | 6 | 55 | 44 / 47 / 56 | 0.87 | 0 | 5.7% |
| NZD/CHF | 2 | 17 | 13 / 13 / 13 | 0.80 | 0 | 11.5% |
| NZD/USD | 4 | 14 | 8 / 11 / 13 | 0.77 | 0 | 12.5% |
| USD/BDT | 4 | 16 | 12 / 13 / 16 | 0.93 | 0 | 11.4% |
| USD/IDR | 2 | 52 | 51 / 52 / 53 | 0.99 | 0 | 11.4% |
| USD/MXN | 9 | 18 | 13 / 15 / 18 | 0.88 | 0 | 0.3% |
| USD/PHP | 12 | 10 | 6 / 8 / 10 | 0.83 | 0 | 10.4% |
| All | 53 | | | 10–90%: 0.73–0.97 | 0 of 53 | 9.6% |

Touches fill 73–97% of the tolerance band on every fire and none share a price. That is the random-walk signature, not a clip. The guard nulls are 720 = 2 × 360 bars on most assets — two jump events each, not fat tails.

**C. Shock catalogue** (threshold = max(0.2%, 15 × median non-zero |1m move|))

| UTC (bar open) | Asset | Size | Sign |
|---|---|---|---|
| 09-07 20:24 | USD/IDR | 0.229% | + |
| 09-08 13:47 | USD/BDT | 1.450% | − |
| 09-08 14:50 | NZD/CHF | 3.915% | + |
| 09-09 08:14 | USD/BRL | 5.870% | − |
| 09-09 13:11 | GBP/NZD | 2.747% | − |
| 09-09 23:03 | NZD/USD | 1.587% | + |
| 09-10 00:33 | AUD/NZD | 5.929% | + |
| 09-11 13:44 | USD/PHP | 1.383% | + |
| 09-12 02:00 | USD/BRL | 2.318% | − |
| 09-12 05:09 | USD/IDR | 0.216% | + |
| 09-12 06:52 | NZD/USD | 5.570% | + |

On :00/:15/:30/:45: 1 of 11 (chance 0.73, p = 0.53). Sharing an exact minute with another asset: 0 of 11. Signs 7+/4−. UTC hours: 00, 02, 05, 06, 08, 13×3, 14, 20, 23 — three between 13:11 and 13:47 on three different days, which is within what 11 draws over 24 hours produce. USD/MXN has no shocks by this definition; its median move is so small that the 0.2% floor binds.

Reconciling with the guard: eight further jumps sit between 8× and 15× the median (0.06–0.66%), one per asset, so ~19 large jumps in total. Post-hoc note, flagged as such: 3 of those 19 land exactly on :00 (USD/BRL 02:00, USD/IDR 13:00, USD/PHP 10:00) — naive binomial p ≈ 0.003, but I widened the definition after seeing the catalogue and n = 3. It carries no direction and is worth pre-registering as a timing check on the next capture, nothing more.

**D. Questions (i) and (iii)**

Cannot be run: the files contain OTC series only. Needed: 1-minute closed OHLC for the non-OTC versions of the same pairs, same schema (`symbol`, `candles: [time_ms_utc, o, h, l, c]`, open-time stamps, UTC), covering at least 2026-09-07 19:00 to the cutoff. Two sources, if possible: the platform's own non-OTC symbols (the likeliest re-sync target) and an independent interbank 1m feed. Weekday sessions only, so the two Saturday shocks (09-12) are unevaluable regardless; USD/BDT, USD/IDR and USD/PHP will probably lack usable minute bars. With that in hand, (i) is "post-shock OTC close within 0.1% of the real rate, versus pre-shock", and (iii) is "|OTC − real| in the 30 bars before each shock, versus its unconditional distribution."

**Conclusion**

The capture is self-consistent. h001's 40.6% is 31 excursions splitting 13–13, with first-trade rate 41.9% [26–59]: noise around a coin flip, and no continuation signal either. h002's fingerprint is unambiguous — no clip exists on any asset, so drop h002 rather than defer it. Shocks are rare, unsynchronised across assets, sign-balanced and, by the registered definition, unscheduled. Everything visible in OTC bars alone is a random walk plus unpredictable resets.

What changes: h002 goes from conditional to dropped, so the remaining probability of a 75% rule on this feed falls from ~2% to ~1%, and it now rests entirely on the resets being re-syncs to an external rate. If the non-OTC series in D can be obtained, run (i)/(iii) plus the :00 timing check on the next capture. If it can't, stop the program; there is nothing left to screen from these files.
