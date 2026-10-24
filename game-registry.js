'use strict';
const uno=require('./uno');
const skyjo=require('./skyjo');
const wizard=require('./wizard');
const elfer=require('./elfer');
const bots=require('./bots');
const games={
 uno:{title:'UNO',create:(players,room)=>uno.create(players,room.options||uno.defaults),view:uno.view,act:uno.act,bot:(g,id,level)=>bots.decide(g,id,level)},
 skyjo:{title:'Skyjo Classic',create:(players,room)=>skyjo.create(players,room.skyjoScores||{}),view:skyjo.view,act:skyjo.act,bot:skyjo.botAction},
 elfer:{title:'11er Raus',create:(players,room)=>elfer.create(players,room.elferScores||{}),view:elfer.view,act:elfer.act,bot:elfer.botAction},
 wizard:{title:'Wizard',create:(players,room)=>wizard.create(players,room.wizardScores||{}),view:wizard.view,act:wizard.act,bot:wizard.botAction,restart:wizard.restart}
};
function get(type){const game=games[type];if(!game)throw Error('Unbekanntes Spiel.');return game;}
module.exports={get,types:Object.keys(games)};
