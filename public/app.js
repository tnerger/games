'use strict';
const $ = id => document.getElementById(id);
const socket = io({ reconnection: true, autoConnect:false });
let roomCode = sessionStorage.getItem('gamesRoom') || '';
let identity = null;
let account = null;
function show(page) { for (const id of ['auth-login','auth-change','admin-users','login','lobby','room']) $(id).classList.toggle('hidden', id !== page); }
function status(message) { $('status').textContent = message || ''; }
function enter() { if (identity) { $('greeting').textContent = identity.name; show('lobby'); } else show('auth-login'); }
async function request(url, method='GET', body) {
 const res=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 const data=await res.json();
 if (!res.ok) throw Error(data.error||'Anfrage fehlgeschlagen.');
 return data;
}
async function initAuth() {
 try {
  const data=await request('/api/auth/me');
  account=data.user;
  if (!account) return show('auth-login');
  if (account.mustChange) return show('auth-change');
  identity={id:account.id,name:account.username};
  socket.connect();enter();
  $('admin-open').classList.toggle('hidden',!account.isAdmin);
 } catch(e){status(e.message);show('auth-login');}
}
$('auth-submit').onclick=async()=>{
 try {
  const data=await request('/api/auth/login','POST',{username:$('auth-username').value.trim(),password:$('auth-password').value});
  $('auth-password').value='';
  account=data.user;
  status('');
  if(account.mustChange)show('auth-change');
  else initAuth();
 }catch(e){status(e.message);}
};
$('auth-password').addEventListener('keydown',e=>{if(e.key==='Enter')$('auth-submit').click();});
$('change-submit').onclick=async()=>{
 const password=$('change-new').value;
 if(password!==$('change-confirm').value)return status('Passwörter stimmen nicht überein.');
 try{
  await request('/api/auth/change-password','POST',{oldPassword:$('change-old').value,newPassword:password});
  $('change-new').value='';$('change-confirm').value='';$('change-old').value='';
  account=null;identity=null;status('Passwort geändert. Bitte erneut anmelden.');show('auth-login');
 }catch(e){status(e.message);}
};
$('auth-logout').onclick=async()=>{
 await request('/api/auth/logout','POST');
 socket.disconnect();account=null;identity=null;roomCode='';sessionStorage.removeItem('gamesRoom');show('auth-login');
};
$('admin-open').onclick=async()=>{show('admin-users');await loadUsers();};
$('admin-back').onclick=()=>enter();
async function loadUsers(){
 try{
  const data=await request('/api/admin/users');
  const list=$('admin-list');list.replaceChildren();
  for(const user of data.users){
   const item=document.createElement('li');
   const label=document.createElement('span');label.textContent=user.username+(user.isAdmin?' (Admin)':'')+(user.disabled?' (gesperrt)':'')+(user.mustChange?' · Passwortwechsel offen':'');
   item.append(label);
   if(!user.isAdmin){
    const toggle=document.createElement('button');toggle.textContent=user.disabled?'Entsperren':'Sperren';toggle.className='secondary';
    toggle.onclick=async()=>{try{await request('/api/admin/users/'+user.id,'POST',{action:user.disabled?'enable':'disable'});loadUsers();}catch(e){status(e.message);}};
    item.append(toggle);
    const reset=document.createElement('button');reset.textContent='Passwort zurücksetzen';reset.className='secondary';
    reset.onclick=async()=>{
     const password=prompt('Neues vorläufiges Passwort (mind. 12 Zeichen):');
     if(password===null)return;
     try{await request('/api/admin/users/'+user.id,'POST',{action:'reset',password});status('Passwort zurückgesetzt.');loadUsers();}catch(e){status(e.message);}
    };
    item.append(reset);
   }
   list.append(item);
  }
 }catch(e){status(e.message);}
}
$('admin-create').onclick=async()=>{
 try{
  await request('/api/admin/users','POST',{username:$('admin-name').value.trim(),password:$('admin-password').value});
  $('admin-name').value='';$('admin-password').value='';status('Benutzer angelegt.');loadUsers();
 }catch(e){status(e.message);}
};

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
if ($('rename')) $('rename').onclick = () => status('Der Spielername entspricht deinem Benutzerkonto.');
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
initAuth();
