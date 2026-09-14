// Runs a hypothesis over a dataset and settles its trades.
//
// Three guarantees, each enforced mechanically rather than by convention:
// 1. NO LOOK-AHEAD. A hypothesis sees bars only through a BarView that
//    throws on any index past the decision bar. checkNoLookahead() then
//    catches the remaining leak — state smuggled in through a closure —
//    by re-deciding on truncated series and comparing.
// 2. NO OVERLAP. One open position per asset. After a trade the next
//    decision is at the close of that trade's exit bar. Overlapping
//    trades share outcome bars and inflate n with correlated copies.
// 3. NO WINDOW LEAK. Bars outside the requested time window are removed
//    BEFORE segmentation, so a train run cannot see a holdout bar even as
//    warmup or as a settlement bar.
import { liveSegments, settle, resultFor } from "./bars.js";
import { wilson, breakEven, evPerTrade, binomUpperTail } from "./stats.js";

export class LookaheadError extends Error {}

export class BarView {
  #seg; #i;
  constructor(seg, i) { this.#seg = seg; this.#i = i; }
  get length() { return this.#i + 1; }
  // at(k): absolute index 0..length-1, or negative from the end (-1 = decision bar)
  at(k) {
    const idx = k < 0 ? this.#i + 1 + k : k;
    if (idx > this.#i) throw new LookaheadError(`bar ${idx} requested at decision bar ${this.#i}`);
    if (idx < 0) return undefined;
    return this.#seg[idx];
  }
  // last(n): the most recent n bars, oldest first, ending at the decision bar
  last(n) {
    const start = Math.max(0, this.#i + 1 - n);
    return this.#seg.slice(start, this.#i + 1);
  }
}

function inWindow(candles, window) {
  if (!window) return candles;
  const from = window.from ?? -Infinity, to = window.to ?? Infinity;
  return candles.filter(c => c.time >= from && c.time < to);
}

export function marketAllows(market, otc) {
  if (market === "both") return true;
  return market === "otc" ? otc : !otc;
}

export function prepareSegments(series, window, segOpts) {
  return liveSegments(inWindow(series.candles, window), segOpts);
}

export function runHypothesis(hyp, ds, { expiry, window = null, include = null, segOpts } = {}) {
  if (!Number.isInteger(expiry) || expiry < 1) throw new Error(`expiry must be a positive integer (minutes), got ${expiry}`);
  const warmup = Math.max(1, hyp.meta.warmup || 1);
  const trades = [];
  const perSeries = [];

  for (const s of ds.series) {
    if (include && !include.has(s.key)) continue;
    if (!marketAllows(hyp.meta.market, s.otc)) continue;
    const { segments, droppedBars } = prepareSegments(s, window, segOpts);
    const ctx = Object.freeze({ symbol: s.symbol, key: s.key, otc: s.otc, expiry });
    let evaluated = 0, fired = 0, bars = 0;

    for (const seg of segments) {
      bars += seg.length;
      let i = warmup - 1;
      while (i + expiry < seg.length) {
        evaluated++;
        const dir = hyp.decide(new BarView(seg, i), ctx);
        if (dir === "CALL" || dir === "PUT") {
          const o = settle(seg, i, expiry);
          fired++;
          trades.push({
            key: s.key, symbol: s.symbol, otc: s.otc, expiry,
            time: seg[i].time, dir, entry: o.entry, exit: o.exit, move: o.move,
            result: resultFor(dir, o.move)
          });
          i += expiry;
        } else if (dir === null || dir === undefined) {
          i++;
        } else {
          throw new Error(`${hyp.meta.id}.decide returned ${JSON.stringify(dir)}; expected "CALL", "PUT" or null`);
        }
      }
    }
    perSeries.push({ key: s.key, otc: s.otc, bars, segments: segments.length, droppedBars, evaluated, fired });
  }
  return { trades, perSeries };
}

// 52 weeks: keeps weekday and UTC hour, so a time-of-day rule decides the
// same way, while any lookup keyed on real timestamps stops matching.
const PROBE_SHIFT = 364 * 24 * 3600 * 1000;

/**
 * Re-decide at sampled bars on a copy truncated right after the decision
 * bar and shifted forward 52 weeks, and a second time on the full series.
 * Any difference means the hypothesis is reading something other than the
 * bars it was shown, or is not deterministic — either makes its backtest
 * meaningless.
 *
 * Truncation alone is blind to a hypothesis that captured the series in a
 * closure and looks the future up by timestamp (the selftest proved it:
 * 0/200 caught, backtest 100%). The time shift is what breaks that lookup.
 * No in-process check can stop code that reads the dataset file itself;
 * loadHypothesis rejects sources that reach for the filesystem or network.
 */
export function checkNoLookahead(hyp, ds, { expiry = 1, samples = 200, window = null, segOpts } = {}) {
  const warmup = Math.max(1, hyp.meta.warmup || 1);
  const points = [];
  for (const s of ds.series) {
    if (!marketAllows(hyp.meta.market, s.otc)) continue;
    const { segments } = prepareSegments(s, window, segOpts);
    for (const seg of segments) {
      for (let i = warmup - 1; i < seg.length - 1; i++) points.push([s, seg, i]);
    }
  }
  if (!points.length) return { checked: 0, mismatches: [] };

  // deterministic spread across the whole population
  const step = Math.max(1, Math.floor(points.length / samples));
  const mismatches = [];
  let checked = 0;
  for (let p = 0; p < points.length && checked < samples; p += step) {
    const [s, seg, i] = points[p];
    const ctx = Object.freeze({ symbol: s.symbol, key: s.key, otc: s.otc, expiry });
    let full, truncated, again, error = null;
    try {
      full = hyp.decide(new BarView(seg, i), ctx) ?? null;
      const probe = seg.slice(0, i + 1).map(c => Object.freeze({ ...c, time: c.time + PROBE_SHIFT }));
      truncated = hyp.decide(new BarView(probe, i), ctx) ?? null;
      again = hyp.decide(new BarView(seg, i), ctx) ?? null;
    } catch (e) {
      error = e;
    }
    checked++;
    if (error) mismatches.push({ key: s.key, time: seg[i].time, error: String(error.message || error) });
    else if (full !== truncated || full !== again) mismatches.push({ key: s.key, time: seg[i].time, full, truncated, again });
  }
  return { checked, mismatches };
}

/**
 * Score a set of trades. Never pools OTC with real pairs.
 *
 * The hurdle is the HIGHER of break-even and the matched null. The matched
 * null is what a hypothesis would score by picking directions at random
 * with its own CALL/PUT mix, on its own bars. That is the number that
 * exposed 60.9% as a mirage when always-CALL scored 56.5% on the same bars.
 */
export function summarize(trades, { payout }) {
  const groups = {};
  for (const t of trades) (groups[t.otc ? "OTC" : "REAL"] ||= []).push(t);
  const out = {};
  for (const [g, ts] of Object.entries(groups)) out[g] = summarizeGroup(ts, payout);
  return out;
}

export function summarizeGroup(ts, payout) {
  let wins = 0, losses = 0, ties = 0, callsDecided = 0, upDecided = 0;
  const minutes = new Set();
  for (const t of ts) {
    minutes.add(t.time);
    if (t.result === "T") { ties++; continue; }
    if (t.result === "W") wins++; else losses++;
    if (t.dir === "CALL") callsDecided++;
    if (t.move === 1) upDecided++;
  }
  const decided = wins + losses;
  const ci = wilson(wins, decided);
  const be = breakEven(payout);
  const callShare = decided ? callsDecided / decided : null;
  const upRate = decided ? upDecided / decided : null;
  const matchedNull = decided ? callShare * upRate + (1 - callShare) * (1 - upRate) : null;
  const hurdle = decided ? Math.max(be, matchedNull) : be;
  return {
    trades: ts.length, decided, wins, losses, ties,
    distinctMinutes: minutes.size,
    rate: ci ? ci.p : null, ciLow: ci ? ci.low : null, ciHigh: ci ? ci.high : null,
    callShare, upRate, matchedNull, breakEven: be, hurdle,
    evPerTrade: ci ? evPerTrade(ci.p, payout) : null,
    pValue: decided ? binomUpperTail(wins, decided, hurdle) : 1,
    clearsHurdle: ci ? ci.low > hurdle : false
  };
}
