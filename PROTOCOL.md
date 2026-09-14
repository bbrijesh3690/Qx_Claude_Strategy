# Research Protocol

Agreed before any hypothesis was tested (2026-09-14). The point of writing it
down now is that every rule here is easy to relax later, one reasonable
exception at a time.

## The target and what it implies

The goal is a **75% hit rate**. At an 85% payout (break-even 54.1%) that is
+38.7% of stake per trade — and it is cheap to test:

| True rate | Detect it, 1 test | Detect it, 20-test family |
| :--- | ---: | ---: |
| 75% | 41 | 80 |
| 70% | 74 | 141 |
| 65% | 159 | 304 |
| 60% | 546 | 1,042 |

(80% power, one-sided α = 0.025. `node harness/bin/qx.js power` regenerates this.)

Big edges show up fast; marginal ones take months to confirm and barely pay.
So the protocol is built for **screening many narrow hypotheses quickly and
killing them without ceremony.**

The old engine fired on 68% of all minutes. Anything that hits 75% will be
rare: a handful of trades a day, and most minutes should return `null`.

## Markets and expiries

The harness scores **1m, 5m and 15m** expiries. OTC and real pairs are
**always scored separately** and never pooled — the broker generates the OTC
feed and is the counterparty on it, so an edge on one says nothing about the
other.

Each hypothesis states which expiries it is about. Every (expiry × market)
cell it is run on counts toward its multiple-comparison family.

## Phases

**Phase 0 — Harness.** Capture, integrity, settlement, stats, planted-edge
self-test. No strategy. Done when `npm test` and `selftest` pass *and* a real
capture passes `integrity`.

**Phase 1 — Nulls.** Run `nulls` on the real train window. Record per market
and expiry: always-CALL, always-PUT, random, and the up-move base rate.
Hypotheses are judged against these, never against 50%.

**Phase 2 — Screen.** For each hypothesis:
1. Write the file from `research/hypotheses/_TEMPLATE.js`, including
   `statement` and `predictedRate`, **before** running it.
2. Run on the **train** window only.
3. Read the verdict column. `SURVIVES` → Phase 3. `KILL` → log it and move on.
   `needs N more` → collect more data; do not tweak.
4. Log every run in `research/SCREEN_LOG.md`, including the ones that die.

**Phase 3 — Holdout, once.** `run … --holdout`. The harness records the look
in `research/holdout-ledger.jsonl` before computing anything and refuses a
second look for the same id. Re-testing after a tweak turns the holdout into
training data.

**Phase 4 — Forward, on demo.** Live trades compared against the hypothesis's
own backtest. If forward results fall outside the backtest's interval, the
backtest was wrong.

## The gate

A cell **survives** only if its Holm-adjusted one-sided p-value is below 0.025
against a hurdle of

```
hurdle = max(break-even at payout, matched null)
```

The matched null is the rate you'd get picking directions at random with the
hypothesis's own CALL/PUT mix, on its own bars. It is what exposed 60.9% as a
mirage when always-CALL scored 56.5% on the same bars.

A cell is **killed** once it has at least the screen size of decided trades
(from `predictedRate`, 80% power, Holm family) and still hasn't survived.

## Rules that cannot bend

- **A hypothesis is frozen once run.** Any change to `decide` or `meta` means a
  new id, which counts as a new test.
- **No tuning on the train window after seeing results.** A threshold picked
  from the results is a new hypothesis, and it gets screened on data it hasn't
  seen.
- **Integrity failures are excluded, not argued with.** `--include-failing`
  exists only for diagnosing the data; results produced with it are void.
- **Look-ahead check failures void the run.**

## Kill criterion — agreed now

**If 10 hypotheses in a row are killed at the screen, the project stops.**

- Counted in `research/SCREEN_LOG.md`. A survivor that later fails the
  holdout does not reset the count.
- "Stops" means no more hypothesis screening on this market. It does not mean
  one more idea, a new expiry, or a different payout assumption.
- This number is set while it is still abstract. Changing it later needs a
  written reason in this file, dated, before the next hypothesis runs.
