/* ==============================================================
   QX Capture — passive data tap (MAIN world)
   ==============================================================
   Ported from QX-Chart-Assistant v1.4.62. Observes inbound WebSocket
   frames and forwards candle history lists together with every
   non-candle string in the frame, which is where the symbol lives.
   Sends nothing to the socket, reads nothing from the account.

   Changes from the old tap:
   - timestamps are NOT floored to the minute here. Flooring hid
     sub-minute history lists as plausible duplicate 1m bars; the
     ISOLATED side now checks spacing on the raw times.
   - strings that sit directly inside arrays are collected too
     (the old collector skipped them).
   - the canvas price tap is not included yet. Phase 0 works from
     history; the tick stream returns when forward validation needs it.
   ============================================================== */
(function () {
  if (window.__QX_CAPTURE_HOOK__) return;
  window.__QX_CAPTURE_HOOK__ = true;

  function toMs(t) {
    const n = Number(t);
    if (!Number.isFinite(n)) return NaN;
    return n < 1e11 ? Math.round(n * 1000) : Math.round(n);
  }

  function parseCandle(item) {
    if (!item) return null;
    if (typeof item === "object" && !Array.isArray(item)) {
      const t = item.time ?? item.timestamp ?? item.t;
      const o = item.open ?? item.o;
      const h = item.high ?? item.h;
      const l = item.low ?? item.l;
      const c = item.close ?? item.c;
      if (t === undefined || o === undefined || c === undefined || h === undefined || l === undefined) return null;
      const r = { time: toMs(t), open: parseFloat(o), high: parseFloat(h), low: parseFloat(l), close: parseFloat(c) };
      return Number.isFinite(r.time) && !isNaN(r.open) && !isNaN(r.close) ? r : null;
    }
    if (Array.isArray(item) && item.length >= 5) {
      // Quotex native order: [time, open, close, high, low]
      const r = { time: toMs(item[0]), open: parseFloat(item[1]), close: parseFloat(item[2]), high: parseFloat(item[3]), low: parseFloat(item[4]) };
      return Number.isFinite(r.time) && !isNaN(r.open) && !isNaN(r.close) ? r : null;
    }
    return null;
  }

  function extractCandles(arr) {
    if (!Array.isArray(arr) || arr.length < 8) return null;
    const parsed = [];
    for (let i = 0; i < arr.length; i++) {
      const c = parseCandle(arr[i]);
      if (c) parsed.push(c);
      else if (parsed.length > 0 && parsed.length < 5) return null;
    }
    return parsed.length >= 8 ? parsed : null;
  }

  function deepSearch(data, depth) {
    depth = depth || 0;
    if (!data || depth > 5) return null;
    if (Array.isArray(data)) {
      const list = extractCandles(data);
      if (list) return list;
      for (const it of data) {
        const res = deepSearch(it, depth + 1);
        if (res) return res;
      }
    } else if (typeof data === "object") {
      for (const k of ["candles", "history", "data", "quotes", "bars"]) {
        if (data[k]) {
          const res = deepSearch(data[k], depth + 1);
          if (res) return res;
        }
      }
      for (const k of Object.keys(data)) {
        if (typeof data[k] === "object") {
          const res = deepSearch(data[k], depth + 1);
          if (res) return res;
        }
      }
    }
    return null;
  }

  // Every short string and small integer in the frame that is not
  // candle data. Integers are kept as "key=value" so they can never be
  // mistaken for a symbol.
  function collectTokens(data, out, depth) {
    depth = depth || 0;
    if (data === null || data === undefined || depth > 6 || out.length > 60) return out;
    if (typeof data === "string") {
      if (data.length > 1 && data.length <= 40) out.push(data);
      return out;
    }
    if (Array.isArray(data)) {
      if (data.length >= 8) return out; // an OHLC payload
      for (const v of data) collectTokens(v, out, depth + 1);
      return out;
    }
    if (typeof data === "object") {
      for (const k of Object.keys(data)) {
        const v = data[k];
        if (typeof v === "number" && Number.isInteger(v) && v > 0 && v < 100000) out.push(k + "=" + v);
        else if (typeof v === "string" || typeof v === "object") collectTokens(v, out, depth + 1);
      }
    }
    return out;
  }

  function handleIncoming(raw) {
    try {
      const str = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
      const b1 = str.indexOf("{"), b2 = str.indexOf("[");
      const start = b1 === -1 ? b2 : (b2 === -1 ? b1 : Math.min(b1, b2));
      if (start === -1) return;
      const parsed = JSON.parse(str.substring(start));
      const candles = deepSearch(parsed);
      if (!candles) return;
      window.postMessage({
        type: "QX_CAPTURE_HISTORY",
        payload: {
          candles,
          tokens: collectTokens(parsed, []),
          prefix: str.substring(0, Math.min(start, 48)),
          receivedAt: Date.now()
        }
      }, window.location.origin);
    } catch (_) {}
  }

  const OrigWS = window.WebSocket;
  window.WebSocket = function (...args) {
    const ws = new OrigWS(...args);
    ws.addEventListener("message", (ev) => {
      if (typeof ev.data === "string") handleIncoming(ev.data);
      else if (ev.data instanceof Blob) ev.data.text().then(handleIncoming, () => {});
      else if (ev.data instanceof ArrayBuffer) handleIncoming(ev.data);
    });
    return ws;
  };
  window.WebSocket.prototype = OrigWS.prototype;
  for (const k of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) window.WebSocket[k] = OrigWS[k];
})();
