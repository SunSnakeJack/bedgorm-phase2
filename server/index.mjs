import {createHash,randomBytes,randomInt,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {parseArgs} from 'node:util';
import {openDatabase} from './database.mjs';
import {pathToFileURL} from 'node:url';
import {act,createGame,levels,rank} from '../dist/engine.mjs';
import {botView,choose} from '../dist/bot.mjs';

const presenceMs=15_000;
const graceMs=30_000;
const day=86_400_000;
const hash=token=>createHash('sha256').update(token).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(value,limit)=>typeof value==='string'?value.trim().slice(0,limit):'';
const validLevel=level=>typeof level==='string'&&Object.hasOwn(levels,level);
const entropy=()=>randomInt(0x100000000)/0x100000000;
const files=new Map([
  ['/', ['index.html','text/html; charset=UTF-8']],
  ...['app','engine','bot','session','effects','online'].map(name=>['/'+name+'.mjs',[name+'.mjs','text/javascript; charset=UTF-8']]),
  ['/style.css',['style.css','text/css; charset=UTF-8']]
]);

function json(response,status,value){
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  response.end(JSON.stringify(value));
}
async function body(request){
  if(request.headers['content-type']?.split(';')[0]!=='application/json')fail(415,'ต้องส่งข้อมูล JSON');
  let size=0;
  const chunks=[];
  for await(const chunk of request){
    size+=chunk.length;
    if(size>8192){request.resume();fail(413,'ข้อมูลใหญ่เกินไป');}
    chunks.push(chunk);
  }
  let value;
  try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'รูปแบบข้อมูลไม่ถูกต้อง');}
  if(!value||Array.isArray(value)||typeof value!=='object')fail(400,'รูปแบบข้อมูลไม่ถูกต้อง');
  return value;
}
function publicGame(game,seat){
  const {rng,seed,...visible}=structuredClone(game);
  if(!visible.ended){
    for(const side of ['win','last'])visible.overall[side]=visible.overall[side].filter(guess=>guess.owner===seat);
    for(const player of visible.players)if(player.id!==seat)player.used=[];
  }
  return visible;
}

export async function serve({host='127.0.0.1',port=8080,file='bedgorm-online.sqlite',clock=Date.now,tickMs=400,databaseUrl}={}){
  const db=await openDatabase({file,databaseUrl});
  const roomRequests=new Map();
  function limitRoomRequest(address,now){
    const window=Math.floor(now/60_000);
    for(const [key,entry] of roomRequests)if(entry.window!==window)roomRequests.delete(key);
    const entry=roomRequests.get(address)??{window,count:0};
    if(entry.count>=60||(!roomRequests.has(address)&&roomRequests.size>=1024)){
      fail(429,'ส่งคำขอเปิดหรือเข้าห้องมากเกินไป กรุณาลองใหม่ในอีกสักครู่');
    }
    entry.count++;
    roomRequests.set(address,entry);
  }
  const roster=(tx,code)=>tx.all('SELECT seat,name,avatar,bot,ready,seen_at FROM players WHERE room_code=? ORDER BY seat',code);
  const online=(player,now)=>!!player.bot||player.seen_at!==null&&now-player.seen_at<presenceMs;
  const lookup=(tx,code)=>tx.get('SELECT * FROM games WHERE room_code=?',code);
  async function snapshot(tx,room,seat,now){
    const record=await lookup(tx,room.code);
    return {
      code:room.code,name:room.name,settings:JSON.parse(room.settings),me:seat,deadline:record?.deadline??null,
      serverNow:now,
      players:(await roster(tx,room.code)).map(({seen_at,...player})=>({...player,online:online({...player,seen_at},now)})),
      game:record?publicGame(JSON.parse(record.state),seat):null
    };
  }
  async function addGuest(tx,code,seat,input,now){
    const name=text(input.name,24);
    if(!name||!Number.isInteger(input.avatar)||input.avatar<0||input.avatar>6)fail(400,'กรุณากรอกชื่อและเลือกอวตาร');
    const token=randomBytes(32).toString('base64url');
    await tx.run('INSERT INTO players (room_code,seat,name,avatar,seen_at) VALUES (?,?,?,?,?)',code,seat,name,input.avatar,now);
    await tx.run('INSERT INTO guest_sessions VALUES (?,?,?)',hash(token),code,seat);
    return token;
  }
  async function identify(tx,request,code){
    const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization??'')?.[1];
    const session=token&&await tx.get('SELECT seat FROM guest_sessions WHERE token_hash=? AND room_code=?',hash(token),code);
    if(!session)fail(401,'เซสชันห้องไม่ถูกต้อง');
    return session.seat;
  }
  async function advance(tx,code,game,move,id,reason,now){
    const seat=game.turn;
    const next=act(game,move,{auto:reason!=='player',entropy});
    if(next===game)fail(422,'การกระทำนี้ผิดกติกา');
    await tx.run('INSERT INTO actions VALUES (?,?,?,?,?,?)',code,seat,id,next.step,JSON.stringify(move),reason);
    const nextIsBot=!!next.players[next.turn].bot;
    const deadline=!next.ended&&!nextIsBot&&next.config.timer?now+next.config.timer*1000:null;
    const botAt=!next.ended&&nextIsBot?now+700:null;
    await tx.run('UPDATE games SET state=?,deadline=?,bot_at=? WHERE room_code=?',JSON.stringify(next),deadline,botAt,code);
    await tx.run('UPDATE rooms SET expires_at=? WHERE code=?',now+(next.ended?30:1)*day,code);
    if(next.ended){
      await tx.run('INSERT INTO results VALUES (?,?,?)',code,now,JSON.stringify({
        winners:next.winners,rank:rank(next),scores:next.players.map(({id,name,score})=>({id,name,score}))
      }));
    }
  }
  async function advanceIfDue(tx,record,game,now){
    if(game.ended)return false;
    const player=game.players[game.turn];
    const presence=player.bot?null:await tx.get('SELECT seen_at FROM players WHERE room_code=? AND seat=?',record.room_code,player.id);
    const reason=player.bot
      ?(record.bot_at<=now?'bot':null)
      :record.deadline!==null&&record.deadline<=now?'timeout'
        :now-presence.seen_at>=presenceMs+graceMs?'disconnect':null;
    if(!reason)return false;
    await advance(tx,record.room_code,game,choose(botView(game),player.bot??'normal',entropy()),randomUUID(),reason,now);
    return true;
  }
  function tick(){
    const now=clock();
    return db.transaction(async tx=>{
      await tx.run('DELETE FROM rooms WHERE expires_at<=?',now);
      for(const record of await tx.all('SELECT games.* FROM games LEFT JOIN results USING(room_code) WHERE results.room_code IS NULL')){
        await advanceIfDue(tx,record,JSON.parse(record.state),now);
      }
    });
  }
  async function handle(tx,request,path,input){
    const now=clock();
    if(path==='/api/rooms'&&request.method==='POST'){
      const {seats,timer=60,bots=[]}=input;
      if(!Number.isInteger(seats)||seats<3||seats>8||![0,30,60,90].includes(timer)||
        !Array.isArray(bots)||bots.length>=seats||!bots.every(validLevel))fail(400,'การตั้งค่าห้องไม่ถูกต้อง');
      let code;
      do{code=randomBytes(8).toString('hex').toUpperCase();}while(await tx.get('SELECT 1 FROM rooms WHERE code=?',code));
      const settings={seats,timer,bots};
      const name=text(input.roomName,40)||'สวนสนุกแมว';
      await tx.run('INSERT INTO rooms VALUES (?,?,?,?)',code,name,JSON.stringify(settings),now+day);
      const token=await addGuest(tx,code,0,input,now);
      await tx.run('UPDATE players SET ready=1 WHERE room_code=? AND seat=0',code);
      for(const [i,bot] of bots.entries()){
        await tx.run('INSERT INTO players VALUES (?,?,?,?,?,1,NULL)',code,seats-bots.length+i,'บอต '+(i+1),i%7,bot);
      }
      return [201,{...(await snapshot(tx,{code,name,settings:JSON.stringify(settings)},0,now)),token}];
    }
    const match=/^\/api\/rooms\/([0-9A-Fa-f]{16})(?:\/(join|ready|start|move))?$/.exec(path);
    if(!match)fail(404,'ไม่พบเส้นทาง');
    const code=match[1].toUpperCase();
    const command=match[2];
    if(request.method!==(command?'POST':'GET'))fail(405,'วิธีเรียกไม่ถูกต้อง');
    const room=await tx.get('SELECT * FROM rooms WHERE code=? AND expires_at>?',code,now);
    if(!room)fail(404,'ไม่พบห้องหรือห้องหมดอายุ');
    const record=await lookup(tx,code);
    const settings=JSON.parse(room.settings);
    if(command==='join'){
      if(record)fail(409,'เริ่มการแข่งขันแล้ว');
      const players=await roster(tx,code);
      const seat=Array.from({length:settings.seats},(_,i)=>i).find(i=>!players.some(player=>player.seat===i));
      if(seat===undefined)fail(409,'ห้องเต็มแล้ว');
      const token=await addGuest(tx,code,seat,input,now);
      return [201,{...(await snapshot(tx,room,seat,now)),token}];
    }
    const seat=await identify(tx,request,code);
    await tx.run('UPDATE players SET seen_at=? WHERE room_code=? AND seat=?',now,code,seat);
    if(command==='ready'){
      if(record||typeof input.ready!=='boolean')fail(409,'เปลี่ยนสถานะพร้อมไม่ได้');
      await tx.run('UPDATE players SET ready=? WHERE room_code=? AND seat=?',Number(input.ready),code,seat);
    }
    if(command==='start'){
      if(seat!==0)fail(403,'เจ้าของห้องเท่านั้นที่เริ่มเกมได้');
      const players=await roster(tx,code);
      if(record||players.length!==settings.seats||players.some(p=>!p.ready||!online(p,now)))fail(409,'รอผู้เล่นครบและพร้อมทุกคน');
      const game=createGame({...settings,name:players[0].name},randomInt(0x100000000),entropy);
      for(const player of players)Object.assign(game.players[player.seat],{name:player.name,bot:player.bot});
      await tx.run('INSERT INTO games VALUES (?,?,?,NULL)',code,JSON.stringify(game),settings.timer?now+settings.timer*1000:null);
    }
    if(command==='move'){
      if(!record)fail(409,'ยังไม่เริ่มเกม');
      if(typeof input.id!=='string'||!/^[a-f0-9-]{36}$/i.test(input.id)||!Number.isInteger(input.version))fail(400,'ข้อมูลตาเล่นไม่ถูกต้อง');
      const game=JSON.parse(record.state);
      const duplicate=await tx.get('SELECT 1 FROM actions WHERE room_code=? AND seat=? AND action_id=?',code,seat,input.id);
      if(!duplicate){
        if(game.ended||game.step!==input.version)fail(409,'สถานะตาเล่นเปลี่ยนแล้ว');
        if(game.turn!==seat)fail(403,'ยังไม่ถึงตาของคุณ');
        if(record.deadline!==null&&record.deadline<=now)fail(409,'หมดเวลาแล้ว');
        if(input.auto===true&&settings.timer!==0)fail(422,'ใช้เล่นอัตโนมัติได้ในโหมดไม่จำกัดเวลา');
        const legalMove=input.auto===true?choose(botView(game),'normal',entropy()):input.move;
        await advance(tx,code,game,legalMove,input.id,input.auto===true?'requested':'player',now);
      }
    }
    return [200,await snapshot(tx,room,seat,now)];
  }

  const server=createServer(async(request,response)=>{
    try{
      const path=new URL(request.url,'http://localhost').pathname;
      if(path.startsWith('/api/')){
        if(request.method==='POST'&&request.headers.origin!==undefined){
          const origin=URL.parse(request.headers.origin);
          if(!origin||origin.origin!==request.headers.origin||
            !['http:','https:'].includes(origin.protocol)||origin.host!==request.headers.host)fail(403,'ต้นทางไม่ถูกต้อง');
        }
        if(request.method==='POST'&&(path==='/api/rooms'||/^\/api\/rooms\/[0-9a-f]{16}\/join$/i.test(path))){
          limitRoomRequest(request.socket.remoteAddress,clock());
        }
        const input=request.method==='POST'?await body(request):null;
        const [status,result]=await db.transaction(tx=>handle(tx,request,path,input));
        json(response,status,result);
        return;
      }
      const asset=files.get(path);
      if(!asset||request.method!=='GET')fail(404,'ไม่พบหน้า');
      let content=readFileSync(new URL('../dist/'+asset[0],import.meta.url));
      if(path==='/')content=content.toString().replace('<html lang="th">','<html lang="th" data-online="yes">');
      response.writeHead(200,{'Content-Type':asset[1],'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Referrer-Policy':'no-referrer'});
      response.end(content);
    }catch(error){
      if(!error.status)console.error("Unhandled server error");
      if(!response.headersSent)json(response,error.status??500,{error:error.status?error.message:'เกิดข้อผิดพลาดในเซิร์ฟเวอร์'});
      else response.end();
    }
  });
  server.listen(port,host);
  await once(server,'listening');
  let ticking;
  const loop=tickMs?setInterval(()=>{
    if(!ticking)ticking=tick().catch(()=>console.error('Database tick failed')).finally(()=>{ticking=null;});
  },tickMs):null;
  const url='http://'+host+':'+server.address().port;
  return {url,tick,async close(){
    clearInterval(loop);
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await ticking;
    await db.close();
  }};
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const {values}=parseArgs({options:{host:{type:'string'},port:{type:'string'},strictPort:{type:'boolean'}}});
  const app=await serve({host:values.host??process.env.BEDGORM_HOST,port:Number(values.port??process.env.PORT??8080),file:process.env.BEDGORM_DB,databaseUrl:process.env.DATABASE_URL});
  console.log(app.url);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void app.close());
}
