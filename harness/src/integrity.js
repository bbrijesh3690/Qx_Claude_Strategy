// Input validation. The previous project's first verdict was delivered on
// spliced data and defended with a planted-edge test that only proved the
// ANALYSIS worked. Both halves need checking, every time — this is the
// input half, and the harness will not score a series that fails it.
import { createRequire } from "node:module";
import { MINUTE } from "./data.js";

// Same seam threshold the capture merge uses.
const core = createRequire(import.meta.url)("../../extension/core.js");

const FAIL = "fail", WARN = "warn";

function medianAbsLogReturn(candles) {
  const rs = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].time - candles[i - 1].time !== MINUTE) continue;
    const r = Math.abs(Math.log(candles[i].close / candles[i - 1].close));
    if (r > 0) rs.push(r);
  }
  if (!rs.length) return 0;
  rs.sort((a, b) => a - b);
  return rs[Math.floor(rs.length / 2)];
}

export function checkSeries(s, opts = {}) {
  // AUD/JPY and CAD/JPY sit 0.5% apart, so the floor has to sit below that
  // or the exact splice that broke the old project passes. A news spike on
  // a real pair can trip this too; that is a loud false alarm to inspect,
  // which is the right way round.
  const { jumpMultiple = 15, jumpFloor = 0.002, frozenWarn = 0.2 } = opts;
  const c = s.candles;
  const issues = [];
  const add = (severity, code, detail) => issues.push({ severity, code, detail });

  if (s.matchMode !== "symbol") add(FAIL, "attribution", `matchMode is ${JSON.stringify(s.matchMode)}, not "symbol"`);
  if (c.length < 50) add(WARN, "short", `${c.length} bars`);

  let badOhlc = 0, nonPositive = 0, misaligned = 0, dupes = 0, unsorted = 0;
  let gapEvents = 0, missingMinutes = 0, frozen = 0, longestFrozen = 0, run = 0;
  for (let i = 0; i < c.length; i++) {
    const b = c[i];
    if (!(b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0)) nonPositive++;
    if (b.high < Math.max(b.open, b.close) || b.low > Math.min(b.open, b.close)) badOhlc++;
    if (b.time % MINUTE !== 0) misaligned++;
    if (b.high === b.low) { frozen++; run++; longestFrozen = Math.max(longestFrozen, run); } else run = 0;
    if (i > 0) {
      const step = b.time - c[i - 1].time;
      if (step === 0) dupes++;
      else if (step < 0) unsorted++;
      else if (step > MINUTE) { gapEvents++; missingMinutes += step / MINUTE - 1; }
    }
  }
  if (nonPositive) add(FAIL, "non_positive", `${nonPositive} bars`);
  if (badOhlc) add(FAIL, "ohlc_inconsistent", `${badOhlc} bars`);
  if (misaligned) add(FAIL, "not_minute_aligned", `${misaligned} bars`);
  if (dupes) add(FAIL, "duplicate_time", `${dupes} bars`);
  if (unsorted) add(FAIL, "unsorted", `${unsorted} steps`);

  // Splices show up at the SEAM: a bar opening far from where the previous
  // minute closed. That is the fail.
  //
  // A big BODY with a continuous seam is a different thing. v0.1.0 treated
  // it as a splice too, and the first real capture failed 8 of 9 OTC series
  // on 22 such bars — every one opening exactly at the previous close, with
  // the wick spanning the move and later bars continuing from the new level.
  // They are genuine 1–5% shock candles in the broker's feed. They are data,
  // so they get reported but not excluded.
  const med = medianAbsLogReturn(c);
  const limit = core.seamLimit(c);
  const shockLimit = Math.max(jumpFloor, med * jumpMultiple);
  const jumps = [], shocks = [];
  for (let i = 1; i < c.length; i++) {
    if (c[i].time - c[i - 1].time !== MINUTE) continue;
    const seam = Math.abs(Math.log(c[i].open / c[i - 1].close));
    const body = Math.abs(Math.log(c[i].close / c[i - 1].close));
    if (seam > limit) jumps.push({ time: c[i].time, move: Number(seam.toFixed(5)) });
    else if (body > shockLimit) shocks.push({ time: c[i].time, move: Number(body.toFixed(5)) });
  }
  if (jumps.length) add(FAIL, "seam_break", `${jumps.length} bars open > ${(limit * 100).toFixed(2)}% from the previous close (first at ${new Date(jumps[0].time).toISOString()}, ${(jumps[0].move * 100).toFixed(2)}%)`);
  if (shocks.length) add(WARN, "shock_bars", `${shocks.length} continuous one-minute moves > ${(shockLimit * 100).toFixed(2)}%, largest ${(Math.max(...shocks.map(s => s.move)) * 100).toFixed(2)}%`);

  const frozenShare = c.length ? frozen / c.length : 0;
  if (frozenShare > frozenWarn) add(WARN, "frozen_bars", `${(frozenShare * 100).toFixed(1)}% frozen, longest run ${longestFrozen}`);
  if (gapEvents) add(WARN, "gaps", `${gapEvents} gaps, ${missingMinutes} missing minutes`);

  return {
    key: s.key, symbol: s.symbol, otc: s.otc, bars: c.length,
    spanHours: c.length ? Number(((c[c.length - 1].time - c[0].time) / 3600000).toFixed(1)) : 0,
    frozenShare: Number(frozenShare.toFixed(4)), gapEvents, missingMinutes,
    medianAbsReturn: med, jumps: jumps.slice(0, 5), shocks,
    issues, status: issues.some(i => i.severity === FAIL) ? FAIL : (issues.length ? WARN : "ok")
  };
}

// Two instruments sharing bars: CAD/CHF and NZD/CAD shared 178 identical
// closes in the old data. Frozen bars are excluded — two closed markets
// can both sit still without being the same series.
export function checkCrossSeries(series, { minShared = 20, minShare = 0.5 } = {}) {
  const findings = [];
  const maps = series.map(s => {
    const m = new Map();
    for (const c of s.candles) if (c.high !== c.low) m.set(c.time, c.close);
    return m;
  });
  for (let a = 0; a < series.length; a++) {
    for (let b = a + 1; b < series.length; b++) {
      const [small, large] = maps[a].size <= maps[b].size ? [maps[a], maps[b]] : [maps[b], maps[a]];
      let overlap = 0, identical = 0;
      for (const [t, close] of small) {
        if (!large.has(t)) continue;
        overlap++;
        if (large.get(t) === close) identical++;
      }
      if (identical >= minShared && identical / overlap >= minShare) {
        findings.push({ a: series[a].key, b: series[b].key, overlap, identical });
      }
    }
  }
  return findings;
}

export function checkDataset(ds, opts = {}) {
  const perSeries = ds.series.map(s => checkSeries(s, opts));
  const shared = checkCrossSeries(ds.series, opts);
  for (const f of shared) {
    for (const r of perSeries) {
      if (r.key === f.a || r.key === f.b) {
        r.issues.push({ severity: FAIL, code: "shared_bars", detail: `${f.identical}/${f.overlap} identical closes with ${r.key === f.a ? f.b : f.a}` });
        r.status = FAIL;
      }
    }
  }
  const failing = perSeries.filter(r => r.status === FAIL).map(r => r.key);
  return { perSeries, shared, failing, passing: perSeries.filter(r => r.status !== FAIL).map(r => r.key) };
}
