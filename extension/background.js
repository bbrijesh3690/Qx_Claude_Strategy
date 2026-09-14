// Content scripts cannot read chrome.storage.session until a trusted
// context opens it to them. Nothing else happens here.
function openSessionStorage() {
  chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" }).catch(() => {});
}
chrome.runtime.onInstalled.addListener(openSessionStorage);
chrome.runtime.onStartup.addListener(openSessionStorage);
openSessionStorage();
