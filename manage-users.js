'use strict';
const accounts = require('./accounts');
const readline = require('node:readline/promises');
const { execFileSync } = require('node:child_process');
async function main() {
  const [command, username] = process.argv.slice(2);
  const rl = readline.createInterface({input:process.stdin,output:process.stdout});
  async function secret(question) {
    if (!process.stdin.isTTY) throw Error('Passwort-Eingabe erfordert ein Terminal.');
    process.stdout.write(question);
    execFileSync('stty',['-echo']);
    try { return await rl.question(''); }
    finally { execFileSync('stty',['echo']); process.stdout.write('\\n'); }
  }
  try {
    if (command === 'create-admin' || command === 'create-user') {
      if (!username) throw Error('Aufruf: node manage-users.js create-admin|create-user BENUTZERNAME');
      if (command === 'create-admin' && accounts.adminCount() > 0) throw Error('Es existiert bereits ein Administrator.');
      const password = await secret('Vorläufiges Passwort (mindestens 12 Zeichen): ');
      const user = accounts.createUser(username, password, command === 'create-admin');
      console.log('Konto angelegt:', user.username, user.isAdmin ? '(Admin)' : '');
    } else if (command === 'list') {
      for (const user of accounts.listUsers()) console.log(user.username, user.isAdmin?'Admin':'Spieler',user.disabled?'gesperrt':'aktiv',user.mustChange?'Passwortwechsel nötig':'');
    } else if (command === 'reset' || command === 'disable' || command === 'enable') {
      const user = accounts.listUsers().find(u => u.username.toLowerCase() === String(username).toLowerCase());
      if (!user) throw Error('Benutzer nicht gefunden.');
      if (user.isAdmin && command === 'disable') throw Error('Administrator kann nicht gesperrt werden.');
      if (command === 'reset') {
        const password = await secret('Neues vorläufiges Passwort: ');
        accounts.changePassword(user.id,password,true);
      } else accounts.setDisabled(user.id,command === 'disable');
      console.log('Aktualisiert:',user.username);
    } else throw Error('Befehle: create-admin, create-user, list, reset, disable, enable');
  } finally { rl.close(); }
}
main().catch(e => { console.error(e.message);process.exitCode=1; });
