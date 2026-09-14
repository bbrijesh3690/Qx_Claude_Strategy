import { test } from "node:test";
import assert from "node:assert/strict";
import { wilson, breakEven, evPerTrade, binomUpperTail, holm, requiredN, nToProve, normInv } from "../src/stats.js";

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("wilson matches the textbook value", () => {
  const w = wilson(81, 100);
  close(w.low, 0.7222, 1e-3);
  close(w.high, 0.8749, 1e-3);
  assert.equal(wilson(0, 0), null);
});

test("break-even and EV at the payouts the old account saw", () => {
  close(breakEven(0.92), 0.5208);
  close(breakEven(0.85), 0.5405);
  close(breakEven(0.74), 0.5747);
  close(evPerTrade(0.75, 0.85), 0.3875);
  close(evPerTrade(0.504, 0.85), -0.0676); // the retired engine: -6.8% per trade
});

test("binomUpperTail agrees with brute force", () => {
  const brute = (w, n, p) => {
    let s = 0;
    for (let k = w; k <= n; k++) {
      let c = 1;
      for (let j = 0; j < k; j++) c = c * (n - j) / (j + 1);
      s += c * p ** k * (1 - p) ** (n - k);
    }
    return s;
  };
  // Lanczos log-gamma is good to ~1e-8, far finer than any decision needs
  for (const [w, n, p] of [[7, 10, 0.5], [30, 40, 0.54], [0, 5, 0.3], [12, 12, 0.6]]) close(binomUpperTail(w, n, p), brute(w, n, p), 1e-7);
});

test("holm is step-down and never below the raw p", () => {
  const adj = holm([0.01, 0.04, 0.03, 0.005]);
  assert.deepEqual(adj.map(x => Number(x.toFixed(3))), [0.03, 0.06, 0.06, 0.02]);
});

test("normInv is the inverse normal", () => {
  close(normInv(0.975), 1.95996, 1e-4);
  close(normInv(0.8), 0.84162, 1e-4);
  close(normInv(0.001), -3.0902, 1e-3);
});

test("sample sizes behind the plan: 75% at an 85% payout", () => {
  const be = breakEven(0.85);
  assert.equal(requiredN({ p1: 0.75, p0: be }), 41);
  assert.equal(requiredN({ p1: 0.75, p0: be, tests: 20 }), 80);
  assert.ok(nToProve(0.75, be) <= 25);
  assert.equal(requiredN({ p1: 0.5, p0: be }), Infinity);
});
