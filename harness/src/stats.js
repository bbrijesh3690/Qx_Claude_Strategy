// Statistics for binary-option hit rates. No dependencies.
//
// Conventions used everywhere in the harness:
// - "decided" excludes ties (a tie refunds the stake on Quotex).
// - The gate is ONE-SIDED at alpha = 0.025, which is what a 95% Wilson
//   lower bound corresponds to. Asking "is it better than the hurdle"
//   is a one-sided question; pretending otherwise halves the evidence.

export const ALPHA = 0.025;

// Acklam's rational approximation to the inverse normal CDF.
export function normInv(p) {
  if (!(p > 0 && p < 1)) throw new RangeError(`normInv: p must be in (0,1), got ${p}`);
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const lo = 0.02425, hi = 1 - lo;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > hi) return -normInv(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function wilson(wins, decided, z = 1.96) {
  if (!(decided > 0)) return null;
  const p = wins / decided;
  const z2 = z * z;
  const denom = 1 + z2 / decided;
  const centre = (p + z2 / (2 * decided)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p) + z2 / (4 * decided)) / decided);
  return { p, low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) };
}

// A win returns `payout` (0.85 = 85%); a loss costs the whole stake.
export function breakEven(payout) {
  if (!(payout > 0)) throw new RangeError(`breakEven: payout must be > 0, got ${payout}`);
  return 1 / (1 + payout);
}

// Expected return per unit staked, ties ignored.
export function evPerTrade(rate, payout) {
  return rate * payout - (1 - rate);
}

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61503916999185, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

export function lnGamma(z) {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = LANCZOS[0];
  for (let i = 1; i < 9; i++) x += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// Exact P(X >= wins) for X ~ Binomial(decided, p0). The one-sided
// p-value for "the true rate is above p0".
export function binomUpperTail(wins, decided, p0) {
  if (wins <= 0) return 1;
  if (wins > decided) return 0;
  if (p0 <= 0) return 0;
  if (p0 >= 1) return 1;
  const lnC0 = lnGamma(decided + 1);
  const lp = Math.log(p0), lq = Math.log(1 - p0);
  let sum = 0;
  for (let k = wins; k <= decided; k++) {
    const term = Math.exp(lnC0 - lnGamma(k + 1) - lnGamma(decided - k + 1) + k * lp + (decided - k) * lq);
    sum += term;
    if (k > decided * p0 && term < sum * 1e-15) break;
  }
  return Math.min(1, sum);
}

// Holm step-down adjustment. Returns adjusted p-values in input order.
// Uniformly more powerful than Bonferroni and still controls the
// family-wise error rate with no assumption about dependence.
export function holm(pValues) {
  const m = pValues.length;
  const order = pValues.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const adj = new Array(m);
  let running = 0;
  order.forEach(([p, i], rank) => {
    running = Math.max(running, Math.min(1, (m - rank) * p));
    adj[i] = running;
  });
  return adj;
}

// Trades needed to DETECT a true rate p1 against hurdle p0 with the
// given power, one-sided at alpha. `tests` applies a Bonferroni split,
// which is the conservative planning figure for a screening family.
export function requiredN({ p1, p0, alpha = ALPHA, power = 0.8, tests = 1 }) {
  if (!(p1 > p0)) return Infinity;
  const za = normInv(1 - alpha / tests);
  const zb = normInv(power);
  const n = ((za * Math.sqrt(p0 * (1 - p0)) + zb * Math.sqrt(p1 * (1 - p1))) / (p1 - p0)) ** 2;
  return Math.ceil(n);
}

// Smallest n at which an OBSERVED rate p puts the Wilson lower bound
// above p0. This is the optimistic figure — it assumes the sample
// comes in exactly at the true rate — and it is NOT a planning number.
export function nToProve(p, p0, z = 1.96) {
  if (!(p > p0)) return Infinity;
  for (let n = 1; n < 1e7; n++) {
    const w = wilson(p * n, n, z);
    if (w.low > p0) return n;
  }
  return Infinity;
}
