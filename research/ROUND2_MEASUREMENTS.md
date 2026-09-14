# Round-2 Measurements (no budget spent)

Proposed by Fable 5.1 in `prompts/phase2-round2-response.md` and run on
2026-09-15 with `tools/round2-measurements.mjs`.
Data: the train window of `qx_capture_20260914T1929` (up to 2026-09-12 10:24
UTC). h002's outcomes were never computed for reading; only its fire times
and prices were used.

## A. h001's 106 trades are 31 excursions

Trades on the same asset, in the same direction, ≤ 60 minutes apart, count as
one excursion.

| | Win rate | 95% CI |
| :--- | ---: | :--- |
| All trades, CALL (66) | 42.4% | 31.2–54.4 |
| All trades, PUT (40) | 37.5% | 24.2–53.0 |
| **First trade of each excursion (31)** | **41.9%** | **26.4–59.2** |
| Mean of per-excursion win rates (31, each weighted equally) | 59.8% | — |

Excursion sizes: 15, 9, 7, 6, 6, 6, 5, 5, 5, 5, 4, 4, 3, 3, then 2×6 and 1×11.

**Reading:** there were 31 effective trials, not 106. Weighted by trade, it's
40.6%; weighted by excursion, 59.8%. The gap comes from a few long excursions
where price kept moving while the rule kept fading. On 31 excursions, both
numbers are consistent with 50%. **This confirms the critique: it's a coin
flip.** It is not evidence for "follow the deviation", and not evidence of a
hidden fade edge either.

**Protocol note for the harness:** the screen counts decided trades. Trades
clustered on one excursion inflate the sample size. Before the next screen,
the harness should also report distinct excursions, and a kill or survive
should not rest on a sample that is mostly a few clusters.

## B. h002's clip fingerprint: no pinning, so h002 is dropped

A hard clip pins the touches to one price (spread of 0–1 tick). A random walk
spreads them across the 0.5σ band.

| Asset | Fires | Touch spread (ticks), sorted | 0.5σ band (ticks) |
| :--- | ---: | :--- | ---: |
| AUD/NZD | 8 | 18, 28, 30, 32, 32, 34, 36, 36 | 40 |
| GBP/NZD | 6 | 44, 47, 47, 47, 50, 56 | 57 |
| NZD/CHF | 2 | 13, 13 | 18 |
| NZD/USD | 4 | 8, 11, 11, 13 | 14 |
| USD/BDT | 4 | 12, 13, 13, 16 | 16 |
| USD/BRL | 6 | 6, 7, 7, 7, 7, 8 | 8 |
| USD/IDR | 2 | 51, 53 | 54 |
| USD/MXN | 9 | 13–18 | 18 |
| USD/PHP | 12 | 6–10 | 10 |

**0 of 53 fires show a 0–1 tick spread.** On every asset the spread fills the
band, which is the random-walk signature. By the rule the source committed to
before this measurement ("if no pinning, drop it"), **h002 is dropped**. The
8σ spike filter blanks 9.6% of 6-hour windows (6.5% of 4-hour windows). That's
modest, and not why h002 fires so rarely.

## C. Shock catalogue: no timing structure in the OTC data alone

| UTC | Asset | Move |
| :--- | :--- | ---: |
| 09-07 20:24 | USD/IDR | +0.23% |
| 09-08 13:47 | USD/BDT | −1.45% |
| 09-08 14:50 | NZD/CHF | +3.91% |
| 09-09 08:14 | USD/BRL | −5.87% |
| 09-09 13:11 | GBP/NZD | −2.75% |
| 09-09 23:03 | NZD/USD | +1.59% |
| 09-10 00:33 | AUD/NZD | +5.93% |
| 09-11 13:44 | USD/PHP | +1.38% |
| 09-12 02:00 | USD/BRL | −2.32% |
| 09-12 05:09 | USD/IDR | +0.22% |
| 09-12 06:52 | NZD/USD | +5.57% |

- 11 shocks in about 5.4 days across 9 assets, **about 2 a day**; 7 up, 4 down.
- **Question (ii), timing concentration: no.** 1 falls on a quarter-hour
  (0.7 expected by chance), and 2 on a multiple of 5 minutes (2.2 expected).
  No two assets shocked in the same minute. The hours are spread across the
  day. With n = 11 only strong clustering could have shown up, and none did.
- **Questions (i) and (iii), re-syncing to the real rate: not yet
  measurable.** They need 1m OHLC for the real pairs over the same minutes,
  which no capture contains. In this window 5 shocks are on NZD pairs that
  Quotex may also list as real (non-OTC) pairs: NZD/CHF, GBP/NZD, NZD/USD ×2,
  and AUD/NZD.

## Where the idea source's decision tree stands

| Structure | Test | Result |
| :--- | :--- | :--- |
| Slow tether (OU) | h001 screen | Killed; 31 excursions; coin flip |
| Hard clip | h002 fingerprint | No pinning; h002 dropped |
| Scheduled resets | (ii) timing | No concentration (n = 11) |
| Resets re-sync to the real rate | (i) and (iii) | **Open: needs real-pair data** |

The source recommends stopping if (i), (ii) and (iii) all come back "no".
Two structures are now ruled out and (ii) is "no". The last open question is
(i)/(iii).

## Independent replication by Fable 5.1 (round 3)

Fable received the raw captures and a prompt without our results, with
tests restricted to bars before the cutoff
(`prompts/phase2-round3-response.md`). Its code was written from scratch.

| Measurement | Ours | Fable's | Match |
| :--- | :--- | :--- | :--- |
| Two captures agree | 99.99% over the whole overlap; the one differing bar per series is after the cutoff | 100.0% before the cutoff | ✓ consistent |
| h001 trades | 106, 43 W | 106, 43 W | ✓ |
| h001 excursions | 31; first-trade 13/31 = 41.9% [26.4–59.2] | 31; 13/31 = 41.9% [26.4–59.2] | ✓ |
| h001 by direction | CALL 28/66, PUT 15/40 | CALL 28/66, PUT 15/40 | ✓ |
| h002 fires | 53 | 53 | ✓ |
| h002 pinned ≤ 1 tick | 0 of 53 | 0 of 53 | ✓ |
| h002 spreads per asset | e.g. USD/PHP 6–10 ticks, band 10 | USD/PHP 6–10, band 10 | ✓ (every asset) |
| 8σ guard nulls (360) | 9.6% | 9.6% | ✓ |
| Shocks | the same 11, with the same times, sizes and signs | the same 11 | ✓ |
| Quarter-hour / same minute | 1 (0.7 expected) / 0 | 1 (0.73, p = 0.53) / 0 | ✓ |

Two different implementations produced identical numbers. The input and the
analysis have now both been checked independently, which is the lesson from
the old project's first verdict.

**One correction to the response:** it says there are "two Saturday shocks
(09-12)". 2026-09-12 was a Saturday, and **three** shocks fall on it (USD/BRL
02:00, USD/IDR 05:09, NZD/USD 06:52). With real FX closed, all three can't be
compared against a real rate. That leaves 8 shocks that can be, and 4 of
those are on NZD pairs the platform may list as non-OTC.

**New observation, post hoc and flagged as such by the source:** widening the
definition to 8×–15× the median gives about 19 jumps, and 3 of them land exactly on
minute :00. It carries no direction. It is pre-registered below as a timing
check for the next capture, not as a finding.
