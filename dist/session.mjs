const version=1;
export const keys={match:'bedgorm.match.v1',lobby:'bedgorm.lobby.v1',prefs:'bedgorm.prefs.v1'};
export const encode=(game,deadline)=>JSON.stringify({version,game,deadline});
export function decode(raw){
  try{
    const record=JSON.parse(raw);
    if(record?.version!==version||!Array.isArray(record.game?.players)||!record.game.track||
      !(record.deadline===null||Number.isFinite(record.deadline)))return null;
    return {game:record.game,deadline:record.deadline};
  }catch{return null;}
}
export function delayUntilAuto(game,deadline,now){
  if(!game||game.ended||game.players[game.turn].bot||deadline===null)return null;
  return Math.max(0,deadline-now);
}
export function read(key){
  try{return localStorage.getItem(key);}catch{return null;}
}
export function write(key,value){
  try{
    if(value===null)localStorage.removeItem(key);
    else localStorage.setItem(key,value);
    return true;
  }catch{return false;}
}
export function readJson(key){
  try{return JSON.parse(read(key));}catch{return null;}
}
