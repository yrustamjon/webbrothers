/* Metadata only. Do not request extraHeaders, requestHeaders, responseHeaders or requestBody. */
const pending = new Map();
let settings = {enabled: false, key: '', browser: 'chrome'};
let sending = 0;
chrome.storage.local.get(['enabled', 'key', 'browser']).then(v => Object.assign(settings, v));
chrome.storage.onChanged.addListener(changes => {
  for (const k of ['enabled', 'key', 'browser']) if (changes[k]) settings[k] = changes[k].newValue;
  pending.clear();
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.webRequest.onBeforeRequest.addListener(details => {
  if (!settings.enabled || !settings.key || details.url.startsWith('http://127.0.0.1:18444/')) return;
  let origin;
  try { const u = new URL(details.url); if (u.username || u.password) return; origin = u.origin; } catch { return; }
  if (pending.size >= 512) pending.delete(pending.keys().next().value);
  pending.set(details.requestId, {method: details.method, safe_url: origin, started: details.timeStamp});
}, {urls: ['http://*/*', 'https://*/*']});
chrome.webRequest.onCompleted.addListener(details => {
  const entry = pending.get(details.requestId); pending.delete(details.requestId);
  if (!entry || !settings.enabled || sending >= 4) return;
  const event = {method: entry.method, safe_url: entry.safe_url, status: details.statusCode,
    duration_ms: Math.max(0, details.timeStamp - entry.started), transfer_bytes: null,
    browser: settings.browser, profile_id: null, attribution: 'browser', id: '', observed_at: ''};
  sending++;
  fetch('http://127.0.0.1:18444/v1/http-events', {method: 'POST', headers: {
    'Authorization': `Bearer ${settings.key}`, 'Content-Type': 'application/json'
  }, body: JSON.stringify(event), signal: AbortSignal.timeout(2000)}).catch(() => {}).finally(() => sending--);
}, {urls: ['http://*/*', 'https://*/*']});
chrome.webRequest.onErrorOccurred.addListener(details => pending.delete(details.requestId), {urls: ['http://*/*', 'https://*/*']});
