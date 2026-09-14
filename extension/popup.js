(function () {
  const $ = id => document.getElementById(id);

  // Two sources, deduplicated by tabKey, live winning:
  //  - live: asked directly by message, so it works even if storage is broken
  //  - stored: snapshots left by earlier page loads and closed tabs
  async function collectSnapshots() {
    const byKey = new Map();
    let stored = {};
    let storageReadError = null;
    try { stored = await chrome.storage.session.get(null); } catch (e) { storageReadError = e.message || String(e); }
    for (const [k, snap] of Object.entries(stored)) {
      if (k.startsWith("qxCapture_") && snap && snap.series) byKey.set(k, Object.assign({ live: false }, snap));
    }
    let tabs = [];
    try { tabs = await chrome.tabs.query({}); } catch (_) {}
    const live = await Promise.all(tabs.map(t =>
      chrome.tabs.sendMessage(t.id, { type: "qx-status" }).then(r => r, () => null)));
    for (const snap of live) if (snap && snap.tabKey) byKey.set(snap.tabKey, Object.assign({ live: true }, snap));
    return { snaps: [...byKey.values()], storageReadError, liveCount: live.filter(Boolean).length };
  }

  // Merge through the same attribution and splice guards the tabs use,
  // so a merge here can never do something ingest would have refused.
  function merge(snaps) {
    const merged = QXCore.createStore();
    const stats = { tabs: snaps.length, framesSeen: 0, framesAccepted: 0, dropped: { none: 0, ambiguous: 0, invalid: 0, merge: 0 }, invalidReasons: {}, mergeReasons: {}, unknownSymbols: {}, rejectSamples: [], hooks: [] };
    const addCounts = (into, from) => { for (const [k, n] of Object.entries(from || {})) into[k] = (into[k] || 0) + n; };
    for (const snap of snaps) {
      const s = snap.stats || {};
      stats.framesSeen += s.framesSeen || 0;
      stats.framesAccepted += s.framesAccepted || 0;
      addCounts(stats.dropped, s.dropped);
      addCounts(stats.invalidReasons, s.invalidReasons);
      addCounts(stats.mergeReasons, s.mergeReasons);
      addCounts(stats.unknownSymbols, s.unknownSymbols);
      for (const r of s.rejectSamples || []) if (stats.rejectSamples.length < 8) stats.rejectSamples.push(r);
      stats.hooks.push({ live: snap.live, loadedAt: snap.loadedAt || null, hook: snap.hook || null, storageError: snap.storageError || null });
      for (const ser of Object.values(snap.series)) {
        merged.ingest({
          tokens: [ser.symbol], prefix: "",
          candles: ser.candles.map(([time, open, high, low, close]) => ({ time, open, high, low, close }))
        });
      }
    }
    const snap = merged.snapshot();
    stats.popupMergeRejects = snap.stats.dropped.merge;
    return { series: snap.series, stats };
  }

  // Name the first stage that came up empty, in pipeline order.
  function diagnose({ snaps, storageReadError, liveCount }, stats, seriesCount) {
    if (storageReadError) return `Storage cannot be read: ${storageReadError}`;
    if (!snaps.length) return "No Quotex tab is running the capture script. Reload each Quotex tab (F5) — tabs opened before the extension was loaded or reloaded never get it. If it still says this, the site's domain is not in manifest.json's match list.";
    const liveHooks = stats.hooks.filter(h => h.live);
    if (!liveCount) return "Only snapshots from earlier page loads were found; no open Quotex tab answered. Reload the Quotex tab.";
    if (liveHooks.every(h => !h.hook)) return "Capture script is running but the page tap is silent. Reload the tab; if it persists the MAIN-world script is being blocked.";
    const hooks = liveHooks.map(h => h.hook).filter(Boolean);
    const sockets = hooks.reduce((a, h) => a + h.sockets, 0);
    const messages = hooks.reduce((a, h) => a + h.messages, 0);
    const lists = hooks.reduce((a, h) => a + h.historyLists, 0);
    if (!sockets) return "Tap installed after the page opened its connection, so it sees no sockets. Reload the Quotex tab.";
    if (!messages) return `${sockets} socket(s) but no messages yet. Wait for the chart to load.`;
    if (!lists) return `${messages} messages, but none contained a candle history list. Switch assets or timeframe so the chart requests history; if it stays 0, the feed format changed — send the event names below.`;
    if (!stats.framesAccepted) return `${lists} history list(s) seen, none accepted — see drop reasons and samples below.`;
    const storageErr = liveHooks.find(h => h.storageError);
    if (storageErr) return `Capturing, but saving to storage fails: ${storageErr.storageError}. Export still works from the live tab.`;
    return `Capturing: ${seriesCount} series.`;
  }

  let last = null;

  async function render() {
    const src = await collectSnapshots();
    const { series, stats } = merge(src.snaps);
    last = { series, stats };
    const rows = Object.values(series).sort((a, b) => b.candles.length - a.candles.length);
    const bars = rows.reduce((n, s) => n + s.candles.length, 0);
    const d = stats.dropped;
    $("status").textContent = diagnose(src, stats, rows.length);
    $("summary").textContent =
      `${rows.length} series · ${bars.toLocaleString()} bars · ${src.liveCount} live tab(s), ${src.snaps.length} snapshot(s) · ` +
      `frames ${stats.framesAccepted}/${stats.framesSeen} kept (no symbol ${d.none}, ambiguous ${d.ambiguous}, invalid ${d.invalid}, splice ${d.merge})`;

    const diag = {
      hooks: stats.hooks.map(h => h.hook ? {
        live: h.live, sockets: h.hook.sockets, messages: h.hook.messages, binary: h.hook.binary,
        parseErrors: h.hook.parseErrors, historyLists: h.hook.historyLists, events: h.hook.events, storageError: h.storageError
      } : { live: h.live, hook: "silent", storageError: h.storageError }),
      invalidReasons: stats.invalidReasons, mergeReasons: stats.mergeReasons,
      unknownSymbols: stats.unknownSymbols, rejectSamples: stats.rejectSamples
    };
    $("diag").textContent = JSON.stringify(diag, null, 1);

    $("list").innerHTML = "";
    if (!rows.length) return;
    const t = document.createElement("table");
    t.innerHTML = "<tr><th>Symbol</th><th>Bars</th><th>Span (h)</th></tr>";
    for (const s of rows) {
      const c = s.candles;
      const span = c.length ? ((c[c.length - 1][0] - c[0][0]) / 3600000).toFixed(1) : "0";
      const tr = document.createElement("tr");
      for (const [v, cls] of [[s.symbol, ""], [c.length, "n"], [span, "n"]]) {
        const td = document.createElement("td");
        td.textContent = v;
        if (cls) td.className = cls;
        tr.appendChild(td);
      }
      t.appendChild(tr);
    }
    $("list").appendChild(t);
  }

  $("export").addEventListener("click", async () => {
    await render();
    const { series, stats } = last;
    if (!Object.keys(series).length && !confirm("Nothing has been captured. Export an empty file anyway (useful only for diagnosis)?")) return;
    const ds = QXCore.buildDataset({ series, stats }, { extensionVersion: chrome.runtime.getManifest().version });
    const blob = new Blob([JSON.stringify(ds)], { type: "application/json" });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
    a.href = URL.createObjectURL(blob);
    a.download = `qx_capture_${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  $("copy").addEventListener("click", () => navigator.clipboard.writeText($("status").textContent + "\n" + $("summary").textContent + "\n" + $("diag").textContent));

  $("clear").addEventListener("click", async () => {
    if (!confirm("Clear stored snapshots? Open tabs keep what they hold until reloaded.")) return;
    await chrome.storage.session.clear();
    render();
  });

  render().catch(e => { $("status").textContent = "Could not read capture: " + e.message; });
  setInterval(() => render().catch(() => {}), 3000);
})();
