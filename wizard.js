'use strict';
const crypto=require('node:crypto');
const suits=['blue','red','green','yellow'];
const rand=n=>crypto.randomInt(n);
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const makeDeck=()=>shuffle([...suits.flatMap(suit=>Array.from({length:13},(_,i)=>({id:suit+(i+1),suit,value:i+1,type:'number'}))),...Array.from({length:4},(_,i)=>({id:'wizard'+i,suit:null,value:14,type:'wizard'})),...Array.from({length:4},(_,i)=>({id:'jester'+i,suit:null,value:0,type:'jester'}))]);
function create(players,scores={}){
 const g={players:[...players],scores:{...scores},round:0,maxRounds:Math.floor(60/players.length),dealer:-1,hands:{},trump:null,indicator:null,bids:{},tricks:{},trick:[],lead:null,turn:0,phase:'bidding',finished:false,matchFinished:false,events:[],revision:0,history:[],lastRound:null};
 nextRound(g);return g;
}
function event(g,actor,text){g.events.push({id:g.events.length,at:Date.now(),actor,text});g.revision++;}
function nextRound(g){
 g.round++;g.dealer=(g.dealer+1)%g.players.length;
 const deck=makeDeck();g.hands={};for(const id of g.players)g.hands[id]=Array.from({length:g.round},()=>deck.pop());
 g.indicator=g.round===g.maxRounds?null:deck.pop()||null;
 g.trump=g.indicator?.type==='number'?g.indicator.suit:null;
 g.bids={};g.tricks=Object.fromEntries(g.players.map(id=>[id,0]));g.trick=[];g.lead=null;
 g.phase=g.indicator?.type==='wizard'?'choose-trump':'bidding';g.turn=g.phase==='choose-trump'?g.dealer:(g.dealer+1)%g.players.length;
 event(g,null,'Runde '+g.round+' von '+g.maxRounds+' beginnt. '+(g.phase==='choose-trump'?'Der Geber wählt Trumpf.':'Stiche ansagen.'));
}
const next=(g,i)=> (i+1)%g.players.length;
function legal(g,id){
 const hand=g.hands[id]||[];if(!g.lead)return hand.map(c=>c.id);
 const hasLead=hand.some(c=>c.type==='number'&&c.suit===g.lead);
 return hand.filter(c=>c.type!=='number'||!hasLead||c.suit===g.lead).map(c=>c.id);
}
function winner(g){
 const cards=g.trick;
 const wizard=cards.find(x=>x.card.type==='wizard');if(wizard)return wizard.id;
 const numbers=cards.filter(x=>x.card.type==='number');
 if(!numbers.length)return cards[0].id;
 const trump=numbers.filter(x=>x.card.suit===g.trump);
 const eligible=trump.length?trump:numbers.filter(x=>x.card.suit===g.lead);
 return eligible.reduce((a,b)=>a.card.value>=b.card.value?a:b).id;
}
function act(g,id,a){
 if(g.finished)throw Error('Das Spiel ist beendet.');
 if(g.players[g.turn]!==id)throw Error('Du bist nicht am Zug.');
 if(g.phase==='choose-trump'){
  if(a?.type!=='trump'||!suits.includes(a.suit))throw Error('Wähle eine Trumpffarbe.');
  g.trump=a.suit;g.phase='bidding';g.turn=next(g,g.dealer);event(g,id,'hat Trumpf bestimmt.');return;
 }
 if(g.phase==='bidding'){
  if(a?.type!=='bid'||!Number.isInteger(a.count)||a.count<0||a.count>g.round)throw Error('Ungültige Stichansage.');
  g.bids[id]=a.count;event(g,id,'sagt '+a.count+' Stich(e) an.');
  if(g.players.every(p=>Number.isInteger(g.bids[p]))){g.phase='playing';g.turn=next(g,g.dealer);event(g,null,'Alle Ansagen stehen fest. Der erste Stich beginnt.');}
  else g.turn=next(g,g.turn);
  return;
 }
 if(g.phase!=='playing'||a?.type!=='play')throw Error('Wähle eine Karte.');
 const idx=g.hands[id].findIndex(c=>c.id===a.cardId);
 if(idx<0||!legal(g,id).includes(a.cardId))throw Error('Du musst die angespielte Farbe bedienen, falls möglich.');
 const [card]=g.hands[id].splice(idx,1);
 if(card.type==='number'&&!g.lead)g.lead=card.suit;
 g.trick.push({id,card});event(g,id,'spielt '+(card.type==='wizard'?'Zauberer':card.type==='jester'?'Narr':card.value+' '+card.suit)+'.');
 if(g.trick.length<g.players.length){g.turn=next(g,g.turn);return;}
 const win=winner(g);g.tricks[win]++;event(g,win,'gewinnt den Stich ('+g.tricks[win]+').');
 g.trick=[];g.lead=null;g.turn=g.players.indexOf(win);
 if(g.hands[g.players[0]].length===0){
  const points={};for(const p of g.players){const exact=g.bids[p]===g.tricks[p];points[p]=exact?20+10*g.tricks[p]:-10*Math.abs(g.bids[p]-g.tricks[p]);g.scores[p]=(g.scores[p]||0)+points[p];}
  g.lastRound={round:g.round,bids:{...g.bids},tricks:{...g.tricks},points};
  g.history.push(g.lastRound);g.finished=true;g.matchFinished=g.round>=g.maxRounds;g.phase='finished';
  event(g,null,'Runde '+g.round+' beendet. '+(g.matchFinished?'Das Spiel ist beendet.':'Bereit für die nächste Runde.'));
 }
}
function restart(g){
 if(!g.finished||g.matchFinished)throw Error('Keine weitere Runde möglich.');
 g.finished=false;nextRound(g);
}
function view(g,id){
 return {game:'wizard',players:g.players.map(pid=>({id:pid,count:g.hands[pid].length,bid:g.bids[pid]??null,tricks:g.tricks[pid]||0,score:g.scores[pid]||0})),hand:g.hands[id]||[],round:g.round,maxRounds:g.maxRounds,dealer:g.players[g.dealer],turn:g.players[g.turn],phase:g.phase,trump:g.trump,indicator:g.indicator,lead:g.lead,trick:g.trick,legal:g.players[g.turn]===id&&g.phase==='playing'?legal(g,id):[],finished:g.finished,matchFinished:g.matchFinished,lastRound:g.lastRound,history:g.history,events:g.events.slice(-60),revision:g.revision};
}
function botAction(g,id,level){
 if(g.phase==='choose-trump'){
  const counts=suits.map(suit=>({suit,n:g.hands[id].filter(c=>c.suit===suit).length}));
  counts.sort((a,b)=>b.n-a.n);return {type:'trump',suit:level==='easy'?suits[rand(4)]:counts[0].suit};
 }
 if(g.phase==='bidding'){
  const strong=g.hands[id].filter(c=>c.type==='wizard'||(c.type==='number'&&(c.value>=11||c.suit===g.trump&&c.value>=9))).length;
  return {type:'bid',count:Math.max(0,Math.min(g.round,strong+(level==='easy'?rand(3)-1:level==='hard'?0:rand(2)-1)))};
 }
 const cards=g.hands[id].filter(c=>legal(g,id).includes(c.id));
 const power=c=>c.type==='wizard'?100:c.type==='jester'?-10:c.value+(c.suit===g.trump?20:0);
 cards.sort((a,b)=>power(a)-power(b));
 const need=g.bids[id]-g.tricks[id];
 return {type:'play',cardId:(level==='easy'?cards[rand(cards.length)]:need>0?cards.at(-1):cards[0]).id};
}
module.exports={create,act,restart,view,botAction};
