/* ==============================================================
   QX Capture — core attribution and merge logic (pure, no DOM)
   ==============================================================
   Loaded as a classic content script (defines globalThis.QXCore) and
   required by the Node harness tests, so the exact code that files
   candles in the browser is the code under test.

   The rule, learned the expensive way in the previous project:
   A SERIES IS OWNED BY THE SYMBOL THE FRAME NAMES, OR BY NOTHING.
   There is no price-proximity fallback. AUD/JPY and CAD/JPY trade
   0.5% apart, and a guessed owner spliced whole instruments together
   — a spliced series looks like noise and quietly returns ~50%.
   Losing a frame is recoverable. Poisoning a series is not.
   ============================================================== */
(function (root) {
  "use strict";

  const MINUTE = 60000;
  const MAX_BARS_PER_SERIES = 20000;

  // Both halves of a six-letter token must be a known code, otherwise
  // ordinary six-letter words in the frame ("assets", "result",
  // "stream") read as pairs. Extend this list when capture reports a
  // real symbol under `unknownSymbols`.
  const CODES = new Set((
    "AED ARS AUD BDT BHD BRL CAD CHF CLP CNH CNY COP CZK DKK DZD EGP EUR GBP " +
    "HKD HUF IDR ILS INR IQD IRR JOD JPY KES KRW KWD LBP LKR MAD MXN MYR NGN " +
    "NOK NZD OMR PHP PKR PLN QAR RON RUB SAR SEK SGD SYP THB TND TRY TWD UAH " +
    "USD VND YER ZAR XAU XAG XPT XPD BTC ETH LTC XRP BCH DOG ADA SOL DOT BNB"
  ).split(/\s+/));

  /* --------------------------------------------------------------
     parseSymbol("USDPKR_otc") -> { id: "USDPKR_otc", base, quote, otc }
     Returns null for anything that is not a recognisable pair.
     -------------------------------------------------------------- */
  function parseSymbol(token) {
    if (typeof token !== "string" || token.indexOf("=") !== -1) return null;
    if (token.length < 6 || token.length > 16) return null;
    const up = token.toUpperCase();
    const otc = /OTC/.test(up);
    const letters = up.replace(/OTC/g, "").replace(/[^A-Z]/g, "");
    if (letters.length !== 6) return null;
    const base = letters.slice(0, 3), quote = letters.slice(3);
    if (!CODES.has(base) || !CODES.has(quote) || base === quote) return null;
    return { id: base + quote + (otc ? "_otc" : ""), base, quote, otc };
  }

  // Two tokens naming the same pair in either order are one instrument, so
  // identity is order-independent.
  function pairKey(sym) {
    const [a, b] = [sym.base, sym.quote].sort();
    return a + b + (sym.otc ? "_otc" : "");
  }

  // NAMES follow the feed's own order, except where the platform is
  // verified to list the pair the other way round. Add an entry only with
  // evidence; never infer from a naming convention (v0.1.2 tried that and
  // renamed four pairs the platform lists exactly as the feed spells them).
  //   BRLUSD -> USD/BRL (OTC): QX-Chart-Assistant v1.4.55 ledger; confirmed
  //   by the owner against the platform, 2026-09-15.
  // Prices are never touched: the chart shows the feed's numbers under
  // the platform's name, so CALL/PUT mean the same thing either way.
  const PLATFORM_NAMES = { BRLUSD: "USDBRL" };

  function nameKey(sym) {
    const feed = sym.base + sym.quote;
    return (PLATFORM_NAMES[feed] || feed) + (sym.otc ? "_otc" : "");
  }

  // "USDBRL_otc" -> "USD/BRL (OTC)"
  function displayName(key) {
    const m = /^([A-Z]{3})([A-Z]{3})(_otc)?$/.exec(key);
    return m ? `${m[1]}/${m[2]}${m[3] ? " (OTC)" : ""}` : key;
  }

  // Re-derive the canonical key for any stored key or feed symbol, so
  // exports made before this naming rule load under the right name.
  function canonicalKey(anySymbol) {
    const s = parseSymbol(anySymbol);
    return s ? nameKey(s) : anySymbol;
  }

  /* --------------------------------------------------------------
     attribute(tokens, prefix) -> { status, symbol? }
       "ok"        exactly one instrument named
       "none"      no recognisable symbol  -> drop the frame
       "ambiguous" two or more instruments -> drop the frame
     -------------------------------------------------------------- */
  function attribute(tokens, prefix) {
    const found = new Map();
    const unknown = [];
    const all = (Array.isArray(tokens) ? tokens : []).concat(splitPrefix(prefix));
    for (const t of all) {
      const s = parseSymbol(t);
      if (s) {
        if (!found.has(pairKey(s))) found.set(pairKey(s), s);
      } else if (typeof t === "string" && /^[A-Za-z]{6}(_?otc)?$/i.test(t)) {
        unknown.push(t);
      }
    }
    if (found.size === 0) return { status: "none", unknown };
    if (found.size > 1) return { status: "ambiguous", symbols: [...found.values()].map(s => s.id), unknown };
    return { status: "ok", symbol: found.values().next().value, unknown };
  }

  function splitPrefix(prefix) {
    if (typeof prefix !== "string" || !prefix) return [];
    return prefix.split(/[^A-Za-z0-9_#]+/).filter(Boolean);
  }

  /* --------------------------------------------------------------
     validateCandles(raw) -> { ok, candles?, reason? }
     raw is [{time(ms), open, high, low, close}], as emitted by the tap.

     The tap does NOT floor timestamps. A history list of 5-second or
     15-second candles floored to the minute collapses into duplicate
     "1m" bars that look perfectly plausible — so spacing is checked
     here, on the raw times, and anything not strictly 1-minute is
     refused whole.
     -------------------------------------------------------------- */
  function validateCandles(raw) {
    if (!Array.isArray(raw) || raw.length < 8) return { ok: false, reason: "too_short" };
    const out = [];
    for (const c of raw) {
      const t = Number(c.time), o = Number(c.open), h = Number(c.high), l = Number(c.low), cl = Number(c.close);
      if (![t, o, h, l, cl].every(Number.isFinite)) return { ok: false, reason: "non_numeric" };
      if (!(o > 0 && h > 0 && l > 0 && cl > 0)) return { ok: false, reason: "non_positive" };
      if (t % MINUTE !== 0) return { ok: false, reason: "not_minute_aligned" };
      out.push({ time: t, open: o, high: Math.max(h, o, cl), low: Math.min(l, o, cl), close: cl });
    }
    out.sort((a, b) => a.time - b.time);
    for (let i = 1; i < out.length; i++) {
      const step = out[i].time - out[i - 1].time;
      if (step === 0) return { ok: false, reason: "duplicate_time" };
      if (step % MINUTE !== 0) return { ok: false, reason: "irregular_step" };
    }
    // A list with no two adjacent minutes is some other timeframe.
    let adjacent = 0;
    for (let i = 1; i < out.length; i++) if (out[i].time - out[i - 1].time === MINUTE) adjacent++;
    if (adjacent < (out.length - 1) / 2) return { ok: false, reason: "not_1m_timeframe" };
    return { ok: true, candles: out };
  }

  function median(xs) {
    const s = xs.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  // Typical one-minute move of a series, from close to close.
  function medianAbsReturn(candles) {
    const rs = [];
    for (let i = 1; i < candles.length; i++) {
      if (candles[i].time - candles[i - 1].time !== MINUTE) continue;
      const r = Math.abs(Math.log(candles[i].close / candles[i - 1].close));
      if (r > 0) rs.push(r);
    }
    return rs.length ? median(rs) : 0;
  }

  // Largest open-vs-previous-close step that still counts as continuous.
  // On a real feed the next bar opens at, or within a tick of, the last
  // close (measured p99 on the first capture: 0.2–3 bp). A splice shows up
  // exactly here; a genuine shock candle does not, because its move is
  // inside the bar body.
  function seamLimit(candles) {
    return Math.max(0.0005, 15 * medianAbsReturn(candles));
  }

  /* --------------------------------------------------------------
     mergeSeries(existing, incoming) -> { candles, rejected, reason? }

     Every guard refuses the incoming block WHOLE. Trimming only the seam
     would hide a splice while keeping the foreign bars.

     1. Overlap: where the two share minutes, closes must agree.
     2. Seam: where the block touches existing bars minute-to-minute, the
        later bar must open where the earlier one closed.
     3. Level: a block touching nothing must sit within 5% of the NEAREST
        existing bar in time.

     v0.1.1 compared a block against the median of the whole series. The
     first real capture showed why that fails: OTC feeds contain 1–5%
     one-minute shock candles, so a week of history drifts well beyond 5%
     of its own median, and 50 genuine history pages were thrown away as
     "foreign". Checks are now local to where the block joins.
     -------------------------------------------------------------- */
  function mergeSeries(existing, incoming) {
    const have = existing || [];
    const add = incoming || [];
    if (have.length >= 5 && add.length >= 5) {
      const byTime = new Map(have.map(c => [c.time, c]));
      let overlap = 0, disagree = 0;
      for (const c of add) {
        const e = byTime.get(c.time);
        if (!e) continue;
        overlap++;
        if (Math.abs(e.close - c.close) / e.close > 0.001) disagree++;
      }
      // The newest overlapping bar may still have been forming in the
      // older copy, so allow one disagreement.
      if (overlap >= 5 && disagree > 1 && disagree / overlap > 0.1) {
        return { candles: have, rejected: add.length, reason: "overlap_disagrees" };
      }

      const limit = seamLimit(have);
      const first = add[0], last = add[add.length - 1];
      const before = byTime.get(first.time - MINUTE);
      const after = byTime.get(last.time + MINUTE);
      const brokenSeam =
        (before && !byTime.has(first.time) && Math.abs(Math.log(first.open / before.close)) > limit) ||
        (after && !byTime.has(last.time) && Math.abs(Math.log(after.open / last.close)) > limit);
      if (brokenSeam) return { candles: have, rejected: add.length, reason: "seam_mismatch" };

      if (!overlap && !before && !after) {
        let nearest = have[0], best = Infinity;
        for (const c of have) {
          const d = Math.min(Math.abs(c.time - first.time), Math.abs(c.time - last.time));
          if (d < best) { best = d; nearest = c; }
        }
        const ref = Math.abs(nearest.time - first.time) <= Math.abs(nearest.time - last.time) ? first : last;
        if (Math.abs(Math.log(ref.close / nearest.close)) > 0.05) {
          return { candles: have, rejected: add.length, reason: "level_mismatch" };
        }
      }
    }
    const map = new Map();
    for (const c of have) map.set(c.time, c);
    for (const c of add) map.set(c.time, c); // newer copy wins: older one may have been forming
    let merged = [...map.values()].sort((a, b) => a.time - b.time);
    if (merged.length > MAX_BARS_PER_SERIES) merged = merged.slice(-MAX_BARS_PER_SERIES);
    return { candles: merged, rejected: 0 };
  }

  /* --------------------------------------------------------------
     createStore() — the in-memory capture state, one per tab.
     ingest(packet) returns what happened so the caller can count it.
     -------------------------------------------------------------- */
  function createStore() {
    const series = new Map();
    const stats = {
      framesSeen: 0, framesAccepted: 0,
      dropped: { none: 0, ambiguous: 0, invalid: 0, merge: 0 },
      invalidReasons: {}, mergeReasons: {}, unknownSymbols: {},
      rejectSamples: []
    };

    // The first few rejected frames, reduced to what diagnosis needs: the
    // reason, the frame's non-numeric tokens (where a symbol would be) and
    // the first two raw candles (which show the timestamp format).
    // Numeric key=value tokens are left out — they are ids, not symbols.
    function sample(reason, pkt) {
      if (stats.rejectSamples.length >= 8) return;
      stats.rejectSamples.push({
        reason,
        prefix: typeof (pkt && pkt.prefix) === "string" ? pkt.prefix.slice(0, 48) : null,
        tokens: ((pkt && pkt.tokens) || []).filter(t => typeof t === "string" && t.indexOf("=") === -1).slice(0, 12),
        bars: Array.isArray(pkt && pkt.candles) ? pkt.candles.length : null,
        firstCandles: Array.isArray(pkt && pkt.candles) ? pkt.candles.slice(0, 2) : null
      });
    }

    function ingest(pkt) {
      stats.framesSeen++;
      const att = attribute(pkt && pkt.tokens, pkt && pkt.prefix);
      for (const u of att.unknown || []) stats.unknownSymbols[u] = (stats.unknownSymbols[u] || 0) + 1;
      if (att.status !== "ok") { stats.dropped[att.status]++; sample(att.status, pkt); return { accepted: false, reason: att.status }; }

      const v = validateCandles(pkt.candles);
      if (!v.ok) {
        stats.dropped.invalid++;
        stats.invalidReasons[v.reason] = (stats.invalidReasons[v.reason] || 0) + 1;
        sample(v.reason, pkt);
        return { accepted: false, reason: v.reason };
      }

      const key = pairKey(att.symbol);
      const cur = series.get(key) || { key: nameKey(att.symbol), symbol: att.symbol.id, otc: att.symbol.otc, matchMode: "symbol", candles: [], frames: 0, rejectedBars: 0 };
      const m = mergeSeries(cur.candles, v.candles);
      if (m.rejected) {
        cur.rejectedBars += m.rejected;
        stats.dropped.merge++;
        stats.mergeReasons[m.reason] = (stats.mergeReasons[m.reason] || 0) + 1;
        sample(m.reason, pkt);
        series.set(key, cur);
        return { accepted: false, reason: m.reason, symbol: cur.symbol };
      }
      cur.candles = m.candles;
      cur.frames++;
      series.set(key, cur);
      stats.framesAccepted++;
      return { accepted: true, symbol: cur.symbol, bars: cur.candles.length };
    }

    function snapshot() {
      const out = {};
      for (const s of series.values()) {
        out[s.key] = {
          symbol: s.symbol, name: displayName(s.key), otc: s.otc, matchMode: s.matchMode, frames: s.frames, rejectedBars: s.rejectedBars,
          candles: s.candles.map(c => [c.time, c.open, c.high, c.low, c.close])
        };
      }
      return { series: out, stats: JSON.parse(JSON.stringify(stats)) };
    }

    function restore(snap) {
      if (!snap || !snap.series) return;
      for (const [storedKey, s] of Object.entries(snap.series)) {
        const sym = parseSymbol(storedKey);
        if (!sym) continue;
        series.set(pairKey(sym), {
          key: nameKey(sym), symbol: s.symbol, otc: s.otc, matchMode: s.matchMode, frames: s.frames || 0, rejectedBars: s.rejectedBars || 0,
          candles: (s.candles || []).map(([time, open, high, low, close]) => ({ time, open, high, low, close }))
        });
      }
      if (snap.stats) Object.assign(stats, snap.stats);
    }

    return { ingest, snapshot, restore };
  }

  /* --------------------------------------------------------------
     buildDataset(snapshot, meta) — the export file the harness reads.
     -------------------------------------------------------------- */
  function buildDataset(snap, meta) {
    return Object.assign({
      format: "qx-capture",
      formatVersion: 1,
      exportedAt: new Date().toISOString()
    }, meta || {}, { series: snap.series, captureStats: snap.stats });
  }

  const api = { MINUTE, CODES, PLATFORM_NAMES, parseSymbol, pairKey, nameKey, canonicalKey, displayName, attribute, validateCandles, medianAbsReturn, seamLimit, mergeSeries, createStore, buildDataset };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.QXCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
