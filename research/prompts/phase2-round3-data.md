# Phase 2, round 3: raw captures and tests sent to Fable 5.1

Owner's decision, 2026-09-15: give Fable the raw captures and have it run the
measurements it proposed.

- **Sent:** `data/qx_capture_20260914T1929.json` (primary) and
  `data/qx_capture_20260914T1829.json` (the earlier capture), exactly as
  exported. Neither file is in git. Checked before sending: besides the
  candles they hold capture diagnostics only (socket event names, frame
  counts, a storage error message). There is no account, balance or login
  data.
- **These files include the holdout period** (from 2026-09-12 10:24 UTC).
  Consequences:
  1. Fable has seen the holdout bars. Any hypothesis Fable proposes from here
     on is screened only on a capture that doesn't overlap these files.
  2. The prompt restricts every test to bars before the cutoff, so Fable's
     report says nothing about the holdout. The holdout stays valid for
     hypotheses that don't come from Fable.
- **Our own results for the same tests** were left out of the prompt, so
  Fable's numbers are an independent replication. They are in
  `../ROUND2_MEASUREMENTS.md`.

---

```text
Attached: two raw capture files from the Quotex OTC feed, exactly as my capture extension exported them.
- qx_capture_20260914T1929.json — the main capture. Use this one for all tests.
- qx_capture_20260914T1829.json — an earlier capture of the same assets, an hour older. Use it only to cross-check that the overlapping bars match.

File format (JSON)
- "series": one entry per asset. Each has "symbol" (the feed's own name, e.g. "USDPHP_otc") and "candles": an array of [time_ms_utc, open, high, low, close] closed 1-minute bars, sorted by time. time_ms_utc is the bar's open time.
- Name assets by "symbol", not by the entry's key (the older file used alphabetical keys). BRLUSD_otc is listed on the platform as USD/BRL.
- "captureStats" is capture diagnostics only; ignore it.
- USD/PHP has one verified genuine price gap at 2026-09-13 06:10 UTC.

Please run the measurements you proposed, using code, and show the results as tables. Use only these files.

Data rules
- USE ONLY BARS BEFORE 2026-09-12 10:24 UTC. Later bars are a held-out test set: do not analyse them, describe them, or report anything about them.
- Treat each asset separately. A missing minute breaks a series: never compute a difference, window or trade across a gap.
- Do not invent or fetch any other data. Real-market (non-OTC) prices are NOT in these files.

Trade conventions (for h001 and h002)
- Decide at the close of bar i. Entry = open of bar i+1. Exit = close of bar i+15 (15-minute expiry).
- Win if exit is beyond entry in the trade's direction; tie if exit = entry (exclude ties).
- One open trade per asset: after a trade decided at bar i, the next decision on that asset is at bar i+15.
- Use your h001 and h002 code exactly as you wrote it.

Tests
0. Cross-check: for bars before the cutoff present in both files, what share have identical OHLC, per asset?

A. h001 excursions. Run h001 on every asset. Report total decided trades, wins, win rate. Then group trades into excursions (same asset, same direction, consecutive trades no more than 60 minutes apart) and report: number of excursions, trades per excursion, win rate by direction (CALL/PUT), and the win rate of only the FIRST trade of each excursion, each with a 95% Wilson interval.

B. h002 clip fingerprint. Run h002 on every asset. For each fire, take the bars in its 360-bar window that count as touches of the level it traded (highs for PUT, lows for CALL) and report the spread (max − min) of those touch prices in ticks, per asset, alongside 0.5σ expressed in ticks. Define the tick per asset as the smallest positive difference between distinct price levels in that asset's data. Also report the fraction of decision bars where the 8σ guard returns null. Do NOT compute or report h002's win rate.

C. Shock catalogue. A shock is a bar whose close-to-close move |ln(close / previous close)| exceeds max(0.2%, 15 × that asset's median non-zero absolute 1m close-to-close log move), with the previous bar exactly one minute earlier. List every shock (UTC time, asset, size, sign). Then report: how many fall on minute :00/:15/:30/:45 vs chance, how many share their exact minute with another asset, and the distribution of UTC hours.

D. Your questions (i) and (iii) — OTC vs the real rate around shocks — cannot be run from these files. Say so, and state exactly what data and format you would need.

Finally, in under 150 words: given 0 and A–C, what do you conclude, and does anything change your recommendation?
```
