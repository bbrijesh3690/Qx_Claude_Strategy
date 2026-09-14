// The fixed interface every hypothesis sits behind.
//
//   export const meta = {
//     id: "h001-example",            // stable; a changed rule is a new id
//     title: "One line",
//     statement: "The claim, written BEFORE any result was seen.",
//     market: "otc" | "real" | "both",
//     expiries: [1, 5, 15],          // minutes; which ones it claims to work at
//     warmup: 20,                    // bars the view must hold before deciding
//     predictedRate: 0.62,           // what you expect — sizes the screen
//     registeredAt: "2026-09-14"
//   };
//   export function decide(view, ctx) { return "CALL" | "PUT" | null; }
//
// `view` is a BarView: view.at(-1) is the decision bar (fully closed),
// view.last(n) the most recent n bars. `ctx` = { symbol, key, otc, expiry }.
// decide must be a pure function of (view, ctx).
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MARKETS = new Set(["otc", "real", "both"]);

export function validateHypothesis(h) {
  const errs = [];
  const m = h && h.meta;
  if (!m) errs.push("missing `meta`");
  else {
    if (typeof m.id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/i.test(m.id)) errs.push("meta.id must be a simple identifier");
    if (typeof m.statement !== "string" || m.statement.length < 20) errs.push("meta.statement must state the claim (pre-registration)");
    if (!MARKETS.has(m.market)) errs.push(`meta.market must be one of ${[...MARKETS].join(", ")}`);
    if (!Array.isArray(m.expiries) || !m.expiries.length || !m.expiries.every(e => Number.isInteger(e) && e > 0)) errs.push("meta.expiries must be a non-empty list of whole minutes");
    if (!Number.isInteger(m.warmup) || m.warmup < 1) errs.push("meta.warmup must be an integer >= 1");
    if (!(m.predictedRate > 0 && m.predictedRate < 1)) errs.push("meta.predictedRate must be in (0,1)");
    if (typeof m.registeredAt !== "string") errs.push("meta.registeredAt is required");
  }
  if (!h || typeof h.decide !== "function") errs.push("missing `decide(view, ctx)`");
  if (errs.length) throw new Error(`Invalid hypothesis: ${errs.join("; ")}`);
  return h;
}

// A lint, not a sandbox: it stops the accidental leak (a hypothesis that
// loads the dataset to "precompute" something), not a determined one.
const FORBIDDEN = [
  [/\bfrom\s+["'](node:)?(fs|fs\/promises|path|http|https|net|child_process|worker_threads)["']/, "imports a filesystem/network module"],
  [/\bimport\s*\(/, "uses dynamic import()"],
  [/\brequire\s*\(/, "uses require()"],
  [/\bprocess\./, "touches process"],
  [/\b(fetch|XMLHttpRequest|WebSocket)\b/, "reaches for the network"],
  [/\bglobalThis\b/, "reaches into globalThis"],
  [/\.json["']/, "references a JSON file"]
];

export function lintSource(src) {
  return FORBIDDEN.filter(([re]) => re.test(src)).map(([, why]) => why);
}

export async function loadHypothesis(path) {
  const abs = resolve(path);
  const problems = lintSource(readFileSync(abs, "utf8"));
  if (problems.length) throw new Error(`Hypothesis ${path} rejected: ${problems.join("; ")}. decide(view, ctx) must use only the bars it is shown.`);
  const mod = await import(pathToFileURL(abs).href);
  const h = validateHypothesis({ meta: mod.meta, decide: mod.decide });
  h.sourceHash = createHash("sha256").update(readFileSync(abs)).digest("hex");
  h.path = abs;
  return h;
}
