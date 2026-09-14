#!/usr/bin/env node
// QX research harness CLI.
//
//   node harness/bin/qx.js selftest
//   node harness/bin/qx.js power     [--rate 0.75] [--payout 0.85] [--tests 20]
//   node harness/bin/qx.js integrity <dataset.json>
//   node harness/bin/qx.js nulls     <dataset.json> [--expiry 1,5,15] [--payout 0.85]
//   node harness/bin/qx.js run       <hypothesis.js> <dataset.json> [--expiry 5] [--payout 0.85] [--holdout]
import { fileURLToPath } from "node:url";
import { loadDataset } from "../src/data.js";
import { checkDataset } from "../src/integrity.js";
import { runHypothesis, summarizeGroup, checkNoLookahead } from "../src/engine.js";
import { computeCutoff, trainWindow, holdoutWindow, claimHoldoutLook } from "../src/split.js";
import { loadHypothesis } from "../src/hypothesis.js";
import { runNulls, upBaseRates } from "../src/nulls.js";
import { runSelftest } from "../src/selftest.js";
import { breakEven, evPerTrade, requiredN, nToProve, holm, ALPHA } from "../src/stats.js";
import { table, pct, signedPct, resultColumns } from "../src/report.js";

const LEDGER = fileURLToPath(new URL("../../research/holdout-ledger.jsonl", import.meta.url));

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
  const rep = checkDataset(ds);
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
    const payout = num(flags.payout, 0.85);
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
    const rep = checkDataset(ds);
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
    if (!pos[0]) die("usage: nulls <dataset.json> [--expiry 1,5,15] [--payout 0.85]");
    const ds = loadDataset(pos[0]);
    const payout = num(flags.payout, 0.85);
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
    if (!pos[0] || !pos[1]) die("usage: run <hypothesis.js> <dataset.json> [--expiry 5] [--payout 0.85] [--holdout]");
    const hyp = await loadHypothesis(pos[0]);
    const ds = loadDataset(pos[1]);
    const payout = num(flags.payout, 0.85);
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

    const adj = holm(rows.map(r => r.pValue));
    const need = requiredN({ p1: hyp.meta.predictedRate, p0: breakEven(payout), tests: rows.length });
    rows.forEach((r, i) => {
      r.holmP = adj[i];
      r.verdict = r.holmP < ALPHA ? "SURVIVES"
        : r.decided >= need ? "KILL"
        : `needs ${need - r.decided} more`;
    });
    console.log(table(rows, [
      { label: "Cell", key: "name" },
      { label: "Fires", get: r => pct(r.fireRate), align: "right" },
      ...resultColumns,
      { label: "Holm p", get: r => r.holmP < 1e-4 ? r.holmP.toExponential(1) : r.holmP.toFixed(4), align: "right" },
      { label: "Verdict", key: "verdict" }
    ]));
    console.log(`\nScreen size for predicted ${pct(hyp.meta.predictedRate, 0)} across ${rows.length} cell(s): ${need} decided trades (80% power, Holm family).`);
    console.log(`Hurdle per cell = max(break-even, matched null). A cell SURVIVES only if its Holm-adjusted p < ${ALPHA}.`);
  }
};

const { pos, flags } = parseArgs(process.argv.slice(2));
const cmd = pos.shift();
if (!commands[cmd]) {
  console.log("commands: selftest | power | integrity <dataset> | nulls <dataset> | run <hypothesis> <dataset> [--holdout]");
  process.exit(cmd ? 2 : 0);
}
Promise.resolve(commands[cmd]({ pos, flags })).catch(e => die(flags.debug ? (e.stack || String(e)) : `Error: ${e.message || e}`));
