// Loading a capture export into the harness's in-memory form.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

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
  for (const [key, s] of Object.entries(raw.series || {})) {
    const candles = (s.candles || []).map(([time, open, high, low, close]) => Object.freeze({ time, open, high, low, close }));
    series.push({ key, symbol: s.symbol, otc: !!s.otc, matchMode: s.matchMode || null, candles });
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
