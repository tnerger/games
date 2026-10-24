'use strict';
const $ = id => document.getElementById(id);
const socket = io({ reconnection: true, autoConnect:false });
let roomCode = sessionStorage.getItem('gamesRoom') || '';
let identity = null;
let account = null;
function closeAccountMenu(){
 $('account-menu').classList.add('hidden');
 $('account-menu-toggle').setAttribute('aria-expanded','false');
}
function show(page) {
 for (const id of ['auth-login','auth-change','profile','admin-users','login','lobby','room']) $(id).classList.toggle('hidden', id !== page);
 const signedIn=!!account&&!account.mustChange;
 $('account-menu-wrap').classList.toggle('hidden',!signedIn);
 $('auth-logout').classList.toggle('hidden',!signedIn);
 closeAccountMenu();
}
function status(message) { $('status').textContent = message || ''; }
function enter() { if (identity) { $('greeting').textContent = identity.name; show('lobby');if(socket.connected)emit('rooms:list',{},data=>renderPublicRooms(data.rooms)); } else show('auth-login'); }
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
$('auth-logout').onclick=async(e)=>{
 e.preventDefault();
 await request('/api/auth/logout','POST');
 socket.disconnect();account=null;identity=null;roomCode='';sessionStorage.removeItem('gamesRoom');show('auth-login');
};
$('account-menu-toggle').onclick=()=>{
 const open=$('account-menu').classList.toggle('hidden')===false;
 $('account-menu-toggle').setAttribute('aria-expanded',String(open));
};
document.addEventListener('click',e=>{
 if(!$('account-menu-wrap').contains(e.target))closeAccountMenu();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAccountMenu();});
$('profile-open').onclick=()=>{
 $('profile-current-name').textContent=account.username;
 closeProfileDialogs();
 status('');
 show('profile');
};
function closeProfileDialogs(){
 for(const id of ['profile-name-dialog','profile-password-dialog'])$(id).classList.add('hidden');
 for(const id of ['profile-name-password','profile-old-password','profile-new-password','profile-confirm-password'])$(id).value='';
 $('profile-name-error').textContent='';
 $('profile-password-error').textContent='';
}
$('profile-back').onclick=()=>{closeProfileDialogs();status('');enter();};
$('profile-name-open').onclick=()=>{
 closeProfileDialogs();
 $('profile-name').value=account.username;
 $('profile-name-dialog').classList.remove('hidden');
 $('profile-name').focus();
};
$('profile-password-open').onclick=()=>{
 closeProfileDialogs();
 $('profile-password-dialog').classList.remove('hidden');
 $('profile-old-password').focus();
};
$('profile-name-cancel').onclick=closeProfileDialogs;
$('profile-password-cancel').onclick=closeProfileDialogs;
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&!$('profile').classList.contains('hidden'))closeProfileDialogs();
});

$('profile-name-submit').onclick=async()=>{
 const username=$('profile-name').value.trim();
 const currentPassword=$('profile-name-password').value;
 if(!/^[a-zA-Z0-9_.-]{3,24}$/.test(username))return $('profile-name-error').textContent='Benutzername: 3–24 Zeichen (Buchstaben, Ziffern, _, ., -).';
 try{
  const data=await request('/api/profile/username','POST',{username,currentPassword});
  account=data.user;
  identity={id:account.id,name:account.username};
  $('greeting').textContent=account.username;
  $('profile-current-name').textContent=account.username;
  closeProfileDialogs();
  status('Benutzername gespeichert. Bei bestehenden Räumen erscheint der neue Name nach erneutem Beitritt.');
 }catch(e){$('profile-name-error').textContent=e.message;}
};
$('profile-password-submit').onclick=async()=>{
 const currentPassword=$('profile-old-password').value;
 const newPassword=$('profile-new-password').value;
 if(newPassword!==$('profile-confirm-password').value)return $('profile-password-error').textContent='Passwörter stimmen nicht überein.';
 if(newPassword.length<12||newPassword.length>256)return $('profile-password-error').textContent='Passwort muss 12–256 Zeichen lang sein.';
 try{
  await request('/api/profile/password','POST',{currentPassword,newPassword});
  $('profile-old-password').value='';
  $('profile-new-password').value='';
  $('profile-confirm-password').value='';
  closeProfileDialogs();socket.disconnect();account=null;identity=null;roomCode='';sessionStorage.removeItem('gamesRoom');
  $('auth-password').value='';
  status('Passwort geändert. Bitte erneut anmelden.');
  show('auth-login');
 }catch(e){$('profile-password-error').textContent=e.message;}
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
  $('room-name-display').textContent=r.name||'';
  $('players').replaceChildren(...r.players.map(p => {
    const li = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = playerName(p) + (p.id === r.host ? ' 👑' : '') + (p.id === identity.id ? ' (du)' : '');
    if(p.bot)name.title='Bot · Schwierigkeit: '+(botDifficultyName[p.bot]||p.bot);
    const online = document.createElement('span');
    online.textContent = p.online ? '● Online' : '○ Offline';
    li.append(name, online);
    if(r.host===identity.id&&p.id!==identity.id&&!r.gameStarted){
      const kick=document.createElement('button');
      kick.type='button';kick.className='secondary room-kick';kick.textContent='Entfernen';
      kick.onclick=()=>{if(confirm(p.name+' aus dem Raum entfernen?'))emit('room:kick',p.id);};
      li.append(kick);
    }
    return li;
  }));
}
const gameLabels={uno:'UNO',skyjo:'Skyjo',wizard:'Wizard',elfer:'11er Raus',rommy:'RommyCup'};
function renderPublicRooms(rooms){
 const list=$('public-rooms-list');list.replaceChildren();
 if(!rooms?.length){const p=document.createElement('p');p.textContent='Keine öffentlichen Räume vorhanden.';list.append(p);return;}
 for(const r of rooms){
  const item=document.createElement('div');item.className='public-room-entry';
  const details=document.createElement('div');
  const title=document.createElement('strong');title.textContent=r.name;
  const info=document.createElement('p');info.textContent=(gameLabels[r.game]||r.game)+' · '+r.players+'/'+r.maxPlayers+' Spieler · '+(r.playing?'Spiel läuft':'Wartet auf Spieler');
  details.append(title,info);
  const join=document.createElement('button');join.type='button';join.className='secondary';join.textContent='Beitreten';
  join.disabled=r.playing||r.players>=r.maxPlayers;
  join.onclick=()=>joinByCode(r.code);
  item.append(details,join);list.append(item);
 }
}
function joinByCode(code){
 emit('join',{code,identity},result=>{
  roomCode=result.room.code;sessionStorage.setItem('gamesRoom',roomCode);renderRoom(result.room);
 });
}
$('create').onclick=()=>{
 $('create-room-name').value='';
 $('create-room-public').checked=false;
 $('create-room-error').textContent='';
 $('create-room-dialog').classList.remove('hidden');
 $('create-room-name').focus();
};
$('create-room-cancel').onclick=()=>$('create-room-dialog').classList.add('hidden');
$('create-room-confirm').onclick=()=>{
 const roomName=$('create-room-name').value.trim();
 const isPublic=$('create-room-public').checked;
 if(isPublic&&!roomName)return $('create-room-error').textContent='Bitte gib dem öffentlichen Raum einen Namen.';
 emit('create',{identity,roomName,isPublic},result=>{
  $('create-room-dialog').classList.add('hidden');
  roomCode=result.room.code;sessionStorage.setItem('gamesRoom',roomCode);renderRoom(result.room);
 });
};
$('join').onclick = () => {
  const code = $('roomcode').value.trim().toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(code)) return status('Bitte einen sechsstelligen Raumcode eingeben.');
  joinByCode(code);
};
if ($('rename')) $('rename').onclick = () => status('Der Spielername entspricht deinem Benutzerkonto.');
$('leave').onclick = () => emit('leave', {}, () => { roomCode = ''; sessionStorage.removeItem('gamesRoom'); enter(); });
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(roomCode); status('Raumcode kopiert.'); }
  catch { status('Raumcode: ' + roomCode); }
};
socket.on('room', renderRoom);
socket.on('rooms:public',renderPublicRooms);
socket.on('room:kicked',data=>{
 roomCode='';sessionStorage.removeItem('gamesRoom');enter();status(data?.message||'Du wurdest aus dem Raum entfernt.');
});
socket.on('room:removed',data=>{
 roomCode='';sessionStorage.removeItem('gamesRoom');enter();status(data?.message||'Der Raum wurde gelöscht.');
});
socket.on('connect', () => {
  status('');
  if (roomCode && identity) emit('join', { code: roomCode, identity }, result => renderRoom(result.room));
});
socket.on('disconnect', () => status('Verbindung unterbrochen – wir verbinden erneut …'));
fetch('/api/version').then(r => r.json()).then(r => $('version').textContent = 'v' + r.version).catch(()=>{});
initAuth();
