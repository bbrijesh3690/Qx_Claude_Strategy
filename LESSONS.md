# Lessons Carried Forward

Copied word for word from QX-Chart-Assistant v1.4.62 (`CLAUDE.md` and
`FROZEN_LEDGER.md`, Milestones 10–11). They cost weeks to learn, so they are
kept exactly as written. The note after each one says where the new harness
enforces it.

---

## Do not repeat these mistakes

1. **Validate the input, not just the analysis.** The first verdict was
   delivered on data where `ingestHistory` had spliced multiple instruments
   into single series — CAD/CHF and NZD/CAD shared 178 identical bars. A
   spliced series looks like noise, which returns ~50% whether or not an edge
   exists. A planted-edge test proved the *analysis* worked and was used to
   argue the result was sound; it said nothing about whether the candles were
   real. Both halves need checking.
2. **Harvesting real pairs at a weekend yields frozen candles.** Quotex keeps
   serving bars while FX is shut; ~100% have `high == low == open == close`.
   They silently drag any result toward the null. v1.4.52's segmentation
   handles it, but check `frozenDropped` anyway.
3. **A test's null is not automatically 50%.** The S/R scan returns ~51% on
   pure noise because a level that breaks produces no rejection candle, so
   that class of loser is never booked. Calibrate on random walks first.
4. **`__QX_TELEMETRY__` lives in the ISOLATED world.** It is `undefined` in the
   page console, so the wipe command silently fails there. Switch the DevTools
   context to the content script, or clear the `QX_TELEMETRY` IndexedDB store.
5. **Filter on `matchMode === "symbol"`.** Rows attributed by price inference
   are the ones that carried contamination.

> **Enforced in v0.1.0:**
> (1) `integrity` runs before every scoring command and excludes failing
> series; the selftest checks the data side (splices, shared bars) as well as
> the analysis side (planted edges).
> (2) `liveSegments` drops frozen runs; `integrity` reports the frozen share.
> (3) Every result shows its matched null; `nulls` measures the baselines.
> (4) No longer applies: the harness runs in Node, and capture stores nothing
> on the Quotex origin.
> (5) There is no price inference at all. `integrity` fails any series whose
> `matchMode` is not `"symbol"`.

## The verdict was delivered twice, and the first one was not valid

An earlier run reported 50.3% on 4,694 trades and called the engine dead. That
data was contaminated: `ingestHistory` guessed the owning asset from price
proximity within 25%, and AUD/JPY sits 0.5% from CAD/JPY. CAD/CHF and NZD/CAD
ended up sharing 178 bars with identical closes; AUD/JPY drifted 110 → 88 with
a 30% one-minute gap.

A spliced series behaves like noise, which returns ~50% regardless of whether
an edge exists — so that verdict was unsupported even though it happened to be
correct. It was defended on the strength of a planted-edge test that validated
the *analysis* while saying nothing about the *input*. Both halves need
checking, every time.

The symbol was in the WebSocket frame all along (`tokens: ["USDPKR_otc", …]`);
`page-hook.js` was discarding it. Fixed across v1.4.53–55, the last piece being
that Quotex does not always quote a symbol in the order it displays it —
"USD/BRL (OTC)" arrives as `BRLUSD_otc`.

> **Enforced in v0.1.0:** attribution is by symbol or not at all, and both
> orderings of a pair count as one instrument. The selftest catches a splice
> at a 0.5% level offset, the exact AUD/JPY–CAD/JPY distance.

## Storage — nothing outlives the browser session

This matters because `localStorage` and IndexedDB are scoped to the **Quotex
origin**, not the extension: while that data exists, any script on
qxbroker.com can read it. 31 MB of telemetry had accumulated there.

> **Enforced in v0.1.0:** capture uses `chrome.storage.session`, which belongs
> to the extension and is cleared when the browser closes.

## Two bugs found by testing rather than by reading

- `deleteDatabase()` needs exclusive access. With a connection open it blocks,
  and every later `open()` queues behind it — **observed freezing a tab's
  renderer outright**. Two tabs booting together after a relaunch would hit
  this. Replaced with `clear()`, which runs in an ordinary transaction and
  cannot block.
- A `QX_TELEMETRY` database can exist at version 1 with **no object store** —
  any bare `indexedDB.open()` by name creates exactly that. Since `DB_VERSION`
  is also 1, `onupgradeneeded` never fires and every transaction throws
  `NotFoundError`: telemetry silently and permanently dead, with no symptom.
  `openDb` now detects the missing store and reopens one version higher to
  rebuild it. Verified against `fake-indexeddb`.

> **v0.1.0:** no IndexedDB is used. If forward validation brings it back, both
> of these apply again.

## Statistical guardrails

- Distinguishing 60% from break-even needs ~280 settled trades; 57% from 54%
  needs ~1100. Report Wilson intervals, never bare percentages.
- Hold out the newest third of data by time. Do not look at it while iterating.
- ~40 tagged versions of tuning against the same history has already spent a lot
  of statistical power. Confirm findings on fresh data.
- Never pool OTC with real pairs. OTC feeds are broker-generated and the broker
  is the counterparty; an edge on one says nothing about the other.
- Consecutive minutes are highly autocorrelated — 2000 bars is nowhere near 2000
  independent observations.

> **Enforced in v0.1.0:** every rate is printed with its interval; the holdout
> is the newest third by a single global cutoff, with a one-look lock; OTC and
> REAL are separate cells; and trades cannot overlap on the same asset.
> **Not yet handled:** trades on *different* OTC assets in the same minute may
> be correlated. The report doesn't yet show how many distinct minutes the
> trades span; check this before believing a survivor.
