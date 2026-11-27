import './style.css';
import vocab from './content/vocabulary.json';
import grammar from './content/grammar.json';
import encounters from './content/encounters.json';
import verbs from './content/verbs.json';
import { attack, createRun, finish, layout, learn, move, newSave } from './engine';
import { checkAnswer, conjugate, phrase, subjects } from './language';
import { load, parseSave, save } from './persistence';
import { dueFirst } from './learner';
import type { Save } from './types';
const app=document.querySelector<HTMLDivElement>('#app')!;
let state:Save=newSave();
let panel='explore',gloss='',notice='',storageWarning='',busy=false,showEnglish=false,typed=false;
let dbUsable=true;
const escape=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const btn=(label:string,action:string,cls='',disabled=false)=>`<button type="button" class="${cls}" data-action="${escape(action)}" ${disabled?'disabled':''}>${label}</button>`;
const castle=`<svg class="castle" viewBox="0 0 500 320" role="img" aria-label="Le château, sous la lune"><defs><linearGradient id="stone" x2="0" y2="1"><stop stop-color="#81978d"/><stop offset="1" stop-color="#233b3d"/></linearGradient></defs><circle cx="354" cy="60" r="39" fill="#eed49d"/><path d="M0 290 65 257 134 269 210 235 310 260 407 236 500 277V320H0Z" fill="#1a3033"/><g fill="url(#stone)" stroke="#13292b" stroke-width="3"><path d="M100 285V136h58v149m-66-148 37-59 37 59zM339 285V118h58v167m-66-167 37-65 37 65zM158 285V174h181v111M205 175v-68h83v68m-88-68 47-65 47 65z"/><path d="M176 175v-18h20v18h22v-18h22v18h23v-18h22v18h23v-18h20v18"/></g><g fill="#e8b66b"><path d="M122 175v-18a7 7 0 0 1 14 0v18zM361 159v-18a7 7 0 0 1 14 0v18zM240 141v-18a7 7 0 0 1 14 0v18z"/></g><path d="M222 285v-48a25 25 0 0 1 50 0v48" fill="#0c1b1e"/><path d="m224 285-36 35h120l-38-35" fill="#7e8a76"/><g fill="#91aa9a" opacity=".3"><ellipse cx="115" cy="285" rx="98" ry="10"/><ellipse cx="386" cy="298" rx="112" ry="9"/></g><g fill="#c6d4bd"><circle cx="65" cy="80" r="1.5"/><circle cx="190" cy="36" r="1.5"/><circle cx="423" cy="55" r="1.5"/><circle cx="301" cy="24" r="1"/></g></svg>`;
function speak(text:string){
 if(state.settings.muted)return;
 if(!('speechSynthesis' in window)){notice='La voix est indisponible. Le texte reste accessible gratuitement.';return;}
 const voices=speechSynthesis.getVoices();
 const voice=voices.find(v=>v.lang.startsWith('fr')&&v.localService);
 if(!voice){notice='Aucune voix française locale détectée. Lecture gratuite disponible ; vous pouvez installer une voix française sur votre appareil.';return;}
 speechSynthesis.cancel();const line=new SpeechSynthesisUtterance(text);line.lang='fr-FR';line.rate=.85;line.voice=voice;
 line.onerror=()=>{notice='La lecture audio a échoué. Utilisez le texte gratuit.';render();};speechSynthesis.speak(line);
}
function localVoice(){return 'speechSynthesis' in window&&speechSynthesis.getVoices().some(v=>v.localService&&v.lang.startsWith('fr'));}
function hint(id:string,english:string){
 const r=state.run!;
 if(r.light<=0){gloss='Plus de lueurs. Relisez le contexte : vous pouvez continuer.';return;}
 r.light--;learn(state,id,'hint');gloss=english;
}
function nameOf(id:string){return vocab.find(v=>v.id===id)?.lemma??grammar.find(g=>g.id===id)?.verbId.replace('etre','être')??'demander de l’aide';}
function activeEncounter(){const r=state.run!;if(r.y===4&&r.x===3&&!r.npcDone)return 'npc';if(r.y===2&&r.x===3&&r.enemyHp>0)return 'fight';if(r.y===1)return 'doors';if(r.y===3&&(r.x===1||r.x===5)&&!r.potionTaken)return 'potion';return 'explore';}
function pageHeader(){const r=state.run;return `<header class="topbar"><a class="brand" href="./" aria-label="Le Donjon, accueil">♜ <span>LE DONJON</span></a><div class="header-actions"><span class="edition">LE CHÂTEAU DES ÉCHOS</span>${btn(state.settings.muted?'Son coupé':'♫ Son','mute','quiet')}${btn('⚙ <span class="sr-only">Réglages et sauvegarde</span>','settings','icon-button')}</div></header>${r&&r.status==='playing'?`<div class="statusbar"><span><span class="status-icon heart">♥</span> <b>${r.hp}</b><small> / 7 · vie</small></span><span><span class="status-icon gold">✦</span> <b>${r.light}</b><small> lueurs</small></span><span>⚿ <b>${r.key?'1':'0'}</b><small> clé</small></span><span class="tier">${state.learner.tier}</span></div>`:''}`;}
function welcome(){const wins=state.history.filter(h=>h.won).length;return `<main class="welcome"><div class="eyebrow">UNE AVENTURE EN FRANÇAIS</div><h1>Les murs ont<br>des <em>secrets.</em></h1><p class="intro">Écoutez les voix. Trouvez les mots.<br>Le château vous ouvrira ses portes.</p><div class="castle-frame">${castle}<span class="art-caption">LE CHÂTEAU DES ÉCHOS · CHAPITRE I</span></div><div class="welcome-bottom"><span class="eyebrow">01 / LE SEUIL</span><h2>Une lumière dans l’ombre</h2><p>Un veilleur, un gardien et deux portes.<br>Votre français est votre meilleur allié.</p>${btn(wins?'Entrer à nouveau <span>→</span>':'Entrer dans le château <span>→</span>','start','primary wide')}<div class="session-note">◷ 5–10 minutes <span>·</span> Sauvegarde automatique</div>${wins?`<p class="unlock">✦ ${wins} évasion${wins>1?'s':''} · Le titre « Éclaireur des Échos » est acquis.</p>`:''}</div><footer>Sans compte. Sans publicité. Votre aventure reste ici.</footer></main>`;}
function map(){const r=state.run!;return `<section class="map-section" aria-label="Plan du château"><div class="section-label"><span>REZ-DE-CHAUSSÉE</span><span>LE SEUIL · ${r.turns} pas</span></div><div class="dungeon" role="group" aria-label="Carte : touchez une case voisine pour avancer">${layout.flatMap((row,y)=>[...row].map((cell,x)=>{
 let symbol='',kind=cell==='#'?'wall':'floor',label='Couloir';
 if(x===3&&y===4){symbol=r.npcDone?'♙':'♙';label='Éloi, le veilleur';kind+=' npc';}
 if(x===3&&y===2){symbol=r.enemyHp>0?'♟':'·';label=r.enemyHp>0?'Gardien spectral':'Gardien apaisé';kind+=' enemy';}
 if(y===1&&(x===2||x===4)){symbol='▥';label=x===2?'Porte à gauche':'Porte à droite';kind+=' door';}
 if(y===3&&(x===1||x===5)&&!r.potionTaken){symbol='♜';label='Réserve de potions';kind+=' potion';}
 const player=x===r.x&&y===r.y;if(player){symbol='◆';label='Votre position';kind+=' player';}
 const adjacent=Math.abs(x-r.x)+Math.abs(y-r.y)===1&&cell!== '#';
 return cell==='#'?`<div class="cell ${kind}" aria-hidden="true"><i></i></div>`:`<button class="cell ${kind} ${adjacent?'reachable':''}" data-action="move:${x-r.x}:${y-r.y}" aria-label="${label}${adjacent?' — avancer':''}" ${adjacent?'':'disabled'}>${symbol||'<span class="dot">·</span>'}</button>`;
 })).join('')}</div><div class="map-legend"><span><i class="legend-player">◆</i> Vous</span><span>♙ Veilleur</span><span>♟ Gardien</span><span>▥ Porte</span></div><div class="controls" aria-label="Déplacement">${btn('↑<span class="sr-only">Avancer vers le haut</span>','move:0:-1','up')}${btn('←<span class="sr-only">Avancer à gauche</span>','move:-1:0','left')}${btn('↓<span class="sr-only">Avancer vers le bas</span>','move:0:1','down')}${btn('→<span class="sr-only">Avancer à droite</span>','move:1:0','right')}</div><p class="map-tip">Touchez une case voisine ou les flèches.</p></section>`;}
function npc(){const n=encounters.caretaker;return `<div class="encounter-heading"><div class="portrait">♙</div><div><span class="eyebrow">UNE RENCONTRE</span><h2>${n.name}</h2></div></div><p class="dialogue">« ${escape(n.greeting)} »</p><div class="speech">${n.tokens.map(t=>t.vocab?btn(escape(t.text),`gloss:${t.vocab}`,'word'):escape(t.text)).join('')}</div><div class="inline-actions">${btn('♫ Écouter','listen-npc','quiet')}<small>Mot souligné : aide · 1 lueur</small></div><p class="question">${n.question}</p><div class="choices">${n.replies.map(r=>btn(escape(r.fr),`reply:${r.id}`,'choice')).join('')}</div><p class="fine-print">Une demande polie peut ouvrir bien des portes.</p>`;}
function fight(){const r=state.run!;const incoming=r.enemyTurn%2===0?1:3;const current=encounters.spells.find(s=>s.id===r.spell);const priority=dueFirst(state.learner,encounters.spells.map(s=>s.grammarId));
 return `<div class="encounter-heading"><div class="portrait ghost">♟</div><div><span class="eyebrow">LE PASSAGE EST GARDÉ</span><h2>Le gardien spectral</h2></div><b class="enemy-life">${r.enemyHp} / 6</b></div><div class="intent ${incoming===3?'danger':''}">${incoming===3?'⚡ Il prépare une attaque puissante.':'◇ Il lève lentement sa lance.'}<strong>${incoming} dégât${incoming>1?'s':''} à la riposte</strong></div>${!current?`<p>La lumière traverse son armure. Quel sort choisissez-vous ?</p><div class="spells">${[...encounters.spells].sort((a,b)=>priority.indexOf(a.grammarId)-priority.indexOf(b.grammarId)).map(s=>btn(`<span class="spell-symbol">${s.id==='strike'?'✧':s.id==='shield'?'◈':'❧'}</span><span><b>${s.name}</b><small>${s.description}</small></span><span>→</span>`,`spell:${s.id}`,'spell')).join('')}</div>`:`<div class="spell-prompt"><span class="eyebrow">${current.name.toUpperCase()} · ${verbs.find(v=>v.id===current.verbId)!.infinitive.toUpperCase()} AU PRÉSENT</span><h3>${subjects[r.person!]} …</h3><p>${current.flavor} Assemblez le sujet et le verbe.</p></div><div class="answer" aria-label="Votre formule">${r.selected!.length?r.selected!.map(i=>btn(escape(r.tiles![i]),`untile:${i}`,'selected-tile')).join(''):'<span>Votre formule apparaît ici…</span>'}</div><div class="tile-bank">${r.tiles!.map((t,i)=>btn(escape(t),`tile:${i}`,'tile',r.selected!.includes(i))).join('')}</div><div class="inline-actions">${btn('Effacer','clear','quiet')}${btn('Aide · 1 ✦','spell-hint','quiet',r.light===0)}</div>${typed?`<label class="text-label">Votre formule<input id="typed-answer" lang="fr" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="Écrivez la formule"/><span class="accents">${[...'éèêçàâîôù','œ'].map(a=>btn(a,`accent:${a}`,'accent')).join('')}</span></label>`:''}${btn('Lancer le sort <span>✧</span>','cast','primary wide',!typed&&!r.selected!.length)}<div class="inline-actions">${btn('Changer de sort','cancel-spell','quiet')}${btn(typed?'Utiliser les tuiles':'Écrire (+1 lueur si réussi)','typing','quiet')}</div>`}`;}
function doors(){const r=state.run!;const d=encounters.doors[r.doorSide];const free=state.settings.captions||state.settings.muted||!localVoice();return `<span class="eyebrow">LE DERNIER ÉCHO</span><h2>Deux portes. Une sortie.</h2><p>Une voix murmure derrière la pierre. Écoutez-la avant de choisir.</p><div class="listening-orb">♫</div>${btn('♫ Écouter la voix','listen-door','primary wide')}<div class="inline-actions">${btn(free?'Lire la phrase · gratuit':'Lire la phrase · 1 ✦','reveal-door','quiet',!free&&!r.doorRevealed&&r.light===0)}</div>${r.doorRevealed?`<blockquote>${d.fr}</blockquote>`:''}${free?'<p class="fine-print">Lecture gratuite : mode texte ou voix locale indisponible.</p>':''}<div class="door-choices">${btn('▥<span>Porte à gauche</span>','door:left','door-choice')}${btn('▥<span>Porte à droite</span>','door:right','door-choice')}</div>${!r.key?'<p class="fine-print">Il vous manque une clé. Parlez au veilleur.</p>':''}${r.enemyHp>0?'<p class="fine-print">Le gardien protège encore les serrures.</p>':''}`;}
function potion(){return `<span class="eyebrow">LA RÉSERVE DU VEILLEUR</span><h2>Une gorgée de courage</h2><p>Deux fioles vous attendent. Que disait Éloi ?</p><div class="potion-bottles"><span class="bottle blue">♜</span><span class="bottle green">♜</span></div><div class="choices">${btn('Boire la potion bleue','potion:blue','choice')}${btn('Boire la potion verte','potion:green','choice')}${btn('Ne rien boire','leave','quiet')}</div><p class="fine-print">Vous ne pourrez prendre qu’une seule potion.</p>`;}
function explore(){const r=state.run!;return `<span class="eyebrow">VOTRE OBJECTIF</span><h2>${!r.npcDone?'Suivez la voix.':r.enemyHp>0?'Passez le gardien.':'Trouvez la sortie.'}</h2><p>${!r.npcDone?'Le veilleur vous attend au nord. Peut-être connaît-il un chemin vers la sortie.':r.enemyHp>0?'Le gardien est au centre de la galerie du haut. Les réserves, sur les côtés, peuvent vous aider.':'Les deux portes sont au nord. Une voix vous indiquera laquelle ouvrir.'}</p><div class="objective"><span>01</span><p>Demander de l’aide ${r.npcDone?'✓':''}</p></div><div class="objective"><span>02</span><p>Apaiser le gardien ${r.enemyHp===0?'✓':''}</p></div><div class="objective"><span>03</span><p>Écouter et sortir</p></div><div class="flavor">« Ici, les mots ont du pouvoir.<br>Choisissez-les avec soin. »</div>${r.x===3&&r.y===4?btn('Reparler au veilleur','revisit','choice wide'):''}`;}
function debrief(){const r=state.run!,h=state.history[0],g=grammar.find(g=>g.id===h?.mistake);return `<main class="debrief"><span class="eyebrow">CARNET D’AVENTURE · ${r.turns} PAS</span><div class="end-emblem">${r.status==='won'?'✧':'❧'}</div><h1>${r.status==='won'?'L’aube vous attend.':'Votre lumière demeure.'}</h1><p>${r.status==='won'?'Les portes s’ouvrent. Le château se souviendra de vous.':'Le château vous retient… mais vos mots restent acquis.'}</p><div class="debrief-grid"><section class="card"><span class="eyebrow">MOTS RENCONTRÉS</span><h2>Un peu plus de lumière</h2><div class="word-list">${(h?.newWords.length?h.newWords:[]).map(id=>`<span>${escape(nameOf(id))}</span>`).join('')||'<p>Des mots déjà familiers vous ont accompagné.</p>'}</div></section><section class="card"><span class="eyebrow">À RETROUVER BIENTÔT</span><h2>Les échos à revoir</h2><div class="word-list">${h?.struggled.map(id=>`<span>${escape(nameOf(id))}</span>`).join('')||'<p>Aucune difficulté enregistrée cette fois.</p>'}</div>${g?`<p>${g.explanation}</p>`:'<p>Continuez à observer le sujet avant de choisir le verbe.</p>'}${showEnglish?`<p class="english">${g?.english??'Look at the subject before choosing the verb.'}</p>`:''}${btn(showEnglish?'Masquer l’anglais':'English · bilan','english','quiet')}</section></div><p class="fine-print">${Object.keys(state.learner.items).length} éléments suivis · Parcours ${state.learner.tier}${r.status==='won'?' · Titre acquis : Éclaireur des Échos':''}</p>${btn('Retourner au château <span>→</span>','start','primary')}<p class="fine-print">Une nouvelle tentative, des indices différents. Vos acquis restent avec vous.</p></main>`;}
function settings(){return `<main class="settings card"><span class="eyebrow">VOTRE CARNET</span><h1>À votre rythme.</h1><p>Vos données restent sur cet appareil. Exportez votre carnet pour le conserver ailleurs.</p><div class="setting-row"><div><b>Sous-titres accessibles</b><small>Lecture gratuite des énigmes sonores.</small></div>${btn(state.settings.captions?'Activés':'Désactivés','captions','choice')}</div><div class="setting-row"><div><b>Voix française locale</b><small>${localVoice()?'Disponible sur cet appareil.':'Indisponible : le texte reste gratuit.'}</small></div>${btn('♫ Essayer','test-voice','quiet')}</div><div class="setting-row"><div><b>Progression</b><small>${Object.keys(state.learner.items).length} éléments · ${state.history.length} aventures · ${state.learner.tier}</small></div></div><div class="choices">${btn('Exporter le carnet (.json)','export','choice')}<label class="choice import-label">Importer un carnet (.json)<input id="import" type="file" accept="application/json,.json"/></label>${btn('Protéger le stockage sur cet appareil','persist','choice')}${btn('Revenir à l’aventure →','back','primary')}</div><p class="fine-print">Une importation valide remplace le carnet actuel. Une copie est exportée avant le remplacement. Le navigateur peut effacer les données ; gardez une sauvegarde.</p></main>`;}
function render(){
 const focused=(document.activeElement as HTMLElement)?.dataset.action;
 let body=panel==='settings'?settings():!state.run?welcome():state.run.status!=='playing'?debrief():`<main class="play"><div class="chapter-heading"><span class="eyebrow">CHAPITRE I</span><h1>Le seuil des Échos</h1><p>Chaque mot peut ouvrir un passage.</p></div><div class="game-layout">${map()}<section class="encounter card" aria-label="Rencontre">${panel==='npc'?npc():panel==='fight'?fight():panel==='doors'?doors():panel==='potion'?potion():explore()}${gloss?`<div class="gloss" role="status">${escape(gloss)}</div>`:''}</section></div><div class="journal" role="status"><span>✎</span><p>${escape(state.run.log)}</p></div><div class="play-footer"><span>${dbUsable?'● Carnet enregistré sur cet appareil':'○ Carnet en mémoire seulement'}</span>${btn('Carnet et réglages','settings','quiet')}</div></main>`;
 app.innerHTML=`${pageHeader()}${storageWarning?`<div class="warning" role="alert">${escape(storageWarning)}</div>`:''}${notice?`<div class="notice" role="status">${escape(notice)} ${btn('Fermer','dismiss','quiet')}</div>`:''}${body}`;
 if(focused)Array.from(app.querySelectorAll<HTMLButtonElement>('button[data-action]')).find(b=>b.dataset.action===focused&&!b.disabled)?.focus({preventScroll:true});
}
async function persist(){try{await save(state);dbUsable=true;storageWarning='';}catch{dbUsable=false;storageWarning='La sauvegarde locale est indisponible. Exportez votre carnet avant de fermer cette page.';}}
function exportSave(){const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`le-donjon-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function beginSpell(id:string){const r=state.run!,s=encounters.spells.find(s=>s.id===id)!;r.spell=id;
 
 const person=state.learner.tier==='A1'?[0,3,4][(r.enemyTurn+r.seed)%3]:(r.enemyTurn+r.seed)%6;
 r.person=person;r.selected=[];r.assisted=false;
 const expected=conjugate(s.verbId,person);const subject=phrase(s.verbId,person).startsWith('j’')?'j’':subjects[person];
 r.tiles=[subject,expected,...[...new Set([conjugate(s.verbId,(person+1)%6),conjugate(s.verbId,(person+2)%6),subjects[(person+2)%6]])].filter(t=>t!==expected&&t!==subject)];
 // Fisher–Yates: tile order is saved and survives reloads.
 for(let i=r.tiles.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r.tiles[i],r.tiles[j]]=[r.tiles[j],r.tiles[i]];}
 learn(state,s.grammarId,'seen');
}
async function act(action:string){
 const [a,b,c]=action.split(':');const r=state.run;
 if(a==='dismiss'){notice='';render();return;}
 if(a==='mute'){state.settings.muted=!state.settings.muted;if('speechSynthesis'in window)speechSynthesis.cancel();}
 if(a==='settings'){panel='settings';gloss='';}
 if(a==='back')panel=r&&r.status==='playing'?activeEncounter():'explore';
 if(a==='captions')state.settings.captions=!state.settings.captions;
 if(a==='test-voice')speak('Bienvenue au Château des Échos.');
 if(a==='export')exportSave();
 if(a==='persist'){try{const yes=await navigator.storage?.persist?.();notice=yes?'Le stockage est protégé. Gardez aussi une copie exportée.':'Le navigateur ne garantit pas la conservation. Exportez votre carnet.';}catch{notice='Protection indisponible. Exportez votre carnet.';}}
 if(a==='english')showEnglish=!showEnglish;
 if(a==='start'){
  state.run=createRun();panel='explore';gloss='';showEnglish=false;notice='';
  for(const id of dueFirst(state.learner,['droite','gauche'])){if(state.learner.items[id]){state.run.doorSide=id==='droite'?'right':'left';break;}}
  if('speechSynthesis'in window)speechSynthesis.getVoices();
 }
 if(r&&r.status==='playing'){
  if(a==='move'){
   if(panel==='fight'&&r.enemyHp>0){r.log='Le gardien bloque le passage. Apaisez-le pour avancer.';}
   else if(move(r,Number(b),Number(c))){gloss='';panel=activeEncounter();
    if(panel==='npc'){learn(state,'bleue','seen');learn(state,'verte','seen');learn(state,'soigner','seen');learn(state,'poison','seen');learn(state,'sortie','seen');}
    if(panel==='potion')r.log='Deux fioles brillent dans une niche.';
    if(panel==='fight'){learn(state,'gardien','seen');r.log='Le gardien : « Montrez-moi le pouvoir de vos mots. »';}
   }
  }
  if(a==='revisit'){panel='npc';}
  if(a==='gloss'){const word=vocab.find(v=>v.id===b);if(word)hint(word.id,word.english);}
  if(a==='listen-npc')speak(encounters.caretaker.clue);
  if(a==='reply'){
   const reply=encounters.caretaker.replies.find(t=>t.id===b)!;
   if(reply.correct){if(!r.npcDone)learn(state,'dialogue-help','understood');r.npcDone=true;r.key=true;r.log=encounters.caretaker.success;panel='explore';gloss='';}
   else{learn(state,'dialogue-help','failed');r.log=encounters.caretaker.failure;gloss='Pour partir, demandez de l’aide au veilleur.';}
  }
  if(a==='potion'&&!r.potionTaken){r.potionTaken=true;r.turns++;learn(state,'bleue',b==='blue'?'understood':'failed');learn(state,'poison',b==='blue'?'understood':'failed');if(b==='blue'){r.hp=7;r.log='La potion bleue vous soigne. Vous retrouvez toute votre énergie.';}else{r.hp=Math.max(1,r.hp-2);r.log='Oups ! La verte est un poison. La bleue soigne. Vous perdez 2 points de vie, mais vous tenez debout.';}panel='explore';}
  if(a==='leave')panel='explore';
  if(a==='spell')beginSpell(b);
  if(a==='cancel-spell'){delete r.spell;gloss='';}
  if(a==='tile'&&r.tiles&&!r.selected!.includes(Number(b)))r.selected!.push(Number(b));
  if(a==='untile')r.selected=r.selected!.filter(i=>i!==Number(b));
  if(a==='clear')r.selected=[];
  if(a==='typing')typed=!typed;
  if(a==='accent'){const input=document.querySelector<HTMLInputElement>('#typed-answer');if(input){input.setRangeText(b,input.selectionStart??input.value.length,input.selectionEnd??input.value.length,'end');input.focus();}return;}
  if(a==='spell-hint'&&r.spell){const spell=encounters.spells.find(s=>s.id===r.spell)!;if(r.light>0){r.assisted=true;hint(spell.grammarId,`${phrase(spell.verbId,r.person!)} — ${verbs.find(v=>v.id===spell.verbId)!.english}`);}}
  if(a==='cast'&&r.spell){
   const s=encounters.spells.find(s=>s.id===r.spell)!;const expected=phrase(s.verbId,r.person!);const input=document.querySelector<HTMLInputElement>('#typed-answer');
   const answer=typed?input?.value??'':r.selected!.map(i=>r.tiles![i]).join(' ');const result=checkAnswer(answer,expected);
   if(result.correct){if(!r.assisted)learn(state,s.grammarId,'produced');if(typed&&!r.assisted)r.light=Math.min(9,r.light+1);r.log=`« ${expected} » — ${s.name} ! ${result.accentNote?'Pensez aux accents : '+expected+'.':''}`;}
   else{learn(state,s.grammarId,'failed');r.log=`Le sort fait… pouf ! On dit « ${expected} ». ${grammar.find(g=>g.id===s.grammarId)!.explanation}`;}
   attack(r,s.id,result.correct);delete r.spell;gloss='';
   if(r.enemyHp===0){r.log+=' Le gardien s’incline. Les portes sont libres.';r.light=Math.min(9,r.light+1);panel='explore';}
   if(r.hp===0)finish(state);
  }
  if(a==='listen-door'){r.heard=true;speak(encounters.doors[r.doorSide].fr);learn(state,encounters.doors[r.doorSide].vocab,'seen');}
  if(a==='reveal-door'&&!r.doorRevealed){const free=state.settings.captions||state.settings.muted||!localVoice();if(free||r.light>0){r.doorRevealed=true;r.doorAssisted=!free;if(!free){r.light--;learn(state,encounters.doors[r.doorSide].vocab,'hint');}learn(state,encounters.doors[r.doorSide].vocab,'seen');}}
  if(a==='door'){
   if(!r.key)r.log='La serrure résiste. Le veilleur possède peut-être une clé.';
   else if(r.enemyHp>0)r.log='Le gardien retient la porte. Retrouvez-le au centre de la galerie.';
   else if(!r.heard&&!r.doorRevealed)r.log='Écoutez ou lisez d’abord le message de la porte.';
   else if(b===r.doorSide){if(!r.doorAssisted)learn(state,encounters.doors[r.doorSide].vocab,'understood');r.status='won';finish(state);}
   else{learn(state,encounters.doors[r.doorSide].vocab,'failed');r.hp=Math.max(1,r.hp-1);r.log='Un placard à balais ! Une araignée vous surprend (−1 vie). Écoutez encore : « '+encounters.doors[r.doorSide].fr+' »';r.doorRevealed=true;r.doorAssisted=true;}
  }
 }
 await persist();render();
}
app.addEventListener('click',async e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');if(!b||b.disabled||busy)return;busy=true;try{await act(b.dataset.action!);}catch(err){notice='Cette action n’a pas abouti. Votre carnet reste accessible dans les réglages.';console.error(err);render();}finally{busy=false;}});
app.addEventListener('change',async e=>{const input=e.target as HTMLInputElement;if(input.id!=='import'||!input.files?.[0])return;busy=true;try{const file=input.files[0];if(file.size>2_000_000)throw new Error('Fichier trop volumineux.');const imported=parseSave(await file.text());exportSave();state=imported;panel=state.run?.status==='playing'?activeEncounter():'explore';notice='Carnet importé. Une copie du carnet précédent a été exportée.';await persist();}catch{notice='Import refusé : fichier invalide ou incompatible. Votre carnet actuel est conservé.';}finally{busy=false;render();}});
if('speechSynthesis'in window)speechSynthesis.addEventListener('voiceschanged',()=>{if(panel==='settings'||panel==='doors')render();});
try{state=await load();panel=state.run?.status==='playing'?activeEncounter():'explore';}catch{dbUsable=false;storageWarning='Le carnet local ne peut pas être lu. Exportez votre partie avant de quitter ; aucune donnée existante ne sera remplacée sans action.';}
render();
