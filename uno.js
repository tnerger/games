'use strict';
const crypto = require('node:crypto');
const colors = ['red','yellow','green','blue'];
const defaults = { stacking:false, sevenZero:false, drawUntilPlayable:false, challenge:true, actionFinish:true };
const descriptions = {
 stacking:'Auf +2 darf eine weitere +2 gelegt werden. Die Strafe addiert sich. +4 wird nicht gemischt.',
 sevenZero:'Eine 7 tauscht deine Hand mit einer gewählten Person; bei 0 wandern alle Hände weiter.',
 drawUntilPlayable:'Ohne passende Karte ziehst du bis eine Karte passt (maximal bis der Stapel leer ist).',
 challenge:'Eine +4 darf angezweifelt werden. Wer falsch liegt, zieht sechs statt vier Karten.',
 actionFinish:'Die letzte Karte darf eine Aktionskarte sein. Ihre Wirkung wird noch ausgeführt.'
};
const shuffle = a => { for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a; };
const makeDeck = () => {
 const d=[];let id=0;
 for(const color of colors){
  d.push({id:String(id++),color,value:'0'});
  for(const value of ['1','2','3','4','5','6','7','8','9','skip','reverse','draw2'])
   for(let i=0;i<2;i++)d.push({id:String(id++),color,value});
 }
 for(let i=0;i<4;i++)for(const value of ['wild','wild4'])d.push({id:String(id++),color:'wild',value});
 return shuffle(d);
};
function create(players,opts){
 const deck=makeDeck(), hands={};
 for(const id of players) hands[id]=Array.from({length:7},()=>deck.pop());
 let top=deck.pop();
 while(top.value==='wild4'){deck.unshift(top);shuffle(deck);top=deck.pop();}
 const game={players:[...players],hands,deck,discard:[top],turn:0,direction:1,color:top.color==='wild'?colors[crypto.randomInt(4)]:top.color,rules:{...defaults,...opts},pending:0,pendingType:null,awaitingColor:false,awaitingSwap:false,awaitingChallenge:false,wild4Illegal:false,wild4Player:null,finished:false,winner:null,log:['UNO wurde gestartet.'],revision:0};
 if(top.value==='skip')game.turn=1%players.length;
 if(top.value==='reverse'){game.direction=-1;game.turn=players.length===2?0:players.length-1;}
 if(top.value==='draw2'){const target=game.players[game.turn];draw(game,target,2);game.turn=next(game,game.turn);}
 if(top.value==='wild')game.color=colors[crypto.randomInt(4)];
 return game;
}
function next(g,from=g.turn){return (from+g.direction+g.players.length)%g.players.length;}
function draw(g,id,n){let count=0;for(let i=0;i<n;i++){if(!g.deck.length){const top=g.discard.pop();g.deck=shuffle(g.discard);g.discard=[top];}if(!g.deck.length)break;g.hands[id].push(g.deck.pop());count++;}return count;}
function canPlay(g,c){if(g.pending)return g.rules.stacking&&g.pendingType==='draw2'&&c.value==='draw2';return c.color==='wild'||c.color===g.color||c.value===g.discard.at(-1).value;}
function view(g,id){
 const p=g.players[g.turn];
 return {players:g.players.map(pid=>({id:pid,count:g.hands[pid].length})),hand:g.hands[id]||[],top:g.discard.at(-1),color:g.color,turn:p,direction:g.direction,pending:g.pending,awaitingColor:g.awaitingColor,awaitingSwap:g.awaitingSwap,awaitingChallenge:g.awaitingChallenge,finished:g.finished,winner:g.winner,rules:g.rules,descriptions,log:g.log,revision:g.revision,canPlay:(g.hands[id]||[]).filter(c=>id===p&&!g.awaitingColor&&!g.awaitingSwap&&!g.awaitingChallenge&&canPlay(g,c)).map(c=>c.id)};
}
function act(g,id,a){
 g.revision++;
 if(g.finished)throw Error('Die Runde ist beendet.');
 if(g.players[g.turn]!==id)throw Error('Du bist nicht am Zug.');
 if(!a||typeof a!=='object')throw Error('Ungültige Aktion.');
 if(g.awaitingChallenge){
  if(a.type!=='challenge'&&a.type!=='accept')throw Error('Bitte +4 annehmen oder anzweifeln.');
  const count=a.type==='challenge'?(g.wild4Illegal?0:6):4;
  if(a.type==='challenge'&&g.wild4Illegal)draw(g,g.wild4Player,4);else draw(g,id,count);
  g.log.push(a.type==='challenge'?(g.wild4Illegal?'Anzweiflung erfolgreich!':'Anzweiflung fehlgeschlagen!'):'Vier Karten gezogen.');
  g.awaitingChallenge=false;g.pending=0;g.pendingType=null;g.turn=next(g);g.wild4Player=null;return;
 }
 if(g.awaitingColor){
  if(a.type!=='color'||!colors.includes(a.color))throw Error('Wähle eine Farbe.');
  g.color=a.color;g.awaitingColor=false;g.turn=next(g);return;
 }
 if(g.awaitingSwap){
  if(a.type!=='swap'||!g.players.includes(a.target)||a.target===id)throw Error('Wähle einen Mitspieler.');
  [g.hands[id],g.hands[a.target]]=[g.hands[a.target],g.hands[id]];
  g.awaitingSwap=false;g.turn=next(g);return;
 }
 if(a.type==='draw'){
  if(g.pending){
   draw(g,id,g.pending);g.log.push('Strafkarten gezogen: '+g.pending);g.pending=0;g.pendingType=null;g.turn=next(g);return;
  }
  const n=draw(g,id,1);
  if(g.rules.drawUntilPlayable){
   while(g.deck.length && !g.hands[id].some(c=>canPlay(g,c)))draw(g,id,1);
  }
  g.log.push(n?'Karte(n) gezogen.':'Ziehstapel leer.');
  // Gezogene spielbare Karte kann in diesem Zug gelegt werden.
  if(!g.hands[id].some(c=>canPlay(g,c)))g.turn=next(g);
  return;
 }
 if(a.type==='pass'){
  if(g.pending||g.hands[id].some(c=>canPlay(g,c)))throw Error('Du kannst noch eine Karte legen.');
  g.turn=next(g);return;
 }
 if(a.type!=='play')throw Error('Unbekannte Aktion.');
 const idx=g.hands[id].findIndex(c=>c.id===String(a.cardId));
 if(idx<0)throw Error('Karte nicht gefunden.');
 const c=g.hands[id][idx];
 if(!canPlay(g,c))throw Error('Diese Karte passt nicht.');
 if(!g.rules.actionFinish && g.hands[id].length===1 && ['skip','reverse','draw2','wild','wild4'].includes(c.value))throw Error('Mit einer Aktionskarte darf nach dieser Regel nicht beendet werden.');
 if(c.value==='wild4' && !g.rules.challenge && g.hands[id].some(x=>x.id!==c.id&&x.color===g.color))throw Error('+4 ist nicht erlaubt, solange du eine Karte der aktuellen Farbe hast.');
 if(c.value==='wild4' && !colors.includes(a.color))throw Error('Wähle für +4 eine Farbe.');
 if(c.value==='wild' && !colors.includes(a.color))throw Error('Wähle eine Farbe.');
 const oldColor=g.color;
 g.wild4Illegal=c.value==='wild4'&&g.hands[id].some(x=>x.id!==c.id&&x.color===oldColor);
 g.hands[id].splice(idx,1);g.discard.push(c);
 if(c.color!=='wild')g.color=c.color;else g.color=a.color;
 g.log.push('Karte gelegt: '+c.color+' '+c.value);
 if(c.value==='reverse')g.direction*=-1;
 if(c.value==='draw2'){g.pending+=2;g.pendingType='draw2';}
 if(c.value==='wild4'){g.pending=4;g.pendingType='wild4';g.wild4Player=id;}
 if(c.value==='skip')g.turn=next(g);
 if(c.value==='reverse'&&g.players.length===2)g.turn=next(g);
 if(c.value==='7'&&g.rules.sevenZero&&g.hands[id].length)g.awaitingSwap=true;
 if(c.value==='0'&&g.rules.sevenZero){const old={...g.hands};for(let i=0;i<g.players.length;i++)g.hands[g.players[next(g,i)]]=old[g.players[i]];}
 if(!g.hands[id].length){
  g.finished=true;g.winner=id;g.log.push('Spiel beendet!');return;
 }
 if(g.awaitingSwap)return;
 g.turn=next(g);
 if(c.value==='wild4'&&g.rules.challenge){g.awaitingChallenge=true;return;}
 if(g.pending&&!g.rules.stacking){draw(g,g.players[g.turn],g.pending);g.turn=next(g);g.pending=0;g.pendingType=null;}
}
module.exports={create,view,act,defaults,descriptions};
