# Phase 2 hypothesis-generation response

Fable 5.1, high effort, separate account, 2026-09-15. Relayed by the owner and
recorded as received, **before any screening or data check**. The prompt is in
`phase2-hypotheses.md`.

---

Before the hypotheses, three things that affect how much budget they're worth.

What "fail" means. You say screening a 75% edge needs ~71 trades. If the screen is "consistent with 75%", then a rule with a true 60% edge fails it and burns a slot even though it beats 52.6%. Two of the four below (H3/H4) top out around 60–70% even if their mechanism is real. Decide which threshold the screen uses before registering them.

Two descriptive checks to run first (same class as your always-CALL check, not hypotheses): the lag-1 autocorrelation of 1m close-to-close differences per asset, and variance ratios VR(15)/VR(60)/VR(240) of those differences. A free random walk gives ρ₁≈0 and VR≈1; an anchored process gives VR falling below 1 at long lags; smoothing gives ρ₁>0. This one table tells you whether H1 and H3/H4 have any room, and it costs no budget.

Counterparty note. Whatever the screen finds, the broker owns the generator, the payout and the fill and can change any of them without notice. I'm not a financial advisor; this is a structural caution, not a prediction.

## h001 — Fade a ≥2.5σ deviation from the 4-hour mean

Mechanism. A 24/7 synthetic feed for a named pair has to be tethered to a reference, or it visibly wanders from the real rate within weeks. The two cheap ways to tether are a linear pull toward the reference (an OU term) or a hard clip (h002). Your dead tests constrain the pull's speed, not its existence: by my arithmetic, an OU pull with half-life ≤60 bars would have given the 20-bar-range fade roughly 55–70% at 15m, and it scored ~50%. A slow pull (half-life 2–5 h) would not register on any test you ran, and it's what a designer who wants intraday charts to look random but weekly drift to stay bounded would pick. Under a slow pull, only large, vol-normalised, multi-hour deviations carry signal, and only the longest expiry captures enough of the reversion. Shock candles that "continue from the new level" are consistent with this if the shock is the reference being updated, so they don't discriminate.

Rule. Over the last 240 bars: σ = MAD-based sd of 1m close differences; z = (close − SMA240) / (σ·√80) (√80 makes z≈N(0,1) under a random walk). PUT if z ≥ 2.5, CALL if z ≤ −2.5. Stand aside if any bar in the window has |diff| > 8σ.

Expiries. 15 only. Fire rate. Under a random walk |z|≥2.5 holds on ~1.2% of bars but in runs; after the one-position rule, ~3–6 trades/asset/day; fewer (~1–3) if the feed is anchored. 20–50/day across 9 assets. Predicted. 0.56 blended: ~0.70 if a slow pull exists (I put that at ~25–30%), 0.50 otherwise. Refutation. ≤52% on 71+ trades, and no improvement in the largest-|z| tercile — the feed is free between resets. Overlap. Partial with h002 (both fire near multi-hour extremes).

```js
export const meta = {
  id: "h001-anchor-fade-4h",
  title: "Fade a >=2.5-sigma vol-normalised deviation from the 4-hour mean (slow-anchored generator)",
  statement: "A 24/7 synthetic pair must be tethered to a reference; the tests already run exclude a fast pull but not a slow one (half-life of hours). Under a slow pull only large multi-hour deviations carry signal and only the 15m expiry captures enough reversion. z = (close - SMA240)/(sigma*sqrt(80)) with sigma the MAD-based sd of 1m close diffs; PUT if z >= 2.5, CALL if z <= -2.5, null if any bar in the window is a shock (|diff| > 8 sigma).",
  market: "otc", expiries: [15], warmup: 241, predictedRate: 0.56,
  registeredAt: "2026-09-15"
};
export function decide(view, ctx) {
  const W = 240;
  if (view.length < W + 1) return null;
  const bars = view.last(W + 1);
  const sig = (d) => {
    const n = d.length, q = d.slice().sort((x, y) => x - y);
    const med = n % 2 ? q[(n - 1) >> 1] : 0.5 * (q[n / 2 - 1] + q[n / 2]);
    const a = d.map(x => Math.abs(x - med)).sort((x, y) => x - y);
    const mad = n % 2 ? a[(n - 1) >> 1] : 0.5 * (a[n / 2 - 1] + a[n / 2]);
    if (mad > 0) return 1.4826 * mad;
    const m = a.reduce((x, y) => x + y, 0) / n; // fallback for heavily quantised feeds
    return m > 0 ? 1.2533 * m : 0;
  };
  const d = [];
  for (let i = 1; i <= W; i++) d.push(bars[i].close - bars[i - 1].close);
  const s = sig(d);
  if (!(s > 0)) return null;
  for (const x of d) if (Math.abs(x) > 8 * s) return null; // shock in window
  let sum = 0;
  for (let i = 1; i <= W; i++) sum += bars[i].close;
  const z = (bars[W].close - sum / W) / (s * Math.sqrt(W / 3));
  if (z >= 2.5) return "PUT";
  if (z <= -2.5) return "CALL";
  return null;
}
```

## h002 — Fade a flat 6-hour extreme that has held through three separated tests

Mechanism. The other cheap tether is a clip: the generator is not allowed outside ±X% of a reference. A clip leaves a fingerprint no random walk produces — a flat extreme at the same price, touched on separate occasions over hours, never exceeded. This is the only version of "support/resistance" a synthetic feed can have: there are no resting orders, so a level can hold only if the generator can't cross it. Your allowed 15m S/R rejection is the retail-shaped cousin of this; I'd rather test the fingerprint directly. If levels are soft rather than hard, this collapses into h001. A reflecting boundary makes the 15m direction nearly certain when price is pinned against it.

Rule. Over the last 360 bars: σ as in h001, shock guard as in h001. hi/lo = window max high / min low. A "touch" is a bar with high ≥ hi − 0.5σ (resp. low ≤ lo + 0.5σ); touches ≥15 bars apart count as separate tests. PUT if ≥3 separate tests of hi, the first ≥60 bars ago, the decision bar is itself a touch, and close ≥ hi − 1.5σ. Mirror for CALL. Null if both sides qualify.

Expiries. 15 only. Fire rate. ~2–5/asset/day under a random walk (near-max revisits are common but the three-separated-tests filter cuts most); rarer if no clip exists. ~20–40/day. Predicted. 0.53 blended: ~0.80 if clips exist (prior ~10–15%), 0.50 otherwise. Refutation. ~50%; additionally, if the extreme is typically exceeded within 15 bars of the third test, that is the random-walk signature and the idea is dead outright. Overlap. Partial with h001.

```js
export const meta = {
  id: "h002-flat-extreme-reflect",
  title: "Fade a flat 6-hour extreme that has held through >=3 separated tests (clipped generator)",
  statement: "A clipped generator leaves a flat extreme that is touched on separate occasions over hours and never exceeded, which a random walk does not produce. When price is pinned against such a level the 15m direction is nearly determined. Rule: within the last 360 bars, >=3 touches of the window high (within 0.5 sigma), separated by >=15 bars, first one >=60 bars ago, decision bar touching, close within 1.5 sigma of the high -> PUT; mirror for CALL.",
  market: "otc", expiries: [15], warmup: 361, predictedRate: 0.53,
  registeredAt: "2026-09-15"
};
export function decide(view, ctx) {
  const W = 360;
  if (view.length < W + 1) return null;
  const bars = view.last(W + 1);
  const sig = (d) => {
    const n = d.length, q = d.slice().sort((x, y) => x - y);
    const med = n % 2 ? q[(n - 1) >> 1] : 0.5 * (q[n / 2 - 1] + q[n / 2]);
    const a = d.map(x => Math.abs(x - med)).sort((x, y) => x - y);
    const mad = n % 2 ? a[(n - 1) >> 1] : 0.5 * (a[n / 2 - 1] + a[n / 2]);
    if (mad > 0) return 1.4826 * mad;
    const m = a.reduce((x, y) => x + y, 0) / n;
    return m > 0 ? 1.2533 * m : 0;
  };
  const d = [];
  for (let i = 1; i <= W; i++) d.push(bars[i].close - bars[i - 1].close);
  const s = sig(d);
  if (!(s > 0)) return null;
  for (const x of d) if (Math.abs(x) > 8 * s) return null;
  const win = bars.slice(1), last = win[W - 1];
  let hi = -Infinity, lo = Infinity;
  for (const b of win) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
  const tests = (touch) => {
    let count = 0, first = -1, prev = -1e9;
    for (let i = 0; i < W; i++) if (touch(win[i])) {
      if (i - prev >= 15) count++;
      prev = i; if (first < 0) first = i;
    }
    return { count, first, prev };
  };
  const top = tests(b => b.high >= hi - 0.5 * s);
  const bot = tests(b => b.low <= lo + 0.5 * s);
  const resist = top.count >= 3 && top.prev === W - 1 && (W - 1 - top.first) >= 60 && (hi - last.close) <= 1.5 * s;
  const support = bot.count >= 3 && bot.prev === W - 1 && (W - 1 - bot.first) >= 60 && (last.close - lo) <= 1.5 * s;
  if (resist && !support) return "PUT";
  if (support && !resist) return "CALL";
  return null;
}
```

## h003 — Fade an isolated ≥2.5σ 1m bar that closes at its extreme

Mechanism. Many generators are two-component: a slow walk plus fast jitter (per-tick mean-reverting noise added so the tick stream looks alive). The jitter reverts within seconds to a minute. A 1m bar that closes at its extreme after a big move has a close that still contains an unreverted jitter excursion, which drains in the next bar. The signature is negative lag-1 autocorrelation of 1m differences, concentrated in the tails. Your 5m and 15m tests cannot see a one-bar effect. The "previous bar small" filter isolates a single-bar excursion from a multi-bar drift.

Rule. σ over the last 60 differences (MAD-based). Decision bar body = close − open, range = high − low. Fire only if 2.5σ ≤ |body| ≤ 8σ, |previous bar body| < 1.5σ, and close is within 25% of range from the extreme in the direction of the move. Direction against the body.

Expiries. 1 only (the mechanism drains within a bar; 5m dilutes it). Fire rate. ~0.6% of bars → ~9/asset/day, ~80/day. Predicted. 0.53 blended. Conditional on ρ₁: ~0.55 at −0.05, ~0.60 at −0.10, ~0.70 at −0.20. Refutation. ~50%; ≥55% continuation means h004's mechanism instead. Overlap. Same detector as h004 with the opposite sign — register at most one, chosen by the sign of ρ₁ from the descriptive check (register neither if |ρ₁| < 0.05; both are ≤52% there).

```js
export const meta = {
  id: "h003-impulse-fade-1m",
  title: "Fade an isolated >=2.5-sigma 1m bar that closes at its extreme (fast-noise component reverts)",
  statement: "Two-component generators add fast mean-reverting jitter to a slow walk; a bar that closes at its extreme after a large move carries an unreverted jitter excursion that drains in the next bar, giving negative lag-1 autocorrelation in the tails. Rule: |body| between 2.5 and 8 sigma (60-bar MAD sd of close diffs), previous bar body < 1.5 sigma, close within 25% of range from the extreme in the direction of the move; trade against the body at 1m.",
  market: "otc", expiries: [1], warmup: 61, predictedRate: 0.53,
  registeredAt: "2026-09-15"
};
export function decide(view, ctx) {
  const W = 60;
  if (view.length < W + 1) return null;
  const bars = view.last(W + 1);
  const sig = (d) => {
    const n = d.length, q = d.slice().sort((x, y) => x - y);
    const med = n % 2 ? q[(n - 1) >> 1] : 0.5 * (q[n / 2 - 1] + q[n / 2]);
    const a = d.map(x => Math.abs(x - med)).sort((x, y) => x - y);
    const mad = n % 2 ? a[(n - 1) >> 1] : 0.5 * (a[n / 2 - 1] + a[n / 2]);
    if (mad > 0) return 1.4826 * mad;
    const m = a.reduce((x, y) => x + y, 0) / n;
    return m > 0 ? 1.2533 * m : 0;
  };
  const d = [];
  for (let i = 1; i <= W; i++) d.push(bars[i].close - bars[i - 1].close);
  const s = sig(d);
  if (!(s > 0)) return null;
  const last = bars[W], prev = bars[W - 1];
  const body = last.close - last.open, range = last.high - last.low, a = Math.abs(body);
  if (range <= 0 || a < 2.5 * s || a > 8 * s) return null;
  if (Math.abs(prev.close - prev.open) >= 1.5 * s) return null;
  if (body > 0) return (last.high - last.close) <= 0.25 * range ? "PUT" : null;
  return (last.close - last.low) <= 0.25 * range ? "CALL" : null;
}
```

## h004 — Follow an isolated ≥2.5σ 1m bar that closes at its extreme

Mechanism. The mirror of h003. If the publishing layer smooths the raw process (an EMA on the tick stream, spline interpolation between generated waypoints, or a per-tick velocity term added for "smooth" charts), the published price lags a raw jump and finishes catching up in the following bar. A 20–60 s smoothing window produces positive lag-1 autocorrelation at 1m that is invisible at 5m and 15m, so your dead trend tests don't exclude it. Same detector, opposite sign.

Rule, expiries, fire rate. Identical to h003; direction with the body; 1m only; ~9/asset/day. Predicted. 0.53 blended; conditional on ρ₁: ~0.55 at +0.05, ~0.60 at +0.10, ~0.70 at +0.20. Refutation. ~50%, or reversal ≥55% (h003's mechanism). Overlap. Mutually exclusive with h003.

```js
export const meta = {
  id: "h004-impulse-follow-1m",
  title: "Follow an isolated >=2.5-sigma 1m bar that closes at its extreme (publishing-side smoothing lags the raw jump)",
  statement: "If the published price is a smoothed version of the raw generator (EMA, spline between waypoints, velocity term), it lags a raw jump and completes the move in the next bar, giving positive lag-1 autocorrelation at 1m that 5m/15m tests cannot see. Rule: |body| between 2.5 and 8 sigma (60-bar MAD sd of close diffs), previous bar body < 1.5 sigma, close within 25% of range from the extreme in the direction of the move; trade with the body at 1m.",
  market: "otc", expiries: [1], warmup: 61, predictedRate: 0.53,
  registeredAt: "2026-09-15"
};
export function decide(view, ctx) {
  const W = 60;
  if (view.length < W + 1) return null;
  const bars = view.last(W + 1);
  const sig = (d) => {
    const n = d.length, q = d.slice().sort((x, y) => x - y);
    const med = n % 2 ? q[(n - 1) >> 1] : 0.5 * (q[n / 2 - 1] + q[n / 2]);
    const a = d.map(x => Math.abs(x - med)).sort((x, y) => x - y);
    const mad = n % 2 ? a[(n - 1) >> 1] : 0.5 * (a[n / 2 - 1] + a[n / 2]);
    if (mad > 0) return 1.4826 * mad;
    const m = a.reduce((x, y) => x + y, 0) / n;
    return m > 0 ? 1.2533 * m : 0;
  };
  const d = [];
  for (let i = 1; i <= W; i++) d.push(bars[i].close - bars[i - 1].close);
  const s = sig(d);
  if (!(s > 0)) return null;
  const last = bars[W], prev = bars[W - 1];
  const body = last.close - last.open, range = last.high - last.low, a = Math.abs(body);
  if (range <= 0 || a < 2.5 * s || a > 8 * s) return null;
  if (Math.abs(prev.close - prev.open) >= 1.5 * s) return null;
  if (body > 0) return (last.high - last.close) <= 0.25 * range ? "CALL" : null;
  return (last.close - last.low) <= 0.25 * range ? "PUT" : null;
}
```

## Considered and not proposed

* Post-shock rules. ~3 fires/day across 9 assets → ~24 days to reach 71 trades; and neither a re-sync nor an injected jump carries sign information about what follows.
* Drift-regime momentum at 60–240 bars. Arithmetic kills it: even a large per-bar drift of 0.05σ gives ~53% at 15m, and a drift big enough for 75% would have been blatant in the 15m-direction test. Cannot pass a 75% screen even if true.
* Anti-trader streak fade (six same-colour bars → fade). The only mechanism is counterparty shading; the 5m-trend superset scoring ~50% caps the reversal at ~53%. Worth revisiting only if the 47.6% on confluence 4.5–5.0 rests on hundreds of trades — check that n; if it's large, it's the most interesting number you have.
* 15m S/R rejection as posed. No mechanism in a synthetic feed beyond what h001/h002 already test.
* Confluence inversion (forbidden), tie-farming, time-of-day drift, cross-asset: no directional mechanism or untestable in 4.5 days.

## Overall assessment

Probability that any 1m-OHLC rule on this feed reaches 75% out of sample: about 5%. Your dead tests already exclude every short- and medium-horizon dependence a generator commonly has; what remains is a slow tether or a hard clip, and the shock candles hint the level is reset externally rather than pulled. Even a real 70% would then have to survive a counterparty who can change the generator, the payout, or the fill without notice — "out of sample" here also means "out of regime". Screen h001 first. Run the ρ₁ check before spending anything on h003/h004. If h001 and h002 both land near 50%, stop: that result says the feed is a free random walk between resets, and no rule on closed bars can beat that.
