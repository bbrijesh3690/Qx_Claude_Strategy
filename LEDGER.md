# Milestone Ledger

| Version | Tag | Milestone | Status |
| :--- | :--- | :--- | :--- |
| **v0.1.0** | `v0.1.0-frozen` (pending) | Phase 0 harness: capture, integrity, settlement, stats, planted-edge selftest | Harness verified on synthetic data; **awaiting a real capture that passes integrity** |

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
