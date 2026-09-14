# Phase 2, round 3: data and tests sent to Fable 5.1

Owner's decision, 2026-09-15: give Fable the data and have it run the
measurements it proposed.

- **Sent:** `data/qx_otc_1m_train_only.csv` (not in git): 61,126 bars,
  9 OTC assets, 2026-09-06 23:47 to 2026-09-12 10:23 UTC. This is the train
  window only; nothing at or after the 10:24 cutoff is included, so the
  holdout stays unseen.
- **Consequence:** Fable has now seen the train bars. Any hypothesis it
  proposes from here on must be screened on a capture that does not overlap
  this data (PROTOCOL.md, rule on idea sources).
- **Our own results for the same tests** were deliberately left out of the
  prompt, so Fable's numbers are an independent replication. They are in
  `../ROUND2_MEASUREMENTS.md`.

---

```text
Attached: qx_otc_1m_train_only.csv — the train window of the Quotex OTC data we discussed. 61,126 closed 1-minute bars, 9 assets, 2026-09-06 23:47 to 2026-09-12 10:23 UTC.
Columns: asset, time_utc (bar open time), open, high, low, close. Rows are grouped by asset and sorted by time.

Please run the measurements you proposed, using code, and show the results as tables. Use only this file.

Data rules
- Treat each asset separately. A missing minute breaks a series: never compute a difference, window or trade across a gap.
- Do not invent or fetch any other data. Real-market (non-OTC) prices are NOT in this file.

Trade conventions (for h001 and h002)
- Decide at the close of bar i. Entry = open of bar i+1. Exit = close of bar i+15 (15-minute expiry).
- Win if exit is beyond entry in the trade's direction; tie if exit = entry (exclude ties).
- One open trade per asset: after a trade decided at bar i, the next decision on that asset is at bar i+15.
- Use your h001 and h002 code exactly as you wrote it.

Tests
A. h001 excursions. Run h001 on every asset. Report total decided trades, wins, win rate. Then group trades into excursions (same asset, same direction, consecutive trades no more than 60 minutes apart) and report: number of excursions, trades per excursion, win rate by direction (CALL/PUT), and the win rate of only the FIRST trade of each excursion, each with a 95% Wilson interval.

B. h002 clip fingerprint. Run h002 on every asset. For each fire, take the bars in its 360-bar window that count as touches of the level it traded (highs for PUT, lows for CALL) and report the spread (max − min) of those touch prices in ticks, per asset, alongside 0.5σ expressed in ticks. Define the tick per asset as the smallest positive difference between distinct price levels in that asset's data. Also report the fraction of decision bars where the 8σ guard returns null. Do NOT compute or report h002's win rate.

C. Shock catalogue. A shock is a bar whose close-to-close move |ln(close / previous close)| exceeds max(0.2%, 15 × that asset's median non-zero absolute 1m close-to-close log move), with the previous bar exactly one minute earlier. List every shock (UTC time, asset, size, sign). Then report: how many fall on minute :00/:15/:30/:45 vs chance, how many share their exact minute with another asset, and the distribution of UTC hours.

D. Your questions (i) and (iii) — OTC vs the real rate around shocks — cannot be run from this file. Say so, and state exactly what data and format you would need.

Finally, in under 150 words: given A–C, what do you conclude, and does anything change your recommendation?
```
