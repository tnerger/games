'use strict';
(()=>{
 const $=id=>document.getElementById(id),send=(event,data)=>emit(event,data);
 const colors={red:'Rot',yellow:'Gelb',green:'Grün',blue:'Blau'};
 let room=null,lastRound=null;
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const name=id=>{const p=room?.players.find(p=>p.id===id);return p?playerName(p):'Mitspieler';};
 const btn=(text,fn,cls='secondary')=>{const b=node('button',text,cls);b.onclick=fn;return b;};
 function card(c,enabled,fn){const b=btn(String(c.value),fn,'elfer-card elfer-'+c.color+(enabled?' elfer-playable':''));b.disabled=!enabled;b.title=colors[c.color]+' '+c.value;return b;}
 $('start-elfer').onclick=()=>send('game:start',{});
 $('elfer-restart').onclick=()=>send('game:restart',{});
 $('elfer-result-close').onclick=()=>{$('elfer-result-overlay').classList.add('hidden');};
 $('elfer-result-reopen').onclick=()=>{$('elfer-result-overlay').classList.remove('hidden');};
 $('elfer-log-toggle').onclick=()=>{const e=$('elfer-log');e.classList.toggle('hidden');$('elfer-log-toggle').textContent=e.classList.contains('hidden')?'Spielverlauf anzeigen':'Spielverlauf ausblenden';};
 socket.on('room',r=>{
  room=r;const selected=r.selectedGame||'uno';
  $('elfer-setup').classList.toggle('hidden',r.gameStarted||selected!=='elfer');
  $('start-elfer').classList.toggle('hidden',r.host!==identity?.id);
  $('elfer-play').classList.toggle('hidden',r.activeGame!=='elfer');
  if(r.activeGame==='elfer'){$('uno-play').classList.add('hidden');$('skyjo-play').classList.add('hidden');$('wizard-play').classList.add('hidden');$('uno-setup').classList.add('hidden');$('skyjo-setup').classList.add('hidden');$('wizard-setup').classList.add('hidden');}
  if(!r.gameStarted){lastRound=null;$('elfer-result-overlay').classList.add('hidden');$('elfer-draw-overlay').classList.add('hidden');}
 });
 socket.on('game:state',g=>{
  if(g.game!=='elfer')return;
  $('elfer-play').classList.remove('hidden');
  $('uno-play').classList.add('hidden');$('skyjo-play').classList.add('hidden');$('wizard-play').classList.add('hidden');
  const mine=g.turn===identity?.id;
  $('elfer-status').textContent=g.finished?'🏁 Runde beendet':mine?'🎯 Du bist am Zug!':name(g.turn)+' ist am Zug.';
  const people=$('elfer-players');people.replaceChildren();
  for(const p of g.players){const item=node('div',(g.turn===p.id&&!g.finished?'▶ ':'')+name(p.id)+' · '+p.count+' Karten','elfer-player'+(g.turn===p.id&&!g.finished?' active':''));people.append(item);}
  const board=$('elfer-board');board.replaceChildren();
  for(const color of Object.keys(colors)){
   const row=node('div',undefined,'elfer-row');
   row.append(node('strong',colors[color],'elfer-row-name'));
   const numbers=node('div',undefined,'elfer-row-numbers');
   const laid=new Set(g.rows[color]);
   for(let v=1;v<=20;v++){
    const slot=node('span',laid.has(v)?String(v):'','elfer-slot'+(laid.has(v)?' elfer-'+color:'')+(v===11?' elfer-eleven':''));
    if(!laid.has(v))slot.setAttribute('aria-label',colors[color]+' '+v+' noch nicht gelegt');
    numbers.append(slot);
   }
   row.append(numbers);board.append(row);
  }
  const last=g.events.at(-1);$('elfer-last').textContent=last?(last.actor?name(last.actor)+': ':'')+last.text:'';
  const draw=g.pendingDraw;
  $('elfer-draw-overlay').classList.toggle('hidden',!draw||!mine||g.finished);
  if(draw&&mine&&!g.finished){
   const required=g.legal.some(c=>c.color===draw.color&&c.value===draw.value);
   $('elfer-draw-title').textContent=required?'🃏 Diese Karte musst du legen!':'🂠 Du hast eine Karte gezogen';
   $('elfer-draw-message').textContent=required?'Die gezogene Karte passt. Sie muss jetzt angelegt werden.':'Diese Karte passt noch nicht und bleibt auf deiner Hand.';
   $('elfer-draw-card').replaceChildren(card(draw,false,()=>{}));
   $('elfer-draw-confirm').textContent=required?'Karte legen & Zug beenden':'Verstanden · Weiter';
   $('elfer-draw-confirm').onclick=()=>send('game:action',required?{type:'play',color:draw.color,value:draw.value}:{type:'ack-draw'});
  }
  const actions=$('elfer-actions');actions.replaceChildren();
  if(mine&&!g.finished&&!draw){
   if(g.played)actions.append(btn('✓ Zug beenden →',()=>send('game:action',{type:'end'}),'elfer-end-turn'));
   else if(!g.legal.length)actions.append(g.deckCount&&g.drawn<3?btn('🂠 Karte ziehen ('+(3-g.drawn)+' übrig)',()=>send('game:action',{type:'draw'})):btn('Weiter / Passen',()=>send('game:action',{type:'pass'})));
  }
  if(!g.finished)actions.append(node('span','Ziehstapel: '+g.deckCount+' Karten','elfer-deck-count'));
  const hand=$('elfer-hand');hand.replaceChildren();
  const playable=new Set(g.legal.map(c=>c.color+':'+c.value));
  for(const c of [...g.hand].sort((a,b)=>Object.keys(colors).indexOf(a.color)-Object.keys(colors).indexOf(b.color)||a.value-b.value))hand.append(card(c,mine&&!g.finished&&!draw&&playable.has(c.color+':'+c.value),()=>send('game:action',{type:'play',color:c.color,value:c.value})));
  const scores=$('elfer-scores');scores.replaceChildren(node('h3','Punktestand (Minuspunkte)'));
  for(const p of g.players)scores.append(node('p',name(p.id)+': '+p.score+(g.roundScores?' (Runde: '+g.roundScores[p.id]+')':'')));
  $('elfer-restart').classList.toggle('hidden',!g.finished||room?.host!==identity?.id);
  $('elfer-result-reopen').classList.toggle('hidden',!g.finished);
  if(g.finished){
   $('elfer-result-title').textContent='🏆 '+name(g.winner)+' gewinnt!';
   const t=node('table'),header=node('tr');
   for(const h of ['Spieler','Runde','Gesamt'])header.append(node('th',h));t.append(header);
   for(const p of [...g.players].sort((a,b)=>g.roundScores[a.id]-g.roundScores[b.id])){
    const tr=node('tr');for(const v of [name(p.id),g.roundScores[p.id],p.score])tr.append(node('td',String(v)));t.append(tr);
   }
   $('elfer-result-content').replaceChildren(t);
   const key=(room?.code||'')+':'+g.events[0]?.at;
   if(lastRound!==key){lastRound=key;$('elfer-result-overlay').classList.remove('hidden');}
  }
  const log=$('elfer-log');log.replaceChildren(...g.events.slice(-60).reverse().map(e=>node('p',new Date(e.at).toLocaleTimeString('de-DE')+' · '+(e.actor?name(e.actor)+': ':'')+e.text)));
 });
})();
