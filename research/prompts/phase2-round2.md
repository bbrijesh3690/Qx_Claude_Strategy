# Phase 2, round 2: report back to Fable 5.1

Written 2026-09-15 after kill #1. It reports only what the protocol allows an
idea source to see: verdicts and the pre-registration descriptive checks.
New hypotheses it prompts must be screened on a capture that doesn't overlap
the screened dataset.

---

```text
Follow-up to your hypotheses for the Quotex OTC research program. Results below. I want critique and a decision, not a longer list.

## What was done with your proposals
- Screen size is now FIXED for every hypothesis: enough decided trades to detect a true 70% edge vs break-even (52.6% at 90% payout), 80% power, Holm-corrected across every hypothesis ever screened. predictedRate is recorded but not used. (Your point about "fail" was right: sizing from each hypothesis's own prediction made honest 53% claims un-killable.)
- Your descriptive checks, on the train window (~5.4 days, 9 OTC assets, log 1m close diffs, within gap-free segments):

  Series    rho1    VR(15)  VR(60)  VR(240)
  AUD/NZD  -0.008   0.95    0.85    0.87
  GBP/NZD  -0.001   1.00    0.87    0.55
  NZD/CHF  -0.001   1.03    0.98    0.91
  NZD/USD  -0.008   1.00    1.04    1.08
  USD/BDT  -0.002   1.05    1.04    0.94
  USD/BRL  +0.005   1.01    1.06    1.01
  USD/IDR  +0.002   0.98    0.91    0.99
  USD/MXN  -0.008   1.02    1.06    1.27
  USD/PHP  +0.006   0.91    0.91    0.67
  Random-walk sd: rho1 ~0.012; VR ~0.05 / 0.11 / 0.22 at q = 15/60/240. Mean VR(240) 0.92 (sd ~0.07).

- h003/h004: not registered, per your own condition (|rho1| < 0.05 on every asset).
- h002: deferred, not screened. It fired only 53 times on the train window (screen size 62).
- h001 (fade |z| >= 2.5 vs SMA240, 15m expiry): SCREENED AND KILLED.
  43 wins / 63 losses = 40.6%, 95% CI [31.7, 50.1], 106 decided trades, fired on 0.2% of bars, 62% of trades CALL. EV -22.9% per trade.
  P(<=43 of 106 | p=0.5) = 0.032 one-sided — below 50%, but trades cluster in runs so effective n is smaller.
- Kill budget: 1 of 10 consecutive used.

## Rules for your answer
- Anything you propose in response to THIS result will be screened only on a NEW capture that does not overlap the data above. Design for that, and say how many days of capture it needs at its fire rate.
- Do not treat 40.6% as evidence for "follow the deviation" unless you can argue a mechanism that would have predicted it BEFORE the result; say plainly if you can't.
- Same code format and restrictions as before.

## What I want
1. Critique (under 200 words): what does a 40.6% fade result at |z| >= 2.5 on 15m, together with the VR table, tell you about how this feed is generated? Which of your mechanisms are now ruled out, weakened, or untouched?
2. h002: spend a slot on it (with a longer capture), or drop it? One-paragraph argument.
3. Decision: recommend exactly one of
   (a) stop the program now — say why;
   (b) at most 2 new hypotheses, fully specified as before, for a fresh capture;
   (c) something other than a new hypothesis that would change the odds (a measurement, a different data source within the rules: read-only, closed 1m OHLC, no account access).
4. Update your probability that any rule on this feed reaches 75% out of sample, and what moved it.
```
