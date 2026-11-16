import {levels} from './engine.mjs';
import {readJson,write} from './session.mjs';

export const enabled=document.documentElement.dataset.online==='yes';
const key='bedgorm.online.room.v1';
const invite=new URLSearchParams(location.search).get('room')?.toUpperCase();
function tabSession(){
  try{return JSON.parse(sessionStorage.getItem(key));}catch{return null;}
}
function saveTab(value){
  try{
    if(value)sessionStorage.setItem(key,JSON.stringify(value));
    else sessionStorage.removeItem(key);
  }catch{}
}
const remembered=tabSession();
let session=invite?(remembered?.code===invite?remembered:null):remembered??readJson(key);
export let room=null;
export let error='';
export let busy=false;
export let offset=0;
let active=false;
let polling;
let notify=()=>{};

function apply(next){
  const {token,serverNow,...state}=next;
  if(token){
    session={code:state.code,token};
    saveTab(session);
    write(key,JSON.stringify(session));
  }
  offset=serverNow-Date.now();
  room=state;
}
async function request(path,body){
  const response=await fetch('/api/'+path,{
    method:body===undefined?'GET':'POST',
    headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(session?{Authorization:'Bearer '+session.token}:{})},
    body:JSON.stringify(body),
    cache:'no-store'
  });
  const result=await response.json();
  if(!response.ok)throw Object.assign(new Error(result.error),{status:response.status});
  apply(result);
}
export function watch(value,callback){
  active=value;
  notify=callback;
  if(active)void poll();
}
async function poll(){
  if(!active||!session||busy||polling||(!room&&invite&&session.code!==invite))return;
  const previous=JSON.stringify(room);
  const lastError=error;
  try{
    polling=request('rooms/'+session.code);
    await polling;
    error='';
  }
  catch(e){
    error=e.status?e.message:'ขาดการเชื่อมต่อ กำลังลองใหม่';
    if([401,404].includes(e.status))forget();
  }finally{polling=null;}
  if(active&&(previous!==JSON.stringify(room)||lastError!==error))notify();
}
if(enabled)setInterval(poll,1100);
function forget(){
  if(readJson(key)?.token===session?.token)write(key,null);
  saveTab(null);
  session=null;
  room=null;
}
async function perform(path,body){
  if(busy)return;
  busy=true;
  error='';
  notify();
  try{
    await polling?.catch(()=>{});
    await request(path,body);
  }
  catch(e){error=e.status?e.message:'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่';}
  finally{busy=false;if(active)notify();}
}
function actionId(){
  if(crypto.randomUUID)return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
let lastAction;
export function move(input,auto=false){
  if(!room?.game||room.game.turn!==room.me||busy)return;
  const version=room.game.step;
  const signature=JSON.stringify({code:room.code,version,input,auto});
  if(lastAction?.signature!==signature)lastAction={signature,id:actionId()};
  void perform('rooms/'+room.code+'/move',{version,move:input,id:lastAction.id,auto});
}
export const isInvite=enabled&&/^[0-9A-F]{16}$/.test(invite??'');
const states=p=>p.bot?'บอต '+levels[p.bot]:p.online?'ออนไลน์':'ออฟไลน์';
const avatars=['🐱','🐯','🦁','🐈','🐈‍⬛','🐾','😺'];
export const avatar=id=>avatars[id];
export function status(escape){
  return '<p class="online-status" role="status">'+escape(error||(busy?'กำลังส่งคำขอ…':''))+'</p>';
}
export function lobby(escape){
  const profile='<label>ชื่อผู้เล่น<input name="name" required maxlength="24"></label><label>อวตาร<select name="avatar">'+avatars.map((a,i)=>'<option value="'+i+'">'+a+'</option>').join('')+'</select></label>';
  const disable=busy?' disabled':'';
  const head='<button class="link back" data-route="home">← คลังเกม</button>';
  const levelOptions=Object.entries(levels).map(([id,label])=>'<option value="'+id+'"'+(id==='normal'?' selected':'')+'>'+label+'</option>').join('');
  if(!room){
    return head+'<div class="lobby-layout"><form id="join-room" class="panel lobby-form"><h1>เข้าห้องออนไลน์</h1>'+status(escape)+
      '<label>รหัสห้อง<input name="code" maxlength="16" minlength="16" pattern="[A-Fa-f0-9]{16}" required value="'+escape(isInvite?invite:'')+'"></label>'+
      profile+'<button class="primary"'+disable+'>เข้าห้อง</button></form><form id="create-room" class="panel lobby-form"><h2>สร้างห้อง</h2>'+
      '<label>ชื่อห้อง<input name="roomName" maxlength="40" placeholder="สวนสนุกแมว"></label>'+profile+
      '<label>จำนวนที่นั่ง<select name="seats">'+[3,4,5,6,7,8].map(n=>'<option>'+n+'</option>').join('')+'</select></label>'+
      '<label>เวลาในแต่ละตา<select name="timer"><option value="30">30 วินาที</option><option value="60" selected>60 วินาที</option><option value="90">90 วินาที</option><option value="0">ไม่จำกัด</option></select></label>'+
      '<fieldset><legend>บอตเติมที่นั่ง</legend><label>จำนวนบอต<select name="botCount">'+Array.from({length:8},(_,i)=>'<option>'+i+'</option>').join('')+'</select></label>'+
      '<div class="online-bots" data-online-bots></div><template id="online-level-options">'+levelOptions+'</template></fieldset><button class="primary"'+disable+'>สร้างห้อง</button></form></div>';
  }
  const host=room.me===0;
  const canStart=room.players.length===room.settings.seats&&room.players.every(p=>p.ready&&p.online);
  const mine=room.players.find(p=>p.seat===room.me);
  const link=new URL(location.pathname,location.origin);
  link.searchParams.set('room',room.code);
  return head+'<section class="panel lobby-form room-lobby"><h1>'+escape(room.name)+'</h1>'+status(escape)+
    '<div class="actions"><b>รหัสห้อง <code>'+room.code+'</code></b><a href="'+escape(link.href)+'" target="_blank" rel="noopener">ลิงก์เชิญ</a></div>'+
    '<label>คัดลอกลิงก์เชิญ<input type="url" readonly value="'+escape(link.href)+'"></label>'+
    '<p>'+room.players.length+' / '+room.settings.seats+' ที่นั่ง · '+(room.settings.timer?room.settings.timer+' วินาที':'ไม่จำกัดเวลา')+'</p>'+
    '<ul class="players">'+room.players.map(p=>'<li><span>'+avatar(p.avatar)+' '+escape(p.name)+(p.seat===0?' · เจ้าของห้อง':'')+
    '<small> · '+states(p)+'</small></span><b>'+(p.ready?'พร้อม':'ยังไม่พร้อม')+'</b></li>').join('')+'</ul>'+
    (host?'<button class="primary" data-online-cmd="start"'+(canStart?disable:' disabled')+'>เริ่มการแข่งขัน</button>':
      '<button class="primary" data-online-cmd="ready"'+disable+'>'+(mine.ready?'ยกเลิกพร้อม':'พร้อมแล้ว')+'</button>')+
    '</section>';
}
export function onSubmit(event){
  if(!['create-room','join-room'].includes(event.target.id))return;
  event.preventDefault();
  if(busy)return;
  const values=new FormData(event.target);
  const profile={name:values.get('name'),avatar:Number(values.get('avatar'))};
  if(event.target.id==='join-room'){
    void perform('rooms/'+values.get('code').trim().toUpperCase()+'/join',profile);
  }else{
    const seats=Number(values.get('seats'));
    const botCount=Number(values.get('botCount'));
    if(botCount>seats-1){
      error='จำนวนบอตต้องน้อยกว่าจำนวนที่นั่ง';
      const status=event.target.parentElement.querySelector('.online-status');
      if(status)status.textContent=error;
      return;
    }
    void perform('rooms',{...profile,seats,roomName:values.get('roomName'),timer:Number(values.get('timer')),bots:Array.from({length:botCount},(_,i)=>values.get('bot-'+i))});
  }
}
export function onCommand(command){
  if(!room)return;
  const path='rooms/'+room.code;
  if(command==='start')void perform(path+'/start',{});
  if(command==='ready')void perform(path+'/ready',{ready:!room.players.find(p=>p.seat===room.me).ready});

}

export function onChange(target){
  if(target.form?.id!=='create-room'||!['seats','botCount'].includes(target.name))return;
  const form=target.form;
  const container=form.querySelector('[data-online-bots]');
  const count=form.elements.botCount;
  const max=Number(form.elements.seats.value)-1;
  for(const option of count.options)option.disabled=Number(option.value)>max;
  if(Number(count.value)>max)count.value=String(max);
  const old=[...container.querySelectorAll('select')].map(select=>select.value);
  const options=form.querySelector('template').innerHTML;
  container.innerHTML=Array.from({length:Number(count.value)},(_,i)=>'<label>ระดับบอต '+(i+1)+
    '<select name="bot-'+i+'">'+options+'</select></label>').join('');
  for(const [i,level] of old.entries())if(form.elements['bot-'+i])form.elements['bot-'+i].value=level;
}
