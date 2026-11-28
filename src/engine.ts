import { record, freshLearner, supportFor } from "./learner";
import type { Evidence, Learner } from "./learner";
import type { Challenge, Kit, Run, Save, Room } from "./types";
import { generateFloor, random, shuffle } from "./dungeon";
import encounters from "./content/encounters.json";
import content from "./content/dungeon.json";
import grammar from "./content/grammar.json";
import vocab from "./content/vocabulary.json";
import { checkAnswer, conjugate, phrase, subjects } from "./language";
export const MAX_FLOORS = 3;
export function newSave(): Save {
  return {
    version: 2,
    learner: freshLearner(),
    run: null,
    history: [],
    settings: { muted: false, captions: false, translations: true },
    migrated: false,
  };
}
export function createRun(
  seed = Math.floor(Math.random() * 0x100000000),
  learner: Learner = freshLearner(),
  kit: Kit = "frost",
): Run {
  const level = generateFloor(seed, 1),
    support: Run["support"] = {};
  for (const item of [...grammar, ...vocab])
    support[item.id] = supportFor(learner, item.id);
  const run: Run = {
    seed,
    ...level,
    x: 3,
    y: 5,
    previousX: 3,
    previousY: 5,
    floor: 1,
    hp: 18,
    maxHp: 18,
    mana: 6,
    maxMana: 6,
    potions: 2,
    ether: 1,
    bombs: 1,
    gold: 6,
    relics: [],
    knownSpells: ["strike", "shield", "heal"],
    kit,
    turns: 0,
    kills: 0,
    status: "playing",
    log: "Chaque détour a son prix. Choisissez votre chemin.",
    logEn:
      "Choose a route. Treasure strengthens your build; enemies and detours use supplies. Reach the stairs, then the Queen on floor 3.",
    events: [],
    startedAt: Date.now(),
    support,
    tier: learner.tier,
    exitSide: seed % 2 ? "left" : "right",
    gateRead: false,
    gateHeard: false,
    gateAssisted: false,
  };
  grantRelic(
    run,
    kit === "frost" ? "frost" : kit === "blood" ? "blood" : "mirror",
  );
  return run;
}
export function currentRoom(r: Run): Room | undefined {
  return r.rooms.find((room) => room.x === r.x && room.y === r.y);
}
export function combatRoom(r: Run): Room | undefined {
  const room = currentRoom(r);
  return room?.enemy && room.enemy.hp > 0 ? room : undefined;
}
export function message(r: Run, fr: string, en: string) {
  r.log = fr;
  r.logEn = en;
}
export function learn(s: Save, id: string, kind: Evidence["kind"]) {
  if (!s.run) return;
  const at = Date.now();
  record(s.learner, id, kind, at);
  s.run.events.push({ id, kind, at });
  s.run.events = s.run.events.slice(-10000);
}
export function move(r: Run, dx: number, dy: number): boolean {
  if (
    r.status !== "playing" ||
    combatRoom(r) ||
    Math.abs(dx) + Math.abs(dy) !== 1
  )
    return false;
  const nx = r.x + dx,
    ny = r.y + dy;
  if (r.layout[ny]?.[nx] !== ".") return false;
  r.previousX = r.x;
  r.previousY = r.y;
  r.x = nx;
  r.y = ny;
  r.turns++;
  delete r.challenge;
  const room = currentRoom(r);
  if (room?.enemy && room.enemy.hp > 0)
    message(
      r,
      "Une présence bloque le passage. Observez son prochain geste.",
      "An enemy blocks your path. Its next attack is shown before you commit. Spells and items take a turn; translations do not.",
    );
  else if (room && !room.cleared)
    message(r, content.rooms[room.type].fr, content.rooms[room.type].en);
  return true;
}
export function enemyIntent(r: Run) {
  const enemy = combatRoom(r)?.enemy;
  if (!enemy) return null;
  const data = content.enemies.find((e) => e.id === enemy.kind)!;
  const i = enemy.turn % data.attacks.length;
  return {
    damage: enemy.frozen > 0 ? 0 : data.attacks[i],
    fr: enemy.frozen > 0 ? "L’ennemi est gelé." : data.intents[i],
    en:
      enemy.frozen > 0
        ? `Frozen: ${enemy.frozen} safe turn(s) remaining.`
        : data.intentEnglish[i],
  };
}
function resolveTurn(s: Save, blocked = false) {
  const r = s.run!,
    room = combatRoom(r);
  r.turns++;
  if (room?.enemy) {
    const e = room.enemy;
    const damage = enemyIntent(r)!.damage;
    if (e.frozen > 0) e.frozen--;
    else if (!blocked) r.hp = Math.max(0, r.hp - damage);
    e.turn++;
  }
  if (r.hp === 0) {
    r.status = "dead";
    delete r.challenge;
    message(
      r,
      "Votre aventure s’arrête ici. Les mots, eux, restent.",
      "This character and their equipment are lost. Your language records remain.",
    );
    finish(s);
  }
}
function rewardKill(r: Run, room: Room) {
  const e = room.enemy;
  if (!e || e.hp > 0 || room.cleared) return;
  room.cleared = true;
  r.kills++;
  const gold = room.type === "enemy" ? 5 + r.floor : 8 + r.floor;
  r.gold += gold;
  const mana = r.relics.includes("reservoir") ? 2 : 1;
  r.mana = Math.min(r.maxMana, r.mana + mana);
  message(
    r,
    `L’ennemi tombe. +${gold} pièces, +${mana} mana.`,
    `Victory: +${gold} gold, +${mana} mana. Health does not refill. ${room.type === "gate" ? "The stairs are now accessible." : room.type === "boss" ? "The final doors are free." : "Continue, rest, or spend your reward."}`,
  );
}
export function beginChallenge(s: Save, id: string): boolean {
  const r = s.run;
  if (
    !r ||
    r.status !== "playing" ||
    !combatRoom(r) ||
    !r.knownSpells.includes(id)
  )
    return false;
  const spell = encounters.spells.find((spell) => spell.id === id);
  if (!spell || r.mana < spell.cost) return false;
  const support = r.support[spell.grammarId] ?? 0;
  const people =
    support === 0 ? [3, 4] : support === 1 ? [0, 3, 4] : [0, 1, 2, 3, 4, 5];
  const person = people[(r.seed + r.turns) % people.length];
  const target = conjugate(spell.verbId, person),
    subject = phrase(spell.verbId, person).startsWith("j’")
      ? "j’"
      : subjects[person];
  const forms = [
    ...new Set([
      conjugate(spell.verbId, (person + 1) % 6),
      conjugate(spell.verbId, (person + 2) % 6),
      conjugate(spell.verbId, (person + 3) % 6),
    ]),
  ].filter((t) => t !== target);
  const extras =
    support === 0
      ? forms.slice(0, 1)
      : [...forms.slice(0, support === 1 ? 2 : 3), subjects[(person + 2) % 6]];
  const tiles = shuffle(
    [subject, target, ...extras],
    random((r.seed + r.turns * 971 + id.length * 13) >>> 0),
  );
  r.challenge = {
    spell: id,
    person,
    tiles,
    selected: [],
    assisted: false,
    attempts: 0,
  };
  learn(s, spell.grammarId, "seen");
  return true;
}
export function helpChallenge(s: Save) {
  const c = s.run?.challenge;
  if (!c) return;
  if (!c.assisted)
    learn(
      s,
      encounters.spells.find((spell) => spell.id === c.spell)!.grammarId,
      "hint",
    );
  c.assisted = true;
}
export function expectedAnswer(c: Challenge) {
  return phrase(
    encounters.spells.find((spell) => spell.id === c.spell)!.verbId,
    c.person,
  );
}
export function cast(s: Save, answer: string): boolean {
  const r = s.run,
    c = r?.challenge,
    room = r && combatRoom(r);
  if (!r || !c || !room?.enemy || r.status !== "playing") return false;
  const spell = encounters.spells.find((spell) => spell.id === c.spell)!;
  if (r.mana < spell.cost) return false;
  const result = checkAnswer(answer, expectedAnswer(c));
  if (!result.correct) {
    learn(s, spell.grammarId, "failed");
    c.attempts++;
    message(
      r,
      `On dit « ${expectedAnswer(c)} ».`,
      `Correction: ${expectedAnswer(c)}. ${grammar.find((g) => g.id === spell.grammarId)!.english}`,
    );
    if ((r.support[spell.grammarId] ?? 0) === 0) {
      r.logEn +=
        " Guided attempt: no turn, mana or health lost. Correct the formula and try again.";
      return false;
    }
    r.logEn +=
      " The spell fizzles and your turn passes. You can always reveal the answer for free before casting.";
    r.mana -= spell.cost;
    delete r.challenge;
    resolveTurn(s);
    return true;
  }
  if (!c.assisted && c.attempts === 0) learn(s, spell.grammarId, "produced");
  r.mana -= spell.cost;
  const enemy = room.enemy;
  let damage = 0,
    blocked = false;
  if (c.spell === "strike") damage = 3 + (r.relics.includes("ember") ? 1 : 0);
  if (c.spell === "shield") {
    blocked = true;
    damage = 2 + (r.relics.includes("mirror") ? 2 : 0);
  }
  if (c.spell === "heal") r.hp = Math.min(r.maxHp, r.hp + 6);
  if (c.spell === "frost") {
    damage = 2;
    enemy.frozen = 2;
  }
  if (c.spell === "drain") {
    damage = 4;
    r.hp = Math.min(r.maxHp, r.hp + 3);
  }
  enemy.hp = Math.max(0, enemy.hp - damage);
  message(
    r,
    `« ${expectedAnswer(c)} » — ${spell.name} !`,
    `${spell.name}: ${damage ? `${damage} damage. ` : ""}${result.accentNote ? "Accents: " + expectedAnswer(c) + ". " : ""}${blocked ? "Attack blocked." : c.spell === "heal" ? "6 health restored before the enemy attack." : ""}`,
  );
  delete r.challenge;
  rewardKill(r, room);
  resolveTurn(s, blocked);
  return true;
}
export function useItem(s: Save, item: "potion" | "ether" | "bomb"): boolean {
  const r = s.run;
  if (!r || r.status !== "playing") return false;
  const room = combatRoom(r);
  if (item === "potion") {
    if (!r.potions || r.hp === r.maxHp) return false;
    r.potions--;
    r.hp = Math.min(r.maxHp, r.hp + (r.relics.includes("flask") ? 9 : 6));
    message(
      r,
      "Vous buvez une potion.",
      "Health restored. Using an item in combat gives the enemy a turn.",
    );
  }
  if (item === "ether") {
    if (!r.ether || r.mana === r.maxMana) return false;
    r.ether--;
    r.mana = Math.min(r.maxMana, r.mana + 4);
    message(
      r,
      "L’éther ravive votre magie.",
      "4 mana restored. Using an item in combat gives the enemy a turn.",
    );
  }
  if (item === "bomb") {
    if (!r.bombs || !room?.enemy) return false;
    r.bombs--;
    room.enemy.hp = Math.max(0, room.enemy.hp - 8);
    message(r, "La bombe éclate !", "8 damage. No spell formula needed.");
    rewardKill(r, room);
  }
  delete r.challenge;
  resolveTurn(s);
  return true;
}
export function retreat(s: Save): boolean {
  const r = s.run;
  if (!r || !combatRoom(r) || r.status !== "playing") return false;
  r.hp = Math.max(0, r.hp - 2);
  r.turns++;
  r.x = r.previousX;
  r.y = r.previousY;
  delete r.challenge;
  message(
    r,
    "Vous reculez dans le couloir. −2 vie.",
    "Retreated for 2 health. Enemy health and attack pattern are preserved; the enemy does not heal.",
  );
  if (r.hp === 0) {
    r.status = "dead";
    finish(s);
  }
  return true;
}
export function grantRelic(r: Run, id: string) {
  if (r.relics.includes(id) || !content.relics.some((relic) => relic.id === id))
    return false;
  r.relics.push(id);
  if (id === "frost" && !r.knownSpells.includes("frost"))
    r.knownSpells.push("frost");
  if (id === "blood" && !r.knownSpells.includes("drain"))
    r.knownSpells.push("drain");
  if (id === "reservoir") {
    r.maxMana += 2;
    r.mana += 2;
  }
  return true;
}
export function offers(r: Run, room: Room) {
  return shuffle(
    content.relics.filter((relic) => !r.relics.includes(relic.id)),
    random((r.seed + r.floor * 101 + room.x * 17 + room.y * 53) >>> 0),
  ).slice(0, 2);
}
export function claimTreasure(r: Run, id: string): boolean {
  const room = currentRoom(r);
  if (
    !room ||
    room.cleared ||
    !["treasure", "shrine"].includes(room.type) ||
    r.status !== "playing"
  )
    return false;
  if (room.type === "shrine" && r.hp <= 3) return false;
  if (id !== "supplies" && !offers(r, room).some((relic) => relic.id === id))
    return false;
  if (room.type === "shrine") r.hp -= 3;
  if (id === "supplies") {
    r.potions++;
    r.ether++;
  } else grantRelic(r, id);
  room.cleared = true;
  r.turns++;
  message(
    r,
    "Votre équipement change votre destin.",
    "Treasure claimed. Your equipment and supplies persist between floors, but are lost on death.",
  );
  return true;
}
export function rest(r: Run, choice: "health" | "mana"): boolean {
  const room = currentRoom(r);
  if (!room || room.type !== "camp" || room.cleared || r.status !== "playing")
    return false;
  if (choice === "health") r.hp = Math.min(r.maxHp, r.hp + 8);
  else r.mana = r.maxMana;
  room.cleared = true;
  r.turns++;
  message(
    r,
    "La fontaine s’éteint.",
    "This fountain is spent. You could choose health or mana, not both.",
  );
  return true;
}
export function buy(r: Run, item: "potion" | "ether" | "bomb"): boolean {
  const room = currentRoom(r),
    cost = item === "bomb" ? 10 : 8;
  if (
    !room ||
    room.type !== "merchant" ||
    r.status !== "playing" ||
    r.gold < cost ||
    room.purchases.includes(item)
  )
    return false;
  r.gold -= cost;
  room.purchases.push(item);
  if (item === "potion") r.potions++;
  if (item === "ether") r.ether++;
  if (item === "bomb") r.bombs++;
  r.turns++;
  message(
    r,
    "Marché conclu.",
    "Supplies purchased. Each item is stocked once per merchant.",
  );
  return true;
}
export function caretaker(s: Save, choice: "blue" | "green"): boolean {
  const r = s.run,
    room = r && currentRoom(r);
  if (
    !r ||
    !room ||
    room.type !== "npc" ||
    room.cleared ||
    r.status !== "playing"
  )
    return false;
  if (choice === "blue") {
    r.potions++;
    learn(s, "bleue", "understood");
    message(
      r,
      "« La bleue soigne. Bonne route ! »",
      "You understood the clue and gained a health potion.",
    );
  } else {
    r.hp = Math.max(1, r.hp - 2);
    learn(s, "poison", "failed");
    message(
      r,
      "« La verte est un poison ! »",
      "The green one is poison. You lose up to 2 health, but survive this learning encounter.",
    );
  }
  room.cleared = true;
  r.turns++;
  return true;
}
export function leaveRoom(r: Run) {
  if (!combatRoom(r))
    message(
      r,
      "Vous reprenez votre route.",
      "You can return to this room later if it has not been used.",
    );
}
export function chooseDoor(s: Save, side: "left" | "right"): boolean {
  const r = s.run,
    room = r && currentRoom(r);
  if (
    !r ||
    r.status !== "playing" ||
    !room ||
    !["gate", "boss"].includes(room.type) ||
    !room.cleared ||
    (!r.gateRead && !r.gateHeard)
  )
    return false;
  const id = r.exitSide === "left" ? "gauche" : "droite";
  if (side !== r.exitSide) {
    learn(s, id, "failed");
    r.hp = Math.max(1, r.hp - 2);
    r.gateRead = true;
    r.gateAssisted = true;
    message(
      r,
      "Une impasse ! Écoutez encore.",
      "Wrong door: a trap costs up to 2 health. Read the correction and try again.",
    );
    return false;
  }
  if (!r.gateAssisted) learn(s, id, "understood");
  r.turns++;
  if (r.floor === MAX_FLOORS) {
    r.status = "won";
    message(
      r,
      "L’aube vous attend.",
      "You escaped the three floors. Your learning survives the next expedition.",
    );
    finish(s);
    return true;
  }
  r.floor++;
  const level = generateFloor(r.seed, r.floor);
  r.layout = level.layout;
  r.rooms = level.rooms;
  r.x = 3;
  r.y = 5;
  r.previousX = 3;
  r.previousY = 5;
  r.exitSide = (r.seed + r.floor) % 2 ? "left" : "right";
  r.gateRead = false;
  r.gateHeard = false;
  r.gateAssisted = false;
  delete r.challenge;
  message(
    r,
    `Étage ${r.floor}. La descente continue.`,
    "Health, mana, gold, equipment and unused supplies carry over. Enemies are stronger on this floor.",
  );
  return true;
}
export function finish(s: Save) {
  const r = s.run;
  if (
    !r ||
    r.status === "playing" ||
    s.history.some((h) => h.at === r.startedAt)
  )
    return;
  const unique = (a: string[]) => [...new Set(a)],
    previous = new Set(s.history.flatMap((h) => h.newWords));
  s.history.unshift({
    won: r.status === "won",
    at: r.startedAt,
    turns: r.turns,
    floor: r.floor,
    kit: r.kit,
    newWords: unique(
      r.events.filter((e) => e.kind === "seen").map((e) => e.id),
    ).filter((id) => !previous.has(id)),
    struggled: unique(
      r.events
        .filter((e) => e.kind === "failed" || e.kind === "hint")
        .map((e) => e.id),
    ),
    mistake: r.events.find(
      (e) => e.kind === "failed" && e.id.startsWith("present-"),
    )?.id,
  });
  s.history = s.history.slice(0, 30);
}
