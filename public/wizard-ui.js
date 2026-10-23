'use strict';
(()=>{
 const $=id=>document.getElementById(id),send=(name,data)=>emit(name,data);
 let room=null,roundSeen=null;
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
  if(active==='wizard'){$('uno-play').classList.add('hidden');$('skyjo-play').classList.add('hidden');}
  if(!r.gameStarted)roundSeen=null;
 }
 $('start-wizard').onclick=()=>send('game:start',{});
 $('wizard-next').onclick=()=>send('game:restart',{});
 $('wizard-log-toggle').onclick=()=>{const l=$('wizard-log');const open=l.classList.toggle('hidden')===false;$('wizard-log-toggle').textContent=open?'Spielverlauf ausblenden':'Spielverlauf anzeigen';};
 socket.on('room',roomUpdate);
 socket.on('game:state',g=>{
  if(g.game!=='wizard')return;
  $('uno-play').classList.add('hidden');$('skyjo-play').classList.add('hidden');$('wizard-play').classList.remove('hidden');
  const mine=g.turn===identity?.id;
  $('game-switch').disabled=!g.finished;
  $('wizard-round').textContent='Runde '+g.round+' / '+g.maxRounds+' · Geber: '+name(g.dealer);
  const trump=$('wizard-trump');trump.replaceChildren(node('strong','Trumpf: '+(g.trump?suits[g.trump]:'Kein Trumpf')));
  if(g.indicator)trump.append(card(g.indicator));
  const table=$('wizard-table');table.replaceChildren();
  for(const play of g.trick){const cell=node('div',undefined,'wizard-played');cell.append(node('span',name(play.id)),card(play.card));table.append(cell);}
  const actions=$('wizard-actions');actions.replaceChildren();
  const last=g.events.at(-1);
  $('wizard-status').textContent=g.finished?'🏁 Runde beendet':g.phase==='choose-trump'?(mine?'🔮 Bestimme die Trumpffarbe':name(g.turn)+' wählt Trumpf'):g.phase==='bidding'?(mine?'🎯 Wie viele Stiche schaffst du?':name(g.turn)+' sagt Stiche an'):mine?'🎯 Du bist am Zug!':name(g.turn)+' spielt.'; 
  if(mine&&g.phase==='choose-trump'){actions.append(node('p','Wähle die Trumpffarbe:'));for(const [s,label] of Object.entries(suits))actions.append(button(label,()=>send('game:action',{type:'trump',s}),'wizard-choice '+s));}
  if(mine&&g.phase==='bidding'){actions.append(node('p','Deine Stichansage:'));const bids=node('div',undefined,'wizard-bids');for(let n=0;n<=g.round;n++)bids.append(button(String(n),()=>send('game:action',{type:'bid',count:n})));actions.append(bids);}
  if(last)actions.append(node('p',last.text,'wizard-last'));
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
  const log=$('wizard-log');log.replaceChildren(...g.events.slice().reverse().map(e=>node('p',new Date(e.at).toLocaleTimeString('de-DE')+' · '+(e.actor?name(e.actor)+': ':'')+e.text)));
 });
})();
