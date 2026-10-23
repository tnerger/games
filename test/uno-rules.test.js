'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const uno=require('../uno');
const c=(id,color,value)=>({id,color,value});
function game(options={}){
 const g=uno.create(['a','b','c'],{...uno.defaults,...options});
 g.hands={a:[c('a1','red','draw2'),c('a2','red','5')],b:[c('b1','blue','2')],c:[c('c1','green','3')]};
 g.deck=Array.from({length:50},(_,i)=>c('d'+i,'yellow','1'));
 g.discard=[c('top','red','1')];g.color='red';g.turn=0;g.direction=1;g.pending=0;g.pendingType=null;g.awaitingChallenge=false;g.finished=false;g.finishAfterPenalty=null;return g;
}
test('+2 with skip enabled draws two and skips recipient',()=>{
 const g=game({penaltySkip:true,stacking:false});
 uno.act(g,'a',{type:'play',cardId:'a1'});
 assert.equal(g.hands.b.length,3);assert.equal(g.players[g.turn],'c');assert.equal(g.pending,0);
});
test('+2 with skip disabled draws two and recipient keeps turn',()=>{
 const g=game({penaltySkip:false,stacking:false});
 uno.act(g,'a',{type:'play',cardId:'a1'});
 assert.equal(g.hands.b.length,3);assert.equal(g.players[g.turn],'b');
});
test('stacking +2 accumulates and resolves skip setting',()=>{
 const g=game({stacking:true,penaltySkip:true});
 g.hands.b=[c('b2','blue','draw2')];
 uno.act(g,'a',{type:'play',cardId:'a1'});
 assert.equal(g.pending,2);assert.equal(g.players[g.turn],'b');
 uno.act(g,'b',{type:'play',cardId:'b2'});
 assert.equal(g.pending,4);assert.equal(g.players[g.turn],'c');
 uno.act(g,'c',{type:'draw'});
 assert.equal(g.hands.c.length,5);assert.equal(g.players[g.turn],'a');
});
test('successful +4 challenge keeps challenger turn',()=>{
 const g=game({challenge:true,penaltySkip:true});
 g.hands.a=[c('w','wild','wild4'),c('r','red','9')];
 uno.act(g,'a',{type:'play',cardId:'w',color:'blue'});
 assert.equal(g.awaitingChallenge,true);
 uno.act(g,'b',{type:'challenge'});
 assert.equal(g.hands.a.length,5);assert.equal(g.players[g.turn],'b');assert.equal(g.awaitingChallenge,false);
});
test('failed +4 challenge draws six and skips only when configured',()=>{
 for(const penaltySkip of [true,false]){
  const g=game({challenge:true,penaltySkip});
  g.hands.a=[c('w','wild','wild4'),c('x','green','9')];
  uno.act(g,'a',{type:'play',cardId:'w',color:'blue'});
  uno.act(g,'b',{type:'challenge'});
  assert.equal(g.hands.b.length,7);
  assert.equal(g.players[g.turn],penaltySkip?'c':'b');
 }
});
test('accepted +4 draws four and respects skip setting',()=>{
 for(const penaltySkip of [true,false]){
  const g=game({challenge:true,penaltySkip});
  g.hands.a=[c('w','wild','wild4'),c('x','green','9')];
  uno.act(g,'a',{type:'play',cardId:'w',color:'blue'});
  uno.act(g,'b',{type:'accept'});
  assert.equal(g.hands.b.length,5);
  assert.equal(g.players[g.turn],penaltySkip?'c':'b');
 }
});
test('last +2 resolves penalty before victory',()=>{
 const g=game({penaltySkip:true,stacking:false,actionFinish:true});
 g.hands.a=[c('a1','red','draw2')];
 uno.act(g,'a',{type:'play',cardId:'a1'});
 assert.equal(g.hands.b.length,3);assert.equal(g.finished,true);assert.equal(g.winner,'a');
});
test('last +4 waits for challenge before victory',()=>{
 const g=game({challenge:true,actionFinish:true});
 g.hands.a=[c('w','wild','wild4')];
 uno.act(g,'a',{type:'play',cardId:'w',color:'blue'});
 assert.equal(g.finished,false);assert.equal(g.awaitingChallenge,true);
 uno.act(g,'b',{type:'accept'});
 assert.equal(g.hands.b.length,5);assert.equal(g.finished,true);assert.equal(g.winner,'a');
});
test('actionFinish false rejects final +2',()=>{
 const g=game({actionFinish:false});g.hands.a=[c('a1','red','draw2')];
 assert.throws(()=>uno.act(g,'a',{type:'play',cardId:'a1'}),/Aktionskarte/);
});
