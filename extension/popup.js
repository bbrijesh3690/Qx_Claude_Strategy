(function () {
  const $ = id => document.getElementById(id);

  // Each capturing tab writes its own key. Merge them through the same
  // attribution and splice guards the tabs themselves use, so a merge
  // here can never do something ingest would have refused.
  async function loadMerged() {
    const all = await chrome.storage.session.get(null);
    const merged = QXCore.createStore();
    const stats = { tabs: 0, framesSeen: 0, framesAccepted: 0, dropped: { none: 0, ambiguous: 0, invalid: 0, merge: 0 }, unknownSymbols: {} };
    for (const [k, snap] of Object.entries(all)) {
      if (!k.startsWith("qxCapture_") || !snap || !snap.series) continue;
      stats.tabs++;
      const s = snap.stats || {};
      stats.framesSeen += s.framesSeen || 0;
      stats.framesAccepted += s.framesAccepted || 0;
      for (const r of Object.keys(stats.dropped)) stats.dropped[r] += (s.dropped && s.dropped[r]) || 0;
      for (const [u, n] of Object.entries(s.unknownSymbols || {})) stats.unknownSymbols[u] = (stats.unknownSymbols[u] || 0) + n;
      for (const ser of Object.values(snap.series)) {
        merged.ingest({
          tokens: [ser.symbol],
          prefix: "",
          candles: ser.candles.map(([time, open, high, low, close]) => ({ time, open, high, low, close }))
        });
      }
    }
    const snap = merged.snapshot();
    stats.popupMergeRejects = snap.stats.dropped.merge;
    return { series: snap.series, stats };
  }

  async function render() {
    const { series, stats } = await loadMerged();
    const rows = Object.values(series).sort((a, b) => b.candles.length - a.candles.length);
    const bars = rows.reduce((n, s) => n + s.candles.length, 0);
    const d = stats.dropped;
    $("summary").textContent =
      `${rows.length} series · ${bars.toLocaleString()} bars · ${stats.tabs} tab(s) · ` +
      `frames ${stats.framesAccepted}/${stats.framesSeen} kept ` +
      `(no symbol ${d.none}, ambiguous ${d.ambiguous}, invalid ${d.invalid}, splice ${d.merge})`;
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
    const { series, stats } = await loadMerged();
    const ds = QXCore.buildDataset({ series, stats }, { extensionVersion: chrome.runtime.getManifest().version });
    const blob = new Blob([JSON.stringify(ds)], { type: "application/json" });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
    a.href = URL.createObjectURL(blob);
    a.download = `qx_capture_${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  $("clear").addEventListener("click", async () => {
    if (!confirm("Clear all captured data in this browser session?")) return;
    await chrome.storage.session.clear();
    render();
  });

  render().catch(e => { $("summary").textContent = "Could not read capture: " + e.message; });
})();
