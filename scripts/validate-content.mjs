import { readFileSync } from "node:fs";
const read = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../src/content/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
const vocabulary = read("vocabulary"),
  verbs = read("verbs"),
  grammar = read("grammar"),
  encounters = read("encounters");
const fail = (message) => {
  throw new Error(message);
};
const text = (value, label) => {
  if (typeof value !== "string" || !value.trim())
    fail(`Missing text: ${label}`);
};
for (const [name, items] of Object.entries({ vocabulary, verbs, grammar })) {
  if (!Array.isArray(items) || !items.length)
    fail(`${name}: empty or invalid array`);
  const ids = new Set();
  for (const item of items) {
    text(item.id, `${name}.id`);
    if (ids.has(item.id)) fail(`Duplicate ${name}: ${item.id}`);
    ids.add(item.id);
    if (!["A1", "A2", "B1", "B2"].includes(item.tier))
      fail(`Invalid tier: ${item.id}`);
    if (name !== "verbs" && typeof item.needs_review !== "boolean")
      fail(`Missing review flag: ${item.id}`);
  }
}
for (const v of vocabulary) {
  text(v.lemma, v.id);
  text(v.english, v.id);
  if (
    !["noun", "verb", "phrase", "adjective", "preposition"].includes(
      v.partOfSpeech,
    )
  )
    fail(`Invalid word class: ${v.id}`);
  if (v.partOfSpeech === "noun" && !["m", "f"].includes(v.gender))
    fail(`Missing gender: ${v.id}`);
}
for (const v of verbs) {
  text(v.infinitive, v.id);
  text(v.english, v.id);
  if (v.forms) {
    if (v.forms.length !== 6) fail(`Six forms required: ${v.id}`);
    v.forms.forEach((f) => text(f, v.id));
  } else if (!["er", "ir"].includes(v.regular))
    fail(`Missing conjugation class: ${v.id}`);
}
for (const g of grammar) {
  if (!verbs.some((v) => v.id === g.verbId) || g.tense !== "present")
    fail(`Invalid grammar: ${g.id}`);
  text(g.explanation, g.id);
  text(g.english, g.id);
  for (const key of ["tipFr", "tipEn", "exampleEnglish"])
    text(g[key], `${g.id}.${key}`);
}
for (const token of encounters.caretaker.tokens) {
  if (typeof token.text !== "string" || !token.text.length)
    fail("Missing dialogue token");
  if (token.vocab && !vocabulary.some((v) => v.id === token.vocab))
    fail(`Unknown word: ${token.vocab}`);
}
for (const key of [
  "name",
  "greeting",
  "clue",
  "question",
  "success",
  "failure",
])
  text(encounters.caretaker[key], key);
const replyIds = new Set();
for (const r of encounters.caretaker.replies) {
  text(r.id, "reply id");
  if (replyIds.has(r.id)) fail("Duplicate reply");
  replyIds.add(r.id);
  text(r.fr, r.id);
  text(r.en, r.id);
  if (typeof r.correct !== "boolean") fail("Missing reply result");
}
if (encounters.caretaker.replies.filter((r) => r.correct).length !== 1)
  fail("Dialogue needs one correct response");
for (const d of Object.values(encounters.doors)) {
  text(d.fr, "door");
  text(d.en, "door");
  if (!vocabulary.some((v) => v.id === d.vocab)) fail("Invalid door reference");
}
const spellIds = new Set();
for (const s of encounters.spells) {
  if (spellIds.has(s.id)) fail("Duplicate spell");
  spellIds.add(s.id);
  for (const k of ["name", "description", "flavor"]) text(s[k], s.id);
  if (
    !verbs.some((v) => v.id === s.verbId) ||
    !grammar.some((g) => g.id === s.grammarId && g.verbId === s.verbId)
  )
    fail(`Invalid spell: ${s.id}`);
}
console.log(
  `Content valid: ${vocabulary.length} words/phrases, ${verbs.length} verbs, ${grammar.length} patterns, ${encounters.caretaker.replies.length} replies, ${spellIds.size} spells.`,
);

const dungeon = read("dungeon");
for (const [name, entries] of Object.entries({
  kits: dungeon.kits,
  relics: dungeon.relics,
  enemies: dungeon.enemies,
})) {
  if (!Array.isArray(entries) || !entries.length) fail(`Missing ${name}`);
  const seen = new Set();
  for (const entry of entries) {
    for (const field of ["id", "name", "english", "symbol"])
      text(entry[field], `${name}.${field}`);
    if (seen.has(entry.id)) fail(`Duplicate ${name}: ${entry.id}`);
    seen.add(entry.id);
    if (name !== "enemies") {
      text(entry.description, entry.id);
      text(entry.help, entry.id);
    } else {
      if (
        !Number.isInteger(entry.hp) ||
        entry.hp <= 0 ||
        !Number.isInteger(entry.hpPerFloor) ||
        entry.hpPerFloor < 0 ||
        !Array.isArray(entry.attacks) ||
        !entry.attacks.length ||
        !entry.attacks.every((n) => Number.isInteger(n) && n > 0)
      )
        fail(`Invalid enemy stats: ${entry.id}`);
      if (
        entry.intents?.length !== entry.attacks.length ||
        entry.intentEnglish?.length !== entry.attacks.length
      )
        fail(`Missing enemy intent translations: ${entry.id}`);
      entry.intents.forEach((line) => text(line, entry.id));
      entry.intentEnglish.forEach((line) => text(line, entry.id));
    }
  }
}
if (dungeon.floors.length !== 3)
  fail("Exactly three floors required by this engine");
for (const floor of dungeon.floors) {
  text(floor.name, "floor");
  text(floor.english, "floor translation");
}
for (const id of [
  "entry",
  "enemy",
  "treasure",
  "camp",
  "merchant",
  "shrine",
  "npc",
  "gate",
  "boss",
]) {
  const room = dungeon.rooms[id];
  if (!room) fail(`Missing room type: ${id}`);
  for (const field of ["fr", "en", "symbol"]) text(room[field], `room ${id}`);
}
for (const spell of encounters.spells) {
  text(spell.english, `spell translation: ${spell.id}`);
  if (!Number.isInteger(spell.cost) || spell.cost < 0)
    fail(`Invalid mana cost: ${spell.id}`);
  if (!["strike", "shield", "heal", "frost", "drain"].includes(spell.id))
    fail(`Implement a spell effect before adding ${spell.id}`);
}
console.log(
  `Dungeon valid: ${dungeon.floors.length} floors, ${dungeon.kits.length} builds, ${dungeon.relics.length} relics, ${dungeon.enemies.length} enemy types.`,
);
