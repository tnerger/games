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
function send(type,payload){emit(type,payload,r=>{if(r?.ok)status('');});}
function make(tag,txt,cls){const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e;}
function button(txt,fn,cls){const b=make('button',txt,cls||'secondary');b.onclick=fn;return b;}
function ruleOptions(room){
 roomInfo=room;
 showScores();
 const isHost=room.host===identity?.id;
 $('bot-setup').classList.toggle('hidden',!isHost||room.gameStarted);
 const bots=$('bot-list');bots.replaceChildren();
 for(const p of room.players.filter(p=>p.bot)){const line=make('div',undefined,'bot-entry');line.append(make('span',p.name));if(isHost)line.append(button('Entfernen',()=>send('bot:remove',p.id),'secondary'));bots.append(line);}
 $('bot-add').disabled=room.players.length>=6;
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
 $('start-uno').classList.toggle('hidden',room.host!==identity?.id);
 $('uno-setup').classList.toggle('hidden',room.gameStarted);
 $('uno-play').classList.toggle('hidden',!room.gameStarted);
}
$('save-rules').onclick=()=>{
 const opts={};document.querySelectorAll('#uno-options input').forEach(x=>opts[x.dataset.rule]=x.checked);
 send('game:configure',opts);
};
$('start-uno').onclick=()=>send('game:start',{});
$('bot-add').onclick=()=>send('bot:add',$('bot-level').value);
function card(c,playable){
 const b=make('button',symbols[c.value]||c.value,'uno-card '+c.color);
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
socket.on('room',ruleOptions);
$('uno-restart').onclick=()=>send('game:restart',{});
$('uno-toggle-log').onclick=()=>{const log=$('uno-log');const open=log.classList.toggle('hidden')===false;$('uno-toggle-log').textContent=open?'Spielverlauf ausblenden':'Spielverlauf anzeigen';$('uno-toggle-log').setAttribute('aria-expanded',String(open));};
function showScores(){if(!roomInfo)return;const target=$('uno-scoreboard');target.replaceChildren(make('h3','Punktetafel'));const table=make('table');const header=make('tr');for(const x of ['Spieler','Siege','Punkte'])header.append(make('th',x));table.append(header);for(const p of roomInfo.players){const row=make('tr');const score=roomInfo.scores?.[p.id]||{wins:0,points:0};for(const v of [p.name,score.wins,score.points])row.append(make('td',String(v)));table.append(row);}target.append(table);}

socket.on('game:state',state=>{
 const changed=state.players.filter(p=>previousCounts[p.id]!==undefined&&p.count>previousCounts[p.id]);
 previousCounts=Object.fromEntries(state.players.map(p=>[p.id,p.count]));
 if(changed.length&&current?.revision!==state.revision){const stage=$('uno-draw-animation');stage.replaceChildren();const count=changed.reduce((sum,p)=>sum+p.count-(current?.players.find(old=>old.id===p.id)?.count||p.count),0);for(let i=0;i<Math.min(5,Math.max(1,count));i++)stage.append(make('span','🂠','flying-card'));stage.classList.remove('drawing');void stage.offsetWidth;stage.classList.add('drawing');}
 current=state;
 $('uno-setup').classList.add('hidden');$('uno-play').classList.remove('hidden');
 const mine=state.turn===identity?.id;
 const playerName=id=>roomInfo?.players.find(p=>p.id===id)?.name||'Mitspieler';
 $('uno-turn').textContent=state.finished?'🏆 Gewonnen: '+playerName(state.winner):mine?'🎯 DU BIST AM ZUG!':'Am Zug: '+playerName(state.turn);
 $('uno-turn').classList.remove('turn-flash');if(state.revision!==lastRevision){void $('uno-turn').offsetWidth;$('uno-turn').classList.add('turn-flash');lastRevision=state.revision;}
 $('uno-notice').textContent=state.log.at(-1)||'UNO gestartet!';
 const colorText={red:'ROT',yellow:'GELB',green:'GRÜN',blue:'BLAU'};
 const banner=$('uno-color-banner');banner.textContent='AKTUELLE FARBE: '+colorText[state.color];banner.className='chosen-color '+state.color;
 $('uno-restart').classList.toggle('hidden',!state.finished||roomInfo?.host!==identity.id);
 showScores();
 const top=$('uno-top');top.replaceChildren(card(state.top,false));
 $('uno-effect').textContent='Aktuelle Farbe: '+names[state.color]+' · Karten der anderen: '+state.players.filter(p=>p.id!==identity.id).map(p=>p.count).join(', ');
 const hand=$('uno-hand');hand.replaceChildren(...state.hand.map(c=>card(c,mine&&!state.finished&&state.canPlay.includes(c.id))));
 const actions=$('uno-actions');actions.replaceChildren();
 if(mine&&!state.finished){
  if(state.awaitingChallenge){
   actions.append(button('+4 akzeptieren (4 ziehen)',()=>send('game:action',{type:'accept'})),button('+4 anzweifeln',()=>send('game:action',{type:'challenge'})));
  }else if(state.awaitingSwap){
   actions.append(make('p','Mit wem möchtest du deine Hand tauschen?'));
   for(const p of state.players.filter(p=>p.id!==identity.id))actions.append(button('Spieler '+p.id.slice(0,5),()=>send('game:action',{type:'swap',target:p.id})));
  }else if(!state.awaitingColor){
   actions.append(button(state.pending?'Strafe ziehen ('+state.pending+')':'Karte ziehen',()=>send('game:action',{type:'draw'})));
  }
 }
 const history=$('uno-log');history.replaceChildren(...state.log.map((entry,i)=>make('p',(i+1)+'. '+entry)));
});
})();
