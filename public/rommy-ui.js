'use strict';
(()=>{
 const $=id=>document.getElementById(id),node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 let room=null,game=null,rows=[],rack=[],active=-1,signature='',sortMode='color',animatedDraw='',splitMode=new Set();
 const colorOrder={red:0,blue:1,black:2,orange:3,joker:4};
 const labels={red:'Rot',blue:'Blau',black:'Schwarz',orange:'Orange',joker:'Joker'};
 const send=(action)=>emit('game:action',action);
 const tile=t=>{
  const b=node('button','rommy-tile rommy-'+t.color,t.color==='joker'?'★':String(t.value));
  b.type='button';b.title=labels[t.color]+(t.color==='joker'?'':' '+t.value);b.setAttribute('aria-label',b.title);
  return b;
 };
 const lookup=()=>new Map([...game.hand,...game.table.flat()].map(t=>[t.id,t]));
 const originalTableIds=()=>new Set(game.table.flat().map(t=>t.id));
 function meldPoints(tiles){
  if(tiles.length<3||tiles.length>13)return null;
  const plain=tiles.filter(t=>t.color!=='joker');
  if(!plain.length)return null;
  if(tiles.length<=4&&plain.every(t=>t.value===plain[0].value)&&new Set(plain.map(t=>t.color)).size===plain.length)return tiles.length*plain[0].value;
  if(new Set(plain.map(t=>t.color)).size!==1)return null;
  let start=null;
  for(let i=0;i<tiles.length;i++)if(tiles[i].color!=='joker'){
   const candidate=tiles[i].value-i;
   if(start!==null&&start!==candidate)return null;
   start=candidate;
  }
  if(start===null||start<1||start+tiles.length-1>13)return null;
  return tiles.reduce((sum,t,i)=>sum+start+i,0);
 }
 function renderOpeningCounter(map){
  const counter=$('rommy-opening-counter');
  if(game.opened||game.finished){counter.classList.add('hidden');return;}
  counter.classList.remove('hidden');
  const own=new Set(game.hand.map(t=>t.id));
  let score=0,invalid=0;
  for(const ids of rows){
   if(!ids.some(id=>own.has(id)))continue;
   const points=meldPoints(ids.map(id=>map.get(id)).filter(Boolean));
   if(points===null)invalid++;else score+=points;
  }
  const missing=Math.max(0,30-score);
  $('rommy-opening-score').textContent=score+' / 30 Punkte';
  $('rommy-opening-needed').textContent=missing?'Noch '+missing+' Punkte benötigt':invalid?'30 Punkte erreicht – Gruppen prüfen':'30 Punkte erreicht!';
  counter.classList.toggle('complete',!missing&&!invalid);
  counter.classList.toggle('invalid',invalid>0);
  $('rommy-opening-progress').style.width=Math.min(100,score/30*100)+'%';
  $('rommy-opening-warning').textContent=invalid?invalid+' unvollständige oder ungültige Gruppe(n) zählen noch nicht.':'';
 }
 function sortGroup(ids){
  const map=lookup(),tiles=ids.map(id=>map.get(id));
  if(tiles.some(t=>!t))return;
  const plain=tiles.filter(t=>t.color!=='joker');
  const jokers=tiles.filter(t=>t.color==='joker');
  if(!plain.length)return;
  if(plain.every(t=>t.value===plain[0].value)){
   ids.splice(0,ids.length,...plain.sort((a,b)=>colorOrder[a.color]-colorOrder[b.color]||a.id.localeCompare(b.id)).map(t=>t.id),...jokers.map(t=>t.id));
   return;
  }
  if(new Set(plain.map(t=>t.color)).size!==1)return;
  const sorted=plain.slice().sort((a,b)=>a.value-b.value||a.id.localeCompare(b.id));
  // Try each possible start, filling number gaps with jokers and preserving
  // the joker positions where possible. Never reorder an already valid run.
  if(meldPoints(tiles)!==null)return;
  const n=ids.length;
  let best=null;
  for(let start=1;start<=14-n;start++){
   const slots=Array(n).fill(null),remaining=[];
   let valid=true;
   for(const t of sorted){
    const pos=t.value-start;
    if(pos<0||pos>=n||slots[pos]){valid=false;break;}
    slots[pos]=t;
   }
   if(!valid)continue;
   for(let i=0;i<n;i++)if(!slots[i])remaining.push(i);
   if(remaining.length!==jokers.length)continue;
   const candidate=slots.slice();
   remaining.forEach((pos,i)=>candidate[pos]=jokers[i]);
   const score=candidate.reduce((sum,t,i)=>sum+Math.abs(ids.indexOf(t.id)-i),0);
   if(!best||score<best.score)best={candidate,score};
  }
  if(best)ids.splice(0,ids.length,...best.candidate.map(t=>t.id));
  else {
   // Partial/incomplete row: keep jokers available rather than placing them
   // permanently in a wrong numeric slot.
   ids.splice(0,ids.length,...sorted.map(t=>t.id),...jokers.map(t=>t.id));
  }
 }
 function splitGroup(index,at){
  const left=rows[index].slice(0,at),right=rows[index].slice(at);
  if(!left.length||!right.length)return;
  rows.splice(index,1,left,right);splitMode.clear();active=index+1;render();
 }
 function sortRack(){
  if(!game)return;
  const map=lookup();
  rack.sort((a,b)=>{
   const x=map.get(a),y=map.get(b);
   if(!x||!y)return 0;
   if(sortMode==='color')return colorOrder[x.color]-colorOrder[y.color]||x.value-y.value||x.id.localeCompare(y.id);
   return (x.color==='joker'?14:x.value)-(y.color==='joker'?14:y.value)||colorOrder[x.color]-colorOrder[y.color]||x.id.localeCompare(y.id);
  });
 }
 function reset(){if(!game)return;splitMode.clear();rows=game.table.map(r=>r.map(t=>t.id));rack=game.hand.map(t=>t.id);sortRack();active=-1;render();}
 function render(){
  if(!game)return;
  const myTurn=game.turn===identity?.id&&!game.finished;
  const map=lookup();
  renderOpeningCounter(map);
  $('rommy-status').textContent=game.finished?'🏆 '+(room?.players.find(p=>p.id===game.winner)?.name||'Mitspieler')+' gewinnt!':myTurn?'🎯 Du bist am Zug!':'Warte auf '+(room?.players.find(p=>p.id===game.turn)?.name||'Mitspieler')+'.';
  $('rommy-bag').textContent='Beutel: '+game.bagCount+' Steine · '+(game.opened?'Erstauslage geschafft':'Erstauslage: mindestens 30 Punkte');
  const players=$('rommy-players');players.replaceChildren();
  for(const p of game.players){const n=room?.players.find(x=>x.id===p.id)?.name||'Mitspieler';players.append(node('span','rommy-player'+(p.id===game.turn?' active':''),n+' · '+p.count));}
  const table=$('rommy-table');table.replaceChildren();
  const recentlyPlaced=new Set(game.newTableTileIds||[]);
  const ownHand=new Set(game.hand.map(t=>t.id));
  rows.forEach((ids,index)=>{
   const line=node('div','rommy-row'+(active===index?' selected':''));
   line.setAttribute('role','group');line.setAttribute('aria-label','Gruppe '+(index+1));const head=node('button','rommy-row-select','Gruppe '+(index+1)+(active===index?' ✓':''));
   head.type='button';head.disabled=!myTurn;head.onclick=()=>{active=active===index?-1:index;splitMode.clear();render();};line.append(head);
   const toggle=node('button','rommy-split-toggle'+(splitMode.has(index)?' active':''),'✂');
   toggle.type='button';toggle.title=splitMode.has(index)?'Teilungspunkte ausblenden':'Teilungspunkte anzeigen';
   toggle.setAttribute('aria-label',toggle.title);
   toggle.setAttribute('aria-pressed',String(splitMode.has(index)));
   toggle.disabled=!myTurn||ids.length<2;
   toggle.onclick=()=>{if(splitMode.has(index))splitMode.delete(index);else splitMode.add(index);render();};
   if(active===index)line.append(toggle);
   const tiles=node('div','rommy-row-tiles');
   ids.forEach((id,pos)=>{
    if(pos>0&&active===index&&splitMode.has(index)){
     const split=node('button','rommy-split','✂');
     split.type='button';split.title='Gruppe nach Stein '+pos+' teilen';
     split.setAttribute('aria-label','Gruppe '+(index+1)+' nach '+pos+' Steinen teilen');
     split.disabled=!myTurn;
     split.onclick=()=>splitGroup(index,pos);
     tiles.append(split);
    }
    const t=map.get(id);if(!t)return;const b=tile(t);
    if(recentlyPlaced.has(id)||ownHand.has(id))b.classList.add('rommy-recently-placed');
    b.disabled=!myTurn;b.onclick=()=>{
    if(active!==index){active=index;splitMode.clear();render();return;}
    rows[index].splice(pos,1);rack.push(id);sortRack();render();
   };tiles.append(b);});
   if(!ids.length)tiles.append(node('span','rommy-empty','Hier Steine ablegen'));
   line.append(tiles);table.append(line);
  });
  const add=$('rommy-add-row');add.disabled=!myTurn;add.onclick=()=>{rows.push([]);active=rows.length-1;splitMode.clear();render();};
  $('rommy-hand-hint').classList.toggle('hidden',!myTurn||active>=0);
  $('rommy-sort-color').setAttribute('aria-pressed',String(sortMode==='color'));
  $('rommy-sort-value').setAttribute('aria-pressed',String(sortMode==='value'));
  const hand=$('rommy-hand');hand.replaceChildren();
  const fromTable=originalTableIds();
  for(const id of rack){const t=map.get(id);if(!t)continue;const b=tile(t);
   if(fromTable.has(id)){b.classList.add('rommy-table-tile-in-rack');b.title+=' · vom Spieltisch (muss zurück auf den Tisch)';}if(game.latestDraw?.tileId===id){b.classList.add('rommy-new-tile');if(animatedDraw===id)b.classList.add('rommy-tile-arriving');}b.disabled=!myTurn;b.onclick=()=>{
   if(active<0||active>=rows.length){return;}
   rows[active].push(id);sortGroup(rows[active]);rack=rack.filter(x=>x!==id);render();
  };hand.append(b);}
  animatedDraw='';
  const moved=rack.length!==game.hand.length||rack.some(id=>!game.hand.some(t=>t.id===id))||JSON.stringify(rows)!==JSON.stringify(game.table.map(r=>r.map(t=>t.id)));
  $('rommy-reset').disabled=!myTurn||!moved;
  $('rommy-submit').disabled=!myTurn||!moved;
  $('rommy-draw').disabled=!myTurn||moved;
  $('rommy-restart').classList.toggle('hidden',!game.finished||room?.host!==identity?.id);
  const last=game.events.at(-1);$('rommy-last').textContent=last?last.text:'';
 }
 $('start-rommy').onclick=()=>emit('game:start',{});
 $('rommy-restart').onclick=()=>emit('game:restart',{});
 $('rommy-reset').onclick=reset;
 $('rommy-sort-color').onclick=()=>{sortMode='color';sortRack();render();};
 $('rommy-sort-value').onclick=()=>{sortMode='value';sortRack();render();};
 $('rommy-submit').onclick=()=>{
  const groups=rows.filter(r=>r.length);
  if(rows.some(r=>r.length>0&&r.length<3))return status('Jede ausgelegte Gruppe benötigt mindestens drei Steine.');
  emit('game:action',{type:'place',groups},()=>{});
 };
 $('rommy-draw').onclick=()=>send({type:'pass'});
 socket.on('room',r=>{
  room=r;
  const selected=r.selectedGame||'uno';
  $('rommy-setup').classList.toggle('hidden',r.gameStarted||selected!=='rommy');
  $('start-rommy').classList.toggle('hidden',r.host!==identity?.id);
  $('rommy-play').classList.toggle('hidden',r.activeGame!=='rommy');
  if(r.activeGame==='rommy'){
   for(const id of ['uno-play','skyjo-play','wizard-play','elfer-play','uno-setup','skyjo-setup','wizard-setup','elfer-setup'])$(id).classList.add('hidden');
  }
  if(!r.gameStarted){game=null;signature='';}
 });
 socket.on('game:state',g=>{
  if(g.game!=='rommy')return;
  game=g;
  const sig=g.revision+':'+g.turn+':'+g.finished;
  if(sig!==signature){animatedDraw=g.latestDraw?.tileId||'';signature=sig;reset();}else render();
  $('rommy-play').classList.remove('hidden');
  for(const id of ['uno-play','skyjo-play','wizard-play','elfer-play'])$(id).classList.add('hidden');
 });
})();
