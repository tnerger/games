'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const wizard=require('../wizard');
const c=(id,suit,value,type='number')=>({id,suit,value,type});
function fixture(){
 const g=wizard.create(['a','b','c']);
 g.round=2;g.maxRounds=20;g.dealer=2;g.phase='bidding';g.turn=0;g.hands={a:[c('a1','red',8),c('a2','blue',13)],b:[c('b1','red',10),c('b2','green',2)],c:[c('c1','yellow',3),c('c2','blue',4)]};g.trump='green';g.trick=[];g.lead=null;g.tricks={a:0,b:0,c:0};g.bids={};return g;
}
test('bids advance into playing phase',()=>{
 const g=fixture();for(const [id,count] of [['a',1],['b',0],['c',1]])wizard.act(g,id,{type:'bid',count});
 assert.equal(g.phase,'playing');assert.equal(g.players[g.turn],'a');
});
test('must follow lead suit if available',()=>{
 const g=fixture();g.phase='playing';g.hands.b.push(c('b3','blue',5));
 wizard.act(g,'a',{type:'play',cardId:'a1'});
 assert.throws(()=>wizard.act(g,'b',{type:'play',cardId:'b2'}),/bedienen/);
 wizard.act(g,'b',{type:'play',cardId:'b1'});
});
test('wizard takes precedence over trump',()=>{
 const g=fixture();g.phase='playing';g.hands.a[0]=c('aw',null,14,'wizard');
 wizard.act(g,'a',{type:'play',cardId:'aw'});
 wizard.act(g,'b',{type:'play',cardId:'b2'});
 wizard.act(g,'c',{type:'play',cardId:'c1'});
 assert.equal(g.tricks.a,1);
});
test('trump wins over lead color',()=>{
 const g=fixture();g.phase='playing';
 wizard.act(g,'a',{type:'play',cardId:'a1'});
 wizard.act(g,'b',{type:'play',cardId:'b2'});
 wizard.act(g,'c',{type:'play',cardId:'c1'});
 assert.equal(g.tricks.b,1);
});
test('scoring gives 20 plus 10 per correct trick and minus 10 per deviation',()=>{
 const g=fixture();g.phase='playing';g.hands={a:[c('a1','red',8)],b:[c('b1','red',10)],c:[c('c1','red',3)]};g.bids={a:0,b:1,c:1};
 wizard.act(g,'a',{type:'play',cardId:'a1'});
 wizard.act(g,'b',{type:'play',cardId:'b1'});
 wizard.act(g,'c',{type:'play',cardId:'c1'});
 assert.equal(g.finished,true);assert.deepEqual(g.lastRound.points,{a:20,b:30,c:-10});
});
test('new round increases hand size',()=>{
 const g=fixture();g.finished=true;wizard.restart(g);
 assert.equal(g.round,3);assert.equal(g.hands.a.length,3);assert.equal(g.finished,false);
});

test('Hard bot chooses a high-value trump suit',()=>{
 const g=fixture();g.phase='choose-trump';g.turn=0;
 g.hands.a=[c('r13','red',13),c('r12','red',12),c('b2','blue',2)];
 assert.deepEqual(wizard.botAction(g,'a','hard'),{type:'trump',suit:'red'});
});
test('Hard bot preserves wizard when it cannot win because another wizard led',()=>{
 const g=fixture();g.phase='playing';g.turn=1;g.trump='green';g.lead=null;
 g.trick=[{id:'a',card:c('w0',null,14,'wizard')}];
 g.bids.b=1;g.tricks.b=0;
 g.hands.b=[c('w1',null,14,'wizard'),c('j1',null,0,'jester')];
 assert.equal(wizard.botAction(g,'b','hard').cardId,'j1');
});
test('Hard bot prefers a losing card after meeting its bid',()=>{
 const g=fixture();g.phase='playing';g.turn=1;g.lead='red';g.trump='green';
 g.trick=[{id:'a',card:c('r9','red',9)}];g.bids.b=0;g.tricks.b=0;
 g.hands.b=[c('r2','red',2),c('r13','red',13)];
 assert.equal(wizard.botAction(g,'b','hard').cardId,'r2');
});
