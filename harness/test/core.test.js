// The capture core that runs inside the extension.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../../extension/core.js");

const T0 = Date.UTC(2026, 8, 14, 10, 0);
const bars = (n, { start = 1.1, step = 60000, t0 = T0, drift = 0.0001 } = {}) =>
  Array.from({ length: n }, (_, i) => {
    const o = start + i * drift, c = o + drift;
    return { time: t0 + i * step, open: o, high: c + drift, low: o - drift, close: c };
  });

test("parseSymbol accepts real pairs in either order and flags OTC", () => {
  assert.deepEqual(core.parseSymbol("USDPKR_otc"), { id: "USDPKR_otc", base: "USD", quote: "PKR", otc: true });
  assert.equal(core.parseSymbol("BRLUSD_otc").id, "BRLUSD_otc");
  assert.equal(core.parseSymbol("EURUSD").otc, false);
  assert.equal(core.pairKey(core.parseSymbol("BRLUSD_otc")), core.pairKey(core.parseSymbol("USDBRL_otc")));
});

test("names follow the feed, except platform names verified by the owner", () => {
  // Verified against the platform 2026-09-15: only BRLUSD is listed the other
  // way round. Everything else is named exactly as the feed spells it.
  const cases = {
    BRLUSD_otc: "USD/BRL (OTC)", USDBRL_otc: "USD/BRL (OTC)",
    BDTUSD_otc: "BDT/USD (OTC)", IDRUSD_otc: "IDR/USD (OTC)", PHPUSD_otc: "PHP/USD (OTC)",
    MXNUSD_otc: "MXN/USD (OTC)", CHFNZD_otc: "CHF/NZD (OTC)", AUDNZD_otc: "AUD/NZD (OTC)",
    GBPNZD_otc: "GBP/NZD (OTC)", NZDUSD_otc: "NZD/USD (OTC)", USDPKR_otc: "USD/PKR (OTC)"
  };
  for (const [feed, name] of Object.entries(cases)) {
    assert.equal(core.displayName(core.canonicalKey(feed)), name, feed);
  }
  const s = core.createStore();
  s.ingest({ tokens: ["BRLUSD_otc"], prefix: "", candles: bars(20, { start: 0.2 }) });
  const out = s.snapshot().series;
  assert.deepEqual(Object.keys(out), ["USDBRL_otc"]);
  assert.equal(out.USDBRL_otc.name, "USD/BRL (OTC)");
  assert.equal(out.USDBRL_otc.symbol, "BRLUSD_otc", "the feed's own spelling is kept");
  assert.equal(out.USDBRL_otc.candles[0][1], 0.2, "prices are never inverted");

  // either spelling of one pair still merges into one series
  s.ingest({ tokens: ["USDBRL_otc"], prefix: "", candles: bars(20, { start: 0.2, t0: T0 + 20 * 60000, drift: 0.0001 }).map((c, i) => i === 0 ? { ...c, open: out.USDBRL_otc.candles[19][4] } : c) });
  assert.equal(Object.keys(s.snapshot().series).length, 1);
});

test("parseSymbol rejects ordinary six-letter words and key=value numbers", () => {
  for (const t of ["assets", "result", "stream", "update", "period=60", "candles", "USDUSD", "history/list"]) {
    assert.equal(core.parseSymbol(t), null, t);
  }
});

test("attribute: one pair ok, none dropped, two pairs ambiguous", () => {
  assert.equal(core.attribute(["asset", "EURUSD_otc", "period=60"], "").status, "ok");
  assert.equal(core.attribute(["period=60", "result"], '42["history/list",').status, "none");
  const amb = core.attribute(["AUDJPY_otc", "CADJPY_otc"], "");
  assert.equal(amb.status, "ambiguous");
  // the same pair named twice, in both orders, is still one instrument
  assert.equal(core.attribute(["USDBRL_otc", "BRLUSD_otc"], "").status, "ok");
  // OTC and real of the same pair are different instruments
  assert.equal(core.attribute(["EURUSD", "EURUSD_otc"], "").status, "ambiguous");
});

test("attribute reads a symbol out of the frame prefix", () => {
  const a = core.attribute([], '42["history/EURJPY_otc",');
  assert.equal(a.status, "ok");
  assert.equal(a.symbol.id, "EURJPY_otc");
});

test("validateCandles refuses sub-minute history instead of flooring it", () => {
  assert.equal(core.validateCandles(bars(30, { step: 5000 })).reason, "not_minute_aligned");
  assert.equal(core.validateCandles(bars(30, { step: 300000 })).reason, "not_1m_timeframe");
  const dup = bars(20); dup[5] = { ...dup[4] };
  assert.equal(core.validateCandles(dup).reason, "duplicate_time");
  assert.equal(core.validateCandles(bars(30)).ok, true);
});

test("mergeSeries refuses a foreign block whole at a broken seam", () => {
  const have = bars(100, { start: 1.10 });
  const foreign = bars(100, { start: 1.30, t0: T0 + 100 * 60000 });
  const m = core.mergeSeries(have, foreign);
  assert.equal(m.reason, "seam_mismatch");
  assert.equal(m.candles.length, 100);

  // AUD/JPY next to CAD/JPY: 0.5% apart, adjacent minutes — the old splice
  const jpy = bars(100, { start: 110.0, drift: 0.001 });
  const cad = bars(49, { start: jpy[0].open * 0.995, drift: 0.001, t0: T0 - 49 * 60000 });
  assert.equal(core.mergeSeries(jpy, cad).reason, "seam_mismatch");
});

test("mergeSeries refuses a detached block far from its nearest neighbour in time", () => {
  const have = bars(100, { start: 1.10 });
  const far = bars(60, { start: 1.30, t0: T0 - 500 * 60000 });
  assert.equal(core.mergeSeries(have, far).reason, "level_mismatch");
});

test("mergeSeries accepts older history across a shock that moved the series median", () => {
  // The first real capture: NZD/USD (OTC) jumped 5.6% in one minute, and six
  // genuine 49-bar pages from before the jump were refused against the
  // whole-series median. Joined at a continuous seam, they belong.
  const pre = bars(49, { start: 0.5480, drift: 0.00001, t0: T0 - 49 * 60000 });
  const jumpOpen = pre[48].close;
  const shock = { time: T0, open: jumpOpen, high: jumpOpen * 1.057, low: jumpOpen, close: jumpOpen * 1.056 };
  const post = bars(3000, { start: shock.close, drift: 0.000001, t0: T0 + 60000 });
  const have = [shock, ...post];
  const m = core.mergeSeries(have, pre);
  assert.equal(m.rejected, 0, m.reason);
  assert.equal(m.candles.length, 3050);
});

test("mergeSeries refuses an overlapping block whose closes disagree", () => {
  // AUD/JPY vs CAD/JPY: same level (inside 5%), different instrument
  const have = bars(100, { start: 110.0, drift: 0.01 });
  const other = bars(100, { start: 110.5, drift: -0.01, t0: T0 + 50 * 60000 });
  assert.equal(core.mergeSeries(have, other).reason, "overlap_disagrees");
});

test("mergeSeries extends a series with its own continuation", () => {
  const all = bars(200);
  const m = core.mergeSeries(all.slice(0, 120), all.slice(100));
  assert.equal(m.rejected, 0);
  assert.equal(m.candles.length, 200);
});

test("store: ingest, drop reasons, snapshot round-trip", () => {
  const s = core.createStore();
  assert.equal(s.ingest({ tokens: ["EURUSD_otc"], prefix: "", candles: bars(50) }).accepted, true);
  assert.equal(s.ingest({ tokens: ["result"], prefix: "", candles: bars(50) }).reason, "none");
  assert.equal(s.ingest({ tokens: ["AUDJPY_otc", "CADJPY_otc"], prefix: "", candles: bars(50) }).reason, "ambiguous");
  const snap = s.snapshot();
  assert.equal(snap.stats.framesSeen, 3);
  assert.equal(snap.stats.framesAccepted, 1);
  assert.deepEqual(snap.stats.dropped, { none: 1, ambiguous: 1, invalid: 0, merge: 0 });
  assert.equal(snap.series.EURUSD_otc.candles.length, 50);
  assert.equal(snap.series.EURUSD_otc.matchMode, "symbol");

  // rejected frames leave a diagnosis sample, without numeric id tokens
  assert.equal(snap.stats.rejectSamples.length, 2);
  assert.deepEqual(snap.stats.rejectSamples[0].tokens, ["result"]);
  const withId = core.createStore();
  withId.ingest({ tokens: ["uid=4821", "history/list"], prefix: "", candles: bars(10) });
  assert.deepEqual(withId.snapshot().stats.rejectSamples[0].tokens, ["history/list"]);
  assert.equal(withId.snapshot().stats.rejectSamples[0].firstCandles.length, 2);

  const again = core.createStore();
  again.restore(snap);
  assert.deepEqual(again.snapshot().series, snap.series);
});
