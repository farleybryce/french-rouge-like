import { record, freshLearner } from './learner';
import type { Evidence } from './learner';
import type { Run, Save } from './types';
export const layout=['#######','##.#.##','#.....#','#.###.#','#.....#','###.###','#######'];
export function newSave():Save {return {version:1,learner:freshLearner(),run:null,history:[],settings:{muted:false,captions:false}};}
export function createRun(seed=Math.floor(Math.random()*0xffffffff), floor=1):Run {
 return {seed,x:3,y:5,hp:7,light:4,floor,turns:0,enemyHp:6,enemyTurn:0,npcDone:false,key:false,potionTaken:false,potionSide:seed%2?'left':'right',doorSide:seed%4<2?'left':'right',doorRevealed:false,heard:false,doorAssisted:false,status:'playing',log:'Une voix vous appelle au bout du couloir.',events:[],startedAt:Date.now()};
}
export function learn(s:Save,id:string,kind:Evidence['kind']) {if(!s.run)return; const at=Date.now();record(s.learner,id,kind,at);s.run.events.push({id,kind,at});}
export function move(r:Run,dx:number,dy:number) {
 if(r.status!=='playing'||Math.abs(dx)+Math.abs(dy)!==1) return false;
 const nx=r.x+dx,ny=r.y+dy;
 if(layout[ny]?.[nx]!=='.') return false;
 r.x=nx;r.y=ny;r.turns++;return true;
}
export function attack(r:Run,spell:string,correct:boolean) {
 r.turns++;
 const incoming=r.enemyTurn%2===0?1:3;
 if(correct) {
  if(spell==='strike') r.enemyHp=Math.max(0,r.enemyHp-2);
  if(spell==='shield') r.enemyHp=Math.max(0,r.enemyHp-1);
  if(spell==='heal') r.hp=Math.min(7,r.hp+3);
 }
 if(r.enemyHp>0 && !(correct&&spell==='shield')) r.hp=Math.max(0,r.hp-incoming);
 r.enemyTurn++; if(r.hp===0)r.status='dead';
}
export function finish(s:Save) {
 const r=s.run;if(!r||r.status==='playing')return;
 if(s.history.some(h=>h.at===r.startedAt))return;
 const unique=(a:string[])=>[...new Set(a)];
 const previous=new Set(s.history.flatMap(h=>h.newWords));
 s.history.unshift({won:r.status==='won',at:r.startedAt,turns:r.turns,newWords:unique(r.events.filter(e=>e.kind==='seen').map(e=>e.id)).filter(id=>!previous.has(id)),struggled:unique(r.events.filter(e=>e.kind==='failed'||e.kind==='hint').map(e=>e.id)),mistake:r.events.find(e=>e.kind==='failed'&&e.id.startsWith('present-'))?.id});
 s.history=s.history.slice(0,30);
}
