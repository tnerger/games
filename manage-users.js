'use strict';
const accounts = require('./accounts');
const readline = require('node:readline/promises');
async function main() {
  const [command, username] = process.argv.slice(2);
  const rl = readline.createInterface({input:process.stdin,output:process.stdout});
  async function secret(question) {
    if (!process.stdin.isTTY) throw Error('Bitte in einer interaktiven SSH-Sitzung ausführen.');
    const input=process.stdin, output=process.stdout;
    output.write(question);
    const wasRaw=input.isRaw;
    input.setRawMode(true);
    input.resume();
    return await new Promise((resolve,reject)=>{
      let value='';
      function finish(err) {
        input.removeListener('data',onData);
        input.setRawMode(!!wasRaw);
        output.write('\\n');
        if(err)reject(err);else resolve(value);
      }
      function onData(chunk) {
        for(const c of chunk.toString('utf8')) {
          if(c==='\\r'||c==='\\n')return finish();
          if(c==='\\u0003')return finish(Error('Abgebrochen.'));
          if(c==='\\u007f'||c==='\\b'){value=value.slice(0,-1);continue;}
          if(c>=' '&&value.length<256)value+=c;
        }
      }
      input.on('data',onData);
    });
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
