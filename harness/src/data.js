// Loading a capture export into the harness's in-memory form.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

// Naming comes from the capture core so browser and harness can never disagree.
const core = createRequire(import.meta.url)("../../extension/core.js");

export const MINUTE = 60000;

/**
 * Dataset shape used everywhere downstream:
 * { hash, source, series: [{ key, symbol, otc, matchMode, candles: [{time,open,high,low,close}] }] }
 * Candles are frozen so no hypothesis can edit the data it is judged on.
 */
export function loadDataset(path) {
  const text = readFileSync(path, "utf8");
  const raw = JSON.parse(text);
  const ds = fromCapture(raw);
  ds.hash = createHash("sha256").update(text).digest("hex");
  ds.source = path;
  return ds;
}

export function fromCapture(raw) {
  if (!raw || raw.format !== "qx-capture") throw new Error("Not a qx-capture dataset (missing format: \"qx-capture\").");
  if (raw.formatVersion !== 1) throw new Error(`Unsupported formatVersion ${raw.formatVersion}; this harness reads 1.`);
  const series = [];
  const seen = new Map();
  for (const [storedKey, s] of Object.entries(raw.series || {})) {
    // Exports from before v0.1.2 keyed pairs alphabetically (BRLUSD_otc);
    // re-key by convention (USDBRL_otc) so every file reads the same way.
    const key = core.canonicalKey(storedKey);
    if (seen.has(key)) throw new Error(`Series ${storedKey} and ${seen.get(key)} are the same instrument (${key}); the export is inconsistent.`);
    seen.set(key, storedKey);
    const candles = (s.candles || []).map(([time, open, high, low, close]) => Object.freeze({ time, open, high, low, close }));
    series.push({ key, name: core.displayName(key), symbol: s.symbol, otc: !!s.otc, matchMode: s.matchMode || null, candles });
  }
  series.sort((a, b) => a.key.localeCompare(b.key));
  return { format: raw.format, exportedAt: raw.exportedAt || null, captureStats: raw.captureStats || null, series };
}

// Build a dataset directly from candle arrays — used by synthetic data
// and tests. Same freezing, same shape.
export function makeDataset(entries) {
  return {
    format: "qx-capture",
    hash: "synthetic",
    series: entries.map(e => ({
      key: e.key || e.symbol,
      symbol: e.symbol,
      otc: e.otc !== undefined ? !!e.otc : /_otc$/i.test(e.symbol),
      matchMode: e.matchMode || "symbol",
      candles: e.candles.map(c => Object.freeze({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }))
    }))
  };
}
