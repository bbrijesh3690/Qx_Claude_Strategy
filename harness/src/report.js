// Plain-text tables. Every rate is printed with its interval; a bare
// percentage is never shown on its own.

export const pct = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x)) ? "—" : (x * 100).toFixed(d) + "%";
export const signedPct = (x, d = 1) => (x === null || x === undefined) ? "—" : (x >= 0 ? "+" : "") + (x * 100).toFixed(d) + "%";

export function table(rows, columns) {
  const cells = rows.map(r => columns.map(c => String(typeof c.get === "function" ? c.get(r) : r[c.key] ?? "")));
  const widths = columns.map((c, i) => Math.max(c.label.length, ...cells.map(row => row[i].length)));
  const line = (vals) => vals.map((v, i) => columns[i].align === "right" ? v.padStart(widths[i]) : v.padEnd(widths[i])).join("  ");
  return [line(columns.map(c => c.label)), widths.map(w => "-".repeat(w)).join("  "), ...cells.map(line)].join("\n");
}

export const resultColumns = [
  { label: "Decided", get: r => r.decided, align: "right" },
  { label: "Rate", get: r => pct(r.rate), align: "right" },
  { label: "95% CI", get: r => r.decided ? `${pct(r.ciLow)}–${pct(r.ciHigh)}` : "—", align: "right" },
  { label: "CALL%", get: r => pct(r.callShare, 0), align: "right" },
  { label: "Matched null", get: r => pct(r.matchedNull), align: "right" },
  { label: "Break-even", get: r => pct(r.breakEven), align: "right" },
  { label: "EV/trade", get: r => signedPct(r.evPerTrade), align: "right" }
];
