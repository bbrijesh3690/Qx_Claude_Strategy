// What "nothing" scores on this data. Every hypothesis is read against
// these, never against 50%.
import { prepareSegments, runHypothesis, summarizeGroup } from "./engine.js";

function null_(id, title, decide) {
  return {
    meta: { id, title, statement: `Null baseline: ${title}.`, market: "both", expiries: [1, 5, 15], warmup: 1, predictedRate: 0.5, registeredAt: "baseline" },
    decide
  };
}

export const alwaysCall = null_("null-always-call", "always CALL", () => "CALL");
export const alwaysPut = null_("null-always-put", "always PUT", () => "PUT");

// Deterministic "coin flip": a hash of (symbol, bar time, seed), so the
// same bar always gets the same call and the look-ahead check still holds.
export function randomDirection(seed = 1) {
  return null_(`null-random-${seed}`, `random direction (seed ${seed})`, (view, ctx) => {
    const t = view.at(-1).time;
    let h = (seed * 2654435761) ^ t ^ (t / 4294967296);
    for (let i = 0; i < ctx.key.length; i++) h = Math.imul(h ^ ctx.key.charCodeAt(i), 16777619);
    h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
    return (h >>> 0) % 2 === 0 ? "CALL" : "PUT";
  });
}

export const NULLS = [alwaysCall, alwaysPut, randomDirection(1)];

/**
 * Base rate of an up move over every (overlapping) expiry window, per series.
 * Descriptive only — overlapping windows are not independent, so no interval.
 */
export function upBaseRates(ds, { expiry, window = null, include = null, segOpts } = {}) {
  const rows = [];
  for (const s of ds.series) {
    if (include && !include.has(s.key)) continue;
    const { segments } = prepareSegments(s, window, segOpts);
    let up = 0, down = 0, flat = 0;
    for (const seg of segments) {
      for (let i = 0; i + expiry < seg.length; i++) {
        const entry = seg[i + 1].open, exit = seg[i + expiry].close;
        if (exit > entry) up++; else if (exit < entry) down++; else flat++;
      }
    }
    const decided = up + down;
    rows.push({ key: s.key, otc: s.otc, up, down, flat, windows: decided + flat, flatShare: decided + flat ? flat / (decided + flat) : null, upRate: decided ? up / decided : null });
  }
  return rows;
}

export function runNulls(ds, { expiry, payout, window, include, segOpts }) {
  return NULLS.map(h => {
    const { trades } = runHypothesis(h, ds, { expiry, window, include, segOpts });
    const groups = {};
    for (const g of ["OTC", "REAL"]) {
      const ts = trades.filter(t => (g === "OTC") === t.otc);
      if (ts.length) groups[g] = summarizeGroup(ts, payout);
    }
    return { id: h.meta.id, title: h.meta.title, groups };
  });
}
