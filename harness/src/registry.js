// The screening registry: every (hypothesis, expiry, market) cell ever run on
// the train window. It does two jobs:
//
// 1. Freezes hypotheses. Once an id has been run, its source is fixed. A
//    changed rule must take a new id, which makes it a new test.
// 2. Defines the multiple-comparison family. Holm is applied across ALL
//    registered cells, not only the ones in the current run. Otherwise
//    screening 10 ideas one at a time is 10 uncorrected looks.
//
// Re-running the same id with the same source (for example on a larger
// capture) replaces that hypothesis's cells. It is the same test with more
// data, not a new one.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function readRegistry(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
}

export function assertNotModified(path, hypothesisId, sourceHash) {
  const prior = readRegistry(path).find(e => e.hypothesisId === hypothesisId);
  if (prior && prior.sourceHash !== sourceHash) {
    throw new Error(
      `Hypothesis "${hypothesisId}" was screened on ${prior.at} with source ${prior.sourceHash.slice(0, 12)}; ` +
      `this file is ${sourceHash.slice(0, 12)}. A screened hypothesis is frozen. Give the changed rule a new id.`
    );
  }
}

/**
 * Record this run's cells, then return the Holm family: every registered cell,
 * with this hypothesis's entry replaced by the new one.
 */
export function recordRun(path, entry) {
  assertNotModified(path, entry.hypothesisId, entry.sourceHash);
  const others = readRegistry(path).filter(e => e.hypothesisId !== entry.hypothesisId);
  const record = Object.assign({ at: new Date().toISOString() }, entry);
  const all = others.concat([record]);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, all.map(e => JSON.stringify(e)).join("\n") + "\n");
  return all.flatMap(e => e.cells.map(c => ({ hypothesisId: e.hypothesisId, ...c })));
}
