import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,move,reverseCat,rank,legal,act,legValues} from '../dist/engine.mjs';
import {choose,botView} from '../dist/bot.mjs';
import {encode,decode,delayUntilAuto} from '../dist/session.mjs';

const setup=(n=3)=>createGame({name:'Tester',seats:n,bots:Array(n-1).fill('normal'),timer:60},42);
test('seeded setup and seven unique cats',()=>{
  assert.deepEqual(setup(),setup());
  assert.equal(new Set(Object.values(setup().track).flat()).size,7);
});
test('moving the middle preserves the lower cat and rides atop the destination',()=>{
  let game=setup();
  game.track={2:[0,1,2],4:[3],9:[4],14:[5],15:[6]};
  move(game,1,2);
  assert.deepEqual(game.track[2],[0]);
  assert.deepEqual(game.track[4],[3,1,2]);
  assert.deepEqual(rank(game),[4,2,1,3,0]);
});
test('reverse exceptions, carrying, and backward crossing',()=>{
  let game=setup();
  game.track={1:[5,0],5:[1,2,3,4],14:[6]};
  assert.equal(reverseCat(game,6),5);
  assert.deepEqual(move(game,5,2).cats,[5,0]);
  assert.equal(game.ended,true);
  assert.equal(rank(game).at(-1),0);
  game.track={5:[0,1,2,3,4],14:[5,6]};
  assert.equal(reverseCat(game,5),6);
});
test('items exclude occupied, first and adjacent slots and brake stacks beneath',()=>{
  const game=setup();
  game.track={2:[0],3:[1],8:[2,3,4],14:[5,6]};
  game.items=[{space:4,owner:1,sign:-1}];
  assert.ok(!legal(game).some(a=>a.type==='item'&&[1,2,3,4,5,8,14].includes(a.space)));
  move(game,0,2);
  assert.equal(game.players[1].score,4);
  assert.deepEqual(game.track[3],[0,1]);
});
test('boost stacks above destination; reverse boost follows moving direction',()=>{
  const game=setup();
  game.track={2:[0],5:[1],8:[2,3,4],14:[5,6]};
  game.items=[{space:4,owner:1,sign:1},{space:12,owner:2,sign:1}];
  move(game,0,2);
  assert.deepEqual(game.track[5],[1,0]);
  move(game,6,2);
  assert.deepEqual(game.track[11],[6]);
});
test('five different dice settle the leg and return items',()=>{
  let game=setup();
  for(let i=0;i<4;i++)game=act(game,{type:'roll'});
  assert.equal(new Set(game.rolled.map(d=>d.die)).size,4);
  game=act(game,{type:'roll'});
  assert.equal(game.leg,2);
  assert.equal(game.rolled.length,0);
  assert.equal(game.players.reduce((sum,p)=>sum+p.score,0),14);
});
test('leg ticket awards and partnership copy the best positive ticket',()=>{
  let game=setup(6);
  game.track={5:[3,2,0,1,4],14:[5,6]};
  game.players[0].tickets=[{cat:4,value:5},{cat:0,value:3}];
  game.players[1].tickets=[{cat:1,value:2}];
  game.players[1].rolls=1;
  game=act(game,{type:'partner',target:1});
  assert.deepEqual(legValues(game).slice(0,2),[[5,-1,1],[1,1,5]]);
});
test('finish awards correct guesses by correct-entry order and hides opponents’ guesses',()=>{
  let game=setup();
  game.track={16:[4,3,2,1,0],5:[5,6]};
  game.draw=[0];
  game.overall.win=[{owner:0,cat:1},{owner:1,cat:0},{owner:2,cat:0}];
  game.overall.last=[{owner:0,cat:4}];
  game.players[1].used=[0];
  const view=botView(game,0);
  assert.equal(view.overall,undefined);
  assert.equal(view.rng,undefined);
  assert.deepEqual(view.players[1].used,[]);
  game=act(game,{type:'roll'});
  assert.ok(game.ended);
  assert.deepEqual(game.players.map(p=>p.score),[11,11,8]);
  assert.deepEqual(game.winners,[0,1]);
});
test('invalid or stale moves do not mutate the game',()=>{
  const game=setup();
  assert.equal(act(game,{type:'leg',cat:5}),game);
  assert.equal(game.turn,0);
});
test('save and expiry survive round trip, bots use legal actions only',()=>{
  const game=setup();
  assert.deepEqual(decode(encode(game,2000)),{game,deadline:2000});
  assert.equal(decode('corrupt'),null);
  assert.equal(delayUntilAuto(game,2000,2100),0);
  assert.equal(delayUntilAuto(game,null,2100),null);
  for(const level of ['easy','normal','hard']){
    const action=choose(botView(game),level,0.4);
    assert.ok(legal(game).some(a=>JSON.stringify(a)===JSON.stringify(action)));
  }
});
test('180 seeded matches finish with no deadlock and retain all cats',()=>{
  for(let seed=1;seed<=180;seed++){
    const seats=3+seed%6;
    let g=createGame({name:'Tester',seats,bots:Array(seats-1).fill('normal'),timer:0},seed);
    for(let turn=0;turn<500&&!g.ended;turn++){
      const level=['easy','normal','hard'][(turn+seed)%3];
      const a=choose(botView(g),level,((seed*313+turn*197)%997)/997);
      const next=act(g,a);
      assert.notEqual(next,g);
      assert.equal(new Set(Object.values(next.track).flat()).size,7);
      g=next;
    }
    assert.ok(g.ended,'seed '+seed);
    assert.ok(g.winners.length);
  }
});
