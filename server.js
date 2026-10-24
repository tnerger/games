'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('node:crypto');
const uno = require('./uno');
const bots = require('./bots');
const skyjo = require('./skyjo');
const gameRegistry=require('./game-registry');
const fs = require('node:fs');
const path = require('node:path');
const accounts = require('./accounts');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 10000 });
const PORT = Number(process.env.PORT || 3000);
const rooms = new Map();
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'rooms.json');
const gameLimits={uno:{min:2,max:6},skyjo:{min:2,max:6},wizard:{min:3,max:6},elfer:{min:2,max:6},rommy:{min:2,max:4}};
const validName = name => typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 24;
const validId = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
const code = () => crypto.randomBytes(3).toString('hex').toUpperCase();
function save() {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = dataFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify([...rooms.values()].map(r => ({
    code: r.code, host: r.host, name:r.name||'', isPublic:!!r.isPublic, lastPlayed:r.lastPlayed||Date.now(), scores:r.scores||{}, skyjoScores:r.skyjoScores||{}, wizardScores:r.wizardScores||{}, elferScores:r.elferScores||{}, selectedGame:r.selectedGame||'uno', options:r.options||uno.defaults, players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, bot:p.bot||null }))
  }))));
  fs.renameSync(tmp, dataFile);
}
try {
  for (const r of JSON.parse(fs.readFileSync(dataFile, 'utf8'))) {
    if (!/^[A-F0-9]{6}$/.test(r.code) || !Array.isArray(r.players)) continue;
    rooms.set(r.code, { code: r.code, host: r.host, name:typeof r.name==='string'?r.name.slice(0,40):'', isPublic:!!r.isPublic, lastPlayed:Number.isFinite(r.lastPlayed)?r.lastPlayed:Date.now(), scores:r.scores||{},skyjoScores:r.skyjoScores||{},wizardScores:r.wizardScores||{},elferScores:r.elferScores||{},selectedGame:r.selectedGame||'uno', options:{...uno.defaults,...(r.options||{})}, players: new Map(r.players.filter(p => validId(p.id) && validName(p.name)).map(p => [p.id, { ...p, online: !!p.bot }])) });
  }
} catch (err) { if (err.code !== 'ENOENT') console.error('Spielstände konnten nicht geladen werden:', err.message); }
const json = express.json({limit:'4kb'});
const cookieName = 'games_session';
function cookieToken(req) {
  const value = (req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='));
  return value ? value.slice(cookieName.length+1) : null;
}
function currentUser(req) { return accounts.getSession(cookieToken(req)); }
function requireUser(req,res,next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({error:'Bitte anmelden.'});
  if (user.must_change) return res.status(403).json({error:'Bitte zuerst das Passwort ändern.'});
  req.user = user;next();
}
function requireAdmin(req,res,next) {
  if (!req.user.is_admin) return res.status(403).json({error:'Nur Administratoren.'});
  next();
}
const loginAttempts = new Map();
function loginAllowed(ip) {
  const entry=loginAttempts.get(ip);
  return !entry || Date.now()-entry.time>15*60000 || entry.count<10;
}
app.use((req,res,next)=>{
  if (req.path.startsWith('/api/')) {
    res.set('Cache-Control','no-store');
    res.set('X-Content-Type-Options','nosniff');
  }
  next();
});
app.post('/api/auth/login',json,(req,res)=>{
  const ip=req.ip;
  if (!loginAllowed(ip)) return res.status(429).json({error:'Zu viele Versuche. Bitte später erneut versuchen.'});
  const user=accounts.authenticate(req.body?.username,req.body?.password);
  if (!user) {
    const old=loginAttempts.get(ip);
    loginAttempts.set(ip,{time:Date.now(),count:old&&Date.now()-old.time<15*60000?old.count+1:1});
    return res.status(401).json({error:'Anmeldung fehlgeschlagen.'});
  }
  loginAttempts.delete(ip);
  const token=accounts.createSession(user.id);
  res.cookie(cookieName,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:7*86400000});
  res.json({user:accounts.safeUser(user)});
});
app.post('/api/auth/logout',(req,res)=>{
  accounts.destroySession(cookieToken(req));
  res.clearCookie(cookieName,{path:'/',sameSite:'strict',secure:process.env.NODE_ENV==='production'});
  res.json({ok:true});
});
app.get('/api/auth/me',(req,res)=>{
  const user=currentUser(req);
  res.json({user:accounts.safeUser(user)});
});
app.post('/api/auth/change-password',json,(req,res)=>{
  const user=currentUser(req);
  if (!user) return res.status(401).json({error:'Bitte anmelden.'});
  if (!user.must_change && !accounts.verifyPassword(req.body?.oldPassword || '',user.password_hash))
    return res.status(403).json({error:'Aktuelles Passwort falsch.'});
  try {
    accounts.changePassword(user.id,req.body?.newPassword);
    accounts.destroySession(cookieToken(req));
    res.clearCookie(cookieName,{path:'/',sameSite:'strict',secure:process.env.NODE_ENV==='production'});
    res.json({ok:true});
  } catch(e){res.status(400).json({error:e.message});}
});
function sameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    const expected = new URL('https://' + req.get('host'));
    const received = new URL(origin);
    if (received.protocol === expected.protocol && received.host === expected.host) return next();
    if (process.env.NODE_ENV !== 'production' && received.host === req.get('host')) return next();
  } catch {}
  return res.status(403).json({error:'Ungültiger Anfrageursprung.'});
}
app.post('/api/profile/username',json,sameOrigin,(req,res)=>{
  const user=currentUser(req);
  if (!user) return res.status(401).json({error:'Bitte anmelden.'});
  if (user.must_change) return res.status(403).json({error:'Bitte zuerst das Passwort ändern.'});
  if (!accounts.verifyPassword(req.body?.currentPassword || '',user.password_hash))
    return res.status(403).json({error:'Aktuelles Passwort falsch.'});
  try { res.json({user:accounts.changeUsername(user.id,req.body?.username)}); }
  catch(e) { res.status(400).json({error:e.message}); }
});
app.post('/api/profile/password',json,sameOrigin,(req,res)=>{
  const user=currentUser(req);
  if (!user) return res.status(401).json({error:'Bitte anmelden.'});
  if (user.must_change) return res.status(403).json({error:'Bitte zuerst das Passwort ändern.'});
  if (!accounts.verifyPassword(req.body?.currentPassword || '',user.password_hash))
    return res.status(403).json({error:'Aktuelles Passwort falsch.'});
  try {
    accounts.validateNewPassword(req.body?.newPassword,user.username,user.password_hash);
    accounts.changePassword(user.id,req.body.newPassword);
    res.clearCookie(cookieName,{path:'/',sameSite:'strict',secure:process.env.NODE_ENV==='production'});
    res.json({ok:true});
  } catch(e) { res.status(400).json({error:e.message}); }
});
app.get('/api/admin/users',requireUser,requireAdmin,(req,res)=>res.json({users:accounts.listUsers()}));
app.post('/api/admin/users',requireUser,requireAdmin,json,(req,res)=>{
  try {res.json({user:accounts.createUser(req.body?.username,req.body?.password)});}
  catch(e){res.status(400).json({error:e.message.includes('UNIQUE')?'Benutzername bereits vergeben.':e.message});}
});
app.post('/api/admin/users/:id',requireUser,requireAdmin,json,(req,res)=>{
  const target=accounts.getUser(req.params.id);
  if (!target) return res.status(404).json({error:'Benutzer nicht gefunden.'});
  const action=req.body?.action;
  if (target.is_admin && action!=='reset') return res.status(403).json({error:'Administratorkonto geschützt.'});
  try {
    if (action==='reset') accounts.changePassword(target.id,req.body?.password,true);
    else if (action==='disable'||action==='enable') accounts.setDisabled(target.id,action==='disable');
    else return res.status(400).json({error:'Unbekannte Aktion.'});
    res.json({ok:true});
  } catch(e){res.status(400).json({error:e.message});}
});
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/version', (_, res) => res.json({ version: require('./package.json').version }));

const { execFile } = require('node:child_process');
const adminToken = fs.readFileSync(path.join(dataDir, 'admin-token'), 'utf8').trim();
let updating = false;
let checking = false;
let failedAuth = new Map();
function adminAuth(req, res, next) {
  const ip = req.ip;
  const record = failedAuth.get(ip);
  if (record && record.count >= 5 && Date.now() - record.at < 60000) return res.status(429).json({ error: 'Zu viele Versuche. Bitte eine Minute warten.' });
  const candidate = req.get('x-admin-key') || '';
  const a = Buffer.from(candidate);
  const b = Buffer.from(adminToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    failedAuth.set(ip, { count: (record && Date.now() - record.at < 60000 ? record.count : 0) + 1, at: Date.now() });
    return res.status(401).json({ error: 'Admin-Schlüssel ungültig.' });
  }
  failedAuth.delete(ip);
  next();
}
function git(args) {
  return new Promise((resolve, reject) => execFile('git', args, { cwd: __dirname, timeout: 30000 }, (err, stdout) => err ? reject(err) : resolve(stdout.trim())));
}
app.get('/api/admin/update', adminAuth, async (req, res) => {
  if (checking || updating) return res.status(409).json({ error: 'Ein Update läuft bereits.' });
  checking = true;
  try {
    await git(['fetch', 'origin', 'main']);
    const local = await git(['rev-parse', 'HEAD']);
    const remote = await git(['rev-parse', 'origin/main']);
    const status = await git(['status', '--porcelain', '--untracked-files=no']);
    const ff = await git(['merge-base', '--is-ancestor', local, remote]).then(() => true, () => false);
    res.json({ current: require('./package.json').version, available: local !== remote && ff && !status, blocked: !!status || !ff, remote: remote.slice(0, 8) });
  } catch (err) { res.status(500).json({ error: 'GitHub-Prüfung fehlgeschlagen: ' + err.message }); }
  finally { checking = false; }
});
app.post('/api/admin/update', adminAuth, express.json({ limit: '1kb' }), async (req, res) => {
  if (checking || updating) return res.status(409).json({ error: 'Update läuft bereits.' });
  if ([...rooms.values()].some(r => [...r.players.values()].some(p => p.online))) return res.status(409).json({ error: 'Spieler sind noch in Räumen verbunden. Bitte erst alle Räume verlassen.' });
  updating = true;
  try {
    await git(['fetch', 'origin', 'main']);
    const local = await git(['rev-parse', 'HEAD']);
    const remote = await git(['rev-parse', 'origin/main']);
    if (local === remote) { updating = false; return res.json({ updated: false, message: 'Bereits aktuell.' }); }
    if (await git(['status', '--porcelain', '--untracked-files=no'])) throw new Error('Lokale Änderungen verhindern das Update.');
    await git(['merge-base', '--is-ancestor', local, remote]);
    const { execFile: exec } = require('node:child_process');
    await new Promise((resolve, reject) => exec('bash', ['update.sh'], { cwd: __dirname, timeout: 120000 }, (err, stdout, stderr) => err ? reject(new Error((stderr || stdout || err.message).slice(0, 400))) : resolve()));
    res.json({ updated: true, message: 'Update installiert. Server startet neu.' });
    setTimeout(() => process.exit(42), 800);
  } catch (err) { updating = false; res.status(500).json({ error: 'Update fehlgeschlagen: ' + err.message }); }
});

const publicRoom = r => ({ code: r.code, host: r.host, name:r.name||'', isPublic:!!r.isPublic, players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, online: p.online, bot:p.bot||null })), gameStarted:!!r.game, gameRules:r.options||uno.defaults,scores:r.scores||{},skyjoScores:r.skyjoScores||{},wizardScores:r.wizardScores||{},elferScores:r.elferScores||{},selectedGame:r.selectedGame||'uno',activeGame:r.gameType||null });
function publishGame(r) { if(!r.game)return;const engine=gameRegistry.get(r.gameType||'uno');for(const p of r.players.values())io.to(r.code).emit('game:notice',{code:r.code});for(const socket of io.sockets.sockets.values()){if(socket.data.room===r.code)socket.emit('game:state',engine.view(r.game,socket.data.player));} }

const botTimers=new Map();
function scheduleBot(r){
 if(!r.game||r.game.finished)return;
 const revealing=r.gameType==='skyjo'&&r.game.phase==='reveal';
 const id=revealing?r.game.players.find(pid=>r.players.get(pid)?.bot&&(r.game.revealed[pid]||0)<2):r.game.players[r.game.turn];
 const player=r.players.get(id);
 if(r.gameType==='uno'&&r.game.autoPenalty){
  if(botTimers.has(r.code))return;
  const game=r.game;
  const timer=setTimeout(()=>{botTimers.delete(r.code);if(r.game!==game||!game.autoPenalty||game.finished)return;try{performAction(r,game.players[game.turn],{type:'draw'});}catch(err){console.error('Automatische UNO-Strafe:',err.message);}},1250);
  botTimers.set(r.code,timer);return;
 }
 if(!player?.bot||botTimers.has(r.code))return;
 const delay=revealing?450:r.gameType==='wizard'?850:r.gameType==='skyjo'&&['replace','flip'].includes(r.game.phase)?650:r.gameType==='rommy'?3400:2400;
 const game=r.game;
 const timer=setTimeout(()=>{
  botTimers.delete(r.code);
  if(r.game!==game||game.finished)return;
  if(revealing?(game.phase!=='reveal'||(game.revealed[id]||0)>=2):game.players[game.turn]!==id)return scheduleBot(r);
  try{
   const action=gameRegistry.get(r.gameType).bot(game,id,player.bot);
   performAction(r,id,action);
  }catch(err){
   console.error('Bot-Fehler:',err.message);
   scheduleBot(r);
  }
 },delay);
 botTimers.set(r.code,timer);
}
function performAction(r,id,action){
 r.lastPlayed=Date.now();save();
 const wasFinished=r.game.finished;
 const before=r.gameType==='uno'?r.game.log.length:0;
 gameRegistry.get(r.gameType).act(r.game,id,action);
 const entries=r.gameType==='uno'?r.game.log.slice(before):[];
 if(!r.game.events)r.game.events=[{id:0,at:Date.now(),actor:null,text:'Die Runde wurde gestartet.'}];
 for(const entry of entries){r.game.events.push({id:r.game.events.length,at:Date.now(),actor:id,text:entry});}
 if(!wasFinished&&r.game.finished&&r.gameType==='wizard'){r.wizardScores=r.game.scores;save();publish(r);}
 if(!wasFinished&&r.game.finished&&r.gameType==='elfer'){r.elferScores=r.game.scores;save();publish(r);}
 if(!wasFinished&&r.game.finished&&r.gameType==='skyjo'){r.skyjoScores=r.game.scores;save();publish(r);}
 if(!wasFinished&&r.game.finished&&r.gameType==='uno'){const winner=r.game.winner;const points=Object.entries(r.game.hands).filter(([pid])=>pid!==winner).flatMap(([,hand])=>hand).reduce((sum,c)=>sum+(c.value==='wild'||c.value==='wild4'?50:['skip','reverse','draw2'].includes(c.value)?20:Number(c.value)||0),0);const score=r.scores[winner]||{wins:0,points:0};r.scores[winner]={wins:score.wins+1,points:score.points+points};save();publish(r);}
 publishGame(r);scheduleBot(r);
}
function publicRooms(){
 return [...rooms.values()].filter(r=>r.isPublic).map(r=>({
  code:r.code,name:r.name||r.code,game:r.selectedGame||'uno',
  players:r.players.size,maxPlayers:gameLimits[r.selectedGame||'uno'].max,
  playing:!!r.game
 })).sort((a,b)=>a.name.localeCompare(b.name,'de'));
}
function publishRooms(){io.emit('rooms:public',publicRooms());}
function publish(r) { io.to(r.code).emit('room', publicRoom(r));publishRooms(); }
const ROOM_TTL=24*60*60*1000;
function cleanupRooms(){
 let changed=false;
 for(const [id,r] of rooms){
  if(Date.now()-(r.lastPlayed||0)<ROOM_TTL)continue;
  const timer=botTimers.get(id);if(timer)clearTimeout(timer);botTimers.delete(id);
  io.to(id).emit('room:removed',{message:'Der Raum wurde nach 24 Stunden ohne Spielaktivität gelöscht.'});
  for(const client of io.sockets.sockets.values()){
   if(client.data.room===id){client.leave(id);client.data.room=null;client.data.player=null;}
  }
  rooms.delete(id);changed=true;
 }
 if(changed){save();publishRooms();}
}
setInterval(cleanupRooms,60*60*1000).unref();
setImmediate(cleanupRooms);
function respond(ack, data) { if (typeof ack === 'function') ack(data); }
io.use((socket,next)=>{
  const header=socket.request.headers.cookie || '';
  const pair=header.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));
  const user=accounts.getSession(pair?.slice(cookieName.length+1));
  if (!user || user.must_change) return next(new Error('Anmeldung erforderlich.'));
  socket.data.accountId=user.id;
  socket.data.sessionToken=pair?.slice(cookieName.length+1);
  next();
});
io.on('connection', socket => {
  socket.use((packet,next)=>{
    const user=accounts.getSession(socket.data.sessionToken);
    if (!user || user.id!==socket.data.accountId || user.disabled || user.must_change) return next(new Error('Konto nicht freigegeben.'));
    next();
  });
  function leave() {
    if (!socket.data.room) return;
    const r = rooms.get(socket.data.room);
    if (r) {
      const p = r.players.get(socket.data.player);
      if (p) {
        const other = [...io.sockets.sockets.values()].some(s => s.id !== socket.id && s.data.room === r.code && s.data.player === p.id);
        p.online = other;
      }
      socket.leave(r.code);
      publish(r);
    }
    socket.data.room = null;
    socket.data.player = null;
  }
  function joinRoom(r, identity, ack) {
    if (identity?.id !== socket.data.accountId || !validName(identity?.name)) return respond(ack, { error: 'Ungültige Spielerkennung.' });
    identity = {id:socket.data.accountId,name:accounts.getUser(socket.data.accountId).username};
    const old = r.players.get(identity.id);
    if (old?.bot) return respond(ack,{error:'Dieser Platz gehört einem Bot.'});
    if (!old && r.game) return respond(ack,{error:'Beitritt während eines laufenden Spiels nicht möglich.'});
    if (!old && r.players.size >= gameLimits[r.selectedGame||'uno'].max) return respond(ack, { error: 'Dieser Raum ist voll.' });
    if (socket.data.room) leave();
    if (!old) r.players.set(identity.id, { id: identity.id, name: identity.name.trim(), online: true });
    else { old.name = identity.name.trim(); old.online = true; }
    socket.join(r.code);
    socket.data.room = r.code;
    socket.data.player = identity.id;
    save();
    publish(r);
    if(r.game) socket.emit('game:state',gameRegistry.get(r.gameType||'uno').view(r.game,identity.id));
    respond(ack, { ok: true, room: publicRoom(r) });
  }
  socket.on('rooms:list',(_,ack)=>respond(ack,{rooms:publicRooms()}));
  socket.on('create', (payload, ack) => {
    const identity=payload?.identity||payload;
    if (identity?.id !== socket.data.accountId) return respond(ack, { error: 'Bitte anmelden.' });
    const name=typeof payload?.roomName==='string'?payload.roomName.trim():'';
    if(name.length>40||(!name&&payload?.isPublic))return respond(ack,{error:'Öffentliche Räume benötigen einen Namen mit maximal 40 Zeichen.'});
    const owner={id:socket.data.accountId,name:accounts.getUser(socket.data.accountId).username};
    let c;
    do { c = code(); } while (rooms.has(c));
    const r = { code: c, host: owner.id, name, isPublic:payload?.isPublic===true, lastPlayed:Date.now(), scores:{},skyjoScores:{},wizardScores:{},elferScores:{},selectedGame:'uno',options:{...uno.defaults}, players: new Map() };
    rooms.set(c, r);
    joinRoom(r, owner, ack);
  });
  socket.on('join', ({ code: c, identity } = {}, ack) => {
    const r = rooms.get(String(c || '').toUpperCase());
    if (!r) return respond(ack, { error: 'Raum nicht gefunden.' });
    joinRoom(r, identity, ack);
  });
  socket.on('room:kick',(id,ack)=>{
    const r=rooms.get(socket.data.room);
    if(!r||r.host!==socket.data.player)return respond(ack,{error:'Nur der Raumleiter darf Mitspieler entfernen.'});
    if(r.game)return respond(ack,{error:'Während einer Partie können keine Spieler entfernt werden.'});
    if(id===r.host||!r.players.has(id))return respond(ack,{error:'Dieser Spieler kann nicht entfernt werden.'});
    r.players.delete(id);
    for(const client of io.sockets.sockets.values()){
      if(client.data.room===r.code&&client.data.player===id){
        client.emit('room:kicked',{message:'Du wurdest vom Raumleiter entfernt.'});
        client.leave(r.code);client.data.room=null;client.data.player=null;
      }
    }
    save();publish(r);respond(ack,{ok:true});
  });
  socket.on('bot:add',(settings,ack)=>{const r=rooms.get(socket.data.room);if(!r||r.host!==socket.data.player||r.game)return respond(ack,{error:'Bots können nur vor dem Spiel vom Raumleiter hinzugefügt werden.'});const difficulty=typeof settings==='string'?settings:settings?.difficulty;const requested=typeof settings==='object'?settings?.name:null;if(!['easy','normal','hard'].includes(difficulty))return respond(ack,{error:'Unbekannte Schwierigkeit.'});if(r.players.size>=6)return respond(ack,{error:'Maximal sechs Spieler.'});const id=crypto.randomBytes(16).toString('hex');const names={easy:'Leicht',normal:'Normal',hard:'Schwer'};const n=[...r.players.values()].filter(p=>p.bot).length+1;const name=typeof requested==='string'&&requested.trim()?requested.trim():'Bot '+n;if(!validName(name))return respond(ack,{error:'Der Bot-Name muss 1 bis 24 Zeichen lang sein.'});r.players.set(id,{id,name,bot:difficulty,online:true});save();publish(r);respond(ack,{ok:true});});
  socket.on('bot:remove',(id,ack)=>{const r=rooms.get(socket.data.room);if(!r||r.host!==socket.data.player||r.game||!r.players.get(id)?.bot)return respond(ack,{error:'Bot kann nicht entfernt werden.'});r.players.delete(id);save();publish(r);respond(ack,{ok:true});});
  socket.on('room:select-game',(type,ack)=>{const r=rooms.get(socket.data.room);if(!r||r.host!==socket.data.player||r.game)return respond(ack,{error:'Spielwechsel nur zwischen Runden durch den Raumleiter.'});if(!['uno','skyjo','wizard','elfer','rommy'].includes(type))return respond(ack,{error:'Unbekanntes Spiel.'});r.selectedGame=type;save();publish(r);respond(ack,{ok:true});});
  socket.on('game:configure', (options, ack) => {
    const r=rooms.get(socket.data.room);
    if(!r||r.host!==socket.data.player||r.game)return respond(ack,{error:'Nur der Raumleiter kann vor dem Start Regeln ändern.'});
    if(!options||typeof options!=='object')return respond(ack,{error:'Ungültige Regeln.'});
    r.options=Object.fromEntries(Object.keys(uno.defaults).map(k=>[k,options[k]===true]));
    save();publish(r);respond(ack,{ok:true});
  });
  socket.on('game:start', (_,ack)=>{
    const r=rooms.get(socket.data.room);
    if(!r||r.host!==socket.data.player||r.game)return respond(ack,{error:'Spiel kann nicht gestartet werden.'});
    const limit=gameLimits[r.selectedGame||'uno'];if(r.players.size<limit.min||r.players.size>limit.max)return respond(ack,{error:'Dieses Spiel benötigt '+limit.min+' bis '+limit.max+' Spieler.'});
    if([...r.players.values()].some(p=>!p.online))return respond(ack,{error:'Alle Spieler müssen online sein.'});
    r.gameType=r.selectedGame||'uno';if(r.gameType==='skyjo')r.skyjoScores={};if(r.gameType==='wizard')r.wizardScores={};if(r.gameType==='elfer')r.elferScores={};r.game=gameRegistry.get(r.gameType).create([...r.players.keys()],r);r.lastPlayed=Date.now();save();
    publish(r);publishGame(r);scheduleBot(r);respond(ack,{ok:true});
  });
  socket.on('game:action',(action,ack)=>{
    const r=rooms.get(socket.data.room);
    if(!r?.game)return respond(ack,{error:'Kein Spiel aktiv.'});
    if(r.gameType==='uno'&&r.game.autoPenalty)return respond(ack,{error:'Strafkarten werden automatisch gezogen.'});
    try{performAction(r,socket.data.player,action);respond(ack,{ok:true});}
    catch(err){respond(ack,{error:err.message});}
  });
  socket.on('game:restart',(_,ack)=>{const r=rooms.get(socket.data.room);if(!r||r.host!==socket.data.player||!r.game?.finished)return respond(ack,{error:'Nur der Raumleiter kann nach Spielende eine neue Runde starten.'});if([...r.players.values()].some(p=>!p.online))return respond(ack,{error:'Alle Spieler müssen online sein.'});if(r.gameType==='wizard'){if(r.game.matchFinished){r.wizardScores={};r.game=gameRegistry.get('wizard').create([...r.players.keys()],r);}else gameRegistry.get('wizard').restart(r.game);}else {if(r.gameType==='skyjo'&&r.game.matchFinished){r.skyjoScores={};save();}r.game=gameRegistry.get(r.gameType).create([...r.players.keys()],r);}r.lastPlayed=Date.now();save();publish(r);publishGame(r);scheduleBot(r);respond(ack,{ok:true});});
  socket.on('room:finish-game',(_,ack)=>{const r=rooms.get(socket.data.room);if(!r||r.host!==socket.data.player||!r.game)return respond(ack,{error:'Nur der Raumleiter kann das laufende Spiel beenden.'});const cancelled=!r.game.finished;const hostName=r.players.get(socket.data.player)?.name||'Der Raumleiter';const timer=botTimers.get(r.code);if(timer)clearTimeout(timer);botTimers.delete(r.code);r.game=null;r.gameType=null;save();publish(r);if(cancelled)io.to(r.code).emit('game:cancelled',{by:hostName,hostId:socket.data.player});respond(ack,{ok:true});});
  socket.on('leave', (_, ack) => { leave(); respond(ack, { ok: true }); });
  socket.on('disconnect', leave);
});
const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => console.log('Games läuft auf ' + HOST + ':' + PORT));
