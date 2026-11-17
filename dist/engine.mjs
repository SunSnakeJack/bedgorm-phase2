export const cats=[
  {name:'โมจิ',color:'#ff92ae',mark:'✿',fur:'pink'},
  {name:'ซันนี่',color:'#ffc467',mark:'☀',fur:'orange'},
  {name:'มิ้นต์',color:'#97dfb1',mark:'✦',fur:'green'},
  {name:'บลูเบลล์',color:'#91c9ff',mark:'◆',fur:'blue'},
  {name:'ทาโร่',color:'#cab2ff',mark:'☾',fur:'purple'},
  {name:'น้องถ่าน',color:'#595175',mark:'↶',fur:'black'},
  {name:'น้องหิมะ',color:'#fff7df',mark:'↶',fur:'white'}
];
export const dice=[0,1,2,3,4,7];
const ticketValues=[5,3,2,2];
const overallValues=[8,5,3,2,1];
export const levels={easy:'ง่าย',normal:'ปกติ',hard:'ยาก'};

export function random(game){
  game.rng=(Math.imul(game.rng,1664525)+1013904223)>>>0;
  return game.rng/4294967296;
}
function shuffle(list,draw){
  for(let i=list.length-1;i>0;i--){
    const j=Math.floor(draw()*(i+1));
    [list[i],list[j]]=[list[j],list[i]];
  }
  return list;
}
function append(track,space,cat){
  (track[space]??=[]).push(cat);
}
export function createGame(config,seed,entropy){
  const game={
    config,seed,rng:seed>>>0,track:{},turn:0,step:0,leg:1,idle:0,ended:false,
    draw:[...dice],rolled:[],stock:cats.slice(0,5).map(()=>[...ticketValues]),
    items:[],overall:{win:[],last:[]},winners:[],
    players:Array.from({length:config.seats},(_,id)=>({
      id,name:id?'บอต '+id:config.name,bot:id?config.bots[id-1]:null,
      score:3,tickets:[],rolls:0,used:[],partner:null,ledger:[{label:'เหรียญเริ่มต้น',value:3}]
    })),
    log:[{label:'เปิดสนาม! ทุกคนเริ่มด้วย 3 เหรียญ',kind:'start'}]
  };
  const draw=entropy??(()=>random(game));
  for(const cat of shuffle([0,1,2,3,4],draw))append(game.track,1+Math.floor(draw()*3),cat);
  for(const cat of [5,6])append(game.track,16-Math.floor(draw()*3),cat);
  return game;
}

function location(game,cat){
  for(const [key,stack] of Object.entries(game.track)){
    const index=stack.indexOf(cat);
    if(index>=0)return {space:Number(key),stack,index};
  }
  throw new Error('Missing cat '+cat);
}
export function rank(game){
  return Object.keys(game.track).map(Number).sort((a,b)=>b-a)
    .flatMap(space=>[...game.track[space]].reverse()).filter(cat=>cat<5);
}
export function reverseCat(game,face){
  const black=location(game,5);
  const white=location(game,6);
  if(black.stack===white.stack&&Math.abs(black.index-white.index)===1){
    return black.index>white.index?5:6;
  }
  const carries=spot=>spot.stack.slice(spot.index+1).some(cat=>cat<5);
  const blackCarries=carries(black);
  const whiteCarries=carries(white);
  return blackCarries===whiteCarries?face:blackCarries?5:6;
}
function score(game,id,label,value){
  const player=game.players[id];
  player.score+=value;
  player.ledger.push({label,value});
}
function log(game,label,kind,action){
  game.log.push(action?{label,kind,...action}:{label,kind});
  if(game.log.length>100)game.log.shift();
}

export function move(game,cat,distance,{credit=true}={}){
  const {space,stack,index}=location(game,cat);
  const carried=stack.splice(index);
  if(!stack.length)delete game.track[space];
  const direction=cat>=5?-1:1;
  const landing=space+distance*direction;
  const item=game.items.find(entry=>entry.space===landing);
  const target=landing+(item?.sign??0)*direction;
  const destination=game.track[target]??[];
  game.track[target]=item?.sign===-1?[...carried,...destination]:[...destination,...carried];
  if(item&&credit){
    score(game,item.owner,'ไอเทมช่อง '+landing,1);
    log(game,game.players[item.owner].name+' ได้ 1 เหรียญจากไอเทมช่อง '+landing,'item');
  }
  if(target<1||target>16)game.ended=true;
  return {cats:carried,from:space,landing,to:target,cat,distance,stacked:destination.length>0};
}

export function legal(game){
  if(game.ended)return [];
  const player=game.players[game.turn];
  const result=[{type:'roll'}];
  for(let cat=0;cat<5;cat++){
    if(game.stock[cat].length)result.push({type:'leg',cat});
    if(!player.used.includes(cat)){
      result.push({type:'overall',side:'win',cat},{type:'overall',side:'last',cat});
    }
  }
  for(let space=2;space<=16;space++){
    if(game.track[space]?.length)continue;
    if(game.items.some(item=>item.space===space||item.owner!==player.id&&
      [1,15].includes(Math.abs(item.space-space))))continue;
    result.push({type:'item',space,sign:1},{type:'item',space,sign:-1});
  }
  if(game.players.length>=6&&player.partner===null){
    for(const other of game.players){
      if(other.id!==player.id&&other.partner===null)result.push({type:'partner',target:other.id});
    }
  }
  return result;
}
export function legValues(game){
  const [first,second]=rank(game);
  const base=game.players.map(p=>[
    ...p.tickets.map(t=>t.cat===first?t.value:t.cat===second?1:-1),
    ...Array(p.rolls).fill(1)
  ]);
  return base.map((values,index)=>{
    const partner=game.players[index].partner;
    if(partner===null)return values;
    const best=Math.max(0,...base[partner]);
    return best?[...values,best]:values;
  });
}
function settleLeg(game){
  const values=legValues(game);
  game.players.forEach((p,id)=>{
    p.tickets.forEach((ticket,i)=>score(game,id,'รอบ '+game.leg+' · ตั๋ว '+cats[ticket.cat].name,values[id][i]));
    if(p.rolls)score(game,id,'รอบ '+game.leg+' · สุ่มลูกเต๋า',p.rolls);
    if(values[id].length>p.tickets.length+p.rolls)score(game,id,'รอบ '+game.leg+' · คู่หู',values[id].at(-1));
  });
  log(game,'จบรอบ '+game.leg+' · '+cats[rank(game)[0]].name+' ขึ้นนำ','leg');
  if(game.ended)return;
  game.leg++;
  game.stock=cats.slice(0,5).map(()=>[...ticketValues]);
  game.items=[];
  game.draw=[...dice];
  game.rolled=[];
  game.players.forEach(p=>{p.tickets=[];p.rolls=0;p.partner=null;});
}
function settleRace(game){
  const order=rank(game);
  for(const [side,correct,label] of [['win',order[0],'ผู้ชนะ'],['last',order.at(-1),'อันดับสุดท้าย']]){
    let hits=0;
    for(const {owner,cat} of game.overall[side]){
      score(game,owner,'ทาย'+label+' · '+cats[cat].name,cat===correct?(overallValues[hits++]??1):-1);
    }
  }
  const best=Math.max(...game.players.map(p=>p.score));
  game.winners=game.players.filter(p=>p.score===best).map(p=>p.id);
  log(game,'จบการแข่งขัน · '+cats[order[0]].name+' เข้าอันดับ 1','finish');
}
export function act(game,input,{auto=false,entropy}={}){
  if(!input)return game;
  const action=legal(game).find(candidate=>
    Object.entries(candidate).every(([key,value])=>input[key]===value));
  if(!action)return game;
  const next=structuredClone(game);
  const player=next.players[next.turn];
  const name=(auto?'เล่นแทน · ':'')+player.name;
  next.step++;
  next.idle++;
  next.lastMove=null;
  // Public metadata lets clients replay missed actions in order after polling.
  const record=(label,kind)=>log(next,label,kind,{step:next.step,seat:player.id,bot:!!player.bot});
  if(action.type==='roll'){
    const draw=entropy??(()=>random(next));
    const [die]=next.draw.splice(Math.floor(draw()*next.draw.length),1);
    const distance=1+Math.floor(draw()*3);
    const cat=die===7?reverseCat(next,draw()<0.5?5:6):die;
    next.rolled.push({die,cat,distance});
    player.rolls++;
    next.idle=0;
    record(name+' สุ่มได้ '+cats[cat].name+' '+distance+' ช่อง','roll');
    next.lastMove=move(next,cat,distance);
    if(next.rolled.length===5||next.ended)settleLeg(next);
    if(next.ended)settleRace(next);
  }
  if(action.type==='leg'){
    const value=next.stock[action.cat].shift();
    player.tickets.push({cat:action.cat,value});
    record(name+' หยิบตั๋ว '+cats[action.cat].name+' · '+value,'ticket');
  }
  if(action.type==='overall'){
    player.used.push(action.cat);
    next.overall[action.side].push({owner:player.id,cat:action.cat});
    record(name+' ส่งคำทายลับ','secret');
  }
  if(action.type==='item'){
    next.items=next.items.filter(item=>item.owner!==player.id);
    next.items.push({space:action.space,owner:player.id,sign:action.sign});
    record(name+' วางไอเทม '+(action.sign>0?'+1':'−1')+' ช่อง '+action.space,'item');
  }
  if(action.type==='partner'){
    player.partner=action.target;
    next.players[action.target].partner=player.id;
    record(name+' จับคู่กับ '+next.players[action.target].name,'partner');
  }
  next.turn=(next.turn+1)%next.players.length;
  return next;
}
