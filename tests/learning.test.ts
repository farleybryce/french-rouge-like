import { describe, expect, it } from "vitest";
import { checkAnswer, conjugate, phrase } from "../src/language";
import { dueFirst, freshLearner, record } from "../src/learner";
import {
  attack,
  createRun,
  finish,
  layout,
  move,
  newSave,
} from "../src/engine";
import { parseSave } from "../src/persistence";

describe("French answers", () => {
  it("accepts omitted accents, ligatures, spacing, case and apostrophe style", () => {
    expect(checkAnswer(" VOUS ETES ", "vous êtes")).toEqual({
      correct: true,
      accentNote: true,
    });
    expect(checkAnswer("j' ai", "j’ai").correct).toBe(true);
    expect(checkAnswer("coeur", "cœur").correct).toBe(true);
    expect(checkAnswer("nous êtes", "nous sommes").correct).toBe(false);
  });
  it("generates regular present forms and all six irregular verb tables", () => {
    expect([0, 1, 2, 3, 4, 5].map((p) => conjugate("parler", p))).toEqual([
      "parle",
      "parles",
      "parle",
      "parlons",
      "parlez",
      "parlent",
    ]);
    expect([0, 1, 2, 3, 4, 5].map((p) => conjugate("finir", p))).toEqual([
      "finis",
      "finis",
      "finit",
      "finissons",
      "finissez",
      "finissent",
    ]);
    const tables = {
      etre: ["suis", "es", "est", "sommes", "êtes", "sont"],
      avoir: ["ai", "as", "a", "avons", "avez", "ont"],
      aller: ["vais", "vas", "va", "allons", "allez", "vont"],
      faire: ["fais", "fais", "fait", "faisons", "faites", "font"],
      pouvoir: ["peux", "peux", "peut", "pouvons", "pouvez", "peuvent"],
      vouloir: ["veux", "veux", "veut", "voulons", "voulez", "veulent"],
    };
    for (const [verb, expected] of Object.entries(tables))
      expect([0, 1, 2, 3, 4, 5].map((p) => conjugate(verb, p))).toEqual(
        expected,
      );
    expect(phrase("avoir", 0)).toBe("j’ai");
    expect(phrase("etre", 0)).toBe("je suis");
    expect(() => conjugate("absent", 0)).toThrow();
  });
});
describe("learning schedule", () => {
  it("distinguishes exposure from mastery and prevents repeated encounter farming", () => {
    const l = freshLearner();
    record(l, "porte", "seen", 0);
    expect(l.items.porte.repetitions).toBe(0);
    record(l, "porte", "understood", 1);
    expect(l.items.porte.intervalDays).toBe(1);
    record(l, "porte", "produced", 2);
    expect(l.items.porte.repetitions).toBe(1);
    record(l, "porte", "produced", 86_400_001);
    expect(l.items.porte.intervalDays).toBe(2);
  });
  it("brings hints and mistakes forward without treating an immediate retry as mastery", () => {
    const l = freshLearner();
    record(l, "porte", "hint", 0);
    record(l, "porte", "understood", 100);
    expect(l.items.porte.repetitions).toBe(0);
    expect(l.items.porte.hintsUsed).toBe(1);
    expect(l.items.porte.dueAt).toBe(600_000);
    record(l, "porte", "failed", 200);
    expect(l.items.porte.failed).toBe(1);
  });
  it("orders due items and adapts conservatively in both directions", () => {
    const l = freshLearner();
    record(l, "porte", "understood", 0);
    record(l, "cle", "failed", 0);
    expect(dueFirst(l, ["porte", "cle"], 1000)).toEqual(["cle", "porte"]);
    for (let i = 0; i < 12; i++)
      record(l, `word-${i}`, "understood", i * 700_000);
    expect(l.tier).toBe("A2");
    for (let i = 0; i < 15; i++) record(l, "porte", "failed", i * 700_000);
    expect(l.tier).toBe("A1");
  });
});
describe("dungeon and saves", () => {
  it("has reachable encounters and both exits", () => {
    const visited = new Set(["3,5"]),
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
        if (layout[y + dy]?.[x + dx] === "." && !visited.has(key)) {
          visited.add(key);
          queue.push([x + dx, y + dy]);
        }
      }
    }
    for (const key of ["3,4", "3,2", "2,1", "4,1", "1,3", "5,3"])
      expect(visited.has(key)).toBe(true);
    const r = createRun(1);
    expect(move(r, 1, 0)).toBe(false);
    expect(move(r, 0, -1)).toBe(true);
  });
  it("resolves shield, enemy tells, lethal blows and permadeath", () => {
    const r = createRun(1);
    attack(r, "shield", true);
    expect(r.hp).toBe(7);
    expect(r.enemyHp).toBe(5);
    attack(r, "strike", false);
    expect(r.hp).toBe(4);
    r.enemyHp = 2;
    attack(r, "strike", true);
    expect(r.hp).toBe(4);
    r.enemyHp = 6;
    r.hp = 1;
    attack(r, "strike", false);
    expect(r.status).toBe("dead");
    const s = newSave();
    s.run = r;
    finish(s);
    finish(s);
    expect(s.history).toHaveLength(1);
    s.run = createRun(2);
    expect(s.run.hp).toBe(7);
    expect(s.history).toHaveLength(1);
  });
  it("round-trips a run and rejects damaged or malicious imports", () => {
    const s = newSave();
    s.run = createRun(1);
    record(s.learner, "porte", "seen", 1);
    expect(parseSave(JSON.stringify(s))).toEqual(s);
    expect(() => parseSave('{"version":2}')).toThrow();
    const bad = structuredClone(s);
    bad.run!.hp = 999;
    expect(() => parseSave(JSON.stringify(bad))).toThrow();
    const invalid = structuredClone(s);
    invalid.run!.x = 0;
    expect(() => parseSave(JSON.stringify(invalid))).toThrow();
    expect(() => parseSave("x".repeat(2_000_001))).toThrow();
  });
});
