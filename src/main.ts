import "./style.css";
import { registerSW } from "virtual:pwa-register";
import { castle } from "./artwork";
import vocab from "./content/vocabulary.json";
import grammar from "./content/grammar.json";
import encounters from "./content/encounters.json";
import dungeon from "./content/dungeon.json";
import verbs from "./content/verbs.json";
import {
  beginChallenge,
  buy,
  caretaker,
  cast,
  chooseDoor,
  claimTreasure,
  combatRoom,
  createRun,
  currentRoom,
  enemyIntent,
  expectedAnswer,
  helpChallenge,
  learn,
  message,
  move,
  newSave,
  offers,
  rest,
  retreat,
  useItem,
} from "./engine";
import { phrase, subjects } from "./language";
import { legacyBackup, load, parseSave, save } from "./persistence";
import { dueFirst } from "./learner";
import type { Kit, Run, Save } from "./types";
const app = document.querySelector<HTMLDivElement>("#app")!;
let state: Save = newSave(),
  screen: "game" | "settings" | "kits" = "game",
  chosenKit: Kit = "frost",
  notice = "",
  gloss = "",
  storageWarning = "",
  busy = false,
  dbUsable = true,
  typed = false,
  expandedMap = false,
  bagOpen = false,
  dismissed = "",
  translationVisible = false;
let updateAvailable = false;
let updateApp: (reload?: boolean) => Promise<void> = async () => {};
const escape = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const btn = (label: string, action: string, cls = "", disabled = false) =>
  `<button type="button" class="${cls}" data-action="${escape(action)}" ${disabled ? "disabled" : ""}>${label}</button>`;
const en = (s: string) =>
  state.settings.translations
    ? `<small class="translation">${escape(s)}</small>`
    : "";
const pair = (fr: string, english: string) => `${escape(fr)}${en(english)}`;
function setBusy(value: boolean) {
  busy = value;
  app.setAttribute("aria-busy", String(value));
}
function localVoice() {
  return (
    "speechSynthesis" in window &&
    speechSynthesis
      .getVoices()
      .some((v) => v.lang.startsWith("fr") && v.localService)
  );
}
function speak(text: string) {
  if (state.settings.muted) {
    notice = "Le son est coupé. / Sound is muted. Text is always free.";
    return;
  }
  if (!("speechSynthesis" in window)) {
    notice =
      "La voix est indisponible. / Audio unavailable. Use the free text.";
    return;
  }
  const voice = speechSynthesis
    .getVoices()
    .find((v) => v.lang.startsWith("fr") && v.localService);
  if (!voice) {
    notice =
      "Aucune voix française locale. / No local French voice found. Use the free text, or install a French voice in your device settings.";
    return;
  }
  speechSynthesis.cancel();
  const line = new SpeechSynthesisUtterance(text);
  line.voice = voice;
  line.lang = "fr-FR";
  line.rate = 0.85;
  line.onerror = () => {
    notice = "Lecture indisponible. / Audio failed; use the free text.";
    render();
  };
  speechSynthesis.speak(line);
}
function header() {
  const r = state.run;
  return `<header class="topbar"><a class="brand" href="./" aria-label="Le Donjon">♜ <span>LE DONJON</span></a><div class="header-actions">${btn(state.settings.translations ? "FR + EN" : "Français", "translations", "quiet")}${btn(state.settings.muted ? "Son coupé" : "♫ Son", "mute", "quiet")}${btn('⚙<span class="sr-only">Réglages / Settings</span>', "settings", "icon-button")}</div></header>${r?.status === "playing" && screen === "game" ? `<div class="statusbar"><span class="health"><span class="heart">♥</span> <b>${r.hp}</b><small>/${r.maxHp}</small></span><span class="mana">✦ <b>${r.mana}</b><small>/${r.maxMana}</small></span><span class="gold">◉ <b>${r.gold}</b></span><span class="tier">${r.floor} / 3</span></div>` : ""}`;
}
function welcome() {
  return `<main class="welcome expedition-intro"><span class="eyebrow">LE CHÂTEAU DES ÉCHOS · EXPÉDITION II</span><h1>Trois étages.<br><em>Une seule vie.</em></h1><p class="intro">Choisissez votre voie. Apprenez les mots.<br>Survivez au château.${en("A new dungeon each run. Your equipment is lost on death; your French stays with you.")}</p><div class="castle-frame">${castle}</div><section class="kit-selection" aria-label="Choose your starting build"><span class="eyebrow">VOTRE PREMIER CHOIX / YOUR STARTING BUILD</span>${dungeon.kits.map((kit) => btn(`<span class="kit-symbol">${kit.symbol}</span><span><b>${kit.name}</b>${en(kit.english)}<span class="kit-description">${kit.description}</span>${en(kit.help)}</span><span class="kit-check">${chosenKit === kit.id ? "●" : "○"}</span>`, `kit:${kit.id}`, `kit ${chosenKit === kit.id ? "chosen" : ""}`)).join("")}</section><div class="welcome-bottom"><p class="rules-note">18 vie · 6 mana · 2 potions · 1 éther · 1 bombe${en("18 health · 6 mana · 2 healing potions · 1 ether · 1 bomb. Three randomized floors, then the Queen. No healing between floors.")}</p>${btn("Commencer l’expédition <span>→</span>", "start", "primary wide")}<p class="session-note">15–25 min · Reprise automatique${en("Autosave after every action. Close and resume any time.")}</p></div><footer>Gratuit. Hors ligne. Sans compte.${en("Free translations, examples and replay. No help currency.")}</footer></main>`;
}
function map(r: Run) {
  const fighting = !!combatRoom(r);
  if (fighting && !expandedMap)
    return `<section class="map-section"><div class="mapbar"><span>ÉTAGE ${r.floor} · ${dungeon.floors[r.floor - 1].name}</span>${btn("Voir le plan / Map", "map-toggle", "quiet")}</div></section>`;
  return `<section class="map-section" aria-label="Dungeon map"><div class="section-label"><span>ÉTAGE ${r.floor} · PLAN DU CHÂTEAU</span><span>${r.turns} TOURS</span></div><div class="dungeon" role="group" aria-label="Move to an adjacent tile">${r.layout
    .flatMap((row, y) =>
      [...row].map((cell, x) => {
        if (cell === "#")
          return '<div class="cell wall" aria-hidden="true"><i></i></div>';
        const room = r.rooms.find((room) => room.x === x && room.y === y),
          player = r.x === x && r.y === y,
          adjacent = Math.abs(r.x - x) + Math.abs(r.y - y) === 1;
        const data = room ? dungeon.rooms[room.type] : null;
        const symbol = player
          ? "◆"
          : room
            ? room.cleared && !["gate", "boss"].includes(room.type)
              ? "✓"
              : data!.symbol
            : "·";
        return `<button class="cell floor ${player ? "player" : ""} ${room?.type ?? ""} ${adjacent && !fighting ? "reachable" : ""} ${room?.cleared ? "cleared" : ""}" data-action="move:${x - r.x}:${y - r.y}" aria-label="${escape(player ? "Your position" : data ? data.fr + " / " + data.en : "Corridor")}${adjacent ? " — move" : ""}" ${!adjacent || fighting ? "disabled" : ""}>${symbol}</button>`;
      }),
    )
    .join(
      "",
    )}</div><div class="map-legend"><span>◆ Vous / You</span><span>◇ Trésor</span><span>❧ Repos</span><span>▥ Escalier</span></div>${fighting ? btn("Masquer le plan / Hide map", "map-toggle", "quiet wide") : `<div class="controls" aria-label="Movement">${btn('↑<span class="sr-only">North</span>', "move:0:-1", "up")}${btn('←<span class="sr-only">West</span>', "move:-1:0", "left")}${btn('↓<span class="sr-only">South</span>', "move:0:1", "down")}${btn('→<span class="sr-only">East</span>', "move:1:0", "right")}</div><p class="map-tip">Touchez une case voisine.${en("Tap an adjacent tile. Room symbols show the risks before you enter.")}</p>`}</section>`;
}
function inventory(r: Run) {
  return `<section class="inventory"><div class="bag-heading">${btn(`Sac / Supplies <span>${r.potions} ♜ · ${r.ether} ✦ · ${r.bombs} ✹ ${bagOpen ? "−" : "+"}</span>`, "bag-toggle", "bag-button wide")}</div>${bagOpen ? `<div class="supply-grid">${btn(pair(`Potion ×${r.potions}`, "Restore " + (r.relics.includes("flask") ? "9" : "6") + " health"), "item:potion", "choice", r.potions === 0 || r.hp === r.maxHp)}${btn(pair(`Éther ×${r.ether}`, "Restore 4 mana"), "item:ether", "choice", r.ether === 0 || r.mana === r.maxMana)}${btn(pair(`Bombe ×${r.bombs}`, "8 damage · combat only"), "item:bomb", "choice", r.bombs === 0 || !combatRoom(r))}</div><p class="fine-print">${combatRoom(r) ? "En combat, boire ou lancer un objet utilise un tour." : "Vos réserves restent avec vous entre les étages."}${en(combatRoom(r) ? "Items take a turn. The enemy attacks unless frozen or defeated." : "Use supplies before a fight to avoid giving the enemy a turn.")}</p>` : ""}<div class="relic-strip" aria-label="Your build">${r.relics
    .map((id) => {
      const relic = dungeon.relics.find((relic) => relic.id === id)!;
      return btn(`${relic.symbol} ${relic.name}`, `relic:${id}`, "relic-badge");
    })
    .join("")}</div></section>`;
}
function explore(r: Run) {
  const room = currentRoom(r);
  const cleared = r.rooms.filter(
    (room) => room.cleared && room.type !== "entry",
  ).length;
  return `<span class="eyebrow">CHOISISSEZ VOTRE CHEMIN</span><h2>Chaque détour compte.</h2><p>Le gardien protège l’escalier. Les trésors changent vos sorts. Une fontaine peut vous sauver.${en("The warden guards the stairs. Optional rooms offer equipment, supplies or recovery. You can avoid fights, but the exit guardian must fall.")}</p><div class="route-key"><span>◇ <b>Trésor</b>${en("Choose one relic or supplies")}</span><span>❧ <b>Fontaine</b>${en("Choose health OR mana, once")}</span><span>⚖ <b>Marchand</b>${en("Spend gold on limited stock")}</span><span>✦ <b>Autel</b>${en("Pay 3 health for treasure")}</span></div><p class="fine-print">${cleared} / 8 salles explorées · ${r.kills} victoires${en("Enemies grow stronger by floor. Asking for language help never changes their stats.")}</p>${room && !["entry", "enemy"].includes(room.type) && (!room.cleared || ["gate", "boss"].includes(room.type)) ? btn("Examiner la salle / Interact", "interact", "choice wide") : ""}`;
}
function fight(r: Run) {
  const room = combatRoom(r)!,
    enemy = room.enemy!,
    data = dungeon.enemies.find((e) => e.id === enemy.kind)!,
    intent = enemyIntent(r)!,
    c = r.challenge;
  const priority = dueFirst(
    state.learner,
    encounters.spells.map((s) => s.grammarId),
  );
  const spell = c && encounters.spells.find((spell) => spell.id === c.spell)!;
  let body = "";
  if (!c || !spell) {
    body = `<p class="combat-instruction">Choisissez un sort, puis sa formule.${en("Choose a tactical action, then build its French formula. Free explanations are available before every cast.")}</p><div class="spells">${[
      ...encounters.spells,
    ]
      .filter((s) => r.knownSpells.includes(s.id))
      .sort(
        (a, b) => priority.indexOf(a.grammarId) - priority.indexOf(b.grammarId),
      )
      .map((s) =>
        btn(
          `<span class="spell-symbol">${s.symbol}</span><span><b>${s.name} <i>${s.cost ? `${s.cost} ✦` : "0 ✦"}</i></b><small>${s.id === "strike" && r.relics.includes("ember") ? "4 dégâts. Sans mana." : s.id === "shield" && r.relics.includes("mirror") ? "Bloque la riposte et renvoie 4 dégâts." : s.description}</small>${en(s.id === "strike" && r.relics.includes("ember") ? "4 damage. No mana cost." : s.id === "shield" && r.relics.includes("mirror") ? "Block and reflect 4 damage." : s.english)}</span>`,
          `spell:${s.id}`,
          "spell",
          r.mana < s.cost,
        ),
      )
      .join("")}</div>`;
  } else {
    const level = r.support[spell.grammarId] ?? 0,
      verb = verbs.find((v) => v.id === spell.verbId)!,
      pattern = grammar.find((g) => g.id === spell.grammarId)!;
    const example = phrase(spell.verbId, c.person === 0 ? 3 : 0);
    body = `<div class="spell-prompt"><span class="eyebrow">${spell.name.toUpperCase()} · ${spell.cost} ✦</span><h3>${subjects[c.person]} … <span class="verb-label">${verb.infinitive}</span></h3>${en(`Present tense · ${subjects[c.person]} = ${["I", "you", "he", "we", "you (plural/polite)", "they"][c.person]} · ${verb.infinitive} = ${verb.english}`)}</div>${level === 0 ? `<div class="teaching"><b>Exemple : ${example}</b>${en(pattern.exampleEnglish)}<p>${pattern.tipFr}</p>${en(pattern.tipEn)}<small>Essai guidé : une erreur permet de réessayer gratuitement.${en("Guided: incorrect French gets a correction before any turn or mana is spent. The chosen spell still has tactical consequences.")}</small></div>` : `<p class="fine-print">${level === 1 ? "Formule accompagnée" : "Formule libre"}${en("Incorrect casting spends a turn and mana. Reveal the answer below for free whenever you need it.")}</p>`}
  ${c.assisted || c.attempts > 0 ? `<div class="gloss"><b>${expectedAnswer(c)}</b><p>${pattern.explanation}</p><small>${escape(pattern.english)}</small>${btn("♫ Écouter / Listen", "listen-formula", "quiet")}</div>` : ""}
  ${typed ? `<label class="text-label">Écrivez la formule / Type the formula<input id="typed-answer" lang="fr" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="${subjects[c.person]} …"/><span class="accents">${[..."éèêçàâîôù", "œ"].map((a) => btn(a, `accent:${a}`, "accent")).join("")}</span></label>` : `<div class="answer" aria-label="Your formula">${c.selected.length ? c.selected.map((i) => btn(escape(c.tiles[i]), `untile:${i}`, "selected-tile")).join("") : "<span>Touchez le sujet, puis le verbe.<br>Tap the subject, then the verb.</span>"}</div><div class="tile-bank">${c.tiles.map((tile, i) => btn(escape(tile), `tile:${i}`, "tile", c.selected.includes(i))).join("")}</div>`}
  <div class="inline-actions">${btn("Expliquer / Free help", "formula-help", "quiet")}${btn(typed ? "Tuiles / Tiles" : "Écrire / Type", "typing", "quiet")}</div>${btn("Lancer le sort / Cast <span>✧</span>", "cast", "primary wide", !typed && c.selected.length === 0)}${btn("Changer de sort / Choose another spell", "cancel-spell", "quiet wide")}`;
  }
  return `<div class="encounter-heading"><div class="portrait ghost">${data.symbol}</div><div><span class="eyebrow">${room.type === "boss" ? "RENCONTRE FINALE" : "COMBAT"}</span><h2>${data.name}</h2>${en(data.english)}</div><b class="enemy-life">${enemy.hp}/${enemy.maxHp} ♥</b></div><div class="intent ${intent.damage >= 4 ? "danger" : ""}">${intent.fr}${en(intent.en)}<strong>Riposte : ${intent.damage} dégâts / Next attack: ${intent.damage} damage</strong></div>${body}<div class="retreat">${btn("Fuir / Retreat · −2 ♥", "retreat", "quiet wide")}<small>${en("Retreat preserves enemy health and attack pattern. It can be fatal at 2 health or less.")}</small></div>`;
}
function treasure(r: Run) {
  const room = currentRoom(r)!,
    shrine = room.type === "shrine";
  return `<span class="eyebrow">${shrine ? "UN PRIX À PAYER" : "UN NOUVEAU POUVOIR"}</span><h2>${shrine ? "L’autel exige un sacrifice." : "Que garderez-vous ?"}</h2><p>${shrine ? "Offrez 3 points de vie pour un seul don." : "Choisissez un seul trésor. Les autres disparaîtront."}${en(shrine ? "Pay 3 health for ONE reward. You can leave and return later." : "Choose ONE reward. Build around your existing spells or prepare supplies for the next floor.")}</p><div class="choices">${offers(
    r,
    room,
  )
    .map((relic) =>
      btn(
        `<span class="reward-title">${relic.symbol} ${relic.name}</span>${en(relic.english)}<span class="reward-description">${relic.description}</span>${en(relic.help)}`,
        `reward:${relic.id}`,
        "choice reward",
        shrine && r.hp <= 3,
      ),
    )
    .join(
      "",
    )}${btn(`${pair("Des provisions", "Supplies")}<span class="reward-description">1 potion + 1 éther</span>${en("A health potion and a mana potion instead of a relic.")}`, "reward:supplies", "choice reward", shrine && r.hp <= 3)}</div>${btn("Repartir sans rien prendre / Leave for now", "dismiss-room", "quiet wide")}`;
}
function camp() {
  return `<span class="eyebrow">UNE SEULE OCCASION</span><h2>La fontaine des murmures</h2><p>L’eau peut soigner le corps ou raviver la magie. Choisissez.${en("One recovery choice, then this fountain is spent. It does not refill between visits.")}</p><div class="choices">${btn(pair("Soigner / +8 ♥", "Restore 8 health"), "rest:health", "choice", state.run!.hp === state.run!.maxHp)}${btn(pair("Raviver la magie / ✦", "Refill mana completely"), "rest:mana", "choice", state.run!.mana === state.run!.maxMana)}${btn("Garder la fontaine pour plus tard / Leave", "dismiss-room", "quiet")}</div>`;
}
function merchant() {
  const r = state.run!,
    room = currentRoom(r)!;
  return `<span class="eyebrow">VOS PIÈCES, VOTRE CHOIX</span><h2>Le marchand sans ombre</h2><p>« Je ne vends pas la victoire. Seulement une chance de plus. »${en("Spend gold from victories. Each supply is stocked once. Buy now, use it when you need it.")}</p><div class="choices">${(
    ["potion", "ether", "bomb"] as const
  )
    .map((id) => {
      const cost = id === "bomb" ? 10 : 8;
      return btn(
        pair(
          `${id === "potion" ? "Potion" : id === "ether" ? "Éther" : "Bombe"} · ${cost} ◉`,
          id === "potion"
            ? "Restore health"
            : id === "ether"
              ? "Restore mana"
              : "8 damage in combat",
        ),
        `buy:${id}`,
        "choice",
        r.gold < cost || room.purchases.includes(id),
      );
    })
    .join("")}${btn("Repartir / Leave", "dismiss-room", "quiet")}</div>`;
}
function npc() {
  const n = encounters.caretaker;
  return `<div class="encounter-heading"><div class="portrait">♙</div><div><span class="eyebrow">UN ALLIÉ DANS L’OMBRE</span><h2>${n.name}</h2>${en("A clue, a conversation, a supply")}</div></div><p>« Prenez une potion avant de descendre. »${en("Take a potion before descending.")}</p><div class="speech">${n.tokens.map((t) => (t.vocab ? btn(escape(t.text), `word:${t.vocab}`, "word") : escape(t.text))).join("")}</div><div class="inline-actions">${btn("♫ Écouter", "listen-npc", "quiet")}${btn("Traduire / Free translation", "translate-npc", "quiet")}</div>${translationVisible ? `<div class="gloss">The blue potion heals. The green one is poison. Take the blue one.</div>` : ""}<p>« Que prendrez-vous ? »${en("Which will you take? Tap underlined words for free meanings.")}</p><div class="choices">${btn(pair("Je prends la potion bleue.", "I’ll take the blue potion."), "npc:blue", "choice")}${btn(pair("Je prends la potion verte.", "I’ll take the green potion."), "npc:green", "choice")}${btn("Repartir / Leave", "dismiss-room", "quiet")}</div>`;
}
function doors(r: Run) {
  const data = encounters.doors[r.exitSide],
    id = data.vocab;
  const guided =
    (r.support[id] ?? 0) === 0 ||
    state.settings.captions ||
    state.settings.muted ||
    !localVoice();
  return `<span class="eyebrow">${r.floor === 3 ? "LA DERNIÈRE PORTE" : "L’ESCALIER EST LIBRE"}</span><h2>Écoutez le château.</h2><p>Une voix indique la bonne porte.${en(r.floor === 3 ? "The Queen is defeated. Follow the direction to escape." : "The guardian is defeated. Follow the direction to the next floor. Your resources will not refill.")}</p>${btn("♫ Écouter / Listen", "listen-door", "primary wide")}${guided || r.gateRead ? `<blockquote>${data.fr}${translationVisible ? `<small class="translation">${data.en}</small>` : ""}</blockquote>` : ""}<div class="inline-actions">${btn("Afficher le texte / Free text", "read-door", "quiet")}${btn("Traduire / Translate", "translate-door", "quiet")}</div><div class="door-choices">${btn("▥<span>À gauche</span>" + en("Left"), "door:left", "door-choice")}${btn("▥<span>À droite</span>" + en("Right"), "door:right", "door-choice")}</div><p class="fine-print">${en(guided ? "Guided directions: the French line is visible. Replay, translation and text are always free." : "Listening mode. Free text and translation are available whenever you need them.")}</p>`;
}
function encounter(r: Run) {
  const room = currentRoom(r);
  if (combatRoom(r)) return fight(r);
  if (room && ["gate", "boss"].includes(room.type)) return doors(r);
  if (room && !room.cleared && dismissed !== room.id) {
    if (room.type === "treasure" || room.type === "shrine") return treasure(r);
    if (room.type === "camp") return camp();
    if (room.type === "merchant") return merchant();
    if (room.type === "npc") return npc();
  }
  return explore(r);
}
function play(r: Run) {
  const floor = dungeon.floors[r.floor - 1];
  return `<main class="play ${combatRoom(r) ? "in-combat" : ""}"><div class="chapter-heading"><span class="eyebrow">EXPÉDITION · ÉTAGE ${r.floor} / 3</span><h1>${floor.name}</h1>${en(floor.english)}<p class="support-note">${en("Dungeon danger rises by floor. Language help is personal, free, and fixed for this run.")}</p></div><div class="game-layout">${map(r)}<section class="encounter card" aria-label="Current encounter">${encounter(r)}${gloss ? `<div class="gloss" role="status">${escape(gloss)}</div>` : ""}${inventory(r)}</section></div><div class="journal" role="status"><span>✎</span><p>${escape(r.log)}${en(r.logEn)}</p></div><div class="play-footer"><span>${dbUsable ? "● Autosave · sur cet appareil" : "○ Memory only · export your save"}</span>${btn("Carnet / Learning journal", "settings", "quiet")}</div></main>`;
}
function nameOf(id: string) {
  return (
    vocab.find((v) => v.id === id)?.lemma ??
    verbs.find((v) => v.id === grammar.find((g) => g.id === id)?.verbId)
      ?.infinitive ??
    "demander de l’aide"
  );
}
function debrief() {
  const r = state.run!,
    h = state.history.find((h) => h.at === r.startedAt),
    g = grammar.find((g) => g.id === h?.mistake);
  return `<main class="debrief"><span class="eyebrow">FIN D’EXPÉDITION · ÉTAGE ${r.floor} / 3</span><div class="end-emblem">${r.status === "won" ? "✧" : "❧"}</div><h1>${r.status === "won" ? "L’aube vous attend." : "Une vie s’éteint. Les mots restent."}</h1><p>${en(r.status === "won" ? "You escaped all three floors. Try a different build next time." : "This character, their gold and equipment are lost. Your vocabulary, mistakes and review schedule are preserved.")}</p><div class="run-stats"><span>${r.kills} victoires${en("Enemies defeated")}</span><span>${r.turns} tours${en("Turns taken")}</span><span>${r.relics.length} reliques${en("Relics collected")}</span></div><div class="debrief-grid"><section class="card"><span class="eyebrow">VOTRE FRANÇAIS</span><h2>Les mots emportés</h2><div class="word-list">${h?.newWords.map((id) => `<span>${escape(nameOf(id))}</span>`).join("") || "<p>Des mots déjà connus vous ont accompagné.</p>"}</div>${en(`${r.events.filter((e) => e.kind === "produced").length} independently correct spell formulas this run. Assisted answers are practice, not independent mastery.`)}</section><section class="card"><span class="eyebrow">LA PROCHAINE FOIS</span><h2>Les échos à revoir</h2><div class="word-list">${h?.struggled.map((id) => `<span>${escape(nameOf(id))}</span>`).join("") || "<p>Aucune difficulté enregistrée.</p>"}</div><p>${g?.explanation ?? "Observez le sujet, puis le verbe."}${en(g?.english ?? "Notice the subject before choosing the verb. Use free help whenever you need it.")}</p></section></div>${btn("Nouvelle expédition / New run →", "new-run", "primary")}<p class="fine-print">${en("Your next run recalculates language support from demonstrated knowledge. Enemies never weaken because of mistakes.")}</p></main>`;
}
function settings() {
  const due = dueFirst(state.learner, Object.keys(state.learner.items))
    .filter((id) => state.learner.items[id].dueAt <= Date.now())
    .slice(0, 8);
  return `<main class="settings card"><span class="eyebrow">VOTRE CARNET / YOUR JOURNAL</span><h1>À votre rythme.</h1><p>Vos données restent sur cet appareil.${en("Export regularly: browsers can evict local storage. No account, tracking or server.")}</p><div class="setting-row"><div><b>Traductions anglaises</b><small>English explanations and game instructions</small></div>${btn(state.settings.translations ? "Activées" : "Désactivées", "translations", "choice")}</div><div class="setting-row"><div><b>Sous-titres</b><small>Always show free listening transcripts</small></div>${btn(state.settings.captions ? "Activés" : "Désactivés", "captions", "choice")}</div><div class="setting-row"><div><b>Voix locale</b><small>${localVoice() ? "French voice available" : "No local French voice. Free text remains available."}</small></div>${btn("♫ Test", "test-voice", "quiet")}</div><p>${Object.keys(state.learner.items).length} éléments suivis · ${state.history.length} expéditions${en("Support is based on each grammar pattern, not XP. Guided → coached → independent, with free help at every stage.")}</p><div class="word-list">${due.map((id) => `<span>${escape(nameOf(id))}</span>`).join("")}</div>${state.migrated ? `<div class="migration-note"><b>Votre français est conservé.</b><p>The old single-floor run was archived in your history. Start a new expedition under the new rules. An original local backup is retained on the device where it was upgraded.</p>${btn("Exporter l’ancien carnet / Original backup", "legacy-export", "quiet")}${btn("Compris / Dismiss migration notice", "ack-migration", "quiet")}</div>` : ""}<div class="choices">${btn("Exporter le carnet / Export JSON", "export", "choice")}<label class="choice import-label">Importer un carnet / Import JSON<input id="import" type="file" accept="application/json,.json"/></label>${btn("Protéger le stockage / Request persistent storage", "persist", "choice")}${btn("Retour / Back →", "back", "primary")}</div><p class="fine-print">Import validates the file, downloads a copy of your current save, then replaces it. Old version-1 learning records are supported. Backup downloads depend on your browser’s download permissions.</p></main>`;
}
function render() {
  const focused = (document.activeElement as HTMLElement)?.dataset.action;
  app.innerHTML = `${header()}${updateAvailable ? `<div class="notice">Une nouvelle version est disponible. / An update is ready. Your run will be saved first. ${btn("Mettre à jour / Update", "update-app", "primary")}</div>` : ""}${storageWarning ? `<div class="warning" role="alert">${escape(storageWarning)}</div>` : ""}${notice ? `<div class="notice" role="status">${escape(notice)} ${btn("Fermer / Close", "dismiss-notice", "quiet")}</div>` : ""}${state.migrated && screen !== "settings" ? `<div class="notice">Your learning has been preserved. The old single-floor run is archived; choose a new build to enter the new dungeon. ${btn("Details / Backup", "settings", "quiet")}</div>` : ""}${screen === "settings" ? settings() : screen === "kits" || !state.run ? welcome() : state.run.status === "playing" ? play(state.run) : debrief()}`;
  if (focused)
    Array.from(app.querySelectorAll<HTMLButtonElement>("button[data-action]"))
      .find((b) => b.dataset.action === focused && !b.disabled)
      ?.focus({ preventScroll: true });
}
async function persist() {
  try {
    await save(state);
    dbUsable = true;
    storageWarning = "";
  } catch {
    dbUsable = false;
    storageWarning =
      "Autosave is unavailable. Export your journal before closing this page.";
  }
}
function exportData(data: unknown, name = "le-donjon") {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function act(action: string) {
  const [a, b, c] = action.split(":");
  const r = state.run;
  if (a === "update-app") {
    await persist();
    await updateApp(true);
    return;
  }
  if (a === "dismiss-notice") {
    notice = "";
    return;
  }
  if (a === "translations") {
    state.settings.translations = !state.settings.translations;
    return;
  }
  if (a === "mute") {
    state.settings.muted = !state.settings.muted;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    return;
  }
  if (a === "settings") {
    screen = "settings";
    return;
  }
  if (a === "back") {
    screen = "game";
    return;
  }
  if (a === "captions") {
    state.settings.captions = !state.settings.captions;
    return;
  }
  if (a === "test-voice") {
    speak("Bienvenue au Château des Échos.");
    return;
  }
  if (a === "export") {
    exportData(state);
    return;
  }
  if (a === "legacy-export") {
    const backup = await legacyBackup();
    if (backup) exportData(backup, "le-donjon-v1");
    else
      notice =
        "Original backup is on the device where the save was upgraded. Your imported learning records are already included in your current export.";
    return;
  }
  if (a === "ack-migration") {
    state.migrated = false;
    return;
  }
  if (a === "persist") {
    try {
      notice = (await navigator.storage?.persist?.())
        ? "Persistent storage granted. Keep an exported backup too."
        : "The browser cannot guarantee retention. Export a backup.";
    } catch {
      notice = "Storage protection unavailable. Export a backup.";
    }
    return;
  }
  if (a === "new-run") {
    screen = "kits";
    return;
  }
  if (a === "kit") {
    if (dungeon.kits.some((k) => k.id === b)) chosenKit = b as Kit;
    return;
  }
  if (a === "start") {
    state.run = createRun(undefined, state.learner, chosenKit);
    screen = "game";
    dismissed = "";
    gloss = "";
    expandedMap = false;
    notice = "";
    return;
  }
  if (!r || r.status !== "playing") return;
  if (a === "map-toggle") {
    expandedMap = !expandedMap;
    return;
  }
  if (a === "bag-toggle") {
    bagOpen = !bagOpen;
    return;
  }
  if (a === "relic") {
    const relic = dungeon.relics.find((relic) => relic.id === b);
    if (relic) gloss = `${relic.name} — ${relic.help}`;
    return;
  }
  if (a === "move") {
    if (move(r, Number(b), Number(c))) {
      dismissed = "";
      gloss = "";
      translationVisible = false;
      expandedMap = false;
      const room = currentRoom(r);
      if (room?.type === "npc" && !room.cleared)
        for (const id of ["bleue", "verte", "poison", "soigner"])
          learn(state, id, "seen");
    }
    return;
  }
  if (a === "dismiss-room") {
    dismissed = currentRoom(r)?.id ?? "";
    return;
  }
  if (a === "interact") {
    dismissed = "";
    return;
  }
  if (a === "spell") {
    if (beginChallenge(state, b)) {
      gloss = "";
      typed = false;
    }
    return;
  }
  if (a === "tile" && r.challenge) {
    const i = Number(b);
    if (
      Number.isInteger(i) &&
      i >= 0 &&
      i < r.challenge.tiles.length &&
      !r.challenge.selected.includes(i)
    )
      r.challenge.selected.push(i);
    return;
  }
  if (a === "untile" && r.challenge) {
    r.challenge.selected = r.challenge.selected.filter((i) => i !== Number(b));
    return;
  }
  if (a === "typing") {
    typed = !typed;
    return;
  }
  if (a === "formula-help") {
    helpChallenge(state);
    return;
  }
  if (a === "listen-formula" && r.challenge) {
    speak(expectedAnswer(r.challenge));
    return;
  }
  if (a === "cancel-spell") {
    delete r.challenge;
    return;
  }
  if (a === "cast" && r.challenge) {
    const answer = typed
      ? (document.querySelector<HTMLInputElement>("#typed-answer")?.value ?? "")
      : r.challenge.selected.map((i) => r.challenge!.tiles[i]).join(" ");
    cast(state, answer);
    return;
  }
  if (a === "retreat") {
    retreat(state);
    expandedMap = false;
    gloss = "";
    return;
  }
  if (a === "item" && ["potion", "ether", "bomb"].includes(b)) {
    useItem(state, b as "potion" | "ether" | "bomb");
    return;
  }
  if (a === "reward") {
    claimTreasure(r, b);
    return;
  }
  if (a === "rest" && ["health", "mana"].includes(b)) {
    rest(r, b as "health" | "mana");
    return;
  }
  if (a === "buy" && ["potion", "ether", "bomb"].includes(b)) {
    buy(r, b as "potion" | "ether" | "bomb");
    return;
  }
  if (a === "npc" && ["blue", "green"].includes(b)) {
    caretaker(state, b as "blue" | "green");
    return;
  }
  if (a === "word") {
    const word = vocab.find((v) => v.id === b);
    if (word) {
      learn(state, word.id, "hint");
      gloss = `${word.lemma} — ${word.english}`;
      speak(word.lemma);
    }
    return;
  }
  if (a === "listen-npc") {
    speak(encounters.caretaker.clue);
    return;
  }
  if (a === "translate-npc") {
    translationVisible = !translationVisible;
    if (translationVisible)
      for (const id of ["bleue", "poison"]) learn(state, id, "hint");
    return;
  }
  if (a === "listen-door") {
    r.gateHeard = true;
    learn(state, encounters.doors[r.exitSide].vocab, "seen");
    speak(encounters.doors[r.exitSide].fr);
    return;
  }
  if (a === "read-door") {
    r.gateRead = true;
    learn(state, encounters.doors[r.exitSide].vocab, "seen");
    return;
  }
  if (a === "translate-door") {
    translationVisible = !translationVisible;
    r.gateRead = true;
    if (translationVisible) {
      r.gateAssisted = true;
      learn(state, encounters.doors[r.exitSide].vocab, "hint");
    }
    return;
  }
  if (a === "door" && ["left", "right"].includes(b)) {
    const guided =
      (r.support[encounters.doors[r.exitSide].vocab] ?? 0) === 0 ||
      state.settings.captions ||
      state.settings.muted ||
      !localVoice();
    if (guided) r.gateRead = true;
    if (chooseDoor(state, b as "left" | "right")) {
      dismissed = "";
      gloss = "";
      translationVisible = false;
      expandedMap = false;
    }
    return;
  }
}
app.addEventListener("click", async (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-action]",
  );
  if (!button || button.disabled || busy) return;
  const action = button.dataset.action!;
  if (action.startsWith("accent:")) {
    const input = document.querySelector<HTMLInputElement>("#typed-answer");
    if (input) {
      input.setRangeText(
        action.slice(7),
        input.selectionStart ?? input.value.length,
        input.selectionEnd ?? input.value.length,
        "end",
      );
      input.focus();
    }
    return;
  }
  setBusy(true);
  try {
    await act(action);
    await persist();
  } catch (error) {
    console.error(error);
    notice = "Action unavailable. Your journal can be exported from settings.";
  } finally {
    setBusy(false);
    render();
  }
});
app.addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id !== "import" || !input.files?.[0] || busy) return;
  setBusy(true);
  try {
    const file = input.files[0];
    if (file.size > 2_000_000) throw new Error("Too large");
    const imported = parseSave(await file.text());
    exportData(state, "le-donjon-before-import");
    state = imported;
    screen = "game";
    gloss = "";
    notice =
      "Carnet importé. / Save imported. A copy of your previous journal was downloaded.";
    await persist();
  } catch {
    notice =
      "Import refusé. / Invalid or incompatible file. Your current journal is unchanged.";
  } finally {
    setBusy(false);
    render();
  }
});
if ("speechSynthesis" in window)
  speechSynthesis.addEventListener("voiceschanged", () => {
    if (screen === "settings") render();
  });
try {
  state = await load();
} catch {
  dbUsable = false;
  storageWarning =
    "Your local save could not be read. Export any in-memory progress before leaving. Existing data is not replaced until you take an action.";
}
render();

updateApp = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateAvailable = true;
    render();
  },
});
