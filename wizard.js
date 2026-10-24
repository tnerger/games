'use strict';
const crypto=require('node:crypto');
const suits=['blue','red','green','yellow'];
const rand=n=>crypto.randomInt(n);
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const makeDeck=()=>shuffle([...suits.flatMap(suit=>Array.from({length:13},(_,i)=>({id:suit+(i+1),suit,value:i+1,type:'number'}))),...Array.from({length:4},(_,i)=>({id:'wizard'+i,suit:null,value:14,type:'wizard'})),...Array.from({length:4},(_,i)=>({id:'jester'+i,suit:null,value:0,type:'jester'}))]);
function create(players,scores={}){
 const g={players:[...players],scores:{...scores},round:0,maxRounds:Math.floor(60/players.length),dealer:-1,hands:{},trump:null,indicator:null,bids:{},tricks:{},trick:[],lead:null,turn:0,phase:'bidding',finished:false,matchFinished:false,events:[],revision:0,history:[],lastRound:null,lastTrick:null};
 nextRound(g);return g;
}
function event(g,actor,text){g.events.push({id:g.events.length,at:Date.now(),actor,text});g.revision++;}
function nextRound(g){
 g.round++;g.dealer=(g.dealer+1)%g.players.length;
 const deck=makeDeck();g.hands={};for(const id of g.players)g.hands[id]=Array.from({length:g.round},()=>deck.pop());
 g.indicator=g.round===g.maxRounds?null:deck.pop()||null;
 g.trump=g.indicator?.type==='number'?g.indicator.suit:null;
 g.bids={};g.tricks=Object.fromEntries(g.players.map(id=>[id,0]));g.trick=[];g.lead=null;
 g.lastTrick=null;g.phase=g.indicator?.type==='wizard'?'choose-trump':'bidding';g.turn=g.phase==='choose-trump'?g.dealer:(g.dealer+1)%g.players.length;
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
 const win=winner(g);g.tricks[win]++;g.lastTrick={winner:win,cards:g.trick.map(x=>({id:x.id,card:{...x.card}})),number:Object.values(g.tricks).reduce((a,b)=>a+b,0)};event(g,win,'gewinnt den Stich ('+g.tricks[win]+').');
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
 return {game:'wizard',players:g.players.map(pid=>({id:pid,count:g.hands[pid].length,bid:g.bids[pid]??null,tricks:g.tricks[pid]||0,score:g.scores[pid]||0})),hand:g.hands[id]||[],round:g.round,maxRounds:g.maxRounds,dealer:g.players[g.dealer],turn:g.players[g.turn],phase:g.phase,trump:g.trump,indicator:g.indicator,lead:g.lead,trick:g.trick,lastTrick:g.lastTrick,legal:g.players[g.turn]===id&&g.phase==='playing'?legal(g,id):[],finished:g.finished,matchFinished:g.matchFinished,lastRound:g.lastRound,history:g.history,events:g.events.slice(-60),revision:g.revision};
}
// Estimates the chance that a card wins a trick using the visible cards only.
function cardStrength(card,g,hand){
 if(card.type==='wizard')return .995;
 if(card.type==='jester')return .005;
 const remaining=13-card.value;
 const trump=card.suit===g.trump;
 const same=hand.filter(c=>c.type==='number'&&c.suit===card.suit).length;
 let p=Math.pow((13-remaining)/13,Math.max(1,g.players.length-1));
 if(trump)p=.55+.42*p;
 else if(g.trump)p*=.70;
 if(card.value===13)p=Math.max(p,trump? .97 : g.trump? .75 : .94);
 return Math.max(.02,Math.min(.98,p+(same===1&&card.value>=10?.04:0)));
}
function currentWinner(trick,lead,trump){
 const wizard=trick.find(x=>x.card.type==='wizard');if(wizard)return wizard.id;
 const numbers=trick.filter(x=>x.card.type==='number');
 if(!numbers.length)return trick[0]?.id||null;
 const trumps=numbers.filter(x=>x.card.suit===trump);
 const eligible=trumps.length?trumps:numbers.filter(x=>x.card.suit===lead);
 return eligible.reduce((a,b)=>a.card.value>=b.card.value?a:b).id;
}
function estimateBid(g,id){
 const hand=g.hands[id];
 const estimate=hand.reduce((sum,c)=>sum+cardStrength(c,g,hand),0);
 // Bidding is about hitting the target, not taking as many tricks as possible.
 return Math.max(0,Math.min(g.round,Math.round(estimate)));
}
function botAction(g,id,level){
 const hand=g.hands[id];
 if(g.phase==='choose-trump'){
  const counts=suits.map(suit=>({suit,score:hand.reduce((sum,c)=>sum+(c.type==='number'&&c.suit===suit?(c.value/13)**2+.15:0),0)}));
  counts.sort((a,b)=>b.score-a.score);
  return {type:'trump',suit:level==='easy'?suits[rand(4)]:counts[0].suit};
 }
 if(g.phase==='bidding'){
  const bid=estimateBid(g,id);
  return {type:'bid',count:level==='easy'?Math.max(0,Math.min(g.round,bid+rand(3)-1)):bid};
 }
 const allowed=new Set(legal(g,id));
 const cards=hand.filter(c=>allowed.has(c.id));
 if(level==='easy')return {type:'play',cardId:cards[rand(cards.length)].id};
 const need=Math.max(0,(g.bids[id]||0)-(g.tricks[id]||0));
 const tricksLeft=hand.length;
 const trick=g.trick;
 const lead=g.lead;
 const current=trick.length?currentWinner(trick,lead,g.trump):null;
 const playersAfter=g.players.length-trick.length-1;
 const options=cards.map(card=>{
  const trial=[...trick,{id,card}];
  const trialLead=lead||(card.type==='number'?card.suit:null);
  const winsNow=currentWinner(trial,trialLead,g.trump)===id;
  const strength=cardStrength(card,g,hand);
  let chance=winsNow?Math.pow(strength,playersAfter/Math.max(1,g.players.length-1)):0;
  if(!trick.length)chance=strength;
  if(card.type==='wizard'&&trick.some(t=>t.card.type==='wizard'))chance=0;
  if(card.type==='jester'&&trick.length&&current!==id)chance=0;
  const reserve=card.type==='wizard'?1.6:card.type==='number'?(card.suit===g.trump?.5:0)+card.value/18:0;
  const target=Math.min(1,need/Math.max(1,tricksLeft));
  // When ahead of the bid, dump dangerous high cards without winning.
  const score=need===0
   ?-chance*12+reserve*.65+(card.type==='wizard'?-2:0)
   :-(chance-target)**2*8-reserve*.28+(winsNow&&need>=tricksLeft?2:0);
  return {card,score,chance};
 });
 options.sort((a,b)=>b.score-a.score||a.card.id.localeCompare(b.card.id));
 return {type:'play',cardId:options[0].card.id};
}
module.exports={create,act,restart,view,botAction};
