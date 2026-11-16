let audio;
export function playSound(kind){
  try{
    audio??=new AudioContext();
    if(audio.state==='suspended')void audio.resume().catch(()=>{});
    const notes=kind==='finish'?[523,659,784,1047]:kind==='leg'?[523,659,784]:kind==='roll'?[440,659]:[587];
    notes.forEach((frequency,i)=>{
      const at=audio.currentTime+i*.085;
      const tone=audio.createOscillator();
      const volume=audio.createGain();
      tone.frequency.value=frequency;
      volume.gain.setValueAtTime(.055,at);
      volume.gain.exponentialRampToValueAtTime(.001,at+.16);
      tone.connect(volume).connect(audio.destination);
      tone.start(at);
      tone.stop(at+.17);
    });
  }catch{return;}
}
export function motion(app,move,reduced,feedback){
  if(reduced||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  if(feedback==='finish'){
    app.querySelector('.cup')?.animate(
      [{transform:'translateY(15px) scale(.7) rotate(-12deg)',opacity:0},{transform:'translateY(-8px) scale(1.14) rotate(6deg)'},{transform:'none',opacity:1}],
      {duration:560,easing:'ease-out'}
    );
  }
  const highlight=feedback==='score'?'.coins':feedback==='round-end'?'.match-meta':feedback==='roll'?'.dice-panel':
    ['leg','overall'].includes(feedback)?'.action-panel':null;
  if(highlight)app.querySelector(highlight)?.animate(
    [{opacity:.7,transform:'scale(.99)'},{opacity:1,transform:'scale(1)'}],
    {duration:270,easing:'ease-out'}
  );
  if(feedback==='roll'){
    app.querySelector('.dice-panel .dice-list:last-child .die:last-of-type')?.animate(
      [{transform:'translateY(4px) rotate(-35deg) scale(.75)'},{transform:'translateY(-6px) rotate(12deg) scale(1.12)'},{transform:'none'}],
      {duration:380,easing:'ease-out'}
    );
  }
  if(!move)return;
  const spaces=[...app.querySelectorAll('.space')];
  const getSpace=position=>spaces[Math.min(16,Math.max(1,position))-1];
  const target=getSpace(move.to);
  if(!target)return;
  const end=target.getBoundingClientRect();
  const route=[move.from];
  const direction=Math.sign(move.landing-move.from);
  for(let step=1;step<=move.distance;step++)route.push(move.from+step*direction);
  if(move.to!==move.landing)route.push(move.to);
  const frames=route.flatMap((space,index)=>{
    const rect=getSpace(space).getBoundingClientRect();
    const offset=index/(route.length-1);
    const x=rect.left-end.left;
    const y=rect.top-end.top;
    const point={offset,transform:'translate('+x+'px,'+y+'px)'};
    if(index===route.length-1)return [point];
    const next=getSpace(route[index+1]).getBoundingClientRect();
    const midX=(x+next.left-end.left)/2;
    const hop=move.stacked&&index===route.length-2?25:move.cat>=5?16:10;
    const midY=(y+next.top-end.top)/2-hop;
    return [point,{offset:offset+.5/(route.length-1),transform:'translate('+midX+'px,'+midY+'px)'}];
  });
  target.querySelectorAll('.moving-cat').forEach(cat=>cat.animate(frames,{duration:move.stacked?500:410,easing:'ease-out'}));
}
