'use strict';
const crypto=require('node:crypto');
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const deck=()=>shuffle([...Array(5).fill(-2),...Array(10).fill(-1),...Array(15).fill(0),...Array.from({length:12},(_,i)=>Array(10).fill(i+1)).flat()].map((value,id)=>({id:String(id),value})));
function create(players,scores={}){
 const pile=deck(),hands={};
 for(const id of players)hands[id]=Array.from({length:12},()=>({card:pile.pop(),open:false}));
 const discard=[pile.pop()];
 return {players:[...players],hands,deck:pile,discard,turn:0,phase:'reveal',revealed:{},held:null,source:null,finisher:null,remaining:null,finished:false,matchFinished:false,roundScores:null,scores:{...scores},events:[{id:0,at:Date.now(),actor:null,text:'Skyjo-Runde gestartet. Jeder deckt zwei Karten auf.'}],revision:0};
}
function event(g,id,text){g.events.push({id:g.events.length,at:Date.now(),actor:id,text});g.revision++;}
function next(g){g.turn=(g.turn+1)%g.players.length;}
function refill(g){if(g.deck.length)return;const top=g.discard.pop();g.deck=shuffle(g.discard);g.discard=[top];}
function take(g){refill(g);if(!g.deck.length)throw Error('Keine Karten mehr verfügbar.');return g.deck.pop();}
function removeColumns(g,id){const h=g.hands[id];for(let col=0;col<3;col++){const indices=[col,col+3,col+6,col+9];const cards=indices.map(i=>h[i]);if(cards.every(x=>x&&x.open&&x.card.value===cards[0].card.value)){for(const i of indices){g.discard.push(h[i].card);h[i]=null;}event(g,id,'hat eine vollständige Spalte mit '+cards[0].card.value+' entfernt.');}}}
function score(g){const points={};for(const id of g.players)points[id]=g.hands[id].reduce((n,x)=>n+(x?.card.value||0),0);
 const fin=g.finisher;if(fin!==null&&points[fin]>0&&g.players.some(id=>id!==fin&&points[id]<=points[fin]))points[fin]*=2;
 g.roundScores=points;for(const id of g.players)g.scores[id]=(g.scores[id]||0)+points[id];g.finished=true;g.phase='finished';g.matchFinished=Object.values(g.scores).some(n=>n>=100);event(g,null,g.matchFinished?'Spiel beendet: 100 Punkte erreicht.':'Runde beendet. Punkte wurden gewertet.');
}
function endTurn(g,id){removeColumns(g,id);if(g.finisher===null&&g.hands[id].every(x=>!x||x.open)){g.finisher=id;g.remaining=g.players.length-1;event(g,id,'hat alle Karten aufgedeckt. Alle anderen haben noch einen Zug.');}
 else if(g.finisher!==null&&id!==g.finisher){g.remaining--;if(g.remaining<=0){score(g);return;}}
 next(g);g.phase='choose';g.held=null;g.source=null;
}
function act(g,id,a){
 if(g.finished)throw Error('Die Runde ist beendet.');
 if(!a||typeof a!=='object')throw Error('Ungültige Aktion.');
 if(g.phase==='reveal'){
  if(a.type!=='reveal'||!Number.isInteger(a.index)||a.index<0||a.index>=12)throw Error('Wähle eine verdeckte Karte.');
  const h=g.hands[id];if(!h||h[a.index]?.open||!h[a.index])throw Error('Karte bereits aufgedeckt.');
  if((g.revealed[id]||0)>=2)throw Error('Du hast bereits zwei Karten aufgedeckt.');
  h[a.index].open=true;g.revealed[id]=(g.revealed[id]||0)+1;event(g,id,'hat eine Karte aufgedeckt.');
  if(g.players.every(pid=>g.revealed[pid]===2)){
   const totals=g.players.map(pid=>g.hands[pid].reduce((n,x)=>n+(x.open?x.card.value:0),0));
   const max=Math.max(...totals);g.turn=totals.indexOf(max);g.phase='choose';event(g,null,'Alle haben zwei Karten aufgedeckt. Die Runde beginnt.');
  }
  return;
 }
 if(g.players[g.turn]!==id)throw Error('Du bist nicht am Zug.');
 if(g.phase==='choose'){
  if(a.type!=='take'||!['deck','discard'].includes(a.source))throw Error('Wähle einen Stapel.');
  g.held=a.source==='deck'?take(g):g.discard.pop();g.source=a.source;g.phase='replace';event(g,id,'hat eine Karte vom '+(a.source==='deck'?'Ziehstapel':'Ablagestapel')+' genommen.');return;
 }
 if(g.phase==='replace'){
  if(a.type==='discard'&&g.source==='deck'){g.discard.push(g.held);event(g,id,'hat die gezogene '+g.held.value+' abgeworfen.');g.held=null;g.phase='flip';return;}
  if(a.type!=='replace'||!Number.isInteger(a.index)||a.index<0||a.index>=12||!g.hands[id][a.index])throw Error('Wähle eine Karte zum Tauschen.');
  const previous=g.hands[id][a.index].card;g.hands[id][a.index]={card:g.held,open:true};g.discard.push(previous);event(g,id,'hat eine '+previous.value+' gegen eine '+g.held.value+' getauscht.');endTurn(g,id);return;
 }
 if(g.phase==='flip'){
  if(a.type!=='flip'||!Number.isInteger(a.index)||a.index<0||a.index>=12||!g.hands[id][a.index]||g.hands[id][a.index].open)throw Error('Decke eine verdeckte Karte auf.');
  g.hands[id][a.index].open=true;event(g,id,'hat eine '+g.hands[id][a.index].card.value+' aufgedeckt.');endTurn(g,id);return;
 }
 throw Error('Ungültiger Spielzustand.');
}
function view(g,id){return {game:'skyjo',players:g.players.map(pid=>({id:pid,open:g.hands[pid].filter(x=>x?.open).length,cards:g.hands[pid].filter(Boolean).length})),hand:g.hands[id]?.map(x=>x?{open:x.open,value:x.open?x.card.value:null}:null)||[],turn:g.players[g.turn],phase:g.phase,revealed:g.revealed[id]||0,discard:g.discard.at(-1)?.value,held:g.held&&(g.players[g.turn]===id?g.held.value:null),source:g.source,finisher:g.finisher,remaining:g.remaining,finished:g.finished,matchFinished:g.matchFinished,roundScores:g.roundScores,scores:g.scores,events:g.events,revision:g.revision};}
function botAction(g,id,level){const h=g.hands[id];const hidden=h.map((x,i)=>x&&!x.open?i:null).filter(x=>x!==null);const open=h.map((x,i)=>x&&x.open?i:null).filter(x=>x!==null);
 const pick=a=>a[crypto.randomInt(a.length)];
 if(g.phase==='reveal')return {type:'reveal',index:pick(hidden)};
 if(g.phase==='choose'){const discard=g.discard.at(-1)?.value;return {type:'take',source:discard!==undefined&&(level==='easy'?crypto.randomInt(2)===0:discard<=(level==='hard'?3:5))?'discard':'deck'};}
 if(g.phase==='flip')return {type:'flip',index:pick(hidden)};
 if(g.phase==='replace'){
  const worst=open.length?open.reduce((a,b)=>h[a].card.value>=h[b].card.value?a:b):null;
  if(level==='easy')return {type:'replace',index:pick(h.map((x,i)=>x?i:null).filter(x=>x!==null))};
  const held=g.held.value;
  if(worst!==null&&h[worst].card.value>held)return {type:'replace',index:worst};
  if(hidden.length&&(g.source==='discard'||held<=(level==='hard'?5:3)))return {type:'replace',index:pick(hidden)};
  if(g.source==='deck'&&hidden.length)return {type:'discard'};
  return {type:'replace',index:worst??pick(h.map((x,i)=>x?i:null).filter(x=>x!==null))};
 }
}
module.exports={create,act,view,botAction};
