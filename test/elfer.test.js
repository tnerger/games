'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const game=require('../elfer');
const ids=['a','b','c','d','e','f'];
test('Elfer Raus deals official hand sizes and opens an eleven',()=>{
 for(let n=2;n<=6;n++){
  const g=game.create(ids.slice(0,n));
  const expected=n<=3?20:n===4?15:n===5?12:10;
  assert.equal(Object.values(g.hands).reduce((sum,h)=>sum+h.length,0),n*expected-1);
  assert.equal(g.deck.length,80-n*expected);
  assert.equal(Object.values(g.rows).flat().length,1);
  assert.equal(Object.values(g.rows).flat()[0],11);
  assert.equal(g.events.length,1);
 }
});
test('Elfer Raus enforces placement and allows multiple cards per turn',()=>{
 const g=game.create(ids.slice(0,2));const id=g.players[g.turn];
 assert.throws(()=>game.act(g,id,{type:'play',color:'red',value:21}),/nicht angelegt/);
 assert.throws(()=>game.act(g,id,{type:'end'}),/musst eine Karte/);
 assert.throws(()=>game.act(g,g.players[(g.turn+1)%2],{type:'pass'}),/nicht am Zug/);
 const legal=g.hands[id].find(c=>game.legal(g,c));
 if(legal){game.act(g,id,{type:'play',...legal});assert.equal(g.played,true);assert.equal(g.rows[legal.color].includes(legal.value),true);if(!g.finished)game.act(g,id,{type:'end'});}
});
test('Views hide other players cards and bots return legal actions',()=>{
 const g=game.create(ids.slice(0,3));const id=g.players[g.turn];
 const v=game.view(g,id);assert.equal(v.hand.length,g.hands[id].length);assert.ok(v.players.every(p=>!('hand' in p)));
 for(const level of ['easy','normal','hard']){
  const action=game.botAction(g,id,level);
  if(action.type==='play')assert.equal(game.legal(g,action),true);
  else assert.ok(['draw','pass'].includes(action.type));
 }
});
