// Synthetic series with KNOWN properties. The harness must recover an
// edge that was planted and must find nothing in data that has none,
// before a single real number is trusted.
import { MINUTE } from "./data.js";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const T0 = Date.UTC(2026, 0, 5, 0, 0, 0);

function bar(rand, time, open, ret, vol) {
  const close = open * Math.exp(ret);
  const high = Math.max(open, close) * Math.exp(Math.abs(gaussian(rand)) * vol * 0.5 + 1e-9);
  const low = Math.min(open, close) * Math.exp(-(Math.abs(gaussian(rand)) * vol * 0.5 + 1e-9));
  return { time, open, high, low, close };
}

// Pure geometric random walk: no edge of any kind, by construction.
export function randomWalk({ bars = 5000, start = 1.1, vol = 0.0003, seed = 1, startTime = T0 } = {}) {
  const rand = mulberry32(seed);
  const out = [];
  let price = start;
  for (let i = 0; i < bars; i++) {
    const b = bar(rand, startTime + i * MINUTE, price, gaussian(rand) * vol, vol);
    out.push(b);
    price = b.close;
  }
  return out;
}

/**
 * Planted momentum edge of exactly `q` at a given expiry.
 *
 * Bar 0 stands alone; after it, bars come in blocks of `expiry`. Each
 * block's total move (first bar's open to last bar's close) has the same
 * sign as the direction of the bar immediately before the block with
 * probability `q`. A "follow the last bar" hypothesis run with that
 * expiry and no overlap decides at exactly those bars, so its true hit
 * rate is q — the harness should report q, not merely "something above 50".
 *
 * q = 0.35 plants an edge in the other direction, which must show up
 * as a rate BELOW 50%, not be silently reported as noise.
 */
export function plantedMomentum({ q, expiry = 1, blocks = 4000, start = 1.1, vol = 0.0003, seed = 7, startTime = T0 } = {}) {
  const rand = mulberry32(seed);
  const out = [];
  let price = start;
  let t = startTime;
  const first = bar(rand, t, price, gaussian(rand) * vol, vol);
  out.push(first);
  price = first.close;
  t += MINUTE;

  for (let k = 0; k < blocks; k++) {
    const prev = out[out.length - 1];
    const prevDir = prev.close > prev.open ? 1 : -1;
    const want = rand() < q ? prevDir : -prevDir;
    const rets = Array.from({ length: expiry }, () => gaussian(rand) * vol);
    const total = rets.reduce((a, b) => a + b, 0);
    const flip = Math.sign(total) === want ? 1 : -1;
    for (const r of rets) {
      const b = bar(rand, t, price, r * flip, vol);
      out.push(b);
      price = b.close;
      t += MINUTE;
    }
  }
  return out;
}

// Two instruments stitched end to end at a relative level offset — the
// failure that invalidated the old project's first verdict.
export function splice(a, b, levelRatio) {
  const tail = b.map((c, i) => ({
    time: a[a.length - 1].time + (i + 1) * MINUTE,
    open: c.open * levelRatio, high: c.high * levelRatio, low: c.low * levelRatio, close: c.close * levelRatio
  }));
  return a.concat(tail);
}

export const followLastBar = {
  meta: {
    id: "selftest-follow-last-bar", title: "follow the last bar",
    statement: "Self-test probe: trade in the direction of the decision bar.",
    market: "both", expiries: [1, 5, 15], warmup: 1, predictedRate: 0.65, registeredAt: "selftest"
  },
  decide(view) {
    const b = view.at(-1);
    return b.close > b.open ? "CALL" : (b.close < b.open ? "PUT" : null);
  }
};
