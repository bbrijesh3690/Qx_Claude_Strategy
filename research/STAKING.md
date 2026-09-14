# Staking What-If: Martingale

Owner's question, 2026-09-15: does a martingale bring the success ratio to 75%?

**Method.** Settled trades from the harness, train window of
`qx_capture_20260914T1929`, 90% payout. Each asset runs its own sequence: stake
1, and after a loss the next trade on that asset stakes ×m, for up to k steps.
Ties refund and repeat the step.
- m = 2 is classic doubling.
- m = 2.11 = (1 + 0.9)/0.9 is the smallest multiplier whose win recovers
  every earlier loss in the sequence plus 1 unit.

This is not a hypothesis screen; nothing was registered.

## Results (m = 2; m = 2.11 is within a few percent on every row)

**Random direction, 1m, the 50% baseline** (61,117 trades):

| Steps | Sequence "success" | Trade win rate | Net (units) | Return per unit staked | Worst failed sequence | Max drawdown |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 49.8% | 49.8% | −3,246 | −5.4% | −1 | 3,280 |
| 2 | **74.8%** | 49.8% | −4,323 | −5.4% | −3 | 4,377 |
| 3 | 87.3% | 49.8% | −5,651 | −5.5% | −7 | 5,721 |
| 4 | 93.7% | 49.8% | −6,830 | −5.3% | −15 | 6,953 |
| 5 | 96.8% | 49.8% | −8,643 | −5.5% | −31 | 8,839 |

At 5m the pattern is the same: return −4.1% to −5.2%, success 50.2% → 97.0%.

**h001 (killed), 15m** (106 trades):

| Steps | Sequence "success" | Trade win rate | Net (units) | Return per unit staked | Max drawdown |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 40.6% | 40.6% | −24 | −22.9% | 27 |
| 2 | 66.2% | 40.6% | −29 | −19.9% | 38 |
| 3 | **78.2%** | 40.6% | −49 | −25.0% | 57 |
| 5 | 95.6% | 40.6% | −34 | −10.6% | 68 |

(The smaller percentage loss for h001 at 4–5 steps is noise: it rests on 45–47
sequences, and net units and drawdown are both worse than flat staking.)

## What this establishes

1. **Martingale reaches 75% "success" on a coin flip: two steps are enough.**
   A success ratio counted per sequence is not a measure of edge. It is
   1 − (1 − p)^k, and it approaches 100% for any p as k grows.
2. **Return per unit staked doesn't move.** It stays at about −5% on the
   baseline for every k. Staking can't change the sign of the expected value,
   only its size: the more steps, the more is staked, and the more is lost.
3. **Failures get exponentially worse.** One failed 5-step sequence costs 31
   units, wiping out about 39 successful sequences. Maximum drawdown grows
   with every step.
4. **Doubling doesn't even break even on a win at 90% payout.** At m = 2 a
   win at step j nets 1 − 0.1·2^j units, which is negative from step 4 on.
   Fixing that needs m ≥ 2.11, which makes the failures larger still.

## Protocol consequence

The 75% target is, and stays, the **per-trade** win rate. A staking scheme
can't create a positive expected value from a rule that lacks one, so staking
schemes are never screened as hypotheses. Only after a rule survives
screening, holdout and forward testing would bet sizing be worth discussing,
and even then a martingale increases the risk of ruin.
