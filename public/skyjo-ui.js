'use strict';
(()=>{
const $=id=>document.getElementById(id);
const send=(name,data)=>emit(name,data);
let room=null,lastState=null;
const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
const btn=(label,action,cls='secondary')=>{const x=el('button',label,cls);x.onclick=action;return x;};
const who=id=>room?.players.find(p=>p.id===id)?.name||'Mitspieler';
const label=v=>v===null?'?':String(v);
function card(v,onclick,disabled=false){
 const x=btn(label(v),onclick,'skyjo-card '+(v===null?'back':v<=0?'low':v<=4?'medium':v<=8?'high':'highest'));
 x.disabled=disabled;x.setAttribute('aria-label',v===null?'Verdeckte Karte':'Karte '+v);return x;
}
function updateRoom(r){
 room=r;if(!r.gameStarted)lastState=null;const selected=r.selectedGame||'uno',active=r.activeGame;
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
$('skyjo-log-toggle').onclick=()=>{const x=$('skyjo-log');x.classList.toggle('hidden');$('skyjo-log-toggle').textContent=x.classList.contains('hidden')?'Spielverlauf anzeigen':'Spielverlauf ausblenden';};
socket.on('room',updateRoom);
socket.on('game:state',g=>{
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
 const discardButton=card(g.discard??null,()=>send('game:action',{type:'take',source:'discard'}),!choosing||g.discard==null);discardButton.classList.add('skyjo-pile');
 discard.append(discardButton,el('span','Ablagestapel','skyjo-pile-label'));
 piles.append(deck,discard);
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
  const details=el('details',undefined,'skyjo-opponent');const summary=el('summary',who(p.id)+' · '+p.open+' offen · '+p.cards+' Karten');
  const grid=el('div',undefined,'skyjo-opponent-grid');
  for(const c of p.layout||[])grid.append(c?card(c.open?c.value:null,()=>{},true):el('div','—','skyjo-empty'));
  details.append(summary,grid);players.append(details);
 }
 const scores=$('skyjo-scores');scores.replaceChildren(el('h3','Punktetafel'));
 for(const p of g.players)scores.append(el('p',who(p.id)+': '+(g.scores[p.id]||0)+' Punkte'+(g.roundScores?' (Runde: '+g.roundScores[p.id]+')':'')));
 $('skyjo-restart').classList.toggle('hidden',!g.finished||g.matchFinished||room?.host!==identity?.id);
 if(g.matchFinished)$('skyjo-turn').textContent='🏆 Spiel beendet! '+who(g.players.reduce((a,b)=>g.scores[a]<=g.scores[b]?a:b))+' gewinnt mit den wenigsten Punkten.';
 $('game-switch').disabled=!g.finished;
 const log=$('skyjo-log');log.replaceChildren(...g.events.slice(-60).reverse().map(e=>el('p',new Date(e.at).toLocaleTimeString('de-DE')+' · '+(e.actor?who(e.actor)+': ':'')+e.text)));
});
})();
