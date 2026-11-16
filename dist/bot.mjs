import {legal,move,random,rank,reverseCat} from './engine.mjs';

export function botView(game,seat=game.turn){
  const {track,turn,leg,idle,ended,draw,rolled,stock,items,players}=game;
  return structuredClone({
    track,turn,leg,idle,ended,draw,rolled,stock,items,
    players:players.map(({id,name,bot,score,tickets,rolls,used,partner})=>
      ({id,name,bot,score,tickets,rolls,used:id===seat?used:[],partner}))
  });
}

function sampleResults(view,entropy){
  const rng={rng:Math.floor(entropy*4294967296)>>>0};
  const results=[];
  for(let trial=0;trial<24;trial++){
    const board={track:structuredClone(view.track),items:view.items,ended:false};
    const bag=[...view.draw];
    const landings=[];
    let legOrder;
    for(let step=0;step<25&&!board.ended;step++){
      if(!bag.length)bag.push(0,1,2,3,4,7);
      const [die]=bag.splice(Math.floor(random(rng)*bag.length),1);
      const distance=1+Math.floor(random(rng)*3);
      const cat=die===7?reverseCat(board,random(rng)<.5?5:6):die;
      const result=move(board,cat,distance,{credit:false});
      if(step<5-view.rolled.length)landings.push(result.landing);
      if(step===4-view.rolled.length){
        legOrder=rank(board);
        board.items=[];
        bag.splice(0,bag.length,0,1,2,3,4,7);
      }else if(step>4-view.rolled.length&&
        (step-(4-view.rolled.length))%5===0)bag.splice(0,bag.length,0,1,2,3,4,7);
    }
    results.push({leg:legOrder??rank(board),final:rank(board),landings});
  }
  return results;
}

export function choose(view,level,entropy=Math.random()){
  const actions=legal(view);
  if(!actions.length)return null;
  if(view.idle>=view.players.length||entropy<(level==='easy'?.45:.28))return actions[0];
  const pick=Math.floor(entropy*actions.length);
  if(level==='easy')return actions[pick];
  const order=rank(view);
  const samples=level==='hard'?sampleResults(view,entropy):null;
  const evaluate=action=>{
    if(action.type==='roll')return 1;
    if(action.type==='leg'){
      const value=view.stock[action.cat][0];
      if(samples)return samples.reduce((sum,r)=>sum+(r.leg[0]===action.cat?value:r.leg[1]===action.cat?1:-1),0)/samples.length;
      const index=order.indexOf(action.cat);
      return (index===0?value*.53:index===1?value*.30:-.8)+(view.draw.includes(action.cat)?.22:0);
    }
    if(action.type==='overall'){
      const chosen=action.side==='win'?0:4;
      if(samples)return samples.reduce((sum,r)=>sum+(r.final[chosen]===action.cat?3:-1),0)/samples.length;
      return order[chosen]===action.cat?(view.leg>1?1.7:1.15):-.9;
    }
    if(action.type==='item'){
      if(samples)return samples.reduce((sum,r)=>sum+r.landings.filter(space=>space===action.space).length,0)/samples.length+.25;
      return .5;
    }
    const partner=view.players[action.target];
    return .75+Math.min(1,partner.tickets.length*.35+partner.rolls*.22);
  };
  return actions.map((action,index)=>({action,value:evaluate(action)+((index+pick)%actions.length)*.0001}))
    .reduce((best,next)=>next.value>best.value?next:best).action;
}
