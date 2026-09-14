// Copy to hNNN-short-name.js and fill in BEFORE looking at any result.
// See PROTOCOL.md. Once screened, this file is frozen: any change to the
// rule is a new id, and counts as a new hypothesis toward the kill criterion.
//
// Run:  node harness/bin/qx.js run research/hypotheses/hNNN-name.js <dataset.json>

export const meta = {
  id: "hNNN-short-name",
  title: "One line",
  // The claim, the mechanism you believe causes it, and what would refute it.
  statement: "Replace with the pre-registered claim.",
  market: "otc",          // "otc" | "real" | "both" — scored separately regardless
  expiries: [5],          // only the expiries the claim is actually about
  warmup: 20,             // bars required before the first decision
  predictedRate: 0.65,    // honest expectation; sets the screen size
  registeredAt: "YYYY-MM-DD"
};

// view.at(-1) is the decision bar, fully closed. Entry is the next bar's open.
// view.last(n) is the most recent n bars, oldest first.
// ctx = { symbol, key, otc, expiry }
// Return "CALL", "PUT", or null to stand aside. Most minutes should be null.
export function decide(view, ctx) {
  return null;
}
