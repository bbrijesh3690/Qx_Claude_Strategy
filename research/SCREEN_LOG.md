# Screen Log

Every hypothesis run, including every one that dies. See `PROTOCOL.md`.
The screen size is a fixed 70% minimum edge; Holm covers every registered
cell (`registry.jsonl`).

**Consecutive kills: 1 / 10**

| # | Id | Source | Registered | Dataset (sha256, 12) | Cells | Result (rate, CI, hurdle) | Verdict | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | h001-anchor-fade-4h | Fable 5.1 | 2026-09-15 (`9b63930`) | `23bd8f5c7f0b` | 15m · OTC | 43 W / 63 L = **40.6%** [31.7–50.1], hurdle 52.6% | **KILL** | 106 decided trades against a screen size of 62. Fires on 0.2% of bars, 62% CALL. Holm p 0.995. EV −22.9% per trade. |

### Notes on kill #1

- **The rate fell below 50%, not just below break-even.** P(≤ 43 wins of 106 | 50%) = 0.032, one-sided. That is marginal: the trades cluster in runs, so the effective sample is smaller than 106, and it was not the question being asked. It is **not** evidence for the opposite rule ("follow a 4-hour deviation").
- **Under the protocol, "follow" is a new idea prompted by this result.** It may be registered, but it can only be screened on a capture that doesn't overlap this dataset (data after 2026-09-14 19:29 UTC). Screening it here would be the 19:00 mirage.
- **For the mechanism:** a slow pull toward a reference strong enough to pay at 15m would have shown up as a rate above 50% at |z| ≥ 2.5. It did not.

## Proposed but not registered

These cost no budget. They are recorded so the source's full list is on file.

| Id | Source | Decision | Reason |
| :--- | :--- | :--- | :--- |
| h002-flat-extreme-reflect | Fable 5.1 | Deferred | Only 53 trades on the train window, below the screen size. Its prior (10–15% that clipping exists) is low. Revisit with a longer capture. |
| h003-impulse-fade-1m | Fable 5.1 | Not registered | The source's own pre-registered condition was to register only if lag-1 autocorrelation had magnitude ≥ 0.05. Measured −0.011 to +0.013 on all 9 assets (random-walk sd ≈ 0.012). |
| h004-impulse-follow-1m | Fable 5.1 | Not registered | Same condition as h003, opposite sign. |

## Descriptive checks run before registration (no budget)

Train window of `qx_capture_20260914T1929` (sha256 `23bd8f5c7f0b`), log 1m
close differences, computed within segments only.

| Series | ρ₁ | VR(15) | VR(60) | VR(240) |
| :--- | ---: | ---: | ---: | ---: |
| AUD/NZD | −0.008 | 0.95 | 0.85 | 0.87 |
| GBP/NZD | −0.001 | 1.00 | 0.87 | 0.55 |
| NZD/CHF | −0.001 | 1.03 | 0.98 | 0.91 |
| NZD/USD | −0.008 | 1.00 | 1.04 | 1.08 |
| USD/BDT | −0.002 | 1.05 | 1.04 | 0.94 |
| USD/BRL | +0.005 | 1.01 | 1.06 | 1.01 |
| USD/IDR | +0.002 | 0.98 | 0.91 | 0.99 |
| USD/MXN | −0.008 | 1.02 | 1.06 | 1.27 |
| USD/PHP | +0.006 | 0.91 | 0.91 | 0.67 |

Random-walk sd: ρ₁ ≈ 0.012; VR ≈ 0.05 / 0.11 / 0.22 at q = 15 / 60 / 240.
There is no short-horizon dependence. At 240 bars the mean VR is 0.92
(sd ≈ 0.07), which neither supports nor rules out h001's slow tether.
