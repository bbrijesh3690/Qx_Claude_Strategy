# QX Claude Strategy — Working Notes

Read this, `PROTOCOL.md` and `LESSONS.md` before changing anything.

## What this is

A research harness for finding (or ruling out) a high hit-rate binary-option
setup on Quotex. **The harness is the product.** Strategies are pluggable
hypotheses behind a fixed interface, screened and killed quickly.

Successor to `E:\Qx\Brijesh\QX-Chart-Assistant` (v1.4.62), whose strategy
`v1.0.0-classic5pt` was measured on 26,734 clean rows and retired at 50.4%.
Nothing of that strategy is carried over. What carries over: the data tap, symbol
attribution, the splice guards, and the measurement rig.

## Hard rules

1. **Read-only.** Nothing places, modifies or cancels a trade, or automates a
   click on the platform.
2. **Local-only.** The extension has `permissions: ["storage"]` and no network
   access. Nothing is uploaded. If a change seems to need a network call, it is
   the wrong change.
3. **No account access.** Nothing reads balance, credentials or account state.
4. **No strategy code in `harness/`.** Hypotheses live in `research/hypotheses/`.

## Layout

| Path | Role |
| :--- | :--- |
| `extension/page-hook.js` | MAIN world. Wraps `WebSocket`, forwards candle history lists plus every string in the frame. Sends nothing. |
| `extension/core.js` | Pure attribution + merge logic. Loaded in the browser **and** required by the Node tests — one implementation. |
| `extension/capture.js` | ISOLATED world. Feeds frames to core, persists to `chrome.storage.session` per page load. |
| `extension/popup.*` | Shows what is captured; exports the dataset JSON. |
| `harness/src/` | data · integrity · bars · engine · stats · split · nulls · synthetic · selftest · report |
| `harness/bin/qx.js` | CLI: `selftest`, `power`, `integrity`, `nulls`, `run [--holdout]` |
| `research/hypotheses/` | One file per hypothesis, from `_TEMPLATE.js` |
| `research/SCREEN_LOG.md` | Every screen result, and the kill count |
| `research/holdout-ledger.jsonl` | Written by the harness. Never edit by hand. |

## Invariants — each has a test; keep it that way

- **Attribution:** a frame is filed under the one symbol it names, or dropped.
  No price fallback. Six-letter tokens must be two known currency codes.
- **Naming:** a series is named as the feed spells it, except for entries in
  `PLATFORM_NAMES` (`core.js`). Add an entry only after checking it against
  the platform, never from a naming convention. Prices are never inverted.
- **Seams, not moves:** a splice is a bar that opens away from the previous
  close. Big moves inside one bar are real OTC shocks: they are kept and
  reported, never failed or dropped.
- **Timeframe:** the tap does not floor timestamps; `validateCandles` refuses
  anything not strictly 1-minute.
- **Settlement:** decided at the close of bar *i*; entry at bar *i+1*'s open;
  exit at bar *i+expiry*'s close; never across a gap or frozen run.
- **No overlap** per asset. **No look-ahead:** `BarView` throws on future
  indices, and `checkNoLookahead` re-decides on truncated, 52-week-shifted
  copies.
- **Window isolation:** bars outside train/holdout are removed before
  segmentation.
- **Never pool** OTC and REAL.
- **Holdout** is claimed in the ledger before results are computed.

Changing any of these means changing its test in the same commit, with the
reason recorded in `LEDGER.md`.

## Commands

```bash
npm test                                   # unit tests + selftest
node harness/bin/qx.js selftest            # planted edges, noise, splices, leaks, Holm
node harness/bin/qx.js power --tests 20
node harness/bin/qx.js integrity data/qx_capture_….json
node harness/bin/qx.js nulls data/qx_capture_….json
node harness/bin/qx.js run research/hypotheses/h001-….js data/qx_capture_….json
```

Datasets go in `data/` (git-ignored).

## Conventions

- Semantic versions from `0.1.0`. Bump `VERSION`, `package.json`, and
  `extension/manifest.json` together.
- Conventional commits naming the version: `feat: v0.1.1 <what>`.
- Freeze milestones as `vX.Y.Z-frozen` tags, record them in `LEDGER.md`, and
  mirror each as a ZIP in `E:\Qx\Brijesh\QX_Frozen_Vault\`.
- After touching `extension/core.js` or anything in `harness/src/`: `npm test`.
