import * as online from './online.mjs';
import {act,cats,createGame,dice,legal,levels,rank} from './engine.mjs';
import {botView,choose} from './bot.mjs';
import {decode,delayUntilAuto,encode,keys,read,readJson,write} from './session.mjs';
import {motion,playSound} from './effects.mjs';

const app=document.querySelector('#app');
const dialog=document.querySelector('#dialog');
const announce=document.querySelector('#announce');
const saved=decode(read(keys.match));
let game=saved?.game??null;
let deadline=saved?.deadline??null;
let config=readJson(keys.lobby)??{name:'',seats:4,bots:['normal','normal','normal'],timer:60,seed:''};
let prefs=readJson(keys.prefs)??{sound:false,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches};
let screen='home';
const inRoom=()=>screen==='online'&&!!online.room?.game;
const mySeat=()=>inRoom()?online.room.me:0;
let localMatch;
let pending;
let panel='roll';
let moveEffect;
let feedback;
let storageOK=true;
const boardPositions=[
  [1,1],[1,2],[1,3],[1,4],[1,5],[1,6],[2,6],[3,6],
  [4,6],[4,5],[4,4],[4,3],[4,2],[4,1],[3,1],[2,1]
];

const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const points=n=>n>0?'+'+n:String(n);
const icon=(id,extra='')=>{
  const cat=cats[id];
  return '<span aria-hidden="true" class="cat '+cat.fur+' '+extra+'" style="--fur:'+cat.color+'"><i></i><i></i><b>'+cat.mark+'</b></span>';
};
const name=id=>icon(id,'tiny')+'<span>'+cats[id].name+'</span>';
const dieIcon=id=>id===7?'<span class="grey-die">↶</span>':icon(id,'tiny');
const art=()=>'<div class="cover-art" aria-hidden="true"><div class="sun"></div><div class="cloud cloud-a"></div><div class="cloud cloud-b"></div><div class="hill hill-a"></div><div class="hill hill-b"></div><div class="cover-track"></div><span class="spark spark-a">✦</span><span class="spark spark-b">✧</span><span class="spark spark-c">✦</span><div class="hero-cats">'+icon(3,'art-cat cat-a')+icon(0,'art-cat cat-b')+icon(1,'art-cat cat-c')+'</div><span class="finish-flag">🏁</span></div>';

function home(){
  return '<section class="hero"><div class="hero-copy"><span class="eyebrow">สนามแข่งในสวนสนุกแมว</span><h1>Catm-Up<span>!</span></h1><p>แมววิ่ง แมวซ้อน แมวแซง! จับตาดูสนาม ทายผลให้แม่น แล้วเก็บเหรียญทูน่าให้มากที่สุด</p><div class="actions"><button class="primary" data-route="lobby">▶&nbsp; เริ่มเล่น</button>'+(game?'<button class="secondary" data-route="game">'+(game.ended?'ดูผลเกมล่าสุด':'เล่นต่อ')+'</button>':'<button class="secondary" data-cmd="tutorial">อ่านวิธีเล่น</button>')+'</div></div>'+art()+'</section>'+
  (online.enabled?'<p><button class="secondary" data-route="online">เล่นออนไลน์กับเพื่อน</button></p>':'')+
  '<section class="library"><div class="section-heading"><h2>คลังเกม</h2></div><div class="library-grid"><article class="game-card"><div class="mini-cover">'+icon(0)+icon(1)+icon(3)+'<b>Catm-Up!</b></div><div class="game-card-copy"><div class="badge">เล่นกับบอตได้</div><h3>Catm-Up!</h3><p>เกมกระดานแข่งแมวและทายผล</p><div class="card-footer"><span>♟ 3–8 ที่นั่ง</span><button class="secondary" data-route="lobby">เล่น →</button></div></div></article><article class="soon-card"><span class="soon-icon">✦</span><h3>เกมถัดไป</h3><p>Coming Soon</p></article></div></section>';
}
function lobby(){
  const timings=[[30,'30 วินาที'],[60,'60 วินาที'],[90,'90 วินาที'],[0,'ไม่จำกัด']];
  const options=Object.entries(levels);
  const bots=Array.from({length:config.seats-1},(_,i)=>'<label class="bot-row"><span class="bot-avatar">✦</span><span>บอต '+(i+1)+'</span><select aria-label="ระดับบอต '+(i+1)+'" data-bot="'+i+'">'+options.map(([value,label])=>'<option value="'+value+'" '+((config.bots[i]??'normal')===value?'selected':'')+'>'+label+'</option>').join('')+'</select></label>').join('');
  return '<button class="link back" data-route="home">← คลังเกม</button><div class="lobby-layout"><section class="panel lobby-info">'+art()+'<div><span class="eyebrow">แข่งกับบอต</span><h2>Catm-Up!</h2><p>ผู้เล่น 1 คน และบอต 2–7 ตัว</p><div class="online"><b>Online Multiplayer</b>'+(online.enabled?'<button class="secondary" data-route="online">เล่นออนไลน์</button>':'<span>เล่นได้ผ่านเซิร์ฟเวอร์สำหรับทดสอบ</span>')+'</div></div></section><form id="lobby" class="panel lobby-form"><h1>ตั้งค่าห้อง</h1><div class="fields"><label>ชื่อผู้เล่น<input name="name" maxlength="24" placeholder="นักทายแมว" value="'+escape(config.name)+'"></label><label>จำนวนที่นั่ง<select name="seats">'+[3,4,5,6,7,8].map(n=>'<option '+(config.seats===n?'selected':'')+'>'+n+'</option>').join('')+'</select></label></div><fieldset><legend>เวลาในแต่ละตา</legend><div class="timings">'+timings.map(([time,label])=>'<label><input type="radio" name="timer" value="'+time+'" '+(config.timer===time?'checked':'')+'><span>'+label+'</span></label>').join('')+'</div></fieldset><h3>บอต '+(config.seats-1)+' ตัว</h3><div class="bot-list">'+bots+'</div><details class="seed"><summary>กำหนด Seed</summary><label>Seed ของการแข่งขัน<input name="seed" type="number" step="1" min="0" max="4294967295" placeholder="สุ่มอัตโนมัติ" value="'+escape(config.seed??'')+'"></label></details><button type="submit" class="primary wide">▶&nbsp; เริ่มการแข่งขัน</button></form></div>';
}

function board(){
  const cells=boardPositions.map(([row,column],i)=>{
    const space=i+1;
    const tracks=[space];
    if(space===1)tracks.push(...Object.keys(game.track).map(Number).filter(n=>n<1));
    if(space===16)tracks.push(...Object.keys(game.track).map(Number).filter(n=>n>16));
    const stack=tracks.flatMap(n=>game.track[n]??[]);
    const item=game.items.find(t=>t.space===space);
    return '<button class="space '+(space===1?'start ':space===16?'finish ':'')+
      (stack.some(cat=>game.lastMove?.cats.includes(cat))&&moveEffect?'moved':'')+
      '" style="grid-area:'+row+'/'+column+'" data-space="'+space+'" aria-label="ช่อง '+space+
      (stack.length?' '+stack.map(cat=>cats[cat].name).join(' / '):' ว่าง')+'"><span class="space-no">'+space+'</span>'+
      (space===1?'<span class="line-label">เริ่ม / 🏁</span>':space===16?'<span class="line-label">ก่อนเส้นชัย</span>':'')+
      (item?'<span class="item-mark '+(item.sign>0?'boost':'brake')+'">'+(item.sign>0?'🐟 +1':'🧶 −1')+'</span>':'')+
      (stack.length?'<span class="stack">'+[...stack].reverse().map(cat=>icon(cat,'track-cat'+(moveEffect?.cats.includes(cat)?' moving-cat':''))).join('')+'</span>':'')+
      '</button>';
  }).join('');
  return '<section class="panel board-panel"><div class="board-head"><div><span class="eyebrow">สนามแข่ง 16 ช่อง</span><h2>สวนสนุกแมว</h2></div><span class="chip">↻ แมวหลัก &nbsp; ↶ แมวพิเศษ</span></div><div class="board"><div class="infield"><span class="tree tree-a">🌳</span><span class="tree tree-b">🌳</span><span class="toy">🧶</span><span class="fish">🐟</span><div class="playhouse" aria-hidden="true"><i></i><b></b></div><strong>CAT PARK</strong><span class="tunnel" aria-hidden="true"></span></div>'+cells+'</div><div class="board-note">แตะช่องเพื่อดูชื่อแมวและลำดับการซ้อน</div></section>';
}
function raceStatus(){
  const current=game.players[game.turn];
  const me=game.players[mySeat()];
  return '<div class="match-heading"><div><button class="link back" data-route="home">← คลังเกม</button><h1>Catm-Up!</h1></div><div class="match-meta"><span class="chip">รอบ '+game.leg+'</span><span class="chip coins">🐟 '+me.score+' เหรียญ</span></div></div><div class="turn-strip"><div><span class="turn-dot"></span><b>'+escape(current.name)+'</b><span> · '+(current.bot?'กำลังเลือกการกระทำ':current.id===mySeat()?'ถึงตาคุณ':'กำลังเล่น')+'</span></div><strong id="timer">'+timerText()+'</strong></div>';
}
function timerText(){
  if(!game||game.ended)return '';
  if(game.players[game.turn].bot)return '✦ บอตกำลังเล่น';
  if(deadline===null)return '∞ ไม่จำกัดเวลา';
  const seconds=Math.max(0,Math.ceil((deadline-Date.now()-(inRoom()?online.offset:0))/1000));
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}
function standings(){
  const me=game.players[mySeat()];
  return '<section class="panel sidebar"><h3>อันดับแมว</h3><ol class="rank">'+rank(game).map((cat,i)=>'<li><span class="rank-position">'+(i+1)+'</span>'+name(cat)+'</li>').join('')+'</ol><h3>เหรียญผู้เล่น</h3><ul class="players">'+game.players.map(p=>'<li class="'+(p.id===game.turn?'active-player':'')+'"><span>'+(inRoom()?online.avatar(online.room.players[p.id].avatar)+' ':'')+escape(p.name)+(inRoom()&&!p.bot?'<small class="presence '+(online.room.players[p.id].online?'connected':'')+'"> '+(online.room.players[p.id].online?'ออนไลน์':'ออฟไลน์')+'</small>':'')+(p.bot?' <small>'+levels[p.bot]+'</small>':p.id===mySeat()?' <small>คุณ</small>':'')+'</span><b>'+p.score+'</b></li>').join('')+'</ul><div class="your-tickets"><b>ตั๋วรอบนี้ของคุณ</b><span>'+(me.tickets.map(t=>cats[t.cat].name+' '+t.value).join(' · ')||'ยังไม่มี')+'</span><span>ตั๋วลูกเต๋า '+me.rolls+' ใบ · คำทายลับ '+me.used.length+' ใบ</span>'+(me.partner!==null?'<span>คู่หู '+escape(game.players[me.partner].name)+'</span>':'')+'</div></section>';
}
function dicePanel(){
  return '<section class="panel dice-panel"><div><h3>ยังไม่เปิด</h3><div class="dice-list">'+dice.map(id=>'<span class="die '+(!game.draw.includes(id)?'spent':'')+'" title="'+(id===7?'ลูกเต๋าแมวพิเศษ':cats[id].name)+'">'+dieIcon(id)+'</span>').join('')+'</div></div><div><h3>เปิดแล้ว <small>'+game.rolled.length+' / 5</small></h3><div class="dice-list">'+(game.rolled.map(d=>'<span class="die" title="'+cats[d.cat].name+'">'+dieIcon(d.die)+'<b>'+d.distance+'</b></span>').join('')||'<span class="muted">ยังไม่มี</span>')+'</div></div></section>';
}
function actionPanel(){
  const human=game.turn===mySeat()&&(!inRoom()||!online.busy);
  const actions=legal(game);
  const types=[
    ['roll','⚄','สุ่มลูกเต๋า','สุ่มแมวเดินและรับตั๋ว 1 เหรียญเมื่อจบรอบ'],
    ['leg','✦','ทายรอบ','เลือกแมวจากตั๋วที่ยังเหลือ'],
    ['item','🐟','วางไอเทม','เลือกช่องว่างที่วางได้ แล้วเลือก +1 หรือ −1'],
    ['overall','◈','ทายลับ','ใช้การ์ดแมวแต่ละตัวได้ครั้งเดียวตลอดเกม'],
    ['partner','♧','คู่หู','เลือกผู้เล่นที่ยังว่างเพื่อแชร์รางวัลตั๋วรอบนี้']
  ];
  const disabledReasons={leg:'ตั๋วรอบย่อยหมดแล้ว',item:'ไม่มีช่องที่วางได้',overall:'ใช้การ์ดครบแล้ว',partner:game.players.length<6?'ต้องมีอย่างน้อย 6 ที่นั่ง':'คุณมีคู่หูแล้วหรือไม่มีผู้เล่นที่ว่าง'};
  const tabs=types.filter(([type])=>type!=='partner'||game.players.length>=6).map(([type,symbol,label])=>
    '<button class="tab '+(type===panel?'chosen':'')+'" data-panel="'+type+'" aria-pressed="'+(type===panel)+'"><span>'+symbol+'</span>'+label+'</button>').join('');
  const available=actions.filter(a=>a.type===panel);
  const disabled=human?'':' disabled';
  const actionButton=(a,label,style='secondary')=>'<button class="'+style+'" data-act="'+[a.type,a.cat??a.space??a.target??'',a.side??a.sign??''].join(':')+'"'+disabled+'>'+label+'</button>';
  let controls='';
  if(panel==='roll')controls=actionButton({type:'roll'},'⚄&nbsp; สุ่มลูกเต๋า','primary');
  if(panel==='leg')controls=cats.slice(0,5).map((cat,i)=>{
    const stock=game.stock[i];
    return stock.length?actionButton({type:'leg',cat:i},name(i)+' <b>'+stock[0]+'</b> <small>'+stock.length+' ใบ</small>'):
      '<button class="secondary" disabled>'+name(i)+' <small>หมด</small></button>';
  }).join('');
  if(panel==='item'&&available.length){
    const spaces=available.filter(a=>a.sign===1).map(a=>a.space);
    controls='<label class="inline-label">ช่อง <select id="item-space"'+disabled+'>'+spaces.map(space=>'<option>'+space+'</option>').join('')+'</select></label>'+[1,-1].map(sign=>'<button class="secondary" data-item="'+sign+'"'+disabled+'>'+(sign>0?'🐟 ขนม +1':'🧶 ของเล่น −1')+'</button>').join('');
  }
  if(panel==='overall'&&available.length){
    controls='<label class="inline-label">ทาย <select id="overall-side"'+disabled+'><option value="win">ผู้ชนะ</option><option value="last">อันดับสุดท้าย</option></select></label>'+
      cats.slice(0,5).map((cat,i)=>'<button class="secondary" data-overall="'+i+'"'+(game.players[mySeat()].used.includes(i)?' disabled':disabled)+'>'+name(i)+'</button>').join('');
  }
  if(panel==='partner')controls=available.map(a=>actionButton(a,escape(game.players[a.target].name))).join('');
  const help=human?(available.length?types.find(([type])=>type===panel)?.[3]:disabledReasons[panel]):'รอจนถึงตาของคุณ';
  return '<section class="panel action-panel"><div class="action-head"><h3>เลือกการกระทำ</h3><button class="link" data-cmd="auto" '+(human&&(!inRoom()||game.config.timer===0)?'':'disabled')+'>ให้บอตเล่นแทน</button></div><div class="tabs">'+tabs+'</div><p class="action-help">'+help+'</p><div class="action-options">'+controls+'</div></section>';
}
function activity(){
  return '<details class="panel activity" open><summary>บันทึกการแข่งขัน</summary><ol>'+[...game.log].reverse().map(e=>'<li class="event-'+e.kind+'">'+escape(e.label)+'</li>').join('')+'</ol></details>';
}
function match(){
  return raceStatus()+'<div class="match-grid"><div class="match-main">'+board()+dicePanel()+actionPanel()+'</div><aside>'+standings()+activity()+'</aside></div>';
}
function results(){
  const order=rank(game);
  const sorted=[...game.players].sort((a,b)=>b.score-a.score);
  const winners=game.winners.map(id=>escape(game.players[id].name)).join(' และ ');
  return '<section class="panel result-hero"><span class="eyebrow">จบการแข่งขัน</span><div class="cup">🏆</div><h1>'+winners+' ชนะ'+(game.winners.length>1?'ร่วมกัน':'')+'!</h1><p>ผู้เล่นที่มีเหรียญทูน่าสูงสุด · '+sorted[0].score+' เหรียญ</p><div class="actions"><button class="primary" data-route="lobby">↻&nbsp; เล่นอีกครั้ง</button><button class="secondary" data-route="home">กลับคลังเกม</button></div></section><div class="results-grid"><section class="panel sidebar"><h2>อันดับแมว</h2><p class="winner-cat">'+name(order[0])+' ชนะการแข่งขัน</p><ol class="rank">'+order.map((id,i)=>'<li><span class="rank-position">'+(i+1)+'</span>'+name(id)+'</li>').join('')+'</ol></section><section class="panel sidebar"><h2>คะแนนผู้เล่น</h2>'+sorted.map(p=>'<details class="result-row" '+(p.id===mySeat()?'open':'')+'><summary><b>'+ (sorted.findIndex(other=>other.score===p.score)+1)+'. '+escape(p.name)+'</b><strong>'+p.score+' 🐟</strong></summary><ul>'+p.ledger.map(entry=>'<li><span>'+escape(entry.label)+'</span><b class="'+(entry.value<0?'negative':'')+'">'+points(entry.value)+'</b></li>').join('')+'</ul></details>').join('')+'</section></div>';
}

function render(){
  document.documentElement.dataset.reduce=prefs.reduced?'yes':'no';
  app.innerHTML=screen==='online'?(inRoom()?(game.ended?results():match())+online.status(escape):online.lobby(escape))+(online.room?'<p><button class="link" data-route="home">กลับคลังเกม</button></p>':''):screen==='lobby'?lobby():screen==='game'&&game?(game.ended?results():match()):home();
  if((screen==='game'||inRoom())&&game&&feedback){
    motion(app,moveEffect,prefs.reduced,feedback);
  }
  moveEffect=null;
  feedback=null;
}
function save(){
  storageOK=write(keys.match,game?encode(game,deadline):null);
}
function schedule(){
  clearTimeout(pending);
  if(screen!=='game'||!game||game.ended)return;
  const step=game.step;
  const player=game.players[game.turn];
  const delay=player.bot?(prefs.reduced?250:640):delayUntilAuto(game,deadline,Date.now());
  if(delay===null)return;
  pending=setTimeout(()=>{
    if(screen==='game'&&game.step===step)submit(choose(botView(game),player.bot??'normal'),!player.bot);
  },delay);
}
function nextDeadline(){
  return !game.ended&&game.turn===0&&game.config.timer?Date.now()+1000*game.config.timer:null;
}
function submit(action,auto=false){
  if(!game||game.ended)return;
  const previous=game;
  const before=game.leg;
  game=act(game,action,{auto});
  if(game===previous)return;
  deadline=nextDeadline();
  save();
  moveEffect=game.lastMove;
  feedback=game.ended?'finish':game.leg!==before?'round-end':action.type==='roll'?'roll':game.players.some((p,i)=>p.score!==previous.players[i].score)?'score':action.type;
  announce.textContent=game.log.at(-1).label;
  if(game.leg!==before||game.ended)panel='roll';
  if(prefs.sound)playSound(game.ended?'finish':game.leg!==before?'leg':action.type);
  render();
  schedule();
}
function goto(route){
  const next=(online.enabled?['home','lobby','game','online']:['home','lobby','game']).includes(route)?route:'home';
  if(next==='online'&&screen!=='online'){
    localMatch={game,deadline};
    game=null;
    deadline=null;
    online.watch(true,syncRoom);
  }
  if(next!=='online'&&screen==='online'){
    ({game,deadline}=localMatch);
    online.watch(false,syncRoom);
  }
  if(next==='game'&&!game){screen='home';location.hash='home';render();return;}
  screen=next;
  if(next==='online')syncRoom();
  else render();
  schedule();
  window.scrollTo(0,0);
}
function syncRoom(){
  if(screen!=='online')return;
  const previous=game;
  game=online.room?.game??null;
  deadline=online.room?.deadline??null;
  if(previous&&game&&previous.step!==game.step){
    const singleStep=game.step===previous.step+1;
    moveEffect=singleStep?game.lastMove:null;
    feedback=game.ended?'finish':game.leg!==previous.leg?'round-end':moveEffect?'roll':
      game.players.some((p,i)=>p.score!==previous.players[i].score)?'score':null;
    announce.textContent=game.log.at(-1).label;
    if(prefs.sound&&feedback)playSound(feedback==='round-end'?'leg':feedback);
  }
  const options=[...app.querySelectorAll('select[id]')].map(select=>[select.id,select.value]);
  const focused=document.activeElement;
  const focusedId=app.contains(focused)?focused.id:null;
  const actKey=app.contains(focused)?focused.dataset.act:null;
  if(!game&&!online.room&&app.querySelector('#join-room')){
    const status=app.querySelector('.online-status');
    status.textContent=online.error||(online.busy?'กำลังส่งคำขอ…':'');
    app.querySelectorAll('button[type=submit], form button').forEach(button=>button.disabled=online.busy);
    return;
  }
  render();
  for(const [id,value] of options){
    const select=document.getElementById(id);
    if(select&&[...select.options].some(option=>option.value===value))select.value=value;
  }
  if(focusedId)document.getElementById(focusedId)?.focus({preventScroll:true});
  if(actKey)[...app.querySelectorAll('[data-act]')].find(button=>button.dataset.act===actKey)?.focus({preventScroll:true});
}
function start(){
  if(!document.querySelector('#lobby')?.reportValidity())return;
  const seed=config.seed===''?crypto.getRandomValues(new Uint32Array(1))[0]:Number(config.seed);
  game=createGame({...config,name:config.name.trim()||'นักทายแมว'},seed);
  deadline=nextDeadline();
  panel='roll';
  moveEffect=null;
  save();
  location.hash='game';
}
function popup(title,body){
  dialog.innerHTML='<div class="dialog-head"><h2 id="dialog-title">'+title+'</h2><button class="icon" data-cmd="close" aria-label="ปิด">×</button></div>'+body;
  if(!dialog.open)dialog.showModal();
}
function tutorial(){
  const rules=[
    ['สะสมเหรียญทูน่า','เริ่มที่ 3 เหรียญ เลือกหนึ่งการกระทำในแต่ละตา เมื่อจบเกมผู้เล่นที่มีเหรียญมากสุดชนะ หากเท่ากันให้ชนะร่วมกัน'],
    ['สุ่มเพื่อเดิน','ลูกเต๋าเดิน 1–3 ช่อง แมวตัวที่เดินพาทุกตัวด้านบนไปด้วย เมื่อลงช่องที่มีแมวให้ซ้อนด้านบน ตัวที่อยู่สูงกว่าในช่องเดียวกันมีอันดับดีกว่า'],
    ['ระวังแมวย้อนทาง','น้องถ่านและน้องหิมะเดินย้อนตามลูกเต๋าสีเทา ถ้ามีเพียงตัวเดียวแบกแมวหลัก ให้เดินตัวนั้น ถ้าซ้อนติดกันให้เดินตัวบน แมวพิเศษไม่นับในอันดับ'],
    ['วางไอเทม','ขนม +1 เดินต่อในทิศเดิม ของเล่น −1 ถอยหนึ่งช่องและแทรกใต้กอง เจ้าของได้ 1 เหรียญเมื่อมีแมวลงช่องไอเทม วางได้ช่องว่างที่ไม่ใช่ช่อง 1 และไม่ติดไอเทมอื่น'],
    ['ทายรอบย่อย','เมื่อเปิดลูกเต๋า 5 จาก 6 ลูก จะคิดคะแนน ตั๋วแมวอันดับ 1 ได้ตามมูลค่า 5 / 3 / 2 / 2 อันดับ 2 ได้ 1 และอันดับอื่นเสีย 1 ตั๋วสุ่มลูกเต๋าได้ 1 ต่อใบ'],
    ['ทายผลลับ','ใช้การ์ดแมวแต่ละตัวทายผู้ชนะหรืออันดับสุดท้ายได้ครั้งเดียว ผู้ทายถูกตามลำดับได้ 8 / 5 / 3 / 2 / 1 เหรียญ ผู้ทายผิดเสีย 1'],
    ['จับคู่เมื่อมี 6–8 ที่นั่ง','เลือกคู่หูที่ยังว่าง แต่ละคนรับคะแนนตั๋วบวกสูงสุดของคู่หูเพิ่มหนึ่งใบเมื่อจบรอบ'],
    ['เข้าเส้นชัย','แข่งจบทันทีเมื่อกองแมวข้ามเส้นระหว่างช่อง 16 และ 1 ได้ทั้งสองทิศ แมวหลักที่ถูกพาข้ามย้อนทางจะอยู่ท้ายอันดับ ก่อนประกาศผู้ชนะจะคิดคะแนนรอบสุดท้ายและเปิดคำทายลับ']
  ];
  popup('วิธีเล่น Catm-Up!', '<ol class="tutorial">'+rules.map(([title,body])=>'<li><b>'+title+'</b><p>'+body+'</p></li>').join('')+'</ol><button class="primary" data-cmd="close">เข้าใจแล้ว</button>');
}
function settings(){
  popup('ตั้งค่า','<div class="settings"><label><input type="checkbox" data-pref="sound" '+(prefs.sound?'checked':'')+'> เปิดเสียง</label><label><input type="checkbox" data-pref="reduced" '+(prefs.reduced?'checked':'')+'> ลดแอนิเมชัน</label></div>'+
    (game&&screen!=='online'?'<p class="muted">Seed ของเกมล่าสุด '+game.seed+'</p><p class="muted">'+(storageOK?'บันทึกเกมในเบราว์เซอร์นี้':'เบราว์เซอร์ปิดการบันทึกเกม')+'</p><button class="secondary danger" data-cmd="reset">ลบเกมล่าสุด</button>':''));
}
function inspect(space){
  const cells=Object.keys(game.track).map(Number).filter(n=>n===space||space===1&&n<1||space===16&&n>16);
  const stack=cells.flatMap(n=>game.track[n]).reverse();
  const item=game.items.find(entry=>entry.space===space);
  popup('ช่อง '+space,(stack.length?'<ol class="rank">'+stack.map((id,i)=>'<li><span class="rank-position">'+(i+1)+'</span>'+name(id)+(id>=5?' <small>เดินย้อน</small>':'')+'</li>').join('')+'</ol><p class="muted">เรียงจากด้านบนลงด้านล่าง</p>':'<p>ช่องนี้ยังไม่มีแมว</p>')+
    (item?'<p>ไอเทม '+points(item.sign)+' ของ '+escape(game.players[item.owner].name)+'</p>':''));
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button||button.disabled)return;
  const {route,cmd,space,panel:tab,act:raw,item,overall}=button.dataset;
  if(route){if(dialog.open)dialog.close();location.hash=route;return;}
  if(button.dataset.onlineCmd){online.onCommand(button.dataset.onlineCmd);return;}
  if(cmd==='tutorial')tutorial();
  if(cmd==='settings')settings();
  if(cmd==='close')dialog.close();
  if(cmd==='reset')popup('ลบเกมล่าสุด?', '<p>เหรียญและความคืบหน้าของเกมนี้จะถูกลบ</p><div class="actions"><button class="secondary" data-cmd="settings">ยกเลิก</button><button class="primary" data-cmd="confirm-reset">ลบเกม</button></div>');
  if(cmd==='confirm-reset'){game=null;deadline=null;save();dialog.close();location.hash='home';render();schedule();}
  if(cmd==='resume-lobby'){dialog.close();start();}
  if((screen!=='game'&&!inRoom())||!game||game.ended)return;
  if(space)inspect(Number(space));
  if(tab){panel=tab;render();app.querySelector('[data-panel="'+tab+'"]')?.focus({preventScroll:true});}
  if(game.turn!==mySeat())return;
  const send=inRoom()?online.move:submit;
  if(cmd==='auto'){
    if(inRoom())online.move(null,true);
    else submit(choose(botView(game),'normal'),true);
  }
  if(raw){
    const [type,value,side]=raw.split(':');
    send({type,cat:Number(value),target:Number(value),space:Number(value),side,sign:Number(side)});
  }
  if(item)send({type:'item',space:Number(document.querySelector('#item-space').value),sign:Number(item)});
  if(overall!==undefined)send({type:'overall',side:document.querySelector('#overall-side').value,cat:Number(overall)});
});
document.addEventListener('submit',event=>{
  if(online.enabled)online.onSubmit(event);
  if(event.target.id!=='lobby')return;
  event.preventDefault();
  if(game&&!game.ended)popup('เริ่มเกมใหม่?', '<p>เกมที่กำลังเล่นอยู่จะถูกแทนที่</p><div class="actions"><button class="secondary" data-cmd="close">ยกเลิก</button><button class="primary" data-cmd="resume-lobby">เริ่มเกมใหม่</button></div>');
  else start();
});
document.addEventListener('input',event=>{
  const {target}=event;
  if(target.form?.id==='lobby'&&['name','seed'].includes(target.name)){
    config[target.name]=target.value;
    write(keys.lobby,JSON.stringify(config));
  }
});
document.addEventListener('change',event=>{
  const {target}=event;
  const {bot,pref}=target.dataset;
  if(online.enabled)online.onChange(target);
  if(pref){
    prefs[pref]=target.checked;
    write(keys.prefs,JSON.stringify(prefs));
    document.documentElement.dataset.reduce=prefs.reduced?'yes':'no';
    if(pref==='sound'&&target.checked)playSound('roll');
  }
  if(target.form?.id!=='lobby')return;
  if(bot!==undefined)config.bots[Number(bot)]=target.value;
  if(target.name==='timer')config.timer=Number(target.value);
  if(target.name==='seats'){
    config.seats=Number(target.value);
    config.bots=Array.from({length:config.seats-1},(_,i)=>config.bots[i]??'normal');
    render();
    app.querySelector('[name="seats"]').focus();
  }
  write(keys.lobby,JSON.stringify(config));
});
window.addEventListener('hashchange',()=>goto(location.hash.slice(1)));
setInterval(()=>{
  const timer=document.querySelector('#timer');
  if(timer)timer.textContent=timerText();
},200);
goto(location.hash.slice(1)||(online.isInvite?'online':''));
