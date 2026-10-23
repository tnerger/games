'use strict';
const crypto=require('node:crypto');
const colors=['red','yellow','green','blue'];
const random=n=>crypto.randomInt(n);
function decide(g,id,level){
 const hand=g.hands[id],top=g.discard.at(-1);
 if(g.awaitingChallenge)return {type:level==='easy'?'accept':(level==='hard'&&random(3)===0?'challenge':'accept')};
 if(g.awaitingSwap){const targets=g.players.filter(x=>x!==id);return {type:'swap',target:targets[random(targets.length)]};}
 if(g.awaitingColor)return {type:'color',color:bestColor(hand)};
 const playable=hand.filter(c=>g.pending?(g.rules.stacking&&g.pendingType==='draw2'&&c.value==='draw2'):(c.color==='wild'||c.color===g.color||c.value===top.value));
 if(!playable.length)return {type:'draw'};
 const candidates=playable.filter(c=>!(c.value==='wild4'&&!g.rules.challenge&&hand.some(x=>x!==c&&x.color===g.color))&&!(hand.length===1&&!g.rules.actionFinish&&['skip','reverse','draw2','wild','wild4'].includes(c.value)));
 if(!candidates.length)return {type:'draw'};
 let card;
 if(level==='easy')card=candidates[random(candidates.length)];
 else {
  const opponent=g.players[(g.turn+g.direction+g.players.length)%g.players.length];
  const count=g.hands[opponent].length;
  const score=c=>{
   const same=hand.filter(x=>x!==c&&x.color===c.color).length;
   let n=(c.color==='wild'?-8:4+same*2);
   if(['draw2','skip','reverse'].includes(c.value))n+=level==='hard'&&count<=3?12:3;
   if(c.value==='wild4')n+=level==='hard'&&count<=3?9:-5;
   if(c.value==='wild')n-=3;
   if(level==='hard'&&c.color!=='wild'&&c.color===g.color)n+=3;
   return n+random(4);
  };
  card=candidates.reduce((a,b)=>score(a)>=score(b)?a:b);
 }
 return {type:'play',cardId:card.id,...(card.color==='wild'?{color:bestColor(hand.filter(c=>c!==card))}:{})};
}
function bestColor(hand){const counts=colors.map(c=>hand.filter(x=>x.color===c).length);const max=Math.max(...counts);const choices=colors.filter((c,i)=>counts[i]===max);return choices[random(choices.length)];}
module.exports={decide};
