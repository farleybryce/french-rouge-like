import { describe, expect, it } from "vitest";
import {
  beginChallenge,
  buy,
  cast,
  chooseDoor,
  claimTreasure,
  combatRoom,
  createRun,
  currentRoom,
  enemyIntent,
  expectedAnswer,
  finish,
  grantRelic,
  helpChallenge,
  move,
  newSave,
  offers,
  rest,
  retreat,
  useItem,
} from "../src/engine";
import { generateFloor } from "../src/dungeon";
import { freshLearner, record, supportFor } from "../src/learner";
import { parseSave } from "../src/persistence";
import type { Run, Save } from "../src/types";
function encounter(seed = 1): Save {
  const s = newSave();
  s.run = createRun(seed);
  const room = s.run.rooms.find((room) => room.type === "enemy")!;
  s.run.x = room.x;
  s.run.y = room.y;
  const neighbor = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ].find(([dx, dy]) => s.run!.layout[room.y + dy]?.[room.x + dx] === ".")!;
  s.run.previousX = room.x + neighbor[0];
  s.run.previousY = room.y + neighbor[1];
  return s;
}
function correct(s: Save, spell: string) {
  expect(beginChallenge(s, spell)).toBe(true);
  expect(cast(s, expectedAnswer(s.run!.challenge!))).toBe(true);
}
function at(r: Run, type: string) {
  const room = r.rooms.find((room) => room.type === type)!;
  r.x = room.x;
  r.y = room.y;
  return room;
}
describe("procedural floors", () => {
  it("generates deterministic, varied, connected floors with every required room across 600 layouts", () => {
    const shapes = new Set<string>();
    for (let seed = 0; seed < 200; seed++)
      for (let floor = 1; floor <= 3; floor++) {
        const a = generateFloor(seed, floor);
        expect(generateFloor(seed, floor)).toEqual(a);
        shapes.add(a.layout.join(""));
        const seen = new Set(["3,5"]),
          queue = [[3, 5]];
        while (queue.length) {
          const [x, y] = queue.shift()!;
          for (const [dx, dy] of [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
          ]) {
            const key = `${x + dx},${y + dy}`;
            if (a.layout[y + dy]?.[x + dx] === "." && !seen.has(key)) {
              seen.add(key);
              queue.push([x + dx, y + dy]);
            }
          }
        }
        expect(a.rooms).toHaveLength(9);
        for (const room of a.rooms) expect(seen.has(room.id)).toBe(true);
        expect(a.rooms.filter((room) => room.type === "enemy")).toHaveLength(2);
        for (const type of [
          "treasure",
          "camp",
          "merchant",
          "shrine",
          "npc",
          floor === 3 ? "boss" : "gate",
        ])
          expect(a.rooms.filter((room) => room.type === type)).toHaveLength(1);
      }
    expect(shapes.size).toBeGreaterThan(20);
  });
  it("blocks wall/diagonal movement and prevents walking away from combat", () => {
    const s = encounter(),
      r = s.run!;
    expect(move(r, 1, 0)).toBe(false);
    expect(move(r, 1, 1)).toBe(false);
    r.x = 3;
    r.y = 5;
    expect(move(r, 0, 1)).toBe(false);
    const next = [
      [0, -1],
      [1, 0],
      [-1, 0],
    ].find(([dx, dy]) => r.layout[r.y + dy]?.[r.x + dx] === ".")!;
    expect(move(r, ...(next as [number, number]))).toBe(true);
  });
});
describe("tactics and resources", () => {
  it("makes shield finite, reflects damage and gives the mirror build a distinct effect", () => {
    const s = encounter(),
      r = s.run!,
      e = combatRoom(r)!.enemy!;
    const before = e.hp;
    correct(s, "shield");
    expect(e.hp).toBe(before - 2);
    expect(r.hp).toBe(18);
    expect(r.mana).toBe(5);
    const mirror = encounter();
    grantRelic(mirror.run!, "mirror");
    correct(mirror, "shield");
    expect(combatRoom(mirror.run!)?.enemy?.hp ?? 0).toBe(
      Math.max(0, before - 4),
    );
    r.mana = 0;
    expect(beginChallenge(s, "shield")).toBe(false);
    expect(beginChallenge(s, "strike")).toBe(true);
  });
  it("freezes exactly two retaliations and supports a frost/strike combo", () => {
    const s = encounter(),
      r = s.run!,
      e = combatRoom(r)!.enemy!;
    correct(s, "frost");
    expect(e.frozen).toBe(1);
    expect(r.hp).toBe(18);
    correct(s, "strike");
    expect(r.hp).toBe(18);
    expect(e.frozen).toBe(0);
  });
  it("spends supplies and enemy turns, caps healing, and refuses unusable items", () => {
    const s = encounter(),
      r = s.run!;
    expect(useItem(s, "potion")).toBe(false);
    r.hp = 10;
    const incoming = enemyIntent(r)!.damage;
    expect(useItem(s, "potion")).toBe(true);
    expect(r.potions).toBe(1);
    expect(r.hp).toBe(16 - incoming);
    r.mana = 0;
    expect(useItem(s, "ether")).toBe(true);
    expect(r.mana).toBe(4);
    expect(r.ether).toBe(0);
    expect(useItem(s, "ether")).toBe(false);
    expect(useItem(s, "bomb")).toBe(true);
    expect(r.bombs).toBe(0);
  });
  it("retreat costs health, preserves enemy state, and can kill the character", () => {
    const s = encounter(),
      r = s.run!,
      room = combatRoom(r)!;
    correct(s, "strike");
    const enemy = structuredClone(room.enemy);
    const hp = r.hp;
    expect(retreat(s)).toBe(true);
    expect(r.hp).toBe(hp - 2);
    expect(room.enemy).toEqual(enemy);
    expect(combatRoom(r)).toBeUndefined();
    r.x = room.x;
    r.y = room.y;
    r.hp = 2;
    retreat(s);
    expect(r.status).toBe("dead");
    expect(s.history).toHaveLength(1);
    finish(s);
    expect(s.history).toHaveLength(1);
  });
  it("allows one fountain choice, one treasure choice, and one purchase of each stock item", () => {
    const r = createRun(8);
    at(r, "camp");
    r.hp = 5;
    r.mana = 0;
    expect(rest(r, "health")).toBe(true);
    expect(r.hp).toBe(13);
    expect(rest(r, "mana")).toBe(false);
    expect(r.mana).toBe(0);
    const chest = at(r, "treasure"),
      item = offers(r, chest)[0];
    expect(claimTreasure(r, item.id)).toBe(true);
    expect(r.relics).toContain(item.id);
    expect(claimTreasure(r, "supplies")).toBe(false);
    at(r, "merchant");
    r.gold = 30;
    expect(buy(r, "potion")).toBe(true);
    expect(buy(r, "potion")).toBe(false);
    expect(r.gold).toBe(22);
    at(r, "shrine");
    r.hp = 3;
    expect(claimTreasure(r, "supplies")).toBe(false);
    r.hp = 4;
    expect(claimTreasure(r, "supplies")).toBe(true);
    expect(r.hp).toBe(1);
  });
  it("requires the exit guardian, carries resources across floors and wins only on floor three", () => {
    const s = newSave();
    s.run = createRun(4);
    const r = s.run!;
    r.hp = 9;
    r.mana = 2;
    r.gold = 19;
    for (let floor = 1; floor <= 3; floor++) {
      expect(r.floor).toBe(floor);
      const gate = at(r, floor === 3 ? "boss" : "gate");
      r.gateRead = true;
      expect(chooseDoor(s, r.exitSide)).toBe(false);
      gate.enemy!.hp = 0;
      gate.cleared = true;
      expect(chooseDoor(s, r.exitSide)).toBe(true);
      expect(r.hp).toBe(9);
      expect(r.mana).toBe(2);
      expect(r.gold).toBe(19);
      expect(r.status).toBe(floor === 3 ? "won" : "playing");
    }
    expect(s.history[0].won).toBe(true);
  });
});
describe("language assistance stays separate from dungeon danger", () => {
  it("snapshots per-pattern support and never changes dungeon stats", () => {
    const learner = freshLearner();
    for (let i = 0; i < 8; i++)
      record(learner, "present-faire", "produced", i * 86_400_000);
    expect(supportFor(learner, "present-faire")).toBe(2);
    expect(supportFor(learner, "present-etre")).toBe(0);
    const a = createRun(4),
      b = createRun(4, learner);
    expect(a.rooms).toEqual(b.rooms);
    expect(a.layout).toEqual(b.layout);
    expect(a.hp).toBe(b.hp);
    expect(b.support["present-faire"]).toBe(2);
    record(learner, "present-faire", "hint");
    expect(b.support["present-faire"]).toBe(2);
  });
  it("gives beginners a safe correction before committing a turn, without counting the retry as independent mastery", () => {
    const s = encounter(),
      r = s.run!;
    beginChallenge(s, "shield");
    const before = { hp: r.hp, mana: r.mana, turns: r.turns };
    expect(cast(s, "nous êtes")).toBe(false);
    expect({ hp: r.hp, mana: r.mana, turns: r.turns }).toEqual(before);
    expect(cast(s, expectedAnswer(r.challenge!))).toBe(true);
    expect(s.learner.items["present-etre"].failed).toBe(1);
    expect(s.learner.items["present-etre"].producedCorrectly).toBe(0);
  });
  it("provides free help at advanced levels and records assisted answers separately", () => {
    const s = encounter(),
      r = s.run!;
    r.support["present-etre"] = 2;
    beginChallenge(s, "shield");
    const before = structuredClone(r);
    helpChallenge(s);
    expect(r.hp).toBe(before.hp);
    expect(r.mana).toBe(before.mana);
    expect(r.turns).toBe(before.turns);
    cast(s, expectedAnswer(r.challenge!));
    expect(s.learner.items["present-etre"].hintsUsed).toBe(1);
    expect(s.learner.items["present-etre"].producedCorrectly).toBe(0);
    beginChallenge(s, "strike");
    r.support["present-faire"] = 2;
    const hp = r.hp;
    cast(s, "nonsense");
    expect(r.hp).toBeLessThan(hp);
  });
});
describe("save safety and permadeath", () => {
  it("round-trips a mid-combat save, including selected tiles and support", () => {
    const s = encounter();
    beginChallenge(s, "shield");
    s.run!.challenge!.selected = [0];
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });
  it("rejects corrupt maps, duplicate rooms, bogus relics, invalid tiles and impossible resources", () => {
    const s = encounter();
    beginChallenge(s, "shield");
    for (const change of [
      (r: Run) => (r.hp = 999),
      (r: Run) => (r.rooms[1] = r.rooms[0]),
      (r: Run) => (r.layout[1] = "......."),
      (r: Run) => r.relics.push("bogus"),
      (r: Run) => (r.challenge!.tiles[0] = "<script>bad</script>"),
    ]) {
      const copy = structuredClone(s);
      change(copy.run!);
      expect(() => parseSave(JSON.stringify(copy))).toThrow();
    }
    expect(() => parseSave('{"version":99}')).toThrow();
    expect(() => parseSave("x".repeat(2_000_001))).toThrow();
  });
  it("preserves the learner while a new run resets equipment, consumables and wounds", () => {
    const s = encounter();
    record(s.learner, "porte", "understood", 0);
    s.run!.hp = 0;
    s.run!.status = "dead";
    finish(s);
    s.run = createRun(5, s.learner, "blood");
    expect(s.learner.items.porte.understood).toBe(1);
    expect(s.history).toHaveLength(1);
    expect(s.run.hp).toBe(18);
    expect(s.run.relics).toEqual(["blood"]);
    expect(s.run.potions).toBe(2);
    expect(s.run.gold).toBe(6);
  });
});

import legacy from "./fixtures/v1.json";
it("migrates version 1 learning and history without pretending the old dungeon can resume", () => {
  const migrated = parseSave(JSON.stringify(legacy));
  expect(migrated.version).toBe(2);
  expect(migrated.run).toBeNull();
  expect(migrated.learner).toEqual(legacy.learner);
  expect(migrated.settings.muted).toBe(true);
  expect(migrated.settings.translations).toBe(true);
  expect(migrated.migrated).toBe(true);
  expect(migrated.history).toHaveLength(1);
  expect(parseSave(JSON.stringify(migrated))).toEqual(migrated);
});
it("reduces direction support from demonstrated comprehension as well as production", () => {
  const learner = freshLearner();
  for (let i = 0; i < 8; i++)
    record(learner, "droite", "understood", i * 86_400_000);
  expect(supportFor(learner, "droite")).toBe(2);
  expect(supportFor(learner, "gauche")).toBe(0);
});
