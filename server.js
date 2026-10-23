'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('node:crypto');
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
    code: r.code, host: r.host, players: [...r.players.values()].map(p => ({ id: p.id, name: p.name }))
  }))));
  fs.renameSync(tmp, dataFile);
}
try {
  for (const r of JSON.parse(fs.readFileSync(dataFile, 'utf8'))) {
    if (!/^[A-F0-9]{6}$/.test(r.code) || !Array.isArray(r.players)) continue;
    rooms.set(r.code, { code: r.code, host: r.host, players: new Map(r.players.filter(p => validId(p.id) && validName(p.name)).map(p => [p.id, { ...p, online: false }])) });
  }
} catch (err) { if (err.code !== 'ENOENT') console.error('Spielstände konnten nicht geladen werden:', err.message); }
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/version', (_, res) => res.json({ version: require('./package.json').version }));
const publicRoom = r => ({ code: r.code, host: r.host, players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, online: p.online })) });
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
    if (!old && r.players.size >= 6) return respond(ack, { error: 'Dieser Raum ist voll.' });
    if (socket.data.room) leave();
    if (!old) r.players.set(identity.id, { id: identity.id, name: identity.name.trim(), online: true });
    else { old.name = identity.name.trim(); old.online = true; }
    socket.join(r.code);
    socket.data.room = r.code;
    socket.data.player = identity.id;
    save();
    publish(r);
    respond(ack, { ok: true, room: publicRoom(r) });
  }
  socket.on('create', (identity, ack) => {
    if (!validId(identity?.id) || !validName(identity?.name)) return respond(ack, { error: 'Bitte einen Namen eingeben.' });
    let c;
    do { c = code(); } while (rooms.has(c));
    const r = { code: c, host: identity.id, players: new Map() };
    rooms.set(c, r);
    joinRoom(r, identity, ack);
  });
  socket.on('join', ({ code: c, identity } = {}, ack) => {
    const r = rooms.get(String(c || '').toUpperCase());
    if (!r) return respond(ack, { error: 'Raum nicht gefunden.' });
    joinRoom(r, identity, ack);
  });
  socket.on('leave', (_, ack) => { leave(); respond(ack, { ok: true }); });
  socket.on('disconnect', leave);
});
server.listen(PORT, '0.0.0.0', () => console.log('Games läuft auf Port ' + PORT));
