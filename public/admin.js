'use strict';
const keyInput = document.getElementById('admin-key');
const info = document.getElementById('update-info');
const install = document.getElementById('install-update');
const check = document.getElementById('check-update');
keyInput.value = sessionStorage.getItem('gamesAdminKey') || '';
function message(text) { info.textContent = text; }
async function request(method) {
  const key = keyInput.value.trim();
  if (!key) throw new Error('Bitte zuerst deinen Admin-Schlüssel eingeben.');
  sessionStorage.setItem('gamesAdminKey', key);
  const response = await fetch('/api/admin/update', { method, headers: { 'x-admin-key': key }, cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unbekannter Fehler');
  return result;
}
check.onclick = async () => {
  check.disabled = true; install.classList.add('hidden'); message('Prüfe GitHub …');
  try {
    const r = await request('GET');
    if (r.blocked) message('Update blockiert: lokale Änderungen oder abweichende Git-Historie.');
    else if (r.available) { message('Update verfügbar! Neuer Stand: ' + r.remote); install.classList.remove('hidden'); }
    else message('Du hast bereits die neueste Version (' + r.current + ').');
  } catch (e) { message(e.message); }
  finally { check.disabled = false; }
};
install.onclick = async () => {
  if (!confirm('Update installieren? Der Server startet danach neu.')) return;
  install.disabled = true; check.disabled = true; message('Installiere Update …');
  try {
    const r = await request('POST');
    message(r.message + (r.updated ? ' Bitte gleich die Seite neu laden.' : ''));
    install.classList.add('hidden');
  } catch (e) { message(e.message); install.disabled = false; check.disabled = false; }
};
