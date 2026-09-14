// The harness testing itself on data whose answer is known in advance.
// Phase 0 is not done — and no real result is trusted — until every
// check here passes.
import { makeDataset } from "./data.js";
import { runHypothesis, checkNoLookahead, summarizeGroup } from "./engine.js";
import { checkDataset } from "./integrity.js";
import { holm, wilson, binomUpperTail, ALPHA } from "./stats.js";
import { randomWalk, plantedMomentum, splice, followLastBar } from "./synthetic.js";
import { alwaysCall, randomDirection } from "./nulls.js";

const PAYOUT = 0.85;
const EXPIRIES = [1, 5, 15];

function score(h, ds, expiry) {
  const { trades } = runHypothesis(h, ds, { expiry });
  return summarizeGroup(trades, PAYOUT);
}

// z = 3 interval: the seeds are fixed so results are deterministic, but a
// check should not pass or fail on which seed happened to be chosen.
const wide = r => wilson(r.wins, r.decided, 3);
const pct = x => (x * 100).toFixed(1) + "%";

export function runSelftest() {
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });

  // --- 1. planted edges are recovered at their true rate, both directions
  for (const expiry of EXPIRIES) {
    const blocks = Math.round(24000 / expiry);
    for (const q of [0.65, 0.35]) {
      const ds = makeDataset([{ symbol: "EURUSD_otc", candles: plantedMomentum({ q, expiry, blocks, seed: 100 + expiry }) }]);
      const r = score(followLastBar, ds, expiry);
      const ci = wide(r);
      const recovered = ci.low <= q && q <= ci.high;
      const side = q > 0.5 ? ci.low > 0.5 : ci.high < 0.5;
      check(`planted ${pct(q)} edge @ ${expiry}m is recovered`, recovered && side,
        `${pct(r.rate)} on ${r.decided} trades, 99.7% CI ${pct(ci.low)}–${pct(ci.high)}`);
    }
  }

  // --- 2. pure noise produces nothing
  for (const expiry of EXPIRIES) {
    const ds = makeDataset([{ symbol: "GBPUSD_otc", candles: randomWalk({ bars: 24000, seed: 200 + expiry }) }]);
    for (const h of [followLastBar, alwaysCall]) {
      const r = score(h, ds, expiry);
      const ci = wide(r);
      check(`noise @ ${expiry}m: "${h.meta.title}" finds no edge`, ci.low <= 0.5 && 0.5 <= ci.high,
        `${pct(r.rate)} on ${r.decided} trades, 99.7% CI ${pct(ci.low)}–${pct(ci.high)}`);
    }
  }

  // --- 3. the input half: splices and shared series are caught
  {
    const clean = makeDataset([{ symbol: "AUDJPY_otc", candles: randomWalk({ bars: 3000, seed: 301 }) }]);
    const rep = checkDataset(clean);
    check("clean series passes integrity", rep.failing.length === 0, JSON.stringify(rep.perSeries[0].issues));

    const a = randomWalk({ bars: 1500, start: 110, vol: 0.0002, seed: 302 });
    const b = randomWalk({ bars: 1500, start: 110, vol: 0.0002, seed: 303 });
    for (const ratio of [1.30, 1.005]) {
      const spliced = splice(a, b, (a[a.length - 1].close / b[0].open) * ratio);
      const r = checkDataset(makeDataset([{ symbol: "AUDJPY_otc", candles: spliced }]));
      const codes = r.perSeries[0].issues.map(i => i.code);
      check(`splice at a ${((ratio - 1) * 100).toFixed(1)}% level offset is caught`, codes.includes("seam_break"), codes.join(",") || "no issues");
    }

    // A genuine OTC shock candle: opens at the previous close, moves 3% inside
    // its own body, and the series carries on from the new level. It is data,
    // not a splice, and must not cost the series its place.
    const base = randomWalk({ bars: 3000, seed: 306 });
    const k = 1500, jump = 1.03;
    const shocked = base.map((c, i) => {
      if (i < k) return c;
      if (i === k) return { time: c.time, open: base[k - 1].close, high: base[k - 1].close * jump * 1.0002, low: base[k - 1].close * 0.9999, close: base[k - 1].close * jump };
      const f = (base[k - 1].close * jump) / base[k].close;
      return { time: c.time, open: c.open * f, high: c.high * f, low: c.low * f, close: c.close * f };
    });
    const rs = checkDataset(makeDataset([{ symbol: "NZDUSD_otc", candles: shocked }])).perSeries[0];
    const sc = rs.issues.map(i => i.code);
    check("a genuine 3% shock candle is reported, not failed", rs.status !== "fail" && sc.includes("shock_bars"), sc.join(",") || "no issues");

    const shared = randomWalk({ bars: 400, seed: 304 });
    const other = randomWalk({ bars: 2000, seed: 305 });
    const withCopy = other.slice(0, 1600).concat(shared.map((c, i) => ({ ...c, time: other[1600].time + i * 60000 })));
    const copyOf = shared.map((c, i) => ({ ...c, time: other[1600].time + i * 60000 }));
    const r = checkDataset(makeDataset([
      { symbol: "CADCHF_otc", candles: withCopy },
      { symbol: "NZDCAD_otc", candles: copyOf }
    ]));
    check("two series sharing bars are both failed", r.failing.length === 2, JSON.stringify(r.shared));
  }

  // --- 4. look-ahead is caught
  {
    const candles = randomWalk({ bars: 2000, seed: 401 });
    const ds = makeDataset([{ symbol: "EURJPY_otc", candles }]);
    const peeker = {
      meta: { ...followLastBar.meta, id: "selftest-peek-view", warmup: 1 },
      decide: view => { const next = view.at(view.length); return next.close > next.open ? "CALL" : "PUT"; }
    };
    let threw = false;
    try { runHypothesis(peeker, ds, { expiry: 1 }); } catch (e) { threw = e.name === "LookaheadError" || /requested at decision bar/.test(e.message); }
    check("reading a future bar through the view throws", threw, threw ? "LookaheadError" : "no error");

    // the leak the view cannot see: the whole series captured in a closure
    const byTime = new Map(candles.map((c, i) => [c.time, i]));
    const smuggler = {
      meta: { ...followLastBar.meta, id: "selftest-peek-closure", warmup: 1 },
      decide: view => {
        const next = candles[byTime.get(view.at(-1).time) + 1];
        return next.close > next.open ? "CALL" : "PUT";
      }
    };
    const lk = checkNoLookahead(smuggler, ds, { samples: 200 });
    const fooled = score(smuggler, ds, 1);
    check("closure look-ahead is caught by the truncation check", lk.mismatches.length > 0,
      `${lk.mismatches.length}/${lk.checked} sampled decisions changed when the future was removed (its backtest: ${pct(fooled.rate)})`);

    const honest = checkNoLookahead(followLastBar, ds, { samples: 200 });
    check("an honest hypothesis passes the truncation check", honest.mismatches.length === 0, `${honest.checked} sampled`);
  }

  // --- 5. multiple comparisons: screening many dead ideas yields mirages
  //        uncorrected, and none after Holm
  {
    const ds = makeDataset([{ symbol: "USDCHF_otc", candles: randomWalk({ bars: 4000, seed: 501 }) }]);
    // Judged against 50% rather than break-even, deliberately: the harder
    // hurdle would hide the mirages this check exists to show.
    const ps = [];
    for (let seed = 1; seed <= 60; seed++) {
      const r = score(randomDirection(seed), ds, 1);
      ps.push(binomUpperTail(r.wins, r.decided, 0.5));
    }
    const raw = ps.filter(p => p < ALPHA).length;
    const adj = holm(ps).filter(p => p < ALPHA).length;
    check("60 noise hypotheses: none survive Holm correction", adj === 0,
      `${raw} of 60 look significant uncorrected; ${adj} after Holm`);
  }

  return { pass: checks.every(c => c.pass), checks };
}
