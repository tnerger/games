'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('node:crypto');
const uno = require('./uno');
const bots = require('./bots');
const fs = require('node:fs');
const path = require('node:path');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 10000 });
const PORT = Number(process.env.PORT || 3000);
const rooms = new Map();
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'rooms.json');
const validName = name => typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 24;
const validId = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
const code = () => crypto.randomBytes(3).toString('hex').toUpperCase();
function save() {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = dataFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify([...rooms.values()].map(r => ({
    code: r.code, host: r.host, scores:r.scores||{}, players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, bot:p.bot||null }))
  }))));
  fs.renameSync(tmp, dataFile);
}
try {
  for (const r of JSON.parse(fs.readFileSync(dataFile, 'utf8'))) {
    if (!/^[A-F0-9]{6}$/.test(r.code) || !Array.isArray(r.players)) continue;
    rooms.set(r.code, { code: r.code, host: r.host, scores:r.scores||{}, players: new Map(r.players.filter(p => validId(p.id) && validName(p.name)).map(p => [p.id, { ...p, online: !!p.bot }])) });
  }
} catch (err) { if (err.code !== 'ENOENT') console.error('Spielstände konnten nicht geladen werden:', err.message); }
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

const publicRoom = r => ({ code: r.code, host: r.host, players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, online: p.online, bot:p.bot||null })), gameStarted:!!r.game, gameRules:r.options||uno.defaults,scores:r.scores||{} });
function publishGame(r) { if(!r.game)return;for(const p of r.players.values())io.to(r.code).emit('game:notice',{code:r.code});for(const socket of io.sockets.sockets.values()){if(socket.data.room===r.code)socket.emit('game:state',uno.view(r.game,socket.data.player));} }

const botTimers=new Map();
function scheduleBot(r){
 if(!r.game||r.game.finished)return;
 const id=r.game.players[r.game.turn];const player=r.players.get(id);
 if(!player?.bot||botTimers.has(r.code))return;
 const timer=setTimeout(()=>{botTimers.delete(r.code);if(!r.game||r.game.finished||r.game.players[r.game.turn]!==id)return;try{const action=bots.decide(r.game,id,player.bot);performAction(r,id,action);}catch(err){console.error('Bot-Fehler:',err.message);}},850);
 botTimers.set(r.code,timer);
}
function performAction(r,id,action){
 const wasFinished=r.game.finished;
 const before=r.game.log.length;
 uno.act(r.game,id,action);
 const entries=r.game.log.slice(before);
 if(!r.game.events)r.game.events=[{id:0,at:Date.now(),actor:null,text:'Die Runde wurde gestartet.'}];
 for(const entry of entries){r.game.events.push({id:r.game.events.length,at:Date.now(),actor:id,text:entry});}
 if(!wasFinished&&r.game.finished){const winner=r.game.winner;const points=Object.entries(r.game.hands).filter(([pid])=>pid!==winner).flatMap(([,hand])=>hand).reduce((sum,c)=>sum+(c.value==='wild'||c.value==='wild4'?50:['skip','reverse','draw2'].includes(c.value)?20:Number(c.value)||0),0);const score=r.scores[winner]||{wins:0,points:0};r.scores[winner]={wins:score.wins+1,points:score.points+points};save();publish(r);}
 publishGame(r);scheduleBot(r);
}
function publish(r) { io.to(r.code).emit('room', publicRoom(r)); }
function respond(ack, data) { if (typeof ack === 'function') ack(data); }
io.on('connection', socket => {
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
    if (!validId(identity?.id) || !validName(identity?.name)) return respond(ack, { error: 'Ungültiger Name oder Spielerkennung.' });
    const old = r.players.get(identity.id);
    if (old?.bot) return respond(ack,{error:'Dieser Platz gehört einem Bot.'});
    if (!old && r.players.size >= 6) return respond(ack, { error: 'Dieser Raum ist voll.' });
    if (socket.data.room) leave();
    if (!old) r.players.set(identity.id, { id: identity.id, name: identity.name.trim(), online: true });
    else { old.name = identity.name.trim(); old.online = true; }
    socket.join(r.code);
    socket.data.room = r.code;
    socket.data.player = identity.id;
    save();
    publish(r);
    if(r.game) socket.emit('game:state',uno.view(r.game,identity.id));
    respond(ack, { ok: true, room: publicRoom(r) });
  }
  socket.on('create', (identity, ack) => {
    if (!validId(identity?.id) || !validName(identity?.name)) return respond(ack, { error: 'Bitte einen Namen eingeben.' });
    let c;
    do { c = code(); } while (rooms.has(c));
    const r = { code: c, host: identity.id, scores:{}, players: new Map() };
    rooms.set(c, r);
    joinRoom(r, identity, ack);
  });
  socket.on('join', ({ code: c, identity } = {}, ack) => {
    const r = rooms.get(String(c || '').toUpperCase());
    if (!r) return respond(ack, { error: 'Raum nicht gefunden.' });
    joinRoom(r, identity, ack);
  });
  socket.on('bot:add',(settings,ack)=>{const r=rooms.get(socket.data.room);if(!r||r.host!==socket.data.player||r.game)return respond(ack,{error:'Bots können nur vor dem Spiel vom Raumleiter hinzugefügt werden.'});const difficulty=typeof settings==='string'?settings:settings?.difficulty;const requested=typeof settings==='object'?settings?.name:null;if(!['easy','normal','hard'].includes(difficulty))return respond(ack,{error:'Unbekannte Schwierigkeit.'});if(r.players.size>=6)return respond(ack,{error:'Maximal sechs Spieler.'});const id=crypto.randomBytes(16).toString('hex');const names={easy:'Leicht',normal:'Normal',hard:'Schwer'};const n=[...r.players.values()].filter(p=>p.bot).length+1;const name=typeof requested==='string'&&requested.trim()?requested.trim():'Bot '+n;if(!validName(name))return respond(ack,{error:'Der Bot-Name muss 1 bis 24 Zeichen lang sein.'});r.players.set(id,{id,name,bot:difficulty,online:true});save();publish(r);respond(ack,{ok:true});});
  socket.on('bot:remove',(id,ack)=>{const r=rooms.get(socket.data.room);if(!r||r.host!==socket.data.player||r.game||!r.players.get(id)?.bot)return respond(ack,{error:'Bot kann nicht entfernt werden.'});r.players.delete(id);save();publish(r);respond(ack,{ok:true});});
  socket.on('game:configure', (options, ack) => {
    const r=rooms.get(socket.data.room);
    if(!r||r.host!==socket.data.player||r.game)return respond(ack,{error:'Nur der Raumleiter kann vor dem Start Regeln ändern.'});
    if(!options||typeof options!=='object')return respond(ack,{error:'Ungültige Regeln.'});
    r.options=Object.fromEntries(Object.keys(uno.defaults).map(k=>[k,options[k]===true]));
    publish(r);respond(ack,{ok:true});
  });
  socket.on('game:start', (_,ack)=>{
    const r=rooms.get(socket.data.room);
    if(!r||r.host!==socket.data.player||r.game)return respond(ack,{error:'Spiel kann nicht gestartet werden.'});
    if(r.players.size<2)return respond(ack,{error:'Mindestens zwei Spieler benötigt.'});
    if([...r.players.values()].some(p=>!p.online))return respond(ack,{error:'Alle Spieler müssen online sein.'});
    r.game=uno.create([...r.players.keys()],r.options||uno.defaults);
    publish(r);publishGame(r);scheduleBot(r);respond(ack,{ok:true});
  });
  socket.on('game:action',(action,ack)=>{
    const r=rooms.get(socket.data.room);
    if(!r?.game)return respond(ack,{error:'Kein UNO-Spiel aktiv.'});
    try{performAction(r,socket.data.player,action);respond(ack,{ok:true});}
    catch(err){respond(ack,{error:err.message});}
  });
  socket.on('game:restart',(_,ack)=>{const r=rooms.get(socket.data.room);if(!r||r.host!==socket.data.player||!r.game?.finished)return respond(ack,{error:'Nur der Raumleiter kann nach Spielende eine neue Runde starten.'});if([...r.players.values()].some(p=>!p.online))return respond(ack,{error:'Alle Spieler müssen online sein.'});r.game=uno.create([...r.players.keys()],r.game.rules);publish(r);publishGame(r);scheduleBot(r);respond(ack,{ok:true});});
  socket.on('leave', (_, ack) => { leave(); respond(ack, { ok: true }); });
  socket.on('disconnect', leave);
});
server.listen(PORT, '0.0.0.0', () => console.log('Games läuft auf Port ' + PORT));
