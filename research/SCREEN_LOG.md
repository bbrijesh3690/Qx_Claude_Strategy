# Screen Log

Every hypothesis run, including every one that dies. See `PROTOCOL.md`.
The screen size is a fixed 70% minimum edge; Holm covers every registered
cell (`registry.jsonl`).

**Consecutive kills: 0 / 10**

| # | Id | Source | Registered | Dataset (sha256, 12) | Cells | Result (rate, CI, hurdle) | Verdict | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |

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
