'use strict';
(()=>{
const $=id=>document.getElementById(id);
const send=(name,data)=>emit(name,data);
let room=null,lastState=null,shownResultKey=null,shownRemovalKey=null,discardAnimationTimer=null;
const expandedOpponents=new Set();
let expandedRoomCode=null;
const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
const btn=(label,action,cls='secondary')=>{const x=el('button',label,cls);x.onclick=action;return x;};
const who=id=>{const p=room?.players.find(p=>p.id===id);return p?playerName(p):'Mitspieler';};
const label=v=>v===null?'?':String(v);
function card(v,onclick,disabled=false){
 const x=btn(label(v),onclick,'skyjo-card '+(v===null?'back':v<=0?'low':v<=4?'medium':v<=8?'high':'highest'));
 x.disabled=disabled;x.setAttribute('aria-label',v===null?'Verdeckte Karte':'Karte '+v);return x;
}
function updateRoom(r){
 room=r;if(expandedRoomCode!==r.code){expandedOpponents.clear();expandedRoomCode=r.code;}if(!r.gameStarted){lastState=null;shownResultKey=null;shownRemovalKey=null;$('skyjo-result-overlay').classList.add('hidden');}const selected=r.selectedGame||'uno',active=r.activeGame;
 $('game-picker').classList.toggle('hidden',r.gameStarted);
 $('game-choice').value=selected;$('game-choice').disabled=r.host!==identity?.id;
 $('skyjo-setup').classList.toggle('hidden',r.gameStarted||selected!=='skyjo');
 $('start-skyjo').classList.toggle('hidden',r.host!==identity?.id);
 $('skyjo-play').classList.toggle('hidden',active!=='skyjo');
 $('uno-play').classList.toggle('hidden',active!=='uno');
 $('uno-setup').classList.toggle('hidden',r.gameStarted||selected!=='uno');
 $('game-switch').classList.toggle('hidden',!r.gameStarted||r.host!==identity?.id);
 $('game-switch').disabled=!!r.gameStarted&&!lastState?.finished;
}
$('game-choice').onchange=()=>send('room:select-game',$('game-choice').value);
$('start-skyjo').onclick=()=>send('game:start',{});
$('skyjo-restart').onclick=()=>send('game:restart',{});
$('game-switch').onclick=()=>send('room:finish-game',{});
$('skyjo-result-close').onclick=()=>{$('skyjo-result-overlay').classList.add('hidden');$('skyjo-result-reopen').focus();};
$('skyjo-result-reopen').onclick=()=>{$('skyjo-result-overlay').classList.remove('hidden');$('skyjo-result-close').focus();};
$('skyjo-log-toggle').onclick=()=>{const x=$('skyjo-log');x.classList.toggle('hidden');$('skyjo-log-toggle').textContent=x.classList.contains('hidden')?'Spielverlauf anzeigen':'Spielverlauf ausblenden';};
socket.on('room',updateRoom);
socket.on('game:state',g=>{
 const previous=lastState;
 lastState=g;
 $('game-switch').disabled=!g.finished;
 if(g.game!=='skyjo')return;
 const mine=g.turn===identity?.id;
 const phase=g.phase;
 $('skyjo-turn').textContent=g.finished?'🏁 Runde beendet':phase==='reveal'?'Decke zwei Karten auf ('+g.revealed+'/2)':mine?'🎯 Du bist am Zug!':'Am Zug: '+who(g.turn);
 $('skyjo-last').textContent=(g.events.at(-1)?.actor?who(g.events.at(-1).actor)+': ':'')+(g.events.at(-1)?.text||'');
 const piles=$('skyjo-piles');piles.replaceChildren();
 const choosing=mine&&phase==='choose'&&!g.finished;
 const taking=mine&&phase==='replace';
 const deck=el('div',undefined,'skyjo-stack'+(taking?' skyjo-muted':''));
 const deckButton=btn('🂠',()=>send('game:action',{type:'take',source:'deck'}),'skyjo-pile skyjo-deck');deckButton.disabled=!choosing;
 deck.append(deckButton,el('span','Ziehstapel','skyjo-pile-label'));
 const discard=el('div',undefined,'skyjo-stack'+(taking?' skyjo-muted':''));
 const discardSurface=el('div',undefined,'skyjo-discard-surface');
 const discardButton=card(g.discard??null,()=>send('game:action',{type:'take',source:'discard'}),!choosing||g.discard==null);discardButton.classList.add('skyjo-pile');
 discardSurface.append(discardButton);
 discard.append(discardSurface,el('span','Ablagestapel','skyjo-pile-label'));
 piles.append(deck,discard);
 const newMoves=g.events.filter(e=>e.id>(previous?.events?.at(-1)?.id??-1));
 const hasMove=word=>newMoves.some(e=>e.text.includes(word));
 const sameRound=previous?.game==='skyjo'&&previous.events?.[0]?.at===g.events?.[0]?.at;
 const discardChanged=sameRound&&previous.revision!==g.revision;
 const tookDiscard=discardChanged&&hasMove('vom Ablagestapel genommen');
 const placedDiscard=discardChanged&&(hasMove('getauscht')||hasMove('abgeworfen')||hasMove('Spalte mit'));
 if(tookDiscard||placedDiscard){
  if(discardAnimationTimer)clearTimeout(discardAnimationTimer);
  const oldTop=previous.discard;
  if(tookDiscard){
   const outgoing=card(oldTop,()=>{},true);outgoing.classList.add('skyjo-pile','skyjo-discard-slide-out');discardSurface.append(outgoing);
  }else{
   discardButton.classList.add('skyjo-discard-slide-in');
   if(oldTop!=null){const below=card(oldTop,()=>{},true);below.classList.add('skyjo-pile','skyjo-discard-under');discardSurface.prepend(below);}
  }
  discardAnimationTimer=setTimeout(()=>{discardSurface.querySelectorAll('.skyjo-discard-slide-out,.skyjo-discard-under').forEach(n=>n.remove());discardButton.classList.remove('skyjo-discard-slide-in');},620);
 }
 if(taking){
  const taken=el('div',undefined,'skyjo-taken');
  taken.append(card(g.held,()=>{},true),el('span','Gezogene Karte','skyjo-pile-label'));
  if(g.source==='deck'){const drop=btn('↘',()=>send('game:action',{type:'discard'}),'skyjo-discard-icon');drop.title='Gezogene Karte abwerfen';drop.setAttribute('aria-label','Gezogene Karte abwerfen und eine verdeckte Karte aufdecken');taken.append(drop);}
  piles.append(taken);
 }
 const hand=$('skyjo-hand');hand.replaceChildren();
 g.hand.forEach((c,i)=>{if(!c){hand.append(el('div','—','skyjo-empty'));return;}
  const available=phase==='reveal'&&!c.open&&g.revealed<2||mine&&(phase==='replace'||phase==='flip'&&!c.open);
  const action=phase==='reveal'?'reveal':phase==='flip'?'flip':'replace';
  hand.append(card(c.open?c.value:null,()=>send('game:action',{type:action,index:i}),!available));
 });
 const actions=$('skyjo-actions');actions.replaceChildren();
 if(mine&&phase==='replace')actions.append(el('p','Tippe auf eine deiner Karten, um sie gegen die gezogene Karte auszutauschen.'));
 if(mine&&phase==='flip')actions.append(el('p','Tippe auf eine verdeckte Karte, um sie aufzudecken.'));
 const players=$('skyjo-players');players.replaceChildren(el('h3','Karten der Mitspieler'));
 for(const p of g.players.filter(p=>p.id!==identity?.id)){
  const details=el('details',undefined,'skyjo-opponent');details.open=expandedOpponents.has(p.id)||window.matchMedia('(min-width: 900px)').matches;const summary=el('summary',who(p.id)+' · '+p.open+' offen · '+p.cards+' Karten');summary.addEventListener('click',()=>{if(details.open)expandedOpponents.delete(p.id);else expandedOpponents.add(p.id);});
  const grid=el('div',undefined,'skyjo-opponent-grid');
  for(const c of p.layout||[])grid.append(c?card(c.open?c.value:null,()=>{},true):el('div','—','skyjo-empty'));
  details.append(summary,grid);players.append(details);
 }
 const scores=$('skyjo-scores');scores.replaceChildren(el('h3','Punktetafel'));
 for(const p of g.players)scores.append(el('p',who(p.id)+': '+(g.scores[p.id]||0)+' Punkte'+(g.roundScores?' (Runde: '+g.roundScores[p.id]+')':'')));
 $('skyjo-result-reopen').classList.toggle('hidden',!g.finished);
 if(g.finished){
  const winners=g.matchFinished?g.matchWinners:g.roundWinners;
  const winnerNames=(winners||[]).map(who).join(' & ');
  $('skyjo-result-title').textContent=g.matchFinished?'🏆 '+winnerNames+' '+(winners?.length===1?'hat das Spiel gewonnen!':'haben das Spiel gewonnen!'):'🎉 Rundensieg: '+winnerNames;
  $('skyjo-result-description').textContent=g.matchFinished?'🎊 Herzlichen Glückwunsch! Das Spiel ist entschieden. '+winnerNames+' '+(winners?.length===1?'gewinnt':'gewinnen')+' mit den wenigsten Gesamtpunkten.':'Die Runde ist beendet. Alle Karten sind jetzt aufgedeckt. Gespielt wird weiter, bis jemand mindestens 100 Gesamtpunkte erreicht.';
  $('skyjo-result-overlay').classList.toggle('skyjo-final-victory',!!g.matchFinished);
  const table=el('table',undefined,'skyjo-result-score-table');const header=el('tr');for(const heading of ['Spieler','Runde','Gesamt'])header.append(el('th',heading));table.append(header);
  for(const p of [...g.players].sort((a,b)=>g.roundScores[a.id]-g.roundScores[b.id])){const row=el('tr');if((winners||[]).includes(p.id))row.classList.add('skyjo-winner-row');for(const value of [who(p.id),(g.roundScores[p.id]>=0?'+':'')+g.roundScores[p.id],g.scores[p.id]])row.append(el('td',String(value)));table.append(row);}
  $('skyjo-result-table').replaceChildren(table);
  $('skyjo-result-penalty').textContent=g.penalty?'⚠️ Verdopplungsregel: '+who(g.penalty.player)+' hat die Runde beendet, aber nicht allein die niedrigste Punktzahl erreicht. Deshalb werden '+g.penalty.original+' Punkte auf '+g.penalty.doubled+' verdoppelt.':'✓ Keine Punktverdopplung in dieser Runde.';
  const resultKey=(room?.code||'')+':'+g.events[0]?.at+':'+g.revision;
  if(shownResultKey===null||!shownResultKey.startsWith((room?.code||'')+':'+g.events[0]?.at+':')){shownResultKey=resultKey;const reveal=()=>{$('skyjo-result-overlay').classList.remove('hidden');$('skyjo-result-close').focus();};if(g.lastRemoval&&previous?.revision<g.lastRemoval.revision)setTimeout(()=>{if(lastState===g)reveal();},2100);else reveal();}
 }else{$('skyjo-result-overlay').classList.add('hidden');$('skyjo-result-reopen').classList.add('hidden');shownResultKey=null;}
 $('skyjo-restart').classList.toggle('hidden',!g.finished||room?.host!==identity?.id);
 $('skyjo-restart').textContent=g.matchFinished?'🎲 Neue Skyjo-Partie starten':'Nächste Skyjo-Runde';
 if(g.matchFinished)$('skyjo-turn').textContent='🏆 Spiel beendet! '+who(g.players.reduce((a,b)=>g.scores[a]<=g.scores[b]?a:b))+' gewinnt mit den wenigsten Punkten.';
 $('game-switch').disabled=!g.finished;
 if(g.lastRemoval){
  const key=(room?.code||'')+':'+g.events[0]?.at+':'+g.lastRemoval.revision;
  if(shownRemovalKey!==key){
   shownRemovalKey=key;
   const removal=g.lastRemoval;
   const grid=removal.player===identity?.id?$('skyjo-hand'):[...$('skyjo-players').querySelectorAll('.skyjo-opponent')].find(d=>d.querySelector('summary')?.textContent.startsWith(who(removal.player)+' ·'))?.querySelector('.skyjo-opponent-grid');
   if(grid){
    if(removal.player!==identity?.id){const details=grid.closest('details');if(details)details.open=true;}
    for(const item of removal.cards){const old=grid.children[item.index];if(!old)continue;const preview=card(item.value,()=>{},true);preview.classList.add('skyjo-removing');old.replaceWith(preview);}
    setTimeout(()=>{for(const item of removal.cards){const cell=grid.children[item.index];if(cell?.classList.contains('skyjo-removing'))cell.replaceWith(el('div','—','skyjo-empty'));}},1800);
   }
  }
 }
 const log=$('skyjo-log');log.replaceChildren(...g.events.slice(-60).reverse().map(e=>el('p',new Date(e.at).toLocaleTimeString('de-DE')+' · '+(e.actor?who(e.actor)+': ':'')+e.text)));
});
})();
