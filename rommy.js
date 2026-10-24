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
function beginTurn(g){
 const id=g.players[g.turn];
 const stone=g.bag.length?g.bag.pop():null;
 if(stone)g.hands[id].push(stone);
 g.latestDraw=stone?{player:id,tileId:stone.id,revision:g.revision+1}:null;
 event(g,id,stone?'zieht zu Zugbeginn einen Stein.':'beginnt den Zug (Beutel leer).');
}
function create(players){
 const bag=tiles(),hands={};
 for(const id of players)hands[id]=Array.from({length:14},()=>bag.pop());
 const g={players:[...players],hands,bag,table:[],opened:Object.fromEntries(players.map(id=>[id,false])),turn:0,finished:false,winner:null,events:[],revision:0,latestDraw:null,turnCount:0,newTableTiles:{}};
 beginTurn(g);return g;
}
function event(g,id,text){g.events.push({id:g.events.length,at:Date.now(),actor:id,text});g.revision++;}
function act(g,id,a){
 if(g.finished)throw Error('Die Partie ist beendet.');
 if(g.players[g.turn]!==id)throw Error('Du bist nicht am Zug.');
 if(!a||typeof a!=='object')throw Error('Ungültige Aktion.');
 const hand=g.hands[id];
 if(a.type==='pass'){
  event(g,id,'passt.');g.turn=(g.turn+1)%g.players.length;g.turnCount=(g.turnCount||0)+1;beginTurn(g);return;
 }
 if(a.type==='draw')throw Error('Der Stein wird bereits zu Zugbeginn automatisch gezogen.');
 if(a.type!=='place')throw Error('Unbekannte Aktion.');
 const groups=a.groups;
 if(!Array.isArray(groups)||groups.length>40||groups.some(row=>!Array.isArray(row)||row.length<3||row.length>13))throw Error('Ungültige Steingruppen.');
 const old=g.table.flat(),all=[...old,...hand],byId=new Map(all.map(t=>[t.id,t]));
 const ids=groups.flat();
 if(new Set(ids).size!==ids.length||ids.some(x=>typeof x!=='string'||!byId.has(x)))throw Error('Unbekannte oder doppelte Steine.');
 if(old.some(t=>!ids.includes(t.id)))throw Error('Alle bereits ausgelegten Steine müssen auf dem Tisch bleiben.');
 const used=ids.filter(x=>hand.some(t=>t.id===x));
 if(!used.length)throw Error('Du musst mindestens einen eigenen Stein auslegen.');
 if(!g.opened[id]&&JSON.stringify(groups.filter(row=>row.some(x=>old.some(t=>t.id===x))))!==JSON.stringify(g.table.map(row=>row.map(t=>t.id))))
  throw Error('Bei der Erstauslage darfst du keine Tischsteine verändern.');
 let score=0;
 for(const row of groups){
  const value=meldValue(row.map(x=>byId.get(x)));
  if(value===null)throw Error('Ungültige Reihe oder Gruppe. Joker und Reihenfolge prüfen.');
  if(row.some(x=>used.includes(x)))score+=value;
 }
 if(!g.opened[id]&&score<30)throw Error('Die Erstauslage muss mindestens 30 Punkte ergeben.');
 g.table=groups.map(row=>row.map(x=>byId.get(x)));
 const selected=new Set(used);g.hands[id]=hand.filter(t=>!selected.has(t.id));g.opened[id]=true;
 g.newTableTiles||={};for(const tileId of used)g.newTableTiles[tileId]=g.turnCount||0;
 event(g,id,'legt '+used.length+' Stein'+(used.length===1?'':'e')+' aus.');
 if(!g.hands[id].length){g.finished=true;g.winner=id;event(g,id,'hat alle Steine abgelegt und gewinnt!');}
 else {g.turn=(g.turn+1)%g.players.length;g.turnCount=(g.turnCount||0)+1;beginTurn(g);}
}
function view(g,id){return {game:'rommy',players:g.players.map(p=>({id:p,count:g.hands[p].length,opened:g.opened[p]})),hand:g.hands[id].map(t=>({...t})),table:g.table.map(row=>row.map(t=>({...t}))),turn:g.players[g.turn],bagCount:g.bag.length,opened:g.opened[id],finished:g.finished,winner:g.winner,events:g.events,revision:g.revision,latestDraw:g.latestDraw?.player===id?g.latestDraw:null,newTableTileIds:Object.entries(g.newTableTiles||{}).filter(([,turn])=>(g.turnCount||0)-turn<g.players.length).map(([tileId])=>tileId)};}

function candidates(pool,limit=6500){
 const out=[],seen=new Set();
 const add=row=>{
  const ids=row.map(t=>t.id),key=ids.join(',');
  if(!seen.has(key)&&meldValue(row)!==null){seen.add(key);out.push({ids,tiles:row,score:meldValue(row)});}
 };
 const jokers=pool.filter(t=>t.color==='joker');
 const normal=pool.filter(t=>t.color!=='joker');
 const byColor=Object.fromEntries(COLORS.map(c=>[c,normal.filter(t=>t.color===c)]));
 const byNumber=new Map();
 for(const t of normal){if(!byNumber.has(t.value))byNumber.set(t.value,[]);byNumber.get(t.value).push(t);}
 function choose(arr,count,cb,selected=[],offset=0){
  if(!count){cb(selected);return;}
  for(let i=offset;i<=arr.length-count;i++)choose(arr,count-1,cb,[...selected,arr[i]],i+1);
 }
 // Number groups, with distinct colours and up to two jokers.
 for(let value=1;value<=13;value++){
  const stones=byNumber.get(value)||[];
  for(let n=3;n<=4;n++)for(let j=0;j<=Math.min(jokers.length,n-1);j++)
   choose(stones,n-j,part=>{
    if(new Set(part.map(t=>t.color)).size!==part.length)return;
    choose(jokers,j,js=>add([...part,...js]));
   });
 }
 // Runs: choose a physical copy for each value, optionally replace a slot by a joker.
 for(const color of COLORS){
  const values=new Map();
  for(const t of byColor[color]){if(!values.has(t.value))values.set(t.value,[]);values.get(t.value).push(t);}
  for(let first=1;first<=11;first++)for(let last=first+2;last<=13;last++){
   const slots=Array.from({length:last-first+1},(_,i)=>values.get(first+i)||[]);
   const build=(i,row,usedJokers)=>{
    if(out.length>=limit)return;
    if(i===slots.length){add(row);return;}
    for(const t of slots[i])build(i+1,[...row,t],usedJokers);
    if(usedJokers<jokers.length)for(let j=0;j<jokers.length;j++){
     const joker=jokers[j];if(row.includes(joker))continue;
     build(i+1,[...row,joker],usedJokers+1);
    }
   };
   build(0,[],0);
  }
 }
 return out;
}
function botAction(g,id){
 const hand=g.hands[id],base=g.table.map(row=>row.map(t=>t.id));
 const owned=new Set(hand.map(t=>t.id));
 const plainHand=hand.filter(t=>t.color!=='joker');
 const rank=ids=>ids.filter(t=>owned.has(t)).length;
 const handMelds=candidates(hand).filter(c=>c.ids.every(t=>owned.has(t)));
 // Combine multiple melds for opening 30 and for laying several groups in one turn.
 const bestHand={score:-1,rows:[]};
 let handNodes=0;
 function handSearch(available,chosen,points,depth){
  if(++handNodes>1800)return;
  const used=chosen.flatMap(r=>r.ids);
  const score=used.length*100+points;
  if((g.opened[id]||points>=30)&&score>bestHand.score){
   bestHand.score=score;bestHand.rows=chosen.map(r=>r.ids);
  }
  if(depth>=4||!available.length)return;
  const usedSet=new Set(used);
  const options=available.filter(r=>r.ids.every(t=>!usedSet.has(t))).sort((a,b)=>b.ids.length-a.ids.length||b.score-a.score).slice(0,24);
  for(const row of options)handSearch(options.filter(r=>r!==row),[...chosen,row],points+row.score,depth+1);
 }
 handSearch(handMelds,[],0,0);
 if(!g.opened[id])return bestHand.score<0?{type:'pass'}:{type:'place',groups:[...base,...bestHand.rows]};
 let best={count:bestHand.rows.flat().length,groups:[...base,...bestHand.rows]};
 // Rebuild a single existing table group: extend, reorder, replace joker,
 // or split it into multiple valid groups using hand tiles.
 for(let i=0;i<g.table.length;i++){
  const old=g.table[i],oldIds=new Set(old.map(t=>t.id));
  const pool=[...old,...hand];
  const options=candidates(pool).filter(c=>c.ids.some(t=>oldIds.has(t)));
  const byOld=new Map();
  for(const row of options)for(const tileId of row.ids)if(oldIds.has(tileId)){
   if(!byOld.has(tileId))byOld.set(tileId,[]);
   byOld.get(tileId).push(row);
  }
  let nodes=0;
  function search(remaining,used,chosen){
   if(++nodes>12000)return;
   if(!remaining.size){
    const handUsed=chosen.flatMap(c=>c.ids).filter(t=>owned.has(t));
    const extra=handMelds.filter(c=>c.ids.every(t=>!used.has(t))).sort((a,b)=>b.ids.length-a.ids.length);
    const extras=[],taken=new Set(used);
    for(const row of extra)if(row.ids.every(t=>!taken.has(t))){extras.push(row.ids);row.ids.forEach(t=>taken.add(t));}
    const count=handUsed.length+extras.flat().length;
    if(count>best.count){best={count,groups:[...base.filter((_,j)=>j!==i),...chosen.map(c=>c.ids),...extras]};}
    return;
   }
   const next=[...remaining].sort((a,b)=>(byOld.get(a)?.length||0)-(byOld.get(b)?.length||0))[0];
   const opts=(byOld.get(next)||[]).filter(c=>c.ids.every(t=>!used.has(t))).sort((a,b)=>rank(b.ids)-rank(a.ids));
   for(const row of opts.slice(0,90)){
    const nextRemaining=new Set(remaining);
    row.ids.forEach(t=>nextRemaining.delete(t));
    search(nextRemaining,new Set([...used,...row.ids]),[...chosen,row]);
   }
  }
  search(new Set(oldIds),new Set(),[]);
 }
 return best.count?{type:'place',groups:best.groups}:{type:'pass'};
}
module.exports={create,act,view,botAction,meldValue};
