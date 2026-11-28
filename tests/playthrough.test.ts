import { describe, expect, it } from "vitest";
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
  move,
  newSave,
  offers,
  rest,
  useItem,
} from "../src/engine";
import { parseSave } from "../src/persistence";
import type { Kit, Run } from "../src/types";
function route(r: Run, x: number, y: number): number[][] {
  const queue = [[[r.x, r.y]]],
    seen = new Set([`${r.x},${r.y}`]);
  while (queue.length) {
    const p = queue.shift()!,
      [cx, cy] = p[p.length - 1];
    if (cx === x && cy === y) return p.slice(1);
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [-1, 0],
      [0, 1],
    ]) {
      const nx = cx + dx,
        ny = cy + dy,
        key = `${nx},${ny}`;
      if (r.layout[ny]?.[nx] === "." && !seen.has(key)) {
        seen.add(key);
        queue.push([...p, [nx, ny]]);
      }
    }
  }
  throw new Error("Unreachable");
}
function play(seed: number, kit: Kit) {
  const s = newSave();
  s.run = createRun(seed, s.learner, kit);
  const r = s.run;
  const formula = (id: string) => {
    if (!beginChallenge(s, id)) throw new Error("Unavailable spell " + id);
    cast(s, expectedAnswer(r.challenge!));
  };
  const fight = () => {
    for (let n = 0; n < 100 && combatRoom(r) && r.status === "playing"; n++) {
      const e = combatRoom(r)!.enemy!,
        incoming = enemyIntent(r)!.damage,
        strike = 3 + (r.relics.includes("ember") ? 1 : 0);
      if (e.hp <= strike) {
        formula("strike");
        continue;
      }
      if (e.hp <= 8 && r.bombs) {
        useItem(s, "bomb");
        continue;
      }
      if (r.hp <= incoming + 2 && r.potions && r.hp < r.maxHp) {
        useItem(s, "potion");
        continue;
      }
      if (e.frozen > 0) {
        formula("strike");
        continue;
      }
      if (r.knownSpells.includes("frost") && r.mana >= 2 && e.hp >= 6) {
        formula("frost");
        continue;
      }
      if (
        r.knownSpells.includes("drain") &&
        r.mana >= 2 &&
        r.hp <= r.maxHp - 3
      ) {
        formula("drain");
        continue;
      }
      if (r.mana >= 1) {
        formula("shield");
        continue;
      }
      if (r.ether) {
        useItem(s, "ether");
        continue;
      }
      if (r.hp <= 8 && r.potions) {
        useItem(s, "potion");
        continue;
      }
      formula("strike");
    }
  };
  const walk = (x: number, y: number) => {
    for (let n = 0; n < 100 && r.status === "playing"; n++) {
      fight();
      if (r.status !== "playing" || (r.x === x && r.y === y)) return;
      if (r.hp <= 12 && r.potions) useItem(s, "potion");
      if (r.mana <= 2 && r.ether) useItem(s, "ether");
      const [nx, ny] = route(r, x, y)[0];
      move(r, nx - r.x, ny - r.y);
    }
  };
  for (let floor = 1; floor <= 3 && r.status === "playing"; floor++) {
    for (const type of ["treasure", "npc", "merchant", "camp"]) {
      const room = r.rooms.find((room) => room.type === type)!;
      walk(room.x, room.y);
      if (r.status !== "playing") break;
      if (type === "treasure") {
        const items = offers(r, room);
        const preferred = ["reservoir", "ember", "flask", "mirror"].find((id) =>
          items.some((i) => i.id === id),
        );
        claimTreasure(r, preferred ?? items[0].id);
      }
      if (type === "npc") caretaker(s, "blue");
      if (type === "merchant") {
        buy(r, "ether");
        if (r.gold >= 8) buy(r, "potion");
      }
      if (type === "camp") {
        if (r.mana < r.maxMana) rest(r, "mana");
        else if (r.hp < r.maxHp) rest(r, "health");
      }
    }
    if (r.status !== "playing") break;
    const gate = r.rooms.find((room) => ["gate", "boss"].includes(room.type))!;
    walk(gate.x, gate.y);
    fight();
    if (r.status !== "playing") break;
    r.gateRead = true;
    chooseDoor(s, r.exitSide);
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  }
  return r;
}
describe("complete procedural expeditions", () => {
  for (const kit of ["frost", "mirror", "blood"] as Kit[])
    for (const seed of [0, 1, 2, 19, 73, 1001, 65535, 0xffffffff]) {
      it(`${kit} can escape seed ${seed} using its tactical tools, normal resources and real movement`, () => {
        const r = play(seed, kit);
        expect(
          r.status,
          `${kit} seed ${seed}, floor ${r.floor}, ${r.hp} health, ${r.mana} mana`,
        ).toBe("won");
        expect(r.floor).toBe(3);
        expect(r.kills).toBeGreaterThanOrEqual(3);
      });
    }
});
