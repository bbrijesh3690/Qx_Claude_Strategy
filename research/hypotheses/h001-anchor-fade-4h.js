// Registered 2026-09-15. Proposed by Fable 5.1 (research/prompts/phase2-hypotheses-response.md),
// copied verbatim below this header. Screened on train with a fixed 70% screen size.
// FROZEN once screened: any change needs a new id.

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
