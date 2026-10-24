'use strict';
const accounts = require('./accounts');
const readline = require('node:readline/promises');
const fs = require('node:fs');
async function main() {
  const [command, username] = process.argv.slice(2);
  const rl = readline.createInterface({input:process.stdin,output:process.stdout});
  async function secret(question) {
    // Use the controlling terminal rather than stdin: SSH sessions may redirect stdin.
    let tty;
    try { tty=fs.openSync('/dev/tty','r+'); }
    catch { throw Error('Kein interaktives Terminal verfügbar.'); }
    const input=fs.createReadStream(null,{fd:tty,autoClose:false});
    const output=fs.createWriteStream(null,{fd:tty,autoClose:false});
    const terminal=readline.createInterface({input,output,terminal:true});
    terminal._writeToOutput=function(value) {
      if (value.startsWith(question)) this.output.write(value);
      else if (value.includes('\\n') || value.includes('\\r')) this.output.write('\\n');
    };
    try { return await terminal.question(question); }
    finally { terminal.close();input.destroy();output.destroy();fs.closeSync(tty); }
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
