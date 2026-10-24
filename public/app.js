'use strict';
const $ = id => document.getElementById(id);
const socket = io({ reconnection: true });
let roomCode = sessionStorage.getItem('gamesRoom') || '';
let identity;
try { identity = JSON.parse(localStorage.getItem('gamesIdentity')); } catch {}
if (!identity?.id || !identity?.name) identity = null;
function show(page) { for (const id of ['login','lobby','room']) $(id).classList.toggle('hidden', id !== page); }
function status(message) { $('status').textContent = message || ''; }
function enter() { if (identity) { $('greeting').textContent = identity.name; show('lobby'); } else show('login'); }
function emit(event, payload, callback) {
  if (!socket.connected) return status('Keine Verbindung zum Server.');
  socket.timeout(7000).emit(event, payload, (err, result) => {
    if (err) return status('Der Server antwortet nicht. Bitte erneut versuchen.');
    if (result?.error) return status(result.error);
    status('');
    callback?.(result);
  });
}
const botDifficulty={easy:'🟢',normal:'🟡',hard:'🔴'};
const botDifficultyName={easy:'Leicht',normal:'Normal',hard:'Schwer'};
function playerName(p){return p.name+(p.bot?' '+(botDifficulty[p.bot]||'🤖'):'');}
function renderRoom(r) {
  if (r.code !== roomCode) return;
  show('room');
  $('room-title').textContent = r.code;
  $('count').textContent = '(' + r.players.length + '/6)';
  $('players').replaceChildren(...r.players.map(p => {
    const li = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = playerName(p) + (p.id === r.host ? ' 👑' : '') + (p.id === identity.id ? ' (du)' : '');
    if(p.bot)name.title='Bot · Schwierigkeit: '+(botDifficultyName[p.bot]||p.bot);
    const online = document.createElement('span');
    online.textContent = p.online ? '● Online' : '○ Offline';
    li.append(name, online);
    return li;
  }));
}
$('continue').onclick = () => {
  const name = $('name').value.trim();
  if (!name || name.length > 24) return status('Bitte einen Namen mit maximal 24 Zeichen eingeben.');
  identity = { id: identity?.id || [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2,'0')).join(''), name };
  localStorage.setItem('gamesIdentity', JSON.stringify(identity));
  status(''); enter();
};
$('name').addEventListener('keydown', e => { if (e.key === 'Enter') $('continue').click(); });
$('create').onclick = () => emit('create', identity, result => {
  roomCode = result.room.code; sessionStorage.setItem('gamesRoom', roomCode); renderRoom(result.room);
});
$('join').onclick = () => {
  const code = $('roomcode').value.trim().toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(code)) return status('Bitte einen sechsstelligen Raumcode eingeben.');
  emit('join', { code, identity }, result => {
    roomCode = result.room.code; sessionStorage.setItem('gamesRoom', roomCode); renderRoom(result.room);
  });
};
$('rename').onclick = () => { $('name').value = identity.name; show('login'); };
$('leave').onclick = () => emit('leave', {}, () => { roomCode = ''; sessionStorage.removeItem('gamesRoom'); enter(); });
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(roomCode); status('Raumcode kopiert.'); }
  catch { status('Raumcode: ' + roomCode); }
};
socket.on('room', renderRoom);
socket.on('connect', () => {
  status('');
  if (roomCode && identity) emit('join', { code: roomCode, identity }, result => renderRoom(result.room));
});
socket.on('disconnect', () => status('Verbindung unterbrochen – wir verbinden erneut …'));
fetch('/api/version').then(r => r.json()).then(r => $('version').textContent = 'v' + r.version).catch(()=>{});
enter();
