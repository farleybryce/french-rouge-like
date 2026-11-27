import { newSave } from './engine';
import type { Save } from './types';
import vocab from './content/vocabulary.json';
import grammar from './content/grammar.json';
const ids=new Set([...vocab,...grammar].map(v=>v.id).concat(['dialogue-help']));
const obj=(x:unknown):x is Record<string,any> => !!x&&typeof x==='object'&&!Array.isArray(x);
const num=(x:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const integer=(x:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>num(x,min,max)&&Number.isInteger(x);
const bool=(x:unknown)=>typeof x==='boolean';
const event=(e:unknown)=>obj(e)&&ids.has(e.id)&&['seen','understood','produced','failed','hint'].includes(e.kind)&&num(e.at);
export function parseSave(text:string):Save {
 if(text.length>2_000_000)throw new Error('Fichier trop volumineux.');
 const s:unknown=JSON.parse(text);
 if(!obj(s)||s.version!==1||!obj(s.settings)||!bool(s.settings.muted)||!bool(s.settings.captions)||!obj(s.learner)||!obj(s.learner.items)||!['A1','A2'].includes(s.learner.tier)||!Array.isArray(s.learner.recent)||s.learner.recent.length>200||!s.learner.recent.every(event))throw new Error('Sauvegarde incompatible.');
 for(const [id,i] of Object.entries(s.learner.items)) {
  if(!ids.has(id)||!obj(i)||!['seen','understood','producedCorrectly','failed','hintsUsed','repetitions'].every(k=>integer(i[k]))||!num(i.intervalDays,0,90)||!num(i.dueAt))throw new Error('Données d’apprentissage invalides.');
 }
 if(!Array.isArray(s.history)||s.history.length>30||!s.history.every(h=>obj(h)&&bool(h.won)&&num(h.at)&&integer(h.turns)&&Array.isArray(h.newWords)&&h.newWords.every((id:unknown)=>typeof id==='string'&&ids.has(id))&&Array.isArray(h.struggled)&&h.struggled.every((id:unknown)=>typeof id==='string'&&ids.has(id))&&(h.mistake===undefined||grammar.some(g=>g.id===h.mistake))))throw new Error('Historique invalide.');
 if(s.run!==null) {
  const r=s.run;
  if(!obj(r)||!integer(r.seed,0,0xffffffff)||!integer(r.x,1,5)||!integer(r.y,1,5)||!['1,3','2,2','3,2','4,2','5,2','1,2','5,3','1,4','2,4','3,4','4,4','5,4','3,5','2,1','4,1'].includes(`${r.x},${r.y}`)||!integer(r.hp,0,7)||!integer(r.light,0,99)||!integer(r.floor,1)||!integer(r.turns)||!integer(r.enemyHp,0,6)||!integer(r.enemyTurn)||!['npcDone','key','potionTaken','doorRevealed','heard','doorAssisted'].every(k=>bool(r[k]))||!['left','right'].includes(r.potionSide)||!['left','right'].includes(r.doorSide)||!['playing','won','dead'].includes(r.status)||typeof r.log!=='string'||r.log.length>1000||!num(r.startedAt)||!Array.isArray(r.events)||r.events.length>10000||!r.events.every(event))throw new Error('Partie invalide.');
  if(r.spell!==undefined && (!['strike','shield','heal'].includes(r.spell)||!integer(r.person,0,5)||!Array.isArray(r.tiles)||r.tiles.length>8||!r.tiles.every((t:unknown)=>typeof t==='string'&&t.length<40)||!Array.isArray(r.selected)||!r.selected.every((i:unknown)=>integer(i,0,r.tiles.length-1))||new Set(r.selected).size!==r.selected.length||!bool(r.assisted)))throw new Error('Sort invalide.');
 }
 return s as unknown as Save;
}
let database:Promise<IDBDatabase>|undefined;
function db(){return database??=new Promise((resolve,reject)=>{const request=indexedDB.open('le-donjon',1);request.onupgradeneeded=()=>request.result.createObjectStore('save');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function load():Promise<Save> {
 const d=await db();
 return new Promise((resolve,reject)=>{const req=d.transaction('save').objectStore('save').get('current');req.onsuccess=()=>{try{resolve(req.result?parseSave(JSON.stringify(req.result)):newSave());}catch(e){reject(e);}};req.onerror=()=>reject(req.error);});
}
export async function save(s:Save) {const d=await db();return new Promise<void>((resolve,reject)=>{const tx=d.transaction('save','readwrite');tx.objectStore('save').put(structuredClone(s),'current');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
