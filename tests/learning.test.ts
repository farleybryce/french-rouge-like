import { describe, expect, it } from "vitest";
import { checkAnswer, conjugate, phrase } from "../src/language";
import { dueFirst, freshLearner, record } from "../src/learner";
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
