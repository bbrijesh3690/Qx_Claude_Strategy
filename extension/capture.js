/* ==============================================================
   QX Capture — ISOLATED world
   ==============================================================
   Receives history frames from page-hook.js, attributes them by
   symbol through QXCore, and keeps the result in chrome.storage.session.

   Why storage.session and not localStorage / IndexedDB: those are
   scoped to the Quotex origin, so any script on the site could read
   them (31 MB had piled up there in the old project). storage.session
   belongs to the extension and is cleared when the browser closes.

   v0.1.1: the first real session exported nine empty files with no way
   to tell which link was broken — no frames and a failed write looked
   identical. Every stage now reports: the hook sends its own counters,
   this script heartbeats to storage even with nothing captured, records
   the storage error text, and answers the popup directly by message so
   diagnosis does not depend on storage working at all.
   ============================================================== */
(function () {
  if (window.__QX_CAPTURE_ISOLATED__) return;
  window.__QX_CAPTURE_ISOLATED__ = true;

  const KEY = "qxCapture";
  const store = QXCore.createStore();
  const loadedAt = Date.now();
  let hook = null;          // last counters from page-hook.js; null = never heard from it
  let storageError = null;

  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.type === "QX_CAPTURE_HISTORY") store.ingest(e.data.payload);
    else if (e.data.type === "QX_CAPTURE_HOOK_STATS") hook = e.data.payload;
  });

  // Several Quotex tabs can capture at once. Each page load writes its
  // own key so two tabs never overwrite each other's state, and a reload
  // leaves the previous load's snapshot in place; the popup merges them
  // all through the same guards.
  const tabKey = KEY + "_" + Math.random().toString(36).slice(2, 10);

  function status() {
    return Object.assign(store.snapshot(), { tabKey, loadedAt, updatedAt: Date.now(), hook, storageError });
  }

  function flush() {
    try {
      chrome.storage.session.set({ [tabKey]: status() })
        .then(() => { storageError = null; }, (e) => { storageError = String((e && e.message) || e); });
    } catch (e) {
      storageError = String((e && e.message) || e);
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "qx-status") sendResponse(status());
  });

  setInterval(flush, 3000);
  window.addEventListener("pagehide", flush);
})();
