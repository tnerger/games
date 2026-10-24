'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');

test('private accounts: initial password change, session revocation, disabled accounts', () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'games-accounts-'));
 const src=path.resolve(__dirname,'..','accounts.js');
 const testModule=path.join(root,'accounts.js');
 fs.copyFileSync(src,testModule);
 try {
  const script=`
  const assert=require('node:assert/strict');
  const a=require('./accounts');
  assert.equal(a.adminCount(),0);
  const admin=a.createUser('administrator','temporary-secret-123',true);
  assert.equal(a.adminCount(),1);
  assert.equal(admin.mustChange,true);
  assert.throws(()=>a.createUser('administrator','temporary-secret-123'));
  assert.equal(a.authenticate('administrator','wrong'),null);
  assert.equal(a.authenticate('administrator','temporary-secret-123').id,admin.id);
  const token=a.createSession(admin.id);
  assert.equal(a.getSession(token).id,admin.id);
  assert.equal(a.getSession('not-a-token'),null);
  a.changePassword(admin.id,'new-secure-password-123');
  assert.equal(a.getSession(token),null);
  assert.equal(a.authenticate('administrator','temporary-secret-123'),null);
  assert.equal(a.authenticate('administrator','new-secure-password-123').must_change,0);
  const token2=a.createSession(admin.id);
  a.setDisabled(admin.id,true);
  assert.equal(a.getSession(token2),null);
  assert.equal(a.authenticate('administrator','new-secure-password-123'),null);
  a.setDisabled(admin.id,false);
  assert.ok(a.authenticate('administrator','new-secure-password-123'));
  assert.throws(()=>a.createUser('bad name','a-long-enough-password'));
  assert.throws(()=>a.createUser('valid','short'));
  console.log('accounts-ok');
  `;
  const output=execFileSync(process.execPath,['-e',script],{cwd:root,encoding:'utf8'});
  assert.match(output,/accounts-ok/);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
