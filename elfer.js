'use strict';
const crypto=require('node:crypto');
const colors=['red','yellow','green','blue'];
const dealCount=n=>n<=3?20:n===4?15:n===5?12:10;
function shuffled(){const a=colors.flatMap(color=>Array.from({length:20},(_,i)=>({color,value:i+1})));for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function event(g,actor,text){g.events.push({id:g.events.length,at:Date.now(),actor,text});g.revision++;}
function create(players,scores={}){
 let pile,hands,starter,startColor;
 do{
  pile=shuffled();hands=Object.fromEntries(players.map(id=>[id,Array.from({length:dealCount(players.length)},()=>pile.pop())]));
  startColor=colors.find(color=>players.some(id=>hands[id].some(c=>c.color===color&&c.value===11)));
 }while(!startColor);
 starter=players.findIndex(id=>hands[id].some(c=>c.color===startColor&&c.value===11));
 const id=players[starter];hands[id].splice(hands[id].findIndex(c=>c.color===startColor&&c.value===11),1);
 const g={players:[...players],hands,deck:pile,rows:Object.fromEntries(colors.map(c=>[c,[]])),turn:(starter+1)%players.length,finished:false,winner:null,roundScores:null,scores:{...scores},drawn:0,played:false,pendingDraw:null,events:[],revision:0};
 g.rows[startColor].push(11);event(g,id,'eröffnet mit der '+startColor+'en 11.');
 return g;
}
function legal(g,c){const row=g.rows[c.color];return row.length===0?c.value===11:c.value===Math.min(...row)-1||c.value===Math.max(...row)+1;}
function next(g){g.turn=(g.turn+1)%g.players.length;g.drawn=0;g.played=false;g.pendingDraw=null;}
function finish(g,id){g.finished=true;g.winner=id;g.roundScores=Object.fromEntries(g.players.map(p=>[p,g.hands[p].reduce((sum,c)=>sum+c.value,0)]));for(const p of g.players)g.scores[p]=(g.scores[p]||0)+g.roundScores[p];event(g,id,'hat alle Karten abgelegt und gewinnt die Runde!');}
function act(g,id,a){
 if(g.finished)throw Error('Die Runde ist beendet.');
 if(g.players[g.turn]!==id)throw Error('Du bist nicht am Zug.');
 if(!a||typeof a!=='object')throw Error('Ungültige Aktion.');
 const hand=g.hands[id];
 if(g.pendingDraw&&(a.type!=='play'||a.color!==g.pendingDraw.color||a.value!==g.pendingDraw.value))throw Error('Du musst zuerst die gezogene Karte legen.');
 if(a.type==='play'){
  const i=hand.findIndex(c=>c.color===a.color&&c.value===a.value);
  if(i<0||!legal(g,hand[i]))throw Error('Diese Karte kann nicht angelegt werden.');
  const c=hand.splice(i,1)[0];g.rows[c.color].push(c.value);g.played=true;const forced=!!g.pendingDraw;g.pendingDraw=null;event(g,id,'legt '+c.value+' ('+c.color+') an.');
  if(!hand.length)finish(g,id);else if(forced)next(g);
  return;
 }
 if(a.type==='end'){
  if(!g.played)throw Error('Du musst eine Karte legen, wenn du kannst.');
  event(g,id,'beendet den Zug.');next(g);return;
 }
 if(a.type==='draw'){
  if(g.played||hand.some(c=>legal(g,c)))throw Error('Du kannst eine Karte legen.');
  if(g.drawn>=3||!g.deck.length)throw Error('Du kannst nicht weiter ziehen.');
  const c=g.deck.pop();hand.push(c);g.drawn++;event(g,id,'zieht eine Karte.');
  if(legal(g,c)){
   g.pendingDraw={...c};event(g,id,'muss die gezogene '+c.value+' ('+c.color+') legen.');
  }else if(g.drawn===3||!g.deck.length)next(g);
  return;
 }
 if(a.type==='pass'){
  if(g.played||hand.some(c=>legal(g,c))||g.deck.length&&g.drawn<3)throw Error('Du musst zuerst passende Karten legen oder ziehen.');
  event(g,id,'passt.');next(g);return;
 }
 throw Error('Ungültige Aktion.');
}
function view(g,id){return {game:'elfer',players:g.players.map(p=>({id:p,count:g.hands[p].length,score:g.scores[p]||0})),hand:(g.hands[id]||[]).map(c=>({...c})),rows:g.rows,turn:g.players[g.turn],deckCount:g.deck.length,drawn:g.drawn,played:g.played,pendingDraw:g.players[g.turn]===id?g.pendingDraw:null,legal:(g.hands[id]||[]).filter(c=>legal(g,c)),finished:g.finished,winner:g.winner,roundScores:g.roundScores,scores:g.scores,events:g.events,revision:g.revision};}
function botAction(g,id,level){
 if(g.pendingDraw)return {type:'play',...g.pendingDraw};
 const hand=g.hands[id],options=hand.filter(c=>legal(g,c));
 if(options.length){
  const ranked=options.map(c=>({c,follow:hand.filter(x=>x.color===c.color&&(x.value===c.value-1||x.value===c.value+1)).length,edge:Math.abs(c.value-11)}));
  ranked.sort((a,b)=>level==='easy'?crypto.randomInt(3)-1:level==='hard'?b.follow-a.follow||b.edge-a.edge:b.edge-a.edge);
  return {type:'play',...ranked[0].c};
 }
 if(g.played)return {type:'end'};
 return {type:g.deck.length&&g.drawn<3?'draw':'pass'};
}
module.exports={create,act,view,botAction,legal};
