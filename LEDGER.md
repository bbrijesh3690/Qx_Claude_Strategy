# Milestone Ledger

| Version | Tag | Milestone | Status |
| :--- | :--- | :--- | :--- |
| **v0.1.0** | `v0.1.0-frozen` (pending) | Phase 0 harness: capture, integrity, settlement, stats, planted-edge selftest | Harness verified on synthetic data; **awaiting a real capture that passes integrity** |

## v0.1.2 — first real capture: seams, shocks, naming

**The capture:** `qx_capture_20260914T1829.json`, 9 OTC series, about 10,000
bars each, about 7 days. 1,858 of 1,908 frames were accepted. 

**Integrity under v0.1.1: 1 of 9 passed. Integrity under v0.1.2: 8 of 9 pass.**

### What the first run showed

- **22 "impossible jumps" were real shock candles, not splices.** Every one
  opened exactly at the previous close, had a wick spanning the move, and was
  followed by bars continuing from the new level. They ranged from 0.2% to
  5.6%, about 2–3 per asset per week. The check had measured
  close-to-close, which cannot tell a shock from a splice. It now fails
  only a **seam break**, where a bar opens away from the previous close
  (limit `max(5 bp, 15 × median 1m move)`, shared with the capture merge).
  Shocks are reported as `shock_bars` (a warning) and kept.
- **50 genuine history pages were rejected at capture.** The merge guard
  compared each block to the median of the whole series. NZD/USD's 5.6% shock
  moved that median, so every 49-bar page from before the shock looked
  foreign, and that caused NZD/USD's 294-minute gap (6 × 49). The guards are
  now local:
  - the closes must agree where the block overlaps existing bars;
  - the seam must be continuous where it touches them;
  - a block that touches nothing must be within 5% of the nearest bar in time.

  **This export has already lost those pages. Only a new capture recovers
  them.**
- **One genuine seam break: PHP/USD (OTC), 09-13 06:10.** The bar opens 0.89%
  from the previous close, and its range doesn't reach that close. Under the
  protocol, the whole series is excluded. The likely cause is the merge's
  "newer copy wins" rule replacing a single bar that didn't match (the overlap
  check allows one), but that can't be proven from the export. A new capture
  under v0.1.2 will show whether it happens again.
- **Storage quota.** `chrome.storage.session` (10 MB) filled up
  (`Session storage quota bytes exceeded`). Export still worked, because
  v0.1.1 reads the live tab directly. **Until this is redesigned, export
  before closing the Quotex tab.**

### Naming

The feed spells pairs its own way, and names follow the feed. The only
exception is a verified list: `BRLUSD_otc` is shown as **USD/BRL (OTC)**. The
evidence is the QX-Chart-Assistant v1.4.55 ledger, confirmed by the owner
against the platform on 2026-09-15. Prices are never inverted. Older exports
are renamed when they are loaded.

A first attempt renamed pairs by market convention. That also renamed
BDT/USD, IDR/USD, PHP/USD and CHF/NZD, which the platform actually lists
exactly as the feed spells them. It was reverted before commit. **Names
change only on evidence from the platform.**

Tests: 28/28 pass; selftest 21/21 (added: a genuine shock candle is reported,
not failed).

## v0.1.1 — capture diagnostics

The first real session exported nine files, and every one was empty
(`tabs: 0, framesSeen: 0`). The extension only wrote to storage after it saw
a frame, so "no frames" and "frames arrived but the save failed" looked the
same. The export gave no way to tell which link was broken.

- `page-hook.js` sends counters every 2s: sockets, messages, binary frames,
  parse errors, candle lists found, and the socket.io event names (never
  message contents).
- `capture.js` now writes to storage every 3s even when nothing is captured,
  keeps the text of any storage error, and answers the popup directly by
  message, so diagnosing no longer depends on storage working.
- `core.js` keeps up to 8 rejected-frame samples: the reason, the non-numeric
  tokens, and the first two raw candles. Numeric `key=value` tokens are left
  out, since they are ids.
- The popup names the first pipeline stage that came up empty. It asks before
  exporting an empty file and has a **Copy diagnostics** button.
- The tap now rejects object-form candles with a non-numeric high or low,
  where it previously let them through.

No change to attribution, validation, settlement or scoring. Tests: 25/25.

## v0.1.0 — Phase 0 harness

No strategy exists in this version.

### Verified (2026-09-14)

- `npm test`: 25/25 tests pass.
- `selftest`: 20/20 checks pass.
  - Planted 65% and 35% edges recovered at 1m, 5m and 15m. The 99.7% interval
    contains the planted rate every time, and sits on the correct side of 50%.
  - Pure noise: no edge at any expiry, for either probe.
  - Splices at 30% **and 0.5%** level offsets caught; two series sharing bars
    both failed.
  - Look-ahead through the view throws; look-ahead through a closure is caught.
  - 60 noise hypotheses: 4 look significant uncorrected, 0 after Holm.
- End to end on a synthetic export: the spliced series was excluded, the nulls
  came out near 50%, and the holdout refused a second look.
- Extension files parse; `manifest.json` is valid.

### Found by the selftest rather than by reading

The first look-ahead check only re-decided on a **truncated** series. A
hypothesis that captured the full series in a closure and looked the next bar
up by timestamp passed 200/200 samples while backtesting at **100%**.
Truncation can't see that leak. The check now also shifts every timestamp
forward by 52 weeks, which keeps weekday and hour (so honest time-of-day rules
still decide the same) but breaks lookups keyed on real time. After the fix,
200/200 were caught.

This is the same category of lesson as the old project's planted-edge test: a
check that passes is only evidence if it has been seen to fail.

### Not yet verified

- **The extension has not run against the live site.** Frame parsing, symbol
  tokens and `storage.session` access are unit-tested in Node, but not in
  Chrome on Quotex. Freeze v0.1.0 only after a real capture passes `integrity`.
- Canvas tick capture was deliberately left out. It comes back for Phase 4.
- Payout isn't captured; `--payout` is an assumption supplied on the command
  line. Observed payouts on the old account ran 74–92%.
- Cross-asset same-minute correlation isn't measured (see `LESSONS.md`).

### Ported from QX-Chart-Assistant v1.4.62

WebSocket tap (changed: no timestamp flooring, collects strings inside arrays).
Symbol attribution (changed: the price fallback was removed entirely, and
tokens are checked against currency codes). The level-mismatch splice guard
(added: an overlap-disagreement guard). Wilson intervals, break-even, frozen-bar
segmentation, the train/holdout split, and planted-edge validation (changed: the
edge is planted per expiry at an exact rate).

Left behind: `v1.0.0-classic5pt`, tiered scoring, the lock/flip timing, audio,
the panel, and the XLSX export.
