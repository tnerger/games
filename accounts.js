'use strict';
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const directory = path.join(__dirname, 'data');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(path.join(directory, 'accounts.sqlite'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  must_change INTEGER NOT NULL DEFAULT 1,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
`);
const USERNAME = /^[a-zA-Z0-9_.-]{3,24}$/;
const MIN_PASSWORD = 12;
const hashPassword = password => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return 'scrypt:' + salt.toString('hex') + ':' + hash.toString('hex');
};
function verifyPassword(password, stored) {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(parts[1], 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
const safeUser = u => u && ({
  id:u.id, username:u.username, isAdmin:!!u.is_admin,
  mustChange:!!u.must_change, disabled:!!u.disabled
});
function createUser(username, password, admin = false) {
  if (!USERNAME.test(username)) throw Error('Benutzername: 3–24 Zeichen (Buchstaben, Ziffern, _, ., -).');
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > 256) throw Error('Passwort muss 12–256 Zeichen lang sein.');
  const id = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO users (id, username, password_hash, is_admin, must_change, created_at) VALUES (?,?,?,?,1,?)')
    .run(id, username, hashPassword(password), admin ? 1 : 0, Date.now());
  return safeUser(db.prepare('SELECT * FROM users WHERE id=?').get(id));
}
function authenticate(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 24 || password.length > 256) return null;
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!user || user.disabled || !verifyPassword(password, user.password_hash)) return null;
  return user;
}
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
function createSession(id) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(tokenHash(token), id, Date.now() + 7*86400000);
  return token;
}
function getSession(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const record = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(tokenHash(token), Date.now());
  return record && !record.disabled ? record : null;
}
function destroySession(token) {
  if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));
}
function changePassword(id, password, mustChange = false) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > 256) throw Error('Passwort muss 12–256 Zeichen lang sein.');
  db.prepare('UPDATE users SET password_hash=?,must_change=? WHERE id=?').run(hashPassword(password), mustChange ? 1 : 0, id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
}
function setDisabled(id, disabled) {
  db.prepare('UPDATE users SET disabled=? WHERE id=?').run(disabled ? 1 : 0, id);
  if (disabled) db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
}
function listUsers() { return db.prepare('SELECT id,username,is_admin,must_change,disabled,created_at FROM users ORDER BY username').all().map(safeUser); }
function getUser(id) { return db.prepare('SELECT * FROM users WHERE id=?').get(id); }
function adminCount() { return db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin=1').get().n; }
module.exports = { createUser, authenticate, createSession, getSession, destroySession, changePassword, setDisabled, listUsers, getUser, safeUser, adminCount, verifyPassword };
