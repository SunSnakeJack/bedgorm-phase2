import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {serve} from '../server/index.mjs';

function testPersistentMatch(databaseUrl){
  test('persistent authoritative match ('+(databaseUrl?'PostgreSQL':'SQLite')+')',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'bedgorm-'));
  let now=100_000;
  const file=join(dir,'test.sqlite');
  let app=await serve({port:0,file,databaseUrl,clock:()=>now,tickMs:0});
  try{
    const client=()=>({
      token:'',
      async call(path,body,status=200){
        const response=await fetch(app.url+'/api/'+path,{
          method:body===undefined?'GET':'POST',
          headers:{'Content-Type':'application/json',...(this.token?{Authorization:'Bearer '+this.token}:{})},
          body:JSON.stringify(body)
        });
        assert.equal(response.status,status);
        const result=await response.json();
        if(result.token)this.token=result.token;
        return result;
      }
    });
    const a=client(),b=client(),stranger=client();
    const {code}=await a.call('rooms',{name:'Alice',roomName:'Cat Park',avatar:0,seats:5,timer:30,bots:['easy','normal','hard']},201);
    const route='rooms/'+code;
    await stranger.call(route,undefined,401);
    await b.call(route+'/join',{name:'Bob',avatar:1},201);
    await a.call(route+'/start',{},409);
    await b.call(route+'/ready',{ready:true});
    await b.call(route+'/start',{},403);
    const action=(version,move,id=crypto.randomUUID())=>({version,move,id});
    await a.call(route+'/start',{});
    await stranger.call(route+'/join',{name:'Late',avatar:2},409);
    await a.call(route+'/move',action(0,{type:'leg',cat:9}),422);

    const first=action(0,{type:'overall',cat:0,side:'win'});
    const sends=await Promise.all([
      a.call(route+'/move',first),a.call(route+'/move',first)
    ]);
    assert.equal(sends[0].game.step,1);
    assert.equal(sends[1].game.step,1);
    await b.call(route+'/move',action(0,{type:'roll'}),409);
    const bob=await b.call(route);
    assert.equal(bob.game.overall.win.length,0);
    assert.equal(bob.game.players[0].used.length,0);
    assert.equal('rng' in bob.game,false);
    assert.equal('seed' in bob.game,false);
    assert.equal(bob.deadline,(await a.call(route)).deadline);
    assert.equal((await a.call(route)).game.overall.win.length,1);
    await a.call(route+'/move',action(1,{type:'roll'}),403);
    const reload=client(); reload.token=b.token;
    assert.equal((await reload.call(route)).me,1);
    const afterRoll=await reload.call(route+'/move',action(1,{type:'roll'}));
    assert.equal(afterRoll.game.step,2);
    assert.deepEqual(afterRoll.game.track,(await a.call(route)).game.track);
    await app.close();
    app=await serve({port:0,file,databaseUrl,clock:()=>now,tickMs:0});
    assert.equal((await reload.call(route)).game.step,2);
    let state=afterRoll, proxyPlayed=false, timedOut=false;
    const levels=new Set();
    for(let count=0;!state.game.ended&&count<400;count++){
      const turn=state.game.turn;
      if(turn===0&&count===3){
        now+=30_000;
        await app.tick();
        timedOut=true;
      }else if(turn===1&&count===4){
        now+=50_000;
        await app.tick();
        assert.equal((await a.call(route)).players[1].online,false);
        proxyPlayed=true;
        assert.equal((await reload.call(route)).players[1].online,true);
        assert.equal((await reload.call(route)).game.step,state.game.step+1);
      }else if(turn<2){
        const player=turn===0?a:reload;
        await player.call(route+'/move',action(state.game.step,{type:'roll'}));
      }else{
        levels.add(state.game.players[turn].bot);
        now+=800;
        await app.tick();
      }
      state=await a.call(route);
    }
    assert.deepEqual([...levels].sort(),['easy','hard','normal']);
    assert.equal(timedOut,true);
    assert.equal(proxyPlayed,true);
    assert.equal(state.game.ended,true);
    assert.deepEqual(state.game.players.map(p=>p.score),(await reload.call(route)).game.players.map(p=>p.score));
  }finally{await app.close();rmSync(dir,{force:true,recursive:true});}
});

}

testPersistentMatch();
if(process.env.BEDGORM_TEST_POSTGRES_URL)testPersistentMatch(process.env.BEDGORM_TEST_POSTGRES_URL);

test('concurrent joins allocate distinct seats and preserve the last seat', async () => {
  const app = await serve({port: 0, file: ':memory:', tickMs: 0});
  const post = (path, payload) => fetch(app.url + '/api/' + path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  try {
    const created = await post('rooms', {name: 'Host', avatar: 0, seats: 4, bots: ['normal']});
    assert.equal(created.status, 201);
    const {code} = await created.json();

    const responses = await Promise.all(['Guest A', 'Guest B', 'Guest C'].map(name =>
      post('rooms/' + code + '/join', {name, avatar: 1})
    ));
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 201, 409]);
    const guests = await Promise.all(responses.filter(response => response.ok).map(response => response.json()));
    assert.deepEqual(guests.map(guest => guest.me).sort(), [1, 2]);
    assert.notEqual(guests[0].token, guests[1].token);
  } finally {
    await app.close();
  }
});

test('room creation rejects invalid origins before processing JSON', async () => {
  const app = await serve({port: 0, file: ':memory:', tickMs: 0});
  try {
    for (const origin of ['null', 'invalid', 'https://example.test']) {
      const response = await fetch(app.url + '/api/rooms', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Origin: origin},
        body: '{}'
      });
      assert.equal(response.status, 403);
      await response.json();
    }
  } finally {
    await app.close();
  }
});

test('room request quota recovers after its window closes', async () => {
  let now = 0;
  const app = await serve({port: 0, file: ':memory:', tickMs: 0, clock: () => now});
  const create = body => fetch(app.url + '/api/rooms', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
  });
  try {
    for (let index = 0; index < 60; index++) {
      const response = await create({});
      assert.equal(response.status, 400);
      await response.json();
    }
    const limited = await create({});
    assert.equal(limited.status, 429);
    await limited.json();
    now = 60_000;
    const response = await create({name: 'Host', avatar: 0, seats: 3});
    assert.equal(response.status, 201);
    const {code, token} = await response.json();
    now += 86_400_000;
    await app.tick();
    const expired = await fetch(app.url + '/api/rooms/' + code, {
      headers: {Authorization: 'Bearer ' + token}
    });
    assert.equal(expired.status, 404);
    await expired.json();
  } finally {
    await app.close();
  }
});
