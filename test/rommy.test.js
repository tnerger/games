'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const rommy=require('../rommy');
const t=(id,color,value)=>({id,color,value});
test('RommyCup deals 14 tiles per player and 106 unique tiles',()=>{
 const g=rommy.create(['a','b','c']);
 assert.equal(g.hands.a.length,15);assert.equal(g.hands.b.length,14);
 assert.equal(g.bag.length,106-43);
 assert.equal(new Set([...g.bag,...Object.values(g.hands).flat()].map(x=>x.id)).size,106);
 assert.equal(rommy.view(g,'a').hand.length,15);
 assert.equal(rommy.view(g,'b').hand.length,14);
});
test('Groups and ascending runs including jokers',()=>{
 assert.equal(rommy.meldValue([t('a','red',9),t('b','blue',9),t('c','black',9)]),27);
 assert.equal(rommy.meldValue([t('a','red',8),t('b','joker',0),t('c','red',10)]),27);
 assert.equal(rommy.meldValue([t('a','red',8),t('b','red',10),t('c','red',9)]),null);
 assert.equal(rommy.meldValue([t('a','red',8),t('b','red',8),t('c','blue',8)]),null);
});
test('Initial meld needs 30 points and cannot rearrange table',()=>{
 const g=rommy.create(['a','b']);
 g.hands.a=[t('a1','red',10),t('a2','blue',10),t('a3','black',10)];
 g.hands.b=[t('b1','red',11),t('b2','blue',11),t('b3','black',11)];
 assert.throws(()=>rommy.act(g,'a',{type:'place',groups:[['a1','a2']]}));
 rommy.act(g,'a',{type:'place',groups:[['a1','a2','a3']]});
 assert.equal(g.finished,true);assert.equal(g.winner,'a');
});
test('Cannot steal table tiles or play another user hand',()=>{
 const g=rommy.create(['a','b']);
 g.table=[[t('x','red',10),t('y','blue',10),t('z','black',10)]];
 g.hands.a=[t('a1','orange',10),t('a2','red',11),t('a3','red',12)];
 assert.throws(()=>rommy.act(g,'a',{type:'place',groups:[['a1','a2','a3']]}),/Tisch/);
 assert.throws(()=>rommy.act(g,'a',{type:'place',groups:[['x','y','a1']]}),/Tisch/);
 assert.throws(()=>rommy.act(g,'a',{type:'place',groups:[['x','y','z'],['a1','a2','bad']]}));
});

test('A new tile is drawn at the beginning of every turn',()=>{
 const g=rommy.create(['a','b']);
 assert.equal(g.latestDraw.player,'a');
 assert.ok(g.hands.a.some(t=>t.id===g.latestDraw.tileId));
 assert.throws(()=>rommy.act(g,'a',{type:'draw'}),/automatisch/);
 rommy.act(g,'a',{type:'pass'});
 assert.equal(g.turn,1);
 assert.equal(g.hands.b.length,15);
 assert.equal(g.latestDraw.player,'b');
 assert.equal(g.bag.length,106-44);
});
