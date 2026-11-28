import { newSave } from "./engine";
import { generateFloor } from "./dungeon";
import { parseLegacySave } from "./legacy";
import type { Save } from "./types";
import vocab from "./content/vocabulary.json";
import grammar from "./content/grammar.json";
import encounters from "./content/encounters.json";
import dungeon from "./content/dungeon.json";
import { conjugate, subjects } from "./language";
const ids = new Set(
  [...vocab, ...grammar].map((v) => v.id).concat(["dialogue-help"]),
);
// These guards validate untrusted imported JSON before any state is replaced.
const obj = (x: unknown): x is Record<string, any> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const num = (x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
const integer = (x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  num(x, min, max) && Number.isInteger(x);
const bool = (x: unknown) => typeof x === "boolean";
const event = (e: unknown) =>
  obj(e) &&
  ids.has(e.id) &&
  ["seen", "understood", "produced", "failed", "hint"].includes(e.kind) &&
  num(e.at);
const arrayOf = (x: unknown, allowed: Set<string>, max: number) =>
  Array.isArray(x) &&
  x.length <= max &&
  x.every((v) => typeof v === "string" && allowed.has(v)) &&
  new Set(x).size === x.length;
function invalid(): never {
  throw new Error("Sauvegarde invalide ou incompatible.");
}
export function parseSave(text: string): Save {
  if (text.length > 2_000_000) invalid();
  const s: unknown = JSON.parse(text);
  if (!obj(s)) invalid();
  if (s.version === 1) {
    const old = parseLegacySave(text),
      next = newSave();
    next.learner = old.learner;
    next.history = old.history;
    next.settings = { ...old.settings, translations: true };
    next.migrated = true;
    // The old single-floor world cannot be resumed in the new procedural rules.
    // Keep its learning evidence and a debrief in history; archive raw data in load().
    if (old.run && !next.history.some((h) => h.at === old.run!.startedAt))
      next.history.unshift({
        won: old.run.status === "won",
        at: old.run.startedAt,
        turns: old.run.turns,
        floor: 1,
        newWords: [
          ...new Set(
            old.run.events.filter((e) => e.kind === "seen").map((e) => e.id),
          ),
        ],
        struggled: [
          ...new Set(
            old.run.events
              .filter((e) => e.kind === "failed" || e.kind === "hint")
              .map((e) => e.id),
          ),
        ],
        mistake: old.run.events.find(
          (e) => e.kind === "failed" && e.id.startsWith("present-"),
        )?.id,
      });
    next.history = next.history.slice(0, 30);
    return next;
  }
  if (
    s.version !== 2 ||
    !obj(s.settings) ||
    !["muted", "captions", "translations"].every((k) => bool(s.settings[k])) ||
    !bool(s.migrated) ||
    !obj(s.learner) ||
    !obj(s.learner.items) ||
    !["A1", "A2"].includes(s.learner.tier) ||
    !Array.isArray(s.learner.recent) ||
    s.learner.recent.length > 200 ||
    !s.learner.recent.every(event)
  )
    invalid();
  for (const [id, i] of Object.entries(s.learner.items))
    if (
      !ids.has(id) ||
      !obj(i) ||
      ![
        "seen",
        "understood",
        "producedCorrectly",
        "failed",
        "hintsUsed",
        "repetitions",
      ].every((k) => integer(i[k])) ||
      !num(i.intervalDays, 0, 90) ||
      !num(i.dueAt)
    )
      invalid();
  if (
    !Array.isArray(s.history) ||
    s.history.length > 30 ||
    !s.history.every(
      (h) =>
        obj(h) &&
        bool(h.won) &&
        num(h.at) &&
        integer(h.turns) &&
        Array.isArray(h.newWords) &&
        h.newWords.every(
          (id: unknown) => typeof id === "string" && ids.has(id),
        ) &&
        Array.isArray(h.struggled) &&
        h.struggled.every(
          (id: unknown) => typeof id === "string" && ids.has(id),
        ) &&
        (h.mistake === undefined || grammar.some((g) => g.id === h.mistake)) &&
        (h.floor === undefined || integer(h.floor, 1, 3)) &&
        (h.kit === undefined || ["frost", "mirror", "blood"].includes(h.kit)),
    )
  )
    invalid();
  if (s.run !== null) {
    const r = s.run;
    if (
      !obj(r) ||
      !integer(r.seed, 0, 0xffffffff) ||
      !integer(r.floor, 1, 3) ||
      !integer(r.maxHp, 18, 18) ||
      !integer(r.hp, 0, r.maxHp) ||
      !integer(r.maxMana, 6, 8) ||
      !integer(r.mana, 0, r.maxMana) ||
      !["potions", "ether", "bombs"].every((k) => integer(r[k], 0, 99)) ||
      !integer(r.gold, 0, 9999) ||
      !integer(r.turns) ||
      !integer(r.kills) ||
      !["frost", "mirror", "blood"].includes(r.kit) ||
      !["playing", "won", "dead"].includes(r.status) ||
      !["A1", "A2"].includes(r.tier) ||
      !num(r.startedAt) ||
      !["log", "logEn"].every(
        (k) => typeof r[k] === "string" && r[k].length <= 2000,
      ) ||
      !["left", "right"].includes(r.exitSide) ||
      !["gateRead", "gateHeard", "gateAssisted"].every((k) => bool(r[k])) ||
      !Array.isArray(r.events) ||
      r.events.length > 10000 ||
      !r.events.every(event) ||
      !obj(r.support) ||
      Object.entries(r.support).some(
        ([id, v]) => !ids.has(id) || ![0, 1, 2].includes(v as number),
      )
    )
      invalid();
    if ((r.status === "dead") !== (r.hp === 0)) invalid();
    if (
      !arrayOf(r.relics, new Set(dungeon.relics.map((i) => i.id)), 6) ||
      !arrayOf(r.knownSpells, new Set(encounters.spells.map((i) => i.id)), 5)
    )
      invalid();
    const expectedSpells = [
      "strike",
      "shield",
      "heal",
      ...(r.relics.includes("frost") ? ["frost"] : []),
      ...(r.relics.includes("blood") ? ["drain"] : []),
    ];
    if (
      expectedSpells.length !== r.knownSpells.length ||
      expectedSpells.some((id) => !r.knownSpells.includes(id)) ||
      r.maxMana !== (r.relics.includes("reservoir") ? 8 : 6)
    )
      invalid();
    const generated = generateFloor(r.seed, r.floor);
    if (
      JSON.stringify(generated.layout) !== JSON.stringify(r.layout) ||
      !Array.isArray(r.rooms) ||
      r.rooms.length !== generated.rooms.length
    )
      invalid();
    for (const key of ["x", "y", "previousX", "previousY"])
      if (!integer(r[key], 1, 5)) invalid();
    if (
      r.layout[r.y][r.x] !== "." ||
      r.layout[r.previousY][r.previousX] !== "."
    )
      invalid();
    const seen = new Set();
    for (const room of r.rooms) {
      if (!obj(room) || seen.has(room.id)) invalid();
      seen.add(room.id);
      const original = generated.rooms.find((a) => a.id === room.id);
      if (
        !original ||
        room.x !== original.x ||
        room.y !== original.y ||
        room.type !== original.type ||
        !bool(room.cleared) ||
        !arrayOf(room.purchases, new Set(["potion", "ether", "bomb"]), 3)
      )
        invalid();
      if (original.enemy) {
        const e = room.enemy;
        if (
          !obj(e) ||
          e.kind !== original.enemy.kind ||
          e.maxHp !== original.enemy.maxHp ||
          !integer(e.hp, 0, e.maxHp) ||
          !integer(e.turn) ||
          !integer(e.frozen, 0, 2) ||
          room.cleared !== (e.hp === 0)
        )
          invalid();
      } else if (room.enemy !== undefined) invalid();
    }
    if (
      r.status === "won" &&
      (r.floor !== 3 ||
        !r.rooms.some((room: any) => room.type === "boss" && room.cleared))
    )
      invalid();
    if (r.challenge !== undefined) {
      const c = r.challenge,
        room = r.rooms.find((room: any) => room.x === r.x && room.y === r.y);
      const spell =
        obj(c) && encounters.spells.find((spell) => spell.id === c.spell);
      if (
        !obj(c) ||
        !spell ||
        !r.knownSpells.includes(c.spell) ||
        !room?.enemy ||
        room.enemy.hp <= 0 ||
        !integer(c.person, 0, 5) ||
        !bool(c.assisted) ||
        !integer(c.attempts) ||
        !Array.isArray(c.tiles) ||
        c.tiles.length < 2 ||
        c.tiles.length > 8 ||
        !Array.isArray(c.selected) ||
        c.selected.length > c.tiles.length ||
        !c.selected.every((i: unknown) => integer(i, 0, c.tiles.length - 1)) ||
        new Set(c.selected).size !== c.selected.length
      )
        invalid();
      const allowed = new Set([
        ...subjects,
        "j’",
        ...[0, 1, 2, 3, 4, 5].map((p) => conjugate(spell.verbId, p)),
      ]);
      if (
        !arrayOf(c.tiles, allowed, 8) ||
        !c.tiles.includes(conjugate(spell.verbId, c.person))
      )
        invalid();
    }
  }
  return s as unknown as Save;
}
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("le-donjon", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("save");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
export async function load(): Promise<Save> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction("save").objectStore("save").get("current");
    req.onsuccess = () => {
      try {
        const original = req.result;
        const parsed = original
          ? parseSave(JSON.stringify(original))
          : newSave();
        if (original?.version === 1) {
          const tx = d.transaction("save", "readwrite");
          tx.objectStore("save").put(original, "legacy-v1-backup");
          tx.oncomplete = () => resolve(parsed);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        } else resolve(parsed);
      } catch (e) {
        reject(e);
      }
    };
    req.onerror = () => reject(req.error);
  });
}
export async function save(s: Save) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction("save", "readwrite");
    tx.objectStore("save").put(structuredClone(s), "current");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function legacyBackup(): Promise<unknown> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d
      .transaction("save")
      .objectStore("save")
      .get("legacy-v1-backup");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
