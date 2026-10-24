'use strict';
(()=>{
 const $=id=>document.getElementById(id),node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 let room=null,game=null,rows=[],rack=[],active=0,signature='',sortMode='color',animatedDraw='';
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
 function sortGroup(ids){
  const map=lookup();
  const plain=ids.map(id=>map.get(id)).filter(t=>t&&t.color!=='joker');
  if(!plain.length)return;
  const isSet=new Set(plain.map(t=>t.value)).size===1;
  const colors=new Set(plain.map(t=>t.color));
  if(isSet){
   ids.sort((a,b)=>{
    const x=map.get(a),y=map.get(b);
    return (colorOrder[x.color]-colorOrder[y.color])||x.id.localeCompare(y.id);
   });
  }else if(colors.size===1){
   // Joker keep their relative positions to preserve their represented values.
   const sorted=plain.slice().sort((a,b)=>a.value-b.value||a.id.localeCompare(b.id));
   let next=0;
   for(let i=0;i<ids.length;i++)if(map.get(ids[i]).color!=='joker')ids[i]=sorted[next++].id;
  }
 }
 function splitGroup(index,at){
  const left=rows[index].slice(0,at),right=rows[index].slice(at);
  if(!left.length||!right.length)return;
  rows.splice(index,1,left,right);active=index+1;render();
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
 function reset(){if(!game)return;rows=game.table.map(r=>r.map(t=>t.id));rack=game.hand.map(t=>t.id);sortRack();active=rows.length;render();}
 function render(){
  if(!game)return;
  const myTurn=game.turn===identity?.id&&!game.finished;
  const map=lookup();
  $('rommy-status').textContent=game.finished?'🏆 '+(room?.players.find(p=>p.id===game.winner)?.name||'Mitspieler')+' gewinnt!':myTurn?'🎯 Du bist am Zug!':'Warte auf '+(room?.players.find(p=>p.id===game.turn)?.name||'Mitspieler')+'.';
  $('rommy-bag').textContent='Beutel: '+game.bagCount+' Steine · '+(game.opened?'Erstauslage geschafft':'Erstauslage: mindestens 30 Punkte');
  const players=$('rommy-players');players.replaceChildren();
  for(const p of game.players){const n=room?.players.find(x=>x.id===p.id)?.name||'Mitspieler';players.append(node('span','rommy-player'+(p.id===game.turn?' active':''),n+' · '+p.count));}
  const table=$('rommy-table');table.replaceChildren();
  rows.forEach((ids,index)=>{
   const line=node('div','rommy-row'+(active===index?' selected':''));const head=node('button','rommy-row-select','Gruppe '+(index+1)+(active===index?' ✓':''));
   head.type='button';head.disabled=!myTurn;head.onclick=()=>{active=index;render();};line.append(head);
   const tiles=node('div','rommy-row-tiles');
   ids.forEach((id,pos)=>{
    if(pos>0){
     const split=node('button','rommy-split','✂');
     split.type='button';split.title='Gruppe nach Stein '+pos+' teilen';
     split.setAttribute('aria-label','Gruppe '+(index+1)+' nach '+pos+' Steinen teilen');
     split.disabled=!myTurn;
     split.onclick=()=>splitGroup(index,pos);
     tiles.append(split);
    }
    const t=map.get(id);if(!t)return;const b=tile(t);b.disabled=!myTurn;b.onclick=()=>{
    rows[index].splice(pos,1);rack.push(id);sortRack();render();
   };tiles.append(b);});
   if(!ids.length)tiles.append(node('span','rommy-empty','Hier Steine ablegen'));
   line.append(tiles);table.append(line);
  });
  const add=$('rommy-add-row');add.disabled=!myTurn;add.onclick=()=>{rows.push([]);active=rows.length-1;render();};
  $('rommy-sort-color').setAttribute('aria-pressed',String(sortMode==='color'));
  $('rommy-sort-value').setAttribute('aria-pressed',String(sortMode==='value'));
  const hand=$('rommy-hand');hand.replaceChildren();
  const fromTable=originalTableIds();
  for(const id of rack){const t=map.get(id);if(!t)continue;const b=tile(t);
   if(fromTable.has(id)){b.classList.add('rommy-table-tile-in-rack');b.title+=' · vom Spieltisch (muss zurück auf den Tisch)';}if(game.latestDraw?.tileId===id){b.classList.add('rommy-new-tile');if(animatedDraw===id)b.classList.add('rommy-tile-arriving');}b.disabled=!myTurn;b.onclick=()=>{
   if(active>=rows.length){rows.push([]);active=rows.length-1;}
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
