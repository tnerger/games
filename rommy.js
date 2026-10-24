'use strict';
const crypto=require('node:crypto');
const COLORS=['red','blue','black','orange'];
function tiles(){
 const a=[];let n=0;
 for(let copy=0;copy<2;copy++)for(const color of COLORS)for(let value=1;value<=13;value++)a.push({id:'t'+n++,color,value});
 a.push({id:'t'+n++,color:'joker',value:0},{id:'t'+n++,color:'joker',value:0});
 for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}
 return a;
}
function meldValue(m){
 if(m.length<3||m.length>13)return null;
 const jokers=m.filter(t=>t.color==='joker');
 const plain=m.filter(t=>t.color!=='joker');
 if(!plain.length)return null;
 // Same-number group, max four different colours
 if(m.length<=4&&plain.every(t=>t.value===plain[0].value)&&new Set(plain.map(t=>t.color)).size===plain.length)
  return m.length*plain[0].value;
 // Consecutive ascending run; joker slots count as their represented value.
 if(new Set(plain.map(t=>t.color)).size!==1)return null;
 let start=null;
 for(let i=0;i<m.length;i++)if(m[i].color!=='joker'){
  const candidate=m[i].value-i;
  if(start!==null&&start!==candidate)return null;
  start=candidate;
 }
 if(start===null||start<1||start+m.length-1>13)return null;
 return m.reduce((sum,t,i)=>sum+start+i,0);
}
function create(players){
 const bag=tiles(),hands={};
 for(const id of players)hands[id]=Array.from({length:14},()=>bag.pop());
 return {players:[...players],hands,bag,table:[],opened:Object.fromEntries(players.map(id=>[id,false])),turn:0,finished:false,winner:null,events:[],revision:0};
}
function event(g,id,text){g.events.push({id:g.events.length,at:Date.now(),actor:id,text});g.revision++;}
function act(g,id,a){
 if(g.finished)throw Error('Die Partie ist beendet.');
 if(g.players[g.turn]!==id)throw Error('Du bist nicht am Zug.');
 if(!a||typeof a!=='object')throw Error('Ungültige Aktion.');
 const hand=g.hands[id];
 if(a.type==='draw'){
  if(!g.bag.length)throw Error('Der Beutel ist leer. Lege Steine ab.');
  hand.push(g.bag.pop());event(g,id,'zieht einen Stein.');
  g.turn=(g.turn+1)%g.players.length;return;
 }
 if(a.type!=='place')throw Error('Unbekannte Aktion.');
 const groups=a.groups;
 if(!Array.isArray(groups)||groups.length>40||groups.some(row=>!Array.isArray(row)||row.length<3||row.length>13))throw Error('Ungültige Steingruppen.');
 const old=g.table.flat(),all=[...old,...hand],byId=new Map(all.map(t=>[t.id,t]));
 const ids=groups.flat();
 if(new Set(ids).size!==ids.length||ids.some(x=>typeof x!=='string'||!byId.has(x)))throw Error('Unbekannte oder doppelte Steine.');
 if(old.some(t=>!ids.includes(t.id)))throw Error('Alle bereits ausgelegten Steine müssen auf dem Tisch bleiben.');
 const used=ids.filter(x=>hand.some(t=>t.id===x));
 if(!used.length)throw Error('Du musst mindestens einen eigenen Stein auslegen.');
 if(!g.opened[id]&&old.length&&groups.some(row=>row.some(x=>old.some(t=>t.id===x))))throw Error('Bei der Erstauslage darfst du keine Tischsteine verändern.');
 let score=0;
 for(const row of groups){
  const value=meldValue(row.map(x=>byId.get(x)));
  if(value===null)throw Error('Ungültige Reihe oder Gruppe. Joker und Reihenfolge prüfen.');
  score+=value;
 }
 if(!g.opened[id]&&score<30)throw Error('Die Erstauslage muss mindestens 30 Punkte ergeben.');
 g.table=groups.map(row=>row.map(x=>byId.get(x)));
 const selected=new Set(used);g.hands[id]=hand.filter(t=>!selected.has(t.id));g.opened[id]=true;
 event(g,id,'legt '+used.length+' Stein'+(used.length===1?'':'e')+' aus.');
 if(!g.hands[id].length){g.finished=true;g.winner=id;event(g,id,'hat alle Steine abgelegt und gewinnt!');}
 else g.turn=(g.turn+1)%g.players.length;
}
function view(g,id){return {game:'rommy',players:g.players.map(p=>({id:p,count:g.hands[p].length,opened:g.opened[p]})),hand:g.hands[id].map(t=>({...t})),table:g.table.map(row=>row.map(t=>({...t}))),turn:g.players[g.turn],bagCount:g.bag.length,opened:g.opened[id],finished:g.finished,winner:g.winner,events:g.events,revision:g.revision};}
function botAction(g,id){
 const hand=g.hands[id];
 // Basic bot: find one complete group or run in its rack.
 for(let i=0;i<hand.length;i++)for(let j=i+1;j<hand.length;j++)for(let k=j+1;k<hand.length;k++){
  const row=[hand[i],hand[j],hand[k]];
  const variants=[row,[row[0],row[2],row[1]],[row[1],row[0],row[2]],[row[1],row[2],row[0]],[row[2],row[0],row[1]],[row[2],row[1],row[0]]];
  for(const v of variants){const points=meldValue(v);if(points!==null&&(g.opened[id]||points>=30))return {type:'place',groups:[...g.table.map(r=>r.map(t=>t.id)),v.map(t=>t.id)]};}
 }
 return {type:'draw'};
}
module.exports={create,act,view,botAction,meldValue};
