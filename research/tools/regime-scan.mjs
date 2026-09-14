// Do temporary patterns exist in the feed? Descriptive scan, train window only, no budget.
//
//   node research/tools/regime-scan.mjs data/qx_capture_20260914T1929.json
//
// Method (research/REGIMES.md):
//  1. Cut each asset's gap-free segments into non-overlapping windows (30/60/120 min) and measure
//     in each: lag-1 autocorrelation, candle-colour runs z-score, 2-candle-context predictability
//     (entropy gain), volatility.
//  2. Null: shuffle each segment's 1m returns (same moves, no time structure), B times, same stats.
//     Real structure = real data more extreme than the shuffles.
//  3. Persistence: does a window's pattern carry into the next window?
//  Also: exact replays of price paths (within and across assets), and cross-asset co-movement.
//
// The scan validates itself first: it must find planted regimes and find nothing in a random walk.
import { readFileSync } from "node:fs";
import { loadDataset } from "../../harness/src/data.js";
import { checkDataset } from "../../harness/src/integrity.js";
import { computeCutoff, trainWindow } from "../../harness/src/split.js";
import { prepareSegments } from "../../harness/src/engine.js";
import { mulberry32 } from "../../harness/src/synthetic.js";

const B = 100;
const WINDOWS = [30, 60, 120];

// ---------- window statistics ----------
function windowStats(r) {
  const n = r.length;
  const m = r.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { const d = r[i] - m; den += d * d; if (i) num += d * (r[i - 1] - m); }
  const rho = den > 0 ? num / den : 0;
  const x = r.filter(v => v !== 0).map(v => v > 0 ? 1 : 0);
  const n1 = x.filter(v => v).length, n2 = x.length - n1, N = x.length;
  let runs = N ? 1 : 0;
  for (let i = 1; i < N; i++) if (x[i] !== x[i - 1]) runs++;
  let z = 0;
  if (n1 && n2 && N > 2) {
    const E = 1 + 2 * n1 * n2 / N, V = 2 * n1 * n2 * (2 * n1 * n2 - N) / (N * N * (N - 1));
    z = V > 0 ? (runs - E) / Math.sqrt(V) : 0;
  }
  // entropy gain of next colour given the previous two colours
  const H = ps => ps.reduce((a, p) => a - (p > 0 ? p * Math.log2(p) : 0), 0);
  let gain = 0;
  if (N > 10) {
    const p1 = n1 / N;
    const ctx = [[0, 0], [0, 0], [0, 0], [0, 0]];
    for (let i = 2; i < N; i++) ctx[x[i - 2] * 2 + x[i - 1]][x[i]]++;
    let tot = 0, hc = 0;
    for (const [a, b] of ctx) { const t = a + b; tot += t; if (t) hc += t * H([a / t, b / t]); }
    gain = H([p1, 1 - p1]) - hc / tot;
  }
  const sd = Math.sqrt(den / n);
  return { rho, z, gain, lvol: Math.log(sd || 1e-12) };
}

function corrLag1(pairs) {
  if (pairs.length < 3) return 0;
  const xs = pairs.map(p => p[0]), ys = pairs.map(p => p[1]);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

// assets: [{ key, segments: [returns[]] }]
function metrics(assets, W) {
  const rhos = [], zs = [], gains = [], lv = [];
  const pRho = [], pZ = [], pVol = [];
  for (const a of assets) {
    // Volatility is compared WITHIN an asset: assets differ ~15x in typical move size, and
    // pooling raw log-vol measures that difference, not calm/wild regimes. (First run did exactly that.)
    const stats = [];
    for (const r of a.segments) {
      const seg = [];
      for (let s = 0; s + W <= r.length; s += W) seg.push(windowStats(r.slice(s, s + W)));
      stats.push(seg);
    }
    const flat = stats.flat();
    const mv = flat.reduce((x, st) => x + st.lvol, 0) / (flat.length || 1);
    for (const seg of stats) {
      let prev = null;
      for (const st of seg) {
        const v = st.lvol - mv;
        rhos.push(st.rho); zs.push(st.z); gains.push(st.gain); lv.push(v);
        if (prev) { pRho.push([prev.rho, st.rho]); pZ.push([prev.z, st.z]); pVol.push([prev.v, v]); }
        prev = { rho: st.rho, z: st.z, v };
      }
    }
  }
  const sd = v => { const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
  return {
    windows: rhos.length,
    sdRho: sd(rhos),
    extremeRuns: zs.filter(z => Math.abs(z) > 2.5).length / zs.length,
    meanGain: gains.reduce((a, b) => a + b, 0) / gains.length,
    persistRho: corrLag1(pRho),
    persistRuns: corrLag1(pZ),
    sdVol: sd(lv),
    persistVol: corrLag1(pVol)
  };
}

function shuffled(assets, rand) {
  return assets.map(a => ({
    key: a.key,
    segments: a.segments.map(r => {
      const c = r.slice();
      for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
      return c;
    })
  }));
}

const LABELS = {
  sdRho: "spread of window autocorrelation", extremeRuns: "share of windows with extreme colour runs (|z|>2.5)",
  meanGain: "colour predictability from last 2 candles (bits)", persistRho: "trend/reversal carries into next window",
  persistRuns: "colour-run pattern carries into next window", sdVol: "spread of window volatility",
  persistVol: "volatility carries into next window"
};
const DIRECTIONAL = ["sdRho", "extremeRuns", "meanGain", "persistRho", "persistRuns"];

function scan(assets, seed, quiet) {
  const out = {};
  for (const W of WINDOWS) {
    const real = metrics(assets, W);
    const rand = mulberry32(seed + W);
    const nulls = [];
    for (let b = 0; b < B; b++) nulls.push(metrics(shuffled(assets, rand), W));
    const rows = {};
    for (const k of Object.keys(LABELS)) {
      const nv = nulls.map(n => n[k]).sort((a, b) => a - b);
      const p = (1 + nv.filter(v => v >= real[k]).length) / (B + 1);
      rows[k] = { real: real[k], nullMean: nv.reduce((a, b) => a + b, 0) / B, null95: nv[Math.floor(0.95 * B)], p };
    }
    out[W] = { windows: real.windows, rows };
    if (!quiet) {
      console.log(`  -- window ${W} min: ${real.windows} windows`);
      for (const [k, v] of Object.entries(rows)) {
        const flag = v.p <= 0.01 ? "  <== MORE THAN CHANCE" : "";
        console.log(`     ${LABELS[k].padEnd(52)} real ${v.real.toFixed(4).padStart(8)}  shuffled ${v.nullMean.toFixed(4).padStart(8)} (95th ${v.null95.toFixed(4)})  p=${v.p.toFixed(3)}${flag}`);
      }
    }
  }
  return out;
}

function verdict(res) {
  // Directional structure is claimed only if some directional metric beats chance at p<=0.01 in
  // at least one window size. With 5 metrics x 3 sizes, Bonferroni on 15 looks gives family ~0.15;
  // so a single hit is weak, and persistence is what matters for trading.
  const hits = [];
  for (const W of WINDOWS) for (const k of DIRECTIONAL) if (res[W].rows[k].p <= 0.01) hits.push(`${k}@${W}`);
  return hits;
}

// ---------- replays and co-movement ----------
function replays(series, rand) {
  // quantise each 1m return into 5 bins by the asset's own quintiles; look for identical 20-bar paths
  const L = 20, seen = new Map();
  let windows = 0, dup = 0, dupCross = 0, dupTicks = 0;
  const tickSeen = new Map();
  for (const s of series) {
    const all = s.segments.flat().slice().sort((a, b) => a - b);
    const q = [0.2, 0.4, 0.6, 0.8].map(p => all[Math.floor(p * all.length)]);
    const bin = v => q.filter(t => v > t).length;
    for (const r0 of s.segments) {
      const r = rand ? shuffled([{ segments: [r0] }], rand)[0].segments[0] : r0;
      const code = r.map(bin).join("");
      for (let i = 0; i + L <= code.length; i += 1) {
        const k = code.slice(i, i + L); windows++;
        const prev = seen.get(k);
        if (prev !== undefined) { dup++; if (prev !== s.key) dupCross++; } else seen.set(k, s.key);
      }
      // exact tick-increment replays, length 10, ignoring near-flat paths
      const inc = r.map(v => Math.round(v * 1e6));
      for (let i = 0; i + 10 <= inc.length; i++) {
        const w = inc.slice(i, i + 10);
        if (w.filter(v => v === 0).length > 3) continue;
        const k = s.key + "|" + w.join(",");
        const kAny = w.join(",");
        if (tickSeen.has(kAny)) dupTicks++; else tickSeen.set(kAny, true);
      }
    }
  }
  return { windows, dup, dupCross, dupTicks };
}

// ---------- synthetic validation ----------
function synthAssets({ planted, seed }) {
  const rand = mulberry32(seed), g = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  const assets = [];
  for (let a = 0; a < 9; a++) {
    const r = [];
    let prev = 1;
    while (r.length < 6600) {
      const u = rand(), mode = !planted ? "none" : u < 0.2 ? "trend" : u < 0.4 ? "alt" : "none";
      for (let i = 0; i < 60; i++) {
        let sign = rand() < 0.5 ? 1 : -1;
        if (mode === "trend") sign = rand() < 0.70 ? prev : -prev;
        if (mode === "alt") sign = rand() < 0.70 ? -prev : prev;
        const v = sign * Math.abs(g()) * 0.0003;
        r.push(v); prev = sign;
      }
    }
    assets.push({ key: `S${a}`, segments: [r] });
  }
  return assets;
}

console.log("=== VALIDATION 1: synthetic data WITH planted temporary patterns (20% trending hours, 20% alternating hours, 70% strength)");
const v1 = verdict(scan(synthAssets({ planted: true, seed: 11 }), 1000, false));
console.log(`  detected: ${v1.join(", ") || "NOTHING"}  -> ${v1.length ? "PASS" : "FAIL: scan cannot see regimes"}`);
console.log("\n=== VALIDATION 2: synthetic pure random walk (no patterns)");
const v2 = verdict(scan(synthAssets({ planted: false, seed: 12 }), 2000, false));
console.log(`  detected: ${v2.join(", ") || "nothing"}  -> ${v2.length <= 1 ? "PASS" : "FAIL: scan finds patterns in noise"}`);

console.log("\n=== VALIDATION 3: can the replay check see a reused price path?");
{
  const base = synthAssets({ planted: false, seed: 13 });
  const before = replays(base, null);
  // copy 60 minutes of asset S0 into asset S5 two days later
  base[5].segments[0].splice(3000, 60, ...base[0].segments[0].slice(1000, 1060));
  const after = replays(base, null);
  console.log(`  random walk: ${before.dup} repeated shapes, ${before.dupTicks} exact paths; with one copied hour: ${after.dup} shapes (${after.dupCross} cross-asset), ${after.dupTicks} exact paths -> ${after.dupCross > 0 && before.dup === 0 ? "PASS" : "FAIL"}`);
}

// ---------- real data ----------
const [dsPath] = process.argv.slice(2);
const ds = loadDataset(dsPath);
const rep = checkDataset(ds, { verifiedGaps: JSON.parse(readFileSync(new URL("../verified-gaps.json", import.meta.url), "utf8")) });
const include = new Set(rep.passing), cutoff = computeCutoff(ds, { include }), window = trainWindow(cutoff);
const assets = ds.series.filter(s => include.has(s.key)).map(s => ({
  key: s.key,
  segments: prepareSegments(s, window).segments.map(seg => seg.slice(1).map((c, i) => Math.log(c.close / seg[i].close)))
}));
console.log(`\n=== REAL DATA: train window before ${new Date(cutoff).toISOString()}, ${assets.length} assets, ${assets.reduce((a, s) => a + s.segments.reduce((b, r) => b + r.length, 0), 0)} one-minute returns`);
const realRes = scan(assets, 3000, false);
const hits = verdict(realRes);
console.log(`  directional metrics beating chance (p<=0.01): ${hits.join(", ") || "none"}`);

console.log("\n=== REPLAYED PRICE PATHS (identical 20-bar shape, and identical 10-bar tick moves)");
const rr = replays(assets, null);
const rn = replays(assets, mulberry32(4242));
console.log(`  real:     ${rr.dup} repeated 20-bar shapes (${rr.dupCross} across different assets), ${rr.dupTicks} repeated 10-bar exact paths, of ${rr.windows} windows`);
console.log(`  shuffled: ${rn.dup} repeated 20-bar shapes (${rn.dupCross} across different assets), ${rn.dupTicks} repeated 10-bar exact paths`);

console.log("\n=== CROSS-ASSET CO-MOVEMENT (same-minute return correlation)");
const byMin = assets.map(a => { const m = new Map(); const s = ds.series.find(x => x.key === a.key); for (const seg of prepareSegments(s, window).segments) for (let i = 1; i < seg.length; i++) m.set(seg[i].time, Math.log(seg[i].close / seg[i - 1].close)); return m; });
const cors = [];
for (let i = 0; i < assets.length; i++) for (let j = i + 1; j < assets.length; j++) {
  const pairs = []; for (const [t, v] of byMin[i]) if (byMin[j].has(t)) pairs.push([v, byMin[j].get(t)]);
  cors.push({ pair: `${assets[i].key}~${assets[j].key}`, c: corrLag1(pairs), n: pairs.length });
}
cors.sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
console.log(`  36 pairs; chance sd ~ ${(1 / Math.sqrt(cors[0].n)).toFixed(3)}; largest: ${cors.slice(0, 5).map(c => `${c.pair} ${c.c.toFixed(3)}`).join(", ")}`);
console.log(`  pairs beyond 3 chance-sd: ${cors.filter(c => Math.abs(c.c) > 3 / Math.sqrt(c.n)).length}`);
