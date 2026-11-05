const key = document.getElementById('key'), browser = document.getElementById('browser'), status = document.getElementById('status');
chrome.storage.local.get(['browser', 'enabled']).then(v => { browser.value = v.browser || 'chrome'; status.textContent = v.enabled ? 'Yoqilgan' : 'Oʻchirilgan'; });
document.getElementById('enable').onclick = async () => {
  if (key.value.trim().length < 32) { status.textContent = 'Agent bergan ulash kalitini kiriting.'; return; }
  const allowed = await chrome.permissions.request({origins: ['http://*/*', 'https://*/*']});
  if (!allowed) { status.textContent = 'Sayt ruxsati berilmadi.'; return; }
  await chrome.storage.local.set({key: key.value.trim(), browser: browser.value, enabled: true}); key.value = ''; status.textContent = 'Yoqilgan. Ruxsatlarni brauzer kengaytma sozlamalarida cheklashingiz mumkin.';
};
document.getElementById('disable').onclick = async () => { await chrome.storage.local.remove(['key']); await chrome.storage.local.set({enabled: false}); await chrome.permissions.remove({origins: ['http://*/*', 'https://*/*']}); key.value = ''; status.textContent = 'Toʻxtatildi.'; };
