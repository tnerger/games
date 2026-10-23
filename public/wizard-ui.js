'use strict';
(()=>{
 const $=id=>document.getElementById(id),send=(name,data)=>emit(name,data);
 let room=null,roundSeen=null,shownResultKey=null;
 let displayedTrickKey=null,latestState=null,playbackBusy=false;
 const pendingStates=[];
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const suits={blue:'Eis',red:'Feuer',green:'Wald',yellow:'Sonne'};
 const name=id=>room?.players.find(p=>p.id===id)?.name||'Mitspieler';
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const button=(text,fn,cls='secondary')=>{const b=node('button',text,cls);b.onclick=fn;return b;};
 function card(c,playable=false,click=null){
  const kind=c.type==='number'?c.suit:c.type;
  const b=button('',()=>click?.(c),'wizard-card '+kind+(playable?' playable':''));
  const art=node('div',undefined,'wizard-art');art.style.backgroundImage='url("/wizard-art/'+kind+'.svg")';
  const top=node('span',c.type==='wizard'?'★':c.type==='jester'?'✦':String(c.value),'wizard-value');
  const bottom=node('span',c.type==='number'?suits[c.suit]:c.type==='wizard'?'Zauberer':'Narr','wizard-card-name');
  b.append(art,top,bottom);b.disabled=!playable;b.title=bottom.textContent+(c.type==='number'?' '+c.value:'');return b;
 }
 function roomUpdate(r){
  room=r;const active=r.activeGame,selected=r.selectedGame||'uno';
  $('wizard-setup').classList.toggle('hidden',r.gameStarted||selected!=='wizard');
  $('start-wizard').classList.toggle('hidden',r.host!==identity?.id);
  $('wizard-play').classList.toggle('hidden',active!=='wizard');
  if(active==='wizard'){$('uno-play').classList.add('hidden');$('skyjo-play').classList.add('hidden');$('uno-setup').classList.add('hidden');$('skyjo-setup').classList.add('hidden');}
  if(!r.gameStarted){roundSeen=null;shownResultKey=null;$('wizard-result-overlay').classList.add('hidden');$('wizard-result-reopen').classList.add('hidden');}
 }
 $('start-wizard').onclick=()=>send('game:start',{});
 $('wizard-next').onclick=()=>send('game:restart',{});
 $('wizard-result-close').onclick=()=>{$('wizard-result-overlay').classList.add('hidden');$('wizard-result-reopen').focus();};
 $('wizard-result-reopen').onclick=()=>{$('wizard-result-overlay').classList.remove('hidden');$('wizard-result-close').focus();};
 $('wizard-log-toggle').onclick=()=>{const l=$('wizard-log');const open=l.classList.toggle('hidden')===false;$('wizard-log-toggle').textContent=open?'Spielverlauf ausblenden':'Spielverlauf anzeigen';};
 socket.on('room',roomUpdate);
 async function renderState(g){
  if(g.game!=='wizard')return;
  $('uno-play').classList.add('hidden');$('skyjo-play').classList.add('hidden');$('wizard-play').classList.remove('hidden');
  const mine=g.turn===identity?.id;
  $('game-switch').disabled=!g.finished;
  const dealerIndex=g.players.findIndex(p=>p.id===g.dealer);
  const firstPlayer=g.players[(dealerIndex+1)%g.players.length];
  $('wizard-round').textContent='Runde '+g.round+' / '+g.maxRounds+' · Geber: '+name(g.dealer)+' · Erste Karte: '+name(firstPlayer.id);
  const trump=$('wizard-trump');trump.replaceChildren(node('strong','Trumpf: '+(g.trump?suits[g.trump]:'Kein Trumpf')));
  if(g.indicator)trump.append(card(g.indicator));
  const table=$('wizard-table');table.replaceChildren();
  for(const play of g.trick){const cell=node('div',undefined,'wizard-played');cell.append(node('span',name(play.id)),card(play.card));table.append(cell);}
  const actions=$('wizard-actions');actions.replaceChildren();
  const last=g.events.at(-1);
  $('wizard-status').textContent=g.finished?'🏁 Runde beendet':g.phase==='choose-trump'?(mine?'🔮 Bestimme die Trumpffarbe':name(g.turn)+' wählt Trumpf'):g.phase==='bidding'?(mine?'🎯 Wie viele Stiche schaffst du?':name(g.turn)+' sagt Stiche an'):mine?'🎯 Du bist am Zug!':name(g.turn)+' spielt.'; 
  if(mine&&g.phase==='choose-trump'){actions.append(node('p','Wähle die Trumpffarbe:'));for(const [s,label] of Object.entries(suits))actions.append(button(label,()=>send('game:action',{type:'trump',suit:s}),'wizard-choice '+s));}
  if(mine&&g.phase==='bidding'){actions.append(node('p','Deine Stichansage:'));const bids=node('div',undefined,'wizard-bids');for(let n=0;n<=g.round;n++)bids.append(button(String(n),()=>send('game:action',{type:'bid',count:n})));actions.append(bids);}
  if(last)actions.append(node('p',last.text,'wizard-last'));
  const me=g.players.find(p=>p.id===identity?.id);
  const personal=$('wizard-my-tricks');
  personal.textContent=me?(me.bid===null?'🎯 Ansage: offen · Stiche: '+me.tricks:'🎯 Ansage '+me.bid+' · Stiche '+me.tricks):'';
  const hand=$('wizard-hand');hand.replaceChildren();for(const c of g.hand)hand.append(card(c,mine&&g.phase==='playing'&&g.legal.includes(c.id),x=>send('game:action',{type:'play',cardId:x.id})));
  const scores=$('wizard-scoreboard');scores.replaceChildren(node('h3','Stiche & Punktestand'));
  const t=node('table');const th=node('tr');for(const x of ['Spieler','Ansage','Stiche','Gesamt'])th.append(node('th',x));t.append(th);
  for(const p of g.players){const tr=node('tr');for(const v of [name(p.id),p.bid??'–',p.tricks,p.score])tr.append(node('td',String(v)));t.append(tr);}scores.append(t);
  if(g.finished&&g.lastRound){
   const result=node('div',undefined,'wizard-result');result.append(node('h3',g.matchFinished?'🏆 Spielende':'✨ Rundenwertung'));
   for(const p of g.players)result.append(node('p',name(p.id)+': Ansage '+g.lastRound.bids[p.id]+' / Stiche '+g.lastRound.tricks[p.id]+' → '+(g.lastRound.points[p.id]>0?'+':'')+g.lastRound.points[p.id]+' Punkte'));
   if(g.matchFinished){const best=Math.max(...g.players.map(p=>p.score));result.append(node('strong','🏆 Gewinner: '+g.players.filter(p=>p.score===best).map(p=>name(p.id)).join(' & ')));}
   scores.append(result);
  }
  $('wizard-next').classList.toggle('hidden',!g.finished||g.matchFinished||room?.host!==identity?.id);
  updateResults(g);
  const log=$('wizard-log');log.replaceChildren(...g.events.slice().reverse().map(e=>node('p',new Date(e.at).toLocaleTimeString('de-DE')+' · '+(e.actor?name(e.actor)+': ':'')+e.text)));
 }
 function updateResults(g){
  const overlay=$('wizard-result-overlay'),reopen=$('wizard-result-reopen');
  if(!g.finished||!g.lastRound){overlay.classList.add('hidden');reopen.classList.add('hidden');return;}
  const key=(room?.code||'')+':'+g.lastRound.round;
  reopen.classList.remove('hidden');
  $('wizard-result-title').textContent=g.matchFinished?'🏆 Spiel beendet!':'✨ Runde '+g.lastRound.round+' beendet!';
  $('wizard-result-description').textContent='So haben alle bei ihren Stichansagen abgeschnitten:';
  const table=$('wizard-result-table');table.replaceChildren();
  const t=node('table');const header=node('tr');for(const label of ['Spieler','Ansage','Stiche','Punkte','Gesamt'])header.append(node('th',label));t.append(header);
  for(const p of g.players){const tr=node('tr');const delta=g.lastRound.points[p.id];
   if(g.lastRound.bids[p.id]===g.lastRound.tricks[p.id])tr.classList.add('wizard-exact');
   for(const v of [name(p.id),g.lastRound.bids[p.id],g.lastRound.tricks[p.id],(delta>0?'+':'')+delta,p.score])tr.append(node('td',String(v)));
   t.append(tr);
  }
  table.append(t);
  const winners=$('wizard-result-winners');
  if(g.matchFinished){const best=Math.max(...g.players.map(p=>p.score));winners.textContent='🏆 Gewinner: '+g.players.filter(p=>p.score===best).map(p=>name(p.id)).join(' & ');}
  else winners.textContent='✓ Genau getroffene Ansagen sind hervorgehoben.';
  if(shownResultKey!==key){shownResultKey=key;overlay.classList.remove('hidden');}
 }
 function trickKey(g){return (room?.code||'')+':'+g.round+':'+(g.lastTrick?.number||0);}
 async function showPlay(play,completed=false){
  const table=$('wizard-table');const cell=node('div',undefined,'wizard-played wizard-arriving');cell.append(node('span',name(play.id)),card(play.card));table.append(cell);
  await sleep(500);cell.classList.remove('wizard-arriving');
 }
 async function processState(g){
  const old=latestState;
  if(!old||old.round!==g.round||old.game!=='wizard'){
   latestState=g;displayedTrickKey=null;const notice=$('wizard-trick-announcement');notice.textContent='';notice.classList.remove('wizard-trick-win');await renderState(g);return;
  }
  const oldEvents=new Set(old.events.map(e=>e.id));
  const fresh=g.events.filter(e=>!oldEvents.has(e.id));
  const plays=fresh.filter(e=>e.text.startsWith('spielt '));
  const finishedTrick=g.lastTrick&&trickKey(g)!==displayedTrickKey&&g.lastTrick.number>(old.lastTrick?.number||0);
  latestState=g;
  if(!plays.length&&!finishedTrick){await renderState(g);return;}
  const table=$('wizard-table');
  if(old.trick.length===0){table.replaceChildren();const notice=$('wizard-trick-announcement');notice.textContent='';notice.classList.remove('wizard-trick-win');}
  for(const e of plays){
   const played=g.trick.find(p=>p.id===e.actor)||g.lastTrick?.cards.find(p=>p.id===e.actor);
   if(played)await showPlay(played);
  }
  if(finishedTrick){
   displayedTrickKey=trickKey(g);
   table.replaceChildren();
   for(const play of g.lastTrick.cards){const cell=node('div',undefined,'wizard-played');cell.append(node('span',name(play.id)),card(play.card));table.append(cell);}
   await sleep(550);
   const notice=$('wizard-trick-announcement');notice.textContent='🏆 '+name(g.lastTrick.winner)+' gewinnt Stich '+g.lastTrick.number+'!';notice.classList.add('wizard-trick-win');
   await sleep(1600);notice.classList.remove('wizard-trick-win');
  }
  await renderState(g);
 }
 socket.on('game:state',g=>{
  if(g.game!=='wizard')return;
  pendingStates.push(g);
  if(playbackBusy)return;
  playbackBusy=true;
  (async()=>{try{while(pendingStates.length)await processState(pendingStates.shift());}catch(err){console.error('Wizard animation:',err);if(latestState)await renderState(latestState);}finally{playbackBusy=false;}})();
 });
})();
