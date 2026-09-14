// Segmenting series into tradeable stretches and settling outcomes.
import { MINUTE } from "./data.js";

/**
 * Split a 1m series into contiguous "live" segments.
 *
 * - A seam break larger than `seamLimit` ends a segment (see integrity.js).
 * - Any missing minute ends a segment. An expiry must settle against the
 *   genuinely next minutes, never across a gap.
 * - A run of `maxDeadRun` or more frozen bars (high == low) ends a segment
 *   and is dropped. Quotex keeps serving frozen candles for real pairs
 *   while FX is shut; a weekend harvest is ~100% of them and they drag
 *   every result toward the null.
 * - Segments shorter than `minLen` are dropped.
 */
export function liveSegments(candles, { maxDeadRun = 10, minLen = 50, seamLimit = Infinity } = {}) {
  const segs = [];
  let cur = [];
  let deadRun = 0;
  let dropped = 0;
  const close = () => {
    if (cur.length >= minLen) segs.push(cur); else dropped += cur.length;
    cur = [];
  };
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (cur.length && c.time - cur[cur.length - 1].time !== MINUTE) { close(); deadRun = 0; }
    // A seam break (bar opens away from the previous close) also ends a
    // segment: a trade must never settle across a price discontinuity.
    else if (cur.length && Math.abs(Math.log(c.open / cur[cur.length - 1].close)) > seamLimit) { close(); deadRun = 0; }
    const dead = c.high === c.low;
    deadRun = dead ? deadRun + 1 : 0;
    cur.push(c);
    if (deadRun === maxDeadRun) {
      // remove the frozen run from the segment it was part of
      const run = cur.splice(cur.length - maxDeadRun, maxDeadRun);
      dropped += run.length;
      close();
    } else if (deadRun > maxDeadRun) {
      cur.pop();
      dropped++;
    }
  }
  close();
  return { segments: segs, droppedBars: dropped };
}

/**
 * Outcome of a trade decided at the CLOSE of bar i with an `expiry` of
 * that many 1m bars: entry at bar i+1's open, exit at bar i+expiry's close.
 * Returns +1 (up), -1 (down), 0 (flat), or null if the segment ends first.
 */
export function settle(seg, i, expiry) {
  const exitIdx = i + expiry;
  if (exitIdx >= seg.length) return null;
  const entry = seg[i + 1].open;
  const exit = seg[exitIdx].close;
  return { entry, exit, move: exit > entry ? 1 : (exit < entry ? -1 : 0), exitTime: seg[exitIdx].time };
}

export function resultFor(dir, move) {
  if (move === 0) return "T";
  return (dir === "CALL") === (move === 1) ? "W" : "L";
}
