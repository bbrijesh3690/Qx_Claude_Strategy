/* ==============================================================
   QX Capture — ISOLATED world
   ==============================================================
   Receives history frames from page-hook.js, attributes them by
   symbol through QXCore, and keeps the result in chrome.storage.session.

   Why storage.session and not localStorage / IndexedDB: those are
   scoped to the Quotex origin, so any script on the site could read
   them (31 MB had piled up there in the old project). storage.session
   belongs to the extension and is cleared when the browser closes.
   ============================================================== */
(function () {
  if (window.__QX_CAPTURE_ISOLATED__) return;
  window.__QX_CAPTURE_ISOLATED__ = true;

  const KEY = "qxCapture";
  const store = QXCore.createStore();
  let dirty = false;
  let storageOk = true;

  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.type !== "QX_CAPTURE_HISTORY") return;
    store.ingest(e.data.payload);
    dirty = true;
  });

  // Several Quotex tabs can capture at once. Each page load writes its
  // own key so two tabs never overwrite each other's state, and a reload
  // leaves the previous load's snapshot in place; the popup merges them
  // all through the same guards.
  const tabKey = KEY + "_" + Math.random().toString(36).slice(2, 10);

  function flush() {
    if (!dirty || !storageOk) return;
    dirty = false;
    try {
      chrome.storage.session.set({ [tabKey]: Object.assign(store.snapshot(), { updatedAt: Date.now() }) })
        .catch(() => { storageOk = false; });
    } catch (_) {
      storageOk = false;
    }
  }

  setInterval(flush, 3000);
  window.addEventListener("pagehide", flush);
})();
