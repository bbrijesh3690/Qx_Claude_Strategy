// Train / holdout split by time, and the one-look lock on the holdout.
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * A single global time cutoff: the oldest `trainFraction` of all included
 * bars train, the newest remainder is held out. Global rather than
 * per-asset, so no asset's holdout sits in a period another asset trained on.
 */
export function computeCutoff(ds, { include = null, trainFraction = 2 / 3 } = {}) {
  const times = [];
  for (const s of ds.series) {
    if (include && !include.has(s.key)) continue;
    for (const c of s.candles) times.push(c.time);
  }
  if (!times.length) throw new Error("computeCutoff: no bars to split");
  times.sort((a, b) => a - b);
  return times[Math.min(times.length - 1, Math.floor(times.length * trainFraction))];
}

export const trainWindow = cutoff => ({ from: -Infinity, to: cutoff });
export const holdoutWindow = cutoff => ({ from: cutoff, to: Infinity });

export function readLedger(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
}

/**
 * The holdout is looked at once per hypothesis id, ever. Re-testing after a
 * tweak turns the holdout into training data, so a changed hypothesis is a
 * NEW id and needs its own untouched data — which this dataset no longer has.
 *
 * The look is recorded BEFORE results are computed: a run that crashes or is
 * aborted halfway through has still been seen.
 */
export function claimHoldoutLook(path, entry) {
  const prior = readLedger(path).filter(e => e.hypothesisId === entry.hypothesisId);
  if (prior.length) {
    const p = prior[0];
    throw new Error(
      `Holdout already used by "${entry.hypothesisId}" on ${p.at} (source ${p.sourceHash.slice(0, 12)}, dataset ${String(p.datasetHash).slice(0, 12)}). ` +
      `One look per hypothesis. A modified hypothesis needs fresh data: forward validation.`
    );
  }
  mkdirSync(dirname(path), { recursive: true });
  const record = Object.assign({ at: new Date().toISOString() }, entry);
  appendFileSync(path, JSON.stringify(record) + "\n");
  return record;
}
