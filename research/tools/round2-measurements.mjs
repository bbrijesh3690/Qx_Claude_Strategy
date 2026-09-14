// Round-2 measurements proposed by the idea source (research/prompts/phase2-round2-response.md).
// Train window only. h002 OUTCOMES ARE NEVER READ: only its fire times, directions and prices.
//
//   node research/tools/round2-measurements.mjs data/qx_capture_20260914T1929.json
//
// h002 was never registered, so its code is read straight out of the recorded
// response and written to a temp file for the loader.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDataset } from "../../harness/src/data.js";
import { checkDataset } from "../../harness/src/integrity.js";
import { computeCutoff, trainWindow } from "../../harness/src/split.js";
import { runHypothesis, prepareSegments } from "../../harness/src/engine.js";
import { loadHypothesis } from "../../harness/src/hypothesis.js";
import { wilson } from "../../harness/src/stats.js";

const [dsPath] = process.argv.slice(2);
const response = readFileSync(new URL("../prompts/phase2-hypotheses-response.md", import.meta.url), "utf8");
const h002Src = [...response.matchAll(/```js\n([\s\S]*?)```/g)].map(m => m[1]).find(b => b.includes('"h002-flat-extreme-reflect"'));
const h002Path = join(mkdtempSync(join(tmpdir(), "qx-h002-")), "h002.js");
writeFileSync(h002Path, h002Src);
const ds = loadDataset(dsPath);
const gaps = JSON.parse(readFileSync(new URL("../verified-gaps.json", import.meta.url), "utf8"));
const rep = checkDataset(ds, { verifiedGaps: gaps });
const include = new Set(rep.passing), cutoff = computeCutoff(ds, { include }), window = trainWindow(cutoff);
const iso = t => new Date(t).toISOString().slice(0, 16).replace("T", " ");
const ci = (w, n) => { const c = wilson(w, n); return `${(c.p * 100).toFixed(1)}% [${(c.low * 100).toFixed(1)}-${(c.high * 100).toFixed(1)}] (${w}/${n})`; };

// ---------- A. h001: distinct excursions ----------
const h001 = await loadHypothesis(new URL("../hypotheses/h001-anchor-fade-4h.js", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const t1 = runHypothesis(h001, ds, { expiry: 15, window, include }).trades
  .filter(t => t.result !== "T").sort((a, b) => a.key.localeCompare(b.key) || a.time - b.time);
const exc = [];
for (const t of t1) {
  const last = exc[exc.length - 1];
  if (last && last.key === t.key && last.dir === t.dir && t.time - last.end <= 60 * 60000) { last.trades.push(t); last.end = t.time; }
  else exc.push({ key: t.key, dir: t.dir, trades: [t], end: t.time });
}
console.log("=== A. h001: distinct excursions (same asset, same direction, consecutive trades <= 60 min apart)");
console.log(`trades ${t1.length} -> excursions ${exc.length}; trades per excursion: ${exc.map(e => e.trades.length).sort((a, b) => b - a).join(",")}`);
for (const d of ["CALL", "PUT"]) {
  const ts = t1.filter(t => t.dir === d);
  console.log(`  ${d}: win ${ci(ts.filter(t => t.result === "W").length, ts.length)}`);
}
const firsts = exc.map(e => e.trades[0]);
console.log(`  first trade of each excursion: win ${ci(firsts.filter(t => t.result === "W").length, firsts.length)}`);
const excRate = exc.map(e => e.trades.filter(t => t.result === "W").length / e.trades.length);
console.log(`  mean of per-excursion win rates: ${(100 * excRate.reduce((a, b) => a + b, 0) / exc.length).toFixed(1)}% over ${exc.length}`);

// ---------- B. h002 fingerprint ----------
const sigOf = d => {
  const n = d.length, q = d.slice().sort((x, y) => x - y);
  const med = n % 2 ? q[(n - 1) >> 1] : 0.5 * (q[n / 2 - 1] + q[n / 2]);
  const a = d.map(x => Math.abs(x - med)).sort((x, y) => x - y);
  const mad = n % 2 ? a[(n - 1) >> 1] : 0.5 * (a[n / 2 - 1] + a[n / 2]);
  if (mad > 0) return 1.4826 * mad;
  const m = a.reduce((x, y) => x + y, 0) / n;
  return m > 0 ? 1.2533 * m : 0;
};
const h002 = await loadHypothesis(h002Path);
const fires = runHypothesis(h002, ds, { expiry: 15, window, include }).trades.map(t => ({ key: t.key, time: t.time, dir: t.dir }));
console.log(`\n=== B. h002 fingerprint: ${fires.length} fires (outcomes not read)`);
console.log("asset        tick       fires  touch-price spread in ticks, sorted          0.5σ band in ticks (median)");
const allSpreads = [];
const guard = { 240: [0, 0], 360: [0, 0] };
for (const s of ds.series) {
  if (!include.has(s.key)) continue;
  const lv = [...new Set(s.candles.flatMap(c => [c.open, c.high, c.low, c.close]))].sort((a, b) => a - b);
  let tick = Infinity;
  for (let i = 1; i < lv.length; i++) { const d = lv[i] - lv[i - 1]; if (d > 1e-12 && d < tick) tick = d; }
  const { segments } = prepareSegments(s, window);
  const at = new Map();
  segments.forEach(seg => seg.forEach((b, i) => at.set(b.time, [seg, i])));
  for (const seg of segments) for (const W of [240, 360]) for (let i = W; i < seg.length; i += 5) {
    const d = [];
    for (let k = i - W + 1; k <= i; k++) d.push(seg[k].close - seg[k - 1].close);
    const sg = sigOf(d);
    guard[W][1]++;
    if (d.some(x => Math.abs(x) > 8 * sg)) guard[W][0]++;
  }
  const spreads = [], bands = [];
  for (const f of fires.filter(f => f.key === s.key)) {
    const [seg, i] = at.get(f.time);
    const W = 360, bars = seg.slice(i - W, i + 1), d = [];
    for (let k = 1; k <= W; k++) d.push(bars[k].close - bars[k - 1].close);
    const sg = sigOf(d), win = bars.slice(1);
    let prices;
    if (f.dir === "PUT") { const hi = Math.max(...win.map(b => b.high)); prices = win.filter(b => b.high >= hi - 0.5 * sg).map(b => b.high); }
    else { const lo = Math.min(...win.map(b => b.low)); prices = win.filter(b => b.low <= lo + 0.5 * sg).map(b => b.low); }
    spreads.push(Math.round((Math.max(...prices) - Math.min(...prices)) / tick));
    bands.push(Math.round(0.5 * sg / tick));
  }
  if (!spreads.length) continue;
  spreads.sort((a, b) => a - b); bands.sort((a, b) => a - b);
  allSpreads.push(...spreads);
  console.log(`${s.key.padEnd(12)} ${String(Number(tick.toPrecision(2))).padEnd(10)} ${String(spreads.length).padStart(5)}  ${spreads.join(",").padEnd(42)} ${bands[bands.length >> 1]}`);
}
console.log(`fires with spread 0-1 tick: ${allSpreads.filter(x => x <= 1).length}/${allSpreads.length}`);
for (const W of [240, 360]) console.log(`8σ guard nulls ${(100 * guard[W][0] / guard[W][1]).toFixed(1)}% of decision bars at window ${W} (every 5th bar sampled)`);

// ---------- C. shock catalogue ----------
console.log("\n=== C. shock catalogue, train window: continuous seam, |1m close-to-close| > max(0.2%, 15x median)");
const shocks = [];
for (const s of ds.series) {
  if (!include.has(s.key)) continue;
  const r = rep.perSeries.find(p => p.key === s.key);
  const idx = new Map(s.candles.map((b, i) => [b.time, i]));
  for (const sh of r.shocks) {
    if (sh.time >= cutoff) continue;
    const i = idx.get(sh.time);
    shocks.push({ key: s.key, time: sh.time, size: sh.move, sign: Math.sign(s.candles[i].close - s.candles[i - 1].close) });
  }
}
shocks.sort((a, b) => a.time - b.time);
for (const x of shocks) console.log(`  ${iso(x.time)} UTC  ${x.key.padEnd(11)} ${x.sign > 0 ? "+" : "-"}${(x.size * 100).toFixed(2)}%`);
const mins = shocks.map(x => new Date(x.time).getUTCMinutes());
console.log(`n=${shocks.length}; up ${shocks.filter(x => x.sign > 0).length}, down ${shocks.filter(x => x.sign < 0).length}`);
console.log(`minute-of-hour at :00/:15/:30/:45: ${mins.filter(m => m % 15 === 0).length} (chance ${(shocks.length * 4 / 60).toFixed(1)}); multiple of 5: ${mins.filter(m => m % 5 === 0).length} (chance ${(shocks.length / 5).toFixed(1)})`);
console.log(`shocks sharing their exact minute with another asset: ${shocks.filter((x, i) => shocks.some((y, j) => j !== i && y.time === x.time)).length}`);
console.log(`UTC hours: ${shocks.map(x => new Date(x.time).getUTCHours()).sort((a, b) => a - b).join(",")}`);
