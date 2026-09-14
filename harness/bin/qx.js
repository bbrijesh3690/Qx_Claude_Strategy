#!/usr/bin/env node
// QX research harness CLI.
//
//   node harness/bin/qx.js selftest
//   node harness/bin/qx.js power     [--rate 0.75] [--payout 0.90] [--tests 20]
//   node harness/bin/qx.js integrity <dataset.json>
//   node harness/bin/qx.js nulls     <dataset.json> [--expiry 1,5,15] [--payout 0.90]
//   node harness/bin/qx.js run       <hypothesis.js> <dataset.json> [--expiry 5] [--payout 0.90] [--holdout]
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { loadDataset } from "../src/data.js";
import { checkDataset } from "../src/integrity.js";
import { runHypothesis, summarizeGroup, checkNoLookahead } from "../src/engine.js";
import { computeCutoff, trainWindow, holdoutWindow, claimHoldoutLook } from "../src/split.js";
import { loadHypothesis } from "../src/hypothesis.js";
import { runNulls, upBaseRates } from "../src/nulls.js";
import { runSelftest } from "../src/selftest.js";
import { recordRun, assertNotModified } from "../src/registry.js";
import { breakEven, evPerTrade, requiredN, nToProve, holm, ALPHA } from "../src/stats.js";
import { table, pct, signedPct, resultColumns } from "../src/report.js";

// The owner does not trade below a 90% payout (2026-09-15), so every result
// is judged against the break-even at 90% unless --payout says otherwise.
const PAYOUT = 0.90;
// Screen size is fixed for every hypothesis (owner's decision, 2026-09-15):
// enough trades to detect a true 70% edge. Sizing from each hypothesis's own
// prediction let an honest 53% claim demand 144,000 trades and never be killed.
const SCREEN_EDGE = 0.70;
const REGISTRY = fileURLToPath(new URL("../../research/registry.jsonl", import.meta.url));
const LEDGER = fileURLToPath(new URL("../../research/holdout-ledger.jsonl", import.meta.url));
const GAPS_FILE = fileURLToPath(new URL("../../research/verified-gaps.json", import.meta.url));
// Seam breaks the owner has checked on the platform chart. See research/verified-gaps.json.
const VERIFIED_GAPS = existsSync(GAPS_FILE) ? JSON.parse(readFileSync(GAPS_FILE, "utf8")) : [];

function parseArgs(argv) {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[k] = true;
      else { flags[k] = next; i++; }
    } else pos.push(a);
  }
  return { pos, flags };
}

const num = (v, d) => (v === undefined || v === true) ? d : Number(v);
const list = (v, d) => (v === undefined || v === true) ? d : String(v).split(",").map(Number);

function die(msg) {
  console.error(msg);
  process.exit(2);
}

function screenData(ds, flags) {
  const rep = checkDataset(ds, { verifiedGaps: VERIFIED_GAPS });
  const include = new Set(flags["include-failing"] ? ds.series.map(s => s.key) : rep.passing);
  if (rep.failing.length) {
    console.log(`Integrity: ${rep.failing.length} series FAILED and are excluded${flags["include-failing"] ? " — OVERRIDDEN by --include-failing" : ""}: ${rep.failing.join(", ")}`);
  }
  if (!include.size) die("No series passed integrity. Run `integrity` for details.");
  return { rep, include };
}

// ------------------------------------------------------------------
const commands = {
  selftest() {
    const { pass, checks } = runSelftest();
    for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}\n      ${c.detail}`);
    console.log(`\n${pass ? "SELFTEST PASSED" : "SELFTEST FAILED"} — ${checks.filter(c => c.pass).length}/${checks.length} checks`);
    process.exit(pass ? 0 : 1);
  },

  power({ flags }) {
    const payout = num(flags.payout, PAYOUT);
    const tests = num(flags.tests, 20);
    const rates = flags.rate ? list(flags.rate) : [0.75, 0.70, 0.65, 0.60, 0.56];
    const be = breakEven(payout);
    console.log(`Payout ${pct(payout, 0)} → break-even ${pct(be)}. One-sided alpha ${ALPHA}, power 80%.\n`);
    console.log(table(rates.map(r => ({ r })), [
      { label: "True rate", get: x => pct(x.r, 0), align: "right" },
      { label: "EV/trade", get: x => signedPct(evPerTrade(x.r, payout)), align: "right" },
      { label: "Observed-rate proof", get: x => nToProve(x.r, be), align: "right" },
      { label: "Detect (1 test)", get: x => requiredN({ p1: x.r, p0: be }), align: "right" },
      { label: `Detect (${tests} tests)`, get: x => requiredN({ p1: x.r, p0: be, tests }), align: "right" }
    ]));
    console.log(`\n"Observed-rate proof" assumes the sample lands exactly on the true rate — use the Detect columns to plan.`);
  },

  integrity({ pos }) {
    if (!pos[0]) die("usage: integrity <dataset.json>");
    const ds = loadDataset(pos[0]);
    if (!ds.series.length) {
      const s = ds.captureStats || {};
      console.log(`EMPTY: ${pos[0]} contains no series (frames seen: ${s.framesSeen ?? "?"}, capturing tabs: ${s.tabs ?? "?"}).`);
      console.log("Nothing was captured. Open the extension popup on the Quotex tab — its status line names the stage that is empty.");
      process.exit(1);
    }
    const rep = checkDataset(ds, { verifiedGaps: VERIFIED_GAPS });
    console.log(`Dataset ${pos[0]}  sha256 ${ds.hash.slice(0, 16)}  exported ${ds.exportedAt || "?"}\n`);
    console.log(table(rep.perSeries, [
      { label: "Series", key: "key" },
      { label: "Bars", key: "bars", align: "right" },
      { label: "Span h", key: "spanHours", align: "right" },
      { label: "Frozen", get: r => pct(r.frozenShare), align: "right" },
      { label: "Gaps", key: "gapEvents", align: "right" },
      { label: "Status", get: r => r.status.toUpperCase() },
      { label: "Issues", get: r => r.issues.map(i => `${i.code}: ${i.detail}`).join("; ") }
    ]));
    if (ds.captureStats) {
      const s = ds.captureStats;
      console.log(`\nCapture: ${s.framesAccepted}/${s.framesSeen} frames kept; dropped ${JSON.stringify(s.dropped)}`);
      const unknown = Object.keys(s.unknownSymbols || {});
      if (unknown.length) console.log(`Unrecognised six-letter tokens (extend CODES in extension/core.js if any is a real pair): ${unknown.join(", ")}`);
    }
    console.log(`\n${rep.passing.length} passing, ${rep.failing.length} failing.`);
    process.exit(rep.failing.length ? 1 : 0);
  },

  nulls({ pos, flags }) {
    if (!pos[0]) die("usage: nulls <dataset.json> [--expiry 1,5,15] [--payout 0.90]");
    const ds = loadDataset(pos[0]);
    const payout = num(flags.payout, PAYOUT);
    const { include } = screenData(ds, flags);
    const cutoff = computeCutoff(ds, { include });
    const window = trainWindow(cutoff);
    console.log(`TRAIN window only: bars before ${new Date(cutoff).toISOString()}. Payout ${pct(payout, 0)}.\n`);

    for (const expiry of list(flags.expiry, [1, 5, 15])) {
      console.log(`=== Expiry ${expiry}m ===`);
      const base = upBaseRates(ds, { expiry, window, include });
      for (const g of ["OTC", "REAL"]) {
        const rows = base.filter(b => (g === "OTC") === b.otc);
        if (!rows.length) continue;
        const up = rows.reduce((a, b) => a + b.up, 0), down = rows.reduce((a, b) => a + b.down, 0);
        const flat = rows.reduce((a, b) => a + b.flat, 0);
        console.log(`${g}: up-move base rate ${pct(up / (up + down))} over ${up + down} windows (overlapping); flat ${pct(flat / (up + down + flat))}`);
      }
      const res = runNulls(ds, { expiry, payout, window, include });
      const rows = [];
      for (const n of res) for (const [g, r] of Object.entries(n.groups)) rows.push({ name: `${n.title} · ${g}`, ...r });
      console.log(table(rows, [{ label: "Null", key: "name" }, ...resultColumns]) + "\n");
    }
  },

  async run({ pos, flags }) {
    if (!pos[0] || !pos[1]) die("usage: run <hypothesis.js> <dataset.json> [--expiry 5] [--payout 0.90] [--holdout]");
    const hyp = await loadHypothesis(pos[0]);
    const ds = loadDataset(pos[1]);
    const payout = num(flags.payout, PAYOUT);
    const expiries = list(flags.expiry, hyp.meta.expiries);
    const { include } = screenData(ds, flags);
    const cutoff = computeCutoff(ds, { include });
    const holdout = !!flags.holdout;
    const window = holdout ? holdoutWindow(cutoff) : trainWindow(cutoff);

    if (holdout) {
      claimHoldoutLook(LEDGER, { hypothesisId: hyp.meta.id, sourceHash: hyp.sourceHash, datasetHash: ds.hash, cutoff, expiries, payout });
      console.log(`HOLDOUT look recorded for ${hyp.meta.id}. This is the only one.`);
    }
    console.log(`${hyp.meta.id} — ${hyp.meta.title || ""}\n${hyp.meta.statement}\n`);
    console.log(`${holdout ? "HOLDOUT" : "TRAIN"} window: ${holdout ? "from" : "before"} ${new Date(cutoff).toISOString()}. Payout ${pct(payout, 0)} → break-even ${pct(breakEven(payout))}.`);

    // A run counts as a screen only on its own terms: the protocol payout, its
    // declared expiries, clean data, the train window. Anything else is a
    // what-if: shown, but not registered and given no verdict.
    const whatIf = !holdout && (flags.payout !== undefined || flags.expiry !== undefined || !!flags["include-failing"]);
    if (!holdout && !whatIf) assertNotModified(REGISTRY, hyp.meta.id, hyp.sourceHash);

    const lk = checkNoLookahead(hyp, ds, { expiry: expiries[0], window, samples: 300 });
    if (lk.mismatches.length) {
      console.log(`\nLOOK-AHEAD CHECK FAILED: ${lk.mismatches.length}/${lk.checked} sampled decisions changed when future bars were removed or were not repeatable.`);
      console.log(JSON.stringify(lk.mismatches.slice(0, 5), null, 2));
      process.exit(1);
    }
    console.log(`Look-ahead check: ${lk.checked} sampled decisions, all stable.\n`);

    const rows = [];
    for (const expiry of expiries) {
      const { trades, perSeries } = runHypothesis(hyp, ds, { expiry, window, include });
      for (const g of ["OTC", "REAL"]) {
        const ts = trades.filter(t => (g === "OTC") === t.otc);
        if (!ts.length) continue;
        const evaluated = perSeries.filter(s => (g === "OTC") === s.otc).reduce((a, s) => a + s.evaluated, 0);
        const r = summarizeGroup(ts, payout);
        rows.push({ name: `${expiry}m · ${g}`, fireRate: evaluated ? ts.length / evaluated : 0, ...r });
      }
    }
    if (!rows.length) { console.log("The hypothesis took no trades."); return; }

    const fmtP = p => p < 1e-4 ? p.toExponential(1) : p.toFixed(4);
    const cols = extra => [{ label: "Cell", key: "name" }, { label: "Fires", get: r => pct(r.fireRate), align: "right" }, ...resultColumns, ...extra];

    if (holdout) {
      // One pre-declared confirmation, not a screen: no family to correct over.
      rows.forEach(r => { r.verdict = r.pValue < ALPHA ? "CONFIRMED" : "NOT CONFIRMED"; });
      console.log(table(rows, cols([{ label: "p", get: r => fmtP(r.pValue), align: "right" }, { label: "Verdict", key: "verdict" }])));
      return;
    }
    if (whatIf) {
      console.log(table(rows, cols([{ label: "p (uncorrected)", get: r => fmtP(r.pValue), align: "right" }])));
      console.log("\nWHAT-IF run (--payout, --expiry or --include-failing given): not registered, no verdict.");
      return;
    }

    const cells = rows.map(r => ({ cell: r.name, decided: r.decided, wins: r.wins, pValue: r.pValue, datasetHash: ds.hash }));
    const family = recordRun(REGISTRY, { hypothesisId: hyp.meta.id, sourceHash: hyp.sourceHash, datasetHash: ds.hash, payout, cutoff, cells });
    const adj = holm(family.map(c => c.pValue));
    const need = requiredN({ p1: SCREEN_EDGE, p0: breakEven(payout), tests: family.length });
    rows.forEach(r => {
      r.holmP = adj[family.findIndex(c => c.hypothesisId === hyp.meta.id && c.cell === r.name)];
      r.verdict = r.holmP < ALPHA ? "SURVIVES"
        : r.decided >= need ? "KILL"
        : `needs ${need - r.decided} more`;
    });
    console.log(table(rows, cols([{ label: "Holm p", get: r => fmtP(r.holmP), align: "right" }, { label: "Verdict", key: "verdict" }])));
    const ids = new Set(family.map(c => c.hypothesisId));
    console.log(`\nRegistered. Holm family: ${family.length} cell(s) across ${ids.size} hypothesis(es).`);
    console.log(`Screen size: ${need} decided trades per cell — enough to detect a true ${pct(SCREEN_EDGE, 0)} edge with 80% power in this family. (Predicted ${pct(hyp.meta.predictedRate, 0)} is recorded, not used.)`);
    console.log(`Hurdle per cell = max(break-even, matched null). SURVIVES only if Holm-adjusted p < ${ALPHA}. Log the result in research/SCREEN_LOG.md.`);
  }
};

const { pos, flags } = parseArgs(process.argv.slice(2));
const cmd = pos.shift();
if (!commands[cmd]) {
  console.log("commands: selftest | power | integrity <dataset> | nulls <dataset> | run <hypothesis> <dataset> [--holdout]");
  process.exit(cmd ? 2 : 0);
}
Promise.resolve(commands[cmd]({ pos, flags })).catch(e => die(flags.debug ? (e.stack || String(e)) : `Error: ${e.message || e}`));
