import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {serve} from '../server/index.mjs';
import {openDatabase} from '../server/database.mjs';

const databaseUrl=process.env.BEDGORM_TEST_POSTGRES_URL;
const app=await serve({port:0,file:':memory:',databaseUrl,tickMs:0});
const db=await openDatabase({file:':memory:',databaseUrl});
async function call(path,body,token){
  const response=await fetch(app.url+'/api/'+path,{
    method:body?'POST':'GET',
    headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},
    body:JSON.stringify(body),signal:AbortSignal.timeout(5000)
  });
  assert.ok(response.ok,'HTTP '+response.status);
  return response.json();
}
const stats=values=>({
  averageMs:+(values.reduce((sum,value)=>sum+value,0)/values.length).toFixed(2),
  p95Ms:+values.sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1].toFixed(2)
});
try{
  const guests=[];
  for(const humans of [2,4,8]){
    const host=await call('rooms',{name:'Host',avatar:0,seats:Math.max(3,humans),bots:humans===2?['normal']:[],timer:0});
    const route='rooms/'+host.code;
    const players=await Promise.all(Array.from({length:humans-1},(_,i)=>call(route+'/join',{name:'Guest '+i,avatar:0})));
    await Promise.all(players.map(p=>call(route+'/ready',{ready:true},p.token)));
    await call(route+'/start',{},host.token);
    const action={version:0,move:{type:'roll'},id:crypto.randomUUID()};
    const copies=await Promise.all([call(route+'/move',action,host.token),call(route+'/move',action,host.token)]);
    assert.ok(copies.every(copy=>copy.game.step===1));
    guests.push(...[host,...players].map(p=>({route,token:p.token})));
  }

  const times=[];
  let errors=0;
  const start=performance.now(), cpu=process.cpuUsage();
  for(let wave=0;wave<30;wave++){
    await Promise.all(guests.map(async({route,token})=>{
      const began=performance.now();
      try{await call(route,undefined,token);}catch{errors++;}
      times.push(performance.now()-began);
    }));
  }
  const elapsed=performance.now()-start, usage=process.cpuUsage(cpu);
  const transactions=[];
  for(let i=0;i<30;i++){
    const began=performance.now();
    await db.transaction(tx=>tx.get('SELECT 1'));
    transactions.push(performance.now()-began);
  }
  const response=stats(times);
  console.log(JSON.stringify({
    database:databaseUrl?'PostgreSQL':'SQLite',
    rooms:3,players:guests.length,requests:times.length,errors,response,
    transaction:stats(transactions),requestsPerSecond:+(times.length*1000/elapsed).toFixed(2),
    appCpuPercent:+((usage.user+usage.system)/elapsed/10).toFixed(2),
    appRssMiB:+(process.memoryUsage().rss/1048576).toFixed(2)
  }));
  assert.equal(errors,0);
  assert.ok(response.p95Ms<500,'Polling p95 exceeded 500 ms');
}finally{
  await db.close();
  await app.close();
}
