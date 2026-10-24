'use strict';
(() => {
const $=id=>document.getElementById(id);
const labels={stacking:'+2 stapeln',sevenZero:'7–0-Regel',drawUntilPlayable:'Ziehen bis spielbar',challenge:'+4 anzweifeln',actionFinish:'Mit Aktionskarte beenden',penaltySkip:'Nach +2 / +4 aussetzen'};
const help={
 stacking:'Eine +2 kann mit einer weiteren +2 beantwortet werden. Die Strafkarten addieren sich. +4 kann nicht auf +2 gelegt werden.',
 sevenZero:'7: Du tauschst deine Hand mit einem anderen Spieler. 0: Alle geben ihre Hand in Spielrichtung weiter.',
 drawUntilPlayable:'Wenn du keine passende Karte hast, ziehst du bis eine spielbare Karte erscheint oder der Stapel leer ist.',
 challenge:'Eine +4 ist nur erlaubt, wenn der Ausspieler keine Karte der aktuellen Farbe hat. Bei erfolgreicher Anzweiflung zieht er vier Karten, sonst ziehst du sechs.',
 actionFinish:'Du darfst mit einer Aktionskarte gewinnen. Die Kartenwirkung wird noch ausgeführt, bevor die Runde endet.',
 penaltySkip:'Aktiviert: Wer +2 oder +4 kassiert, zieht Karten und setzt aus. Deaktiviert: Nach dem Ziehen darf diese Person sofort ihren Zug machen.'
};
const names={red:'Rot',yellow:'Gelb',green:'Grün',blue:'Blau',wild:'Schwarz'};
const symbols={skip:'⦸',reverse:'⇄',draw2:'+2',wild:'🌈',wild4:'+4'};
let current=null;
let roomInfo=null;
let lastRevision=-1;
let previousCounts={};
let lastEventId=-1;
let roomDetailsExpanded=false;
let shownUnoResult=null, currentTopForAnimation=null;
$('uno-result-close').onclick=()=>modal('uno-result-overlay',false);
$('uno-result-reopen').onclick=()=>modal('uno-result-overlay',true);
const limits={uno:{min:2,max:6},skyjo:{min:2,max:6},wizard:{min:3,max:6},elfer:{min:2,max:6},rommy:{min:2,max:4}};
const modal=(id,open)=>{$(id).classList.toggle('hidden',!open);};
$('bot-open').onclick=()=>{modal('bot-dialog',true);$('bot-name').focus();};
$('bot-cancel').onclick=()=>modal('bot-dialog',false);
$('uno-rules-open').onclick=()=>modal('uno-rules-dialog',true);
$('uno-rules-close').onclick=()=>modal('uno-rules-dialog',false);
for(const id of ['bot-dialog','uno-rules-dialog'])$(id).addEventListener('click',e=>{if(e.target===$(id))modal(id,false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){modal('bot-dialog',false);modal('uno-rules-dialog',false);}});
function send(type,payload){emit(type,payload,r=>{if(r?.ok)status('');});}
function make(tag,txt,cls){const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e;}
function button(txt,fn,cls){const b=make('button',txt,cls||'secondary');b.onclick=fn;return b;}
function ruleOptions(room){
 roomInfo=room;
 showScores();
 $('room-details-toggle').classList.toggle('hidden',!room.gameStarted);
 $('room-details').classList.toggle('hidden',room.gameStarted&&!roomDetailsExpanded);
 const isHost=room.host===identity?.id;
 $('bot-setup').classList.toggle('hidden',!isHost||room.gameStarted);
 const limit=limits[room.selectedGame]||limits.uno;
 const missing=Math.max(0,limit.min-room.players.length);
 $('bot-count').textContent='('+room.players.filter(p=>p.bot).length+')';
 $('player-limit-info').textContent='Für '+(room.selectedGame==='wizard'?'Wizard':room.selectedGame==='skyjo'?'Skyjo':room.selectedGame==='elfer'?'11er Raus':room.selectedGame==='rommy'?'RommyCup':'UNO')+': '+limit.min+'–'+limit.max+' Spieler · aktuell '+room.players.length+(missing?' · noch '+missing+' benötigt':' · startbereit');
 $('bot-open').disabled=room.players.length>=limit.max;
 const bots=$('bot-list');bots.replaceChildren();
 for(const p of room.players.filter(p=>p.bot)){const line=make('div',undefined,'bot-entry');line.append(make('span',playerName(p)));if(isHost)line.append(button('Entfernen',()=>send('bot:remove',p.id),'secondary'));bots.append(line);}
 $('bot-add').disabled=room.players.length>=limit.max;
 const el=$('uno-options');el.replaceChildren();
 const rules=room.gameRules||{};
 for(const [key,title] of Object.entries(labels)){
  const wrap=make('div',undefined,'rule-option');
  const label=make('label');
  const input=document.createElement('input');input.type='checkbox';input.dataset.rule=key;input.checked=!!rules[key];input.disabled=room.host!==identity?.id;
  label.append(input,document.createTextNode(' '+title));
  wrap.append(label,make('p',help[key]));
  el.append(wrap);
 }
 $('save-rules').classList.toggle('hidden',room.host!==identity?.id);
 $('uno-rules-open').classList.toggle('hidden',room.host!==identity?.id);
 for(const id of ['start-uno','start-skyjo','start-wizard','start-elfer','start-rommy'])if($(id))$(id).disabled=missing>0;
 $('start-uno').classList.toggle('hidden',room.host!==identity?.id);
 const unoSelected=room.selectedGame==='uno';
 $('uno-setup').classList.toggle('hidden',room.gameStarted||!unoSelected);
 $('uno-play').classList.toggle('hidden',!room.gameStarted||room.activeGame!=='uno');
}
$('save-rules').onclick=()=>{
 const opts={};document.querySelectorAll('#uno-options input').forEach(x=>opts[x.dataset.rule]=x.checked);
 emit('game:configure',opts,r=>{if(r?.ok)modal('uno-rules-dialog',false);});
};
$('start-uno').onclick=()=>send('game:start',{});
$('bot-add').onclick=()=>emit('bot:add',{difficulty:$('bot-level').value,name:$('bot-name').value.trim()},r=>{if(r?.ok){modal('bot-dialog',false);$('bot-name').value='';}});
$('room-details-toggle').onclick=()=>{roomDetailsExpanded=!roomDetailsExpanded;$('room-details').classList.toggle('hidden',!roomDetailsExpanded);$('room-details-toggle').textContent=roomDetailsExpanded?'▾ Raum & Mitspieler ausblenden':'▸ Raum & Mitspieler anzeigen';};
function wildArt(value){
 const ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 72 104');svg.setAttribute('aria-hidden','true');svg.classList.add('wild-art');
 const shape=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));svg.append(e);return e;};
 shape('ellipse',{cx:36,cy:52,rx:28,ry:43,fill:'#fff',transform:'rotate(22 36 52)'});
 const parts=[['#e83b48',11,12],['#f7c831',37,12],['#218d58',11,53],['#3275d7',37,53]];
 for(const [fill,x,y] of parts)shape('rect',{x,y,width:24,height:37,rx:5,fill,transform:'rotate(22 36 52)'});
 if(value==='wild4'){
  shape('rect',{x:11,y:38,width:50,height:31,rx:9,fill:'#17171f',stroke:'#fff','stroke-width':2});
  const t=shape('text',{x:36,y:60,'text-anchor':'middle','font-size':24,'font-weight':900,fill:'#fff'});t.textContent='+4';
 }
 return svg;
}
function card(c,playable){
 const b=make('button',c.color==='wild'?'':symbols[c.value]||c.value,'uno-card '+c.color);
 if(c.color==='wild')b.append(wildArt(c.value));
 b.disabled=!playable;
 b.setAttribute('aria-label',names[c.color]+' '+(symbols[c.value]||c.value));
 const hints=[];
 if(current.rules.stacking&&c.value==='draw2')hints.push('Stapelregel: +2 kann auf +2 gelegt werden; Strafe wächst.');
 if(current.rules.sevenZero&&c.value==='7')hints.push('7–0-Regel: Du tauschst deine Hand mit einer Person.');
 if(current.rules.sevenZero&&c.value==='0')hints.push('7–0-Regel: Alle Hände wandern weiter.');
 if(current.rules.challenge&&c.value==='wild4')hints.push('+4 kann angezweifelt werden. Sie ist nur erlaubt, wenn du keine Karte der aktuellen Farbe hast.');
 if(current.rules.actionFinish&&['skip','reverse','draw2','wild','wild4'].includes(c.value))hints.push('Diese Karte darf auch deine letzte Karte sein.');
 if(hints.length){
  const info=make('span','ⓘ','uno-info');info.setAttribute('role','button');info.setAttribute('tabindex','0');
  info.onclick=e=>{e.stopPropagation();alert(hints.join('\n\n'));};
  info.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();alert(hints.join('\n\n'));}};
  b.append(info);
 }
 if(playable)b.onclick=()=>{
  if(c.color==='wild'){
   const choices=$('uno-actions');choices.replaceChildren(make('p','Welche Farbe möchtest du wählen?'));
   for(const color of ['red','yellow','green','blue'])choices.append(button(names[color],()=>send('game:action',{type:'play',cardId:c.id,color}),'uno-color '+color));
  }else send('game:action',{type:'play',cardId:c.id});
 };
 return b;
}
socket.on('room',r=>{if(!r.gameStarted){shownUnoResult=null;currentTopForAnimation=null;modal('uno-result-overlay',false);}ruleOptions(r);});
$('uno-restart').onclick=()=>send('game:restart',{});
$('uno-toggle-log').onclick=()=>{const log=$('uno-log');const open=log.classList.toggle('hidden')===false;$('uno-toggle-log').textContent=open?'Spielverlauf ausblenden':'Spielverlauf anzeigen';$('uno-toggle-log').setAttribute('aria-expanded',String(open));};
function showScores(){if(!roomInfo)return;const target=$('uno-scoreboard');target.replaceChildren(make('h3','Punktetafel'));const table=make('table');const header=make('tr');for(const x of ['Spieler','Siege','Punkte'])header.append(make('th',x));table.append(header);for(const p of roomInfo.players){const row=make('tr');const score=roomInfo.scores?.[p.id]||{wins:0,points:0};for(const v of [playerName(p),score.wins,score.points])row.append(make('td',String(v)));table.append(row);}target.append(table);}

socket.on('game:state',state=>{
 if(state.game==='skyjo'||state.game==='wizard'||state.game==='elfer'||state.game==='rommy')return;
 const oldIds=new Set((current?.hand||[]).map(c=>c.id));
 const freshIds=new Set(current?state.hand.filter(c=>!oldIds.has(c.id)).map(c=>c.id):[]);
 const events=state.events||[];
 const newest=events.at(-1);
 const displayName=id=>{const p=roomInfo?.players.find(p=>p.id===id);return p?playerName(p):'Mitspieler';};
 const describe=e=>{if(!e)return 'UNO wurde gestartet.';if(!e.actor)return e.text;const t=e.text;if(t.startsWith('Karte gelegt: '))return displayName(e.actor)+' hat '+t.slice(14)+' gelegt.';if(t.startsWith('Strafkarten gezogen: '))return displayName(e.actor)+': '+t;if(t.includes('gezogen'))return displayName(e.actor)+' hat '+t.toLowerCase();return displayName(e.actor)+': '+t;};
 current=state;
 $('uno-setup').classList.add('hidden');$('uno-play').classList.remove('hidden');
 const mine=state.turn===identity?.id;
 if(newest&&newest.id!==lastEventId){const area=$('uno-last-move');const next=make('div',describe(newest),'move-in');if(area.firstChild){area.firstChild.className='move-out';area.append(next);setTimeout(()=>{if(area.contains(next))area.replaceChildren(next);next.className='';},550);}else area.replaceChildren(next);lastEventId=newest.id;}
 const colorText={red:'ROT',yellow:'GELB',green:'GRÜN',blue:'BLAU'};
 $('uno-restart').classList.toggle('hidden',!state.finished||roomInfo?.host!==identity.id);
 showScores();
 const top=$('uno-top');
 const oldTop=currentTopForAnimation;
 const newTop=state.top;
 const changed=oldTop&&oldTop.id!==newTop.id;
 top.replaceChildren();
 if(changed){const under=card(oldTop,false);under.classList.add('uno-top-under');top.append(under);}
 const topCard=card(newTop,false);topCard.classList.add('uno-top-card');
 if(changed)topCard.classList.add('uno-card-slide-in');
 if(state.autoPenalty)topCard.classList.add('uno-penalty-pulse');
 top.append(topCard);currentTopForAnimation=newTop;
 const opponents=$('uno-opponents');opponents.replaceChildren();
 for(const p of state.players){
  const person=roomInfo?.players.find(x=>x.id===p.id);
  const active=state.turn===p.id&&!state.finished;
  const item=make('div',undefined,'uno-opponent'+(active?' uno-opponent-active':''));
  item.append(make('span',active?'▶':'','uno-turn-arrow'),make('span',p.id===identity?.id?'Du':person?playerName(person):'Mitspieler','uno-opponent-name'),make('span','🂠 '+p.count,'uno-opponent-count'));
  opponents.append(item);
 }
 if(state.finished){
  const resultKey=(roomInfo?.code||'')+':'+(state.events?.[0]?.at||0)+':'+state.winner;
  if(shownUnoResult!==resultKey){
   shownUnoResult=resultKey;
   $('uno-result-title').textContent='🏆 '+displayName(state.winner)+' hat UNO gewonnen!';
   $('uno-result-description').textContent=state.winner===identity?.id?'Glückwunsch! Du hast die Partie gewonnen.':displayName(state.winner)+' hat alle Karten abgelegt und die Partie gewonnen.';
   modal('uno-result-overlay',true);
  }
 }
 $('uno-result-reopen').classList.toggle('hidden',!state.finished);
 const effect=$('uno-effect');effect.replaceChildren(document.createTextNode('Aktuelle Farbe: '));const colored=make('strong',names[state.color],'active-color-text '+state.color);effect.append(colored,document.createTextNode(' · Karten der anderen: '+state.players.filter(p=>p.id!==identity.id).map(p=>p.count).join(', ')));
 const hand=$('uno-hand');hand.replaceChildren(...state.hand.map(c=>{const element=card(c,mine&&!state.finished&&state.canPlay.includes(c.id));if(freshIds.has(c.id))element.classList.add('newly-drawn');return element;}));
 const actions=$('uno-actions');actions.replaceChildren();
 if(mine&&!state.finished){
  if(state.awaitingChallenge){
   actions.append(button('+4 akzeptieren (4 ziehen)',()=>send('game:action',{type:'accept'})),button('+4 anzweifeln',()=>send('game:action',{type:'challenge'})));
  }else if(state.awaitingSwap){
   actions.append(make('p','Mit wem möchtest du deine Hand tauschen?'));
   for(const p of state.players.filter(p=>p.id!==identity.id))actions.append(button('Spieler '+p.id.slice(0,5),()=>send('game:action',{type:'swap',target:p.id})));
  }else if(!state.awaitingColor){
   if(state.autoPenalty)actions.append(make('p','⚡ '+state.pending+' Strafkarten werden gleich automatisch gezogen …','uno-auto-penalty'));else actions.append(button(state.pending?'Strafe ziehen ('+state.pending+')':'Karte ziehen',()=>send('game:action',{type:'draw'})));
  }
 }
 const history=$('uno-log');history.replaceChildren(...events.slice().reverse().map(e=>{const p=make('p');const stamp=make('time',new Date(e.at).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}),'log-time');p.append(stamp,document.createTextNode(' '+describe(e)));return p;}));
});
})();
