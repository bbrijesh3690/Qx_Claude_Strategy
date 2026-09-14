import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeDataset, fromCapture } from "../src/data.js";
import { checkDataset } from "../src/integrity.js";
import { runHypothesis, summarizeGroup, BarView, LookaheadError } from "../src/engine.js";
import { liveSegments, settle } from "../src/bars.js";
import { computeCutoff, trainWindow, holdoutWindow, claimHoldoutLook, readLedger } from "../src/split.js";
import { lintSource, loadHypothesis } from "../src/hypothesis.js";
import { randomWalk } from "../src/synthetic.js";
import { runSelftest } from "../src/selftest.js";

const M = 60000;
const T0 = Date.UTC(2026, 0, 5);
const hyp = (decide, extra = {}) => ({
  meta: { id: "t", statement: "test hypothesis statement", market: "both", expiries: [1], warmup: 1, predictedRate: 0.6, registeredAt: "test", ...extra },
  decide
});

test("settle: entry at next open, exit at close of bar i+expiry", () => {
  const seg = [
    { time: 0, open: 1, high: 1, low: 1, close: 1 },
    { time: M, open: 2, high: 3, low: 2, close: 3 },
    { time: 2 * M, open: 3, high: 3, low: 1, close: 1.5 }
  ];
  assert.deepEqual(settle(seg, 0, 1), { entry: 2, exit: 3, move: 1, exitTime: M });
  assert.deepEqual(settle(seg, 0, 2), { entry: 2, exit: 1.5, move: -1, exitTime: 2 * M });
  assert.equal(settle(seg, 1, 2), null);
});

test("BarView refuses future bars", () => {
  const v = new BarView([{ time: 0 }, { time: M }, { time: 2 * M }], 1);
  assert.equal(v.length, 2);
  assert.equal(v.at(-1).time, M);
  assert.equal(v.last(5).length, 2);
  assert.throws(() => v.at(2), LookaheadError);
});

test("liveSegments splits on gaps and removes long frozen runs", () => {
  const live = randomWalk({ bars: 120, seed: 3 });
  const frozen = Array.from({ length: 15 }, (_, i) => ({ time: live[119].time + (i + 1) * M, open: 1, high: 1, low: 1, close: 1 }));
  const after = randomWalk({ bars: 80, seed: 4, startTime: frozen[14].time + M });
  const gapAfter = randomWalk({ bars: 60, seed: 5, startTime: after[79].time + 10 * M });
  const { segments, droppedBars } = liveSegments(live.concat(frozen, after, gapAfter));
  assert.deepEqual(segments.map(s => s.length), [120, 80, 60]);
  assert.equal(droppedBars, 15);
});

test("no overlap: the next decision is at the exit bar", () => {
  const ds = makeDataset([{ symbol: "EURUSD_otc", candles: randomWalk({ bars: 100, seed: 9 }) }]);
  const { trades } = runHypothesis(hyp(() => "CALL"), ds, { expiry: 5 });
  for (let k = 1; k < trades.length; k++) assert.equal(trades[k].time - trades[k - 1].time, 5 * M);
  assert.equal(trades.length, 19); // decisions at bars 0,5,...,90; bar 95 has no room to settle
});

test("a train run never sees a holdout bar, even as warmup or settlement", () => {
  const ds = makeDataset([{ symbol: "EURUSD_otc", candles: randomWalk({ bars: 3000, seed: 11 }) }]);
  const cutoff = computeCutoff(ds);
  let maxSeen = -Infinity;
  const spy = hyp(view => { for (const b of view.last(50)) maxSeen = Math.max(maxSeen, b.time); return "PUT"; }, { warmup: 50 });
  const { trades } = runHypothesis(spy, ds, { expiry: 15, window: trainWindow(cutoff) });
  assert.ok(maxSeen < cutoff);
  for (const t of trades) assert.ok(t.time + 15 * M < cutoff, "settlement bar inside train");

  let minSeen = Infinity;
  const spy2 = hyp(view => { minSeen = Math.min(minSeen, view.at(0).time); return null; });
  runHypothesis(spy2, ds, { expiry: 1, window: holdoutWindow(cutoff) });
  assert.ok(minSeen >= cutoff);
});

test("a seam break splits the series; a verified one warns instead of failing", () => {
  const a = randomWalk({ bars: 400, start: 62.1, vol: 0.0002, seed: 31 });
  const b = randomWalk({ bars: 400, start: 62.1, vol: 0.0002, seed: 32, startTime: a[399].time + M });
  const f = (a[399].close * 1.0089) / b[0].open; // USD/PHP (OTC) 09-13 06:10: +0.89% at the open
  const candles = a.concat(b.map(c => ({ time: c.time, open: c.open * f, high: c.high * f, low: c.low * f, close: c.close * f })));
  const ds = makeDataset([{ symbol: "USDPHP_otc", candles }]);
  const gapTime = new Date(b[0].time).toISOString();

  assert.equal(checkDataset(ds).perSeries[0].status, "fail");
  const ok = checkDataset(ds, { verifiedGaps: [{ key: "USDPHP_otc", time: gapTime }] }).perSeries[0];
  assert.equal(ok.status, "warn");
  assert.ok(ok.issues.some(i => i.code === "verified_gap"));
  // a verified gap for another series or another minute does not excuse this one
  assert.equal(checkDataset(ds, { verifiedGaps: [{ key: "USDIDR_otc", time: gapTime }] }).perSeries[0].status, "fail");

  const { trades, perSeries } = runHypothesis(hyp(() => "CALL"), ds, { expiry: 5 });
  assert.equal(perSeries[0].segments, 2);
  for (const t of trades) assert.ok(!(t.time < b[0].time && t.time + 5 * M >= b[0].time), "no trade settles across the gap");
});

test("series are named from the feed symbol, not the stored key", () => {
  const ds = fromCapture({
    format: "qx-capture", formatVersion: 1,
    series: {
      PHPUSD_otc: { symbol: "USDPHP_otc", otc: true, matchMode: "symbol", candles: [] },
      BRLUSD_otc: { symbol: "BRLUSD_otc", otc: true, matchMode: "symbol", candles: [] }
    }
  });
  assert.deepEqual(ds.series.map(s => [s.key, s.name]), [["USDBRL_otc", "USD/BRL (OTC)"], ["USDPHP_otc", "USD/PHP (OTC)"]]);
});

test("decide must return CALL, PUT or null", () => {
  const ds = makeDataset([{ symbol: "EURUSD_otc", candles: randomWalk({ bars: 60, seed: 1 }) }]);
  assert.throws(() => runHypothesis(hyp(() => "BUY"), ds, { expiry: 1 }), /expected "CALL", "PUT" or null/);
});

test("OTC and real pairs are never pooled; matched null exposes a direction mirage", () => {
  // up-drifting series: always-CALL wins well above 50% with no skill at all
  const up = randomWalk({ bars: 4000, seed: 21 }).map((c, i) => ({ ...c }));
  let price = 1.1;
  const drifting = up.map(c => {
    const r = Math.log(c.close / c.open) + 0.0002;
    const o = price, cl = o * Math.exp(r);
    price = cl;
    return { time: c.time, open: o, high: Math.max(o, cl) * 1.0001, low: Math.min(o, cl) * 0.9999, close: cl };
  });
  const ds = makeDataset([
    { symbol: "EURUSD_otc", candles: drifting },
    { symbol: "EURUSD", candles: randomWalk({ bars: 2000, seed: 22 }) }
  ]);
  const { trades } = runHypothesis(hyp(() => "CALL"), ds, { expiry: 1 });
  const otc = summarizeGroup(trades.filter(t => t.otc), 0.85);
  assert.ok(otc.rate > 0.65, `drift gives always-CALL ${otc.rate}`);
  assert.ok(Math.abs(otc.matchedNull - otc.rate) < 1e-9, "matched null equals the rate for a pure direction bet");
  assert.equal(otc.clearsHurdle, false);
  assert.ok(otc.pValue > 0.4);
});

test("holdout: one look per hypothesis id, recorded before results", () => {
  const dir = mkdtempSync(join(tmpdir(), "qx-ledger-"));
  try {
    const path = join(dir, "ledger.jsonl");
    claimHoldoutLook(path, { hypothesisId: "h001", sourceHash: "a".repeat(64), datasetHash: "b".repeat(64), cutoff: 1 });
    assert.throws(() => claimHoldoutLook(path, { hypothesisId: "h001", sourceHash: "c".repeat(64), datasetHash: "d", cutoff: 2 }), /already used/);
    claimHoldoutLook(path, { hypothesisId: "h002", sourceHash: "e".repeat(64), datasetHash: "f", cutoff: 1 });
    assert.equal(readLedger(path).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hypothesis loader rejects sources that could read the data directly", async () => {
  assert.deepEqual(lintSource(`export function decide(v){ return v.at(-1).close > 1 ? "CALL" : null; }`), []);
  assert.ok(lintSource(`import { readFileSync } from "node:fs";`).length);
  assert.ok(lintSource(`const d = await import("./x.js")`).length);
  const dir = mkdtempSync(join(tmpdir(), "qx-hyp-"));
  try {
    const bad = join(dir, "bad.js");
    writeFileSync(bad, `import { readFileSync } from "fs";\nexport const meta = {};\nexport function decide(){ return null; }\n`);
    await assert.rejects(loadHypothesis(bad), /rejected/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("selftest passes: planted edges found, noise and leaks caught", () => {
  const { pass, checks } = runSelftest();
  assert.ok(pass, checks.filter(c => !c.pass).map(c => `${c.name}: ${c.detail}`).join("\n"));
});
