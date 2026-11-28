import content from "./content/dungeon.json";
import type { Enemy, Room, RoomType } from "./types";
export function random(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (n + 0x6d2b79f5) >>> 0;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function makeEnemy(kind: Enemy["kind"], floor: number): Enemy {
  const data = content.enemies.find((e) => e.id === kind)!;
  const hp = data.hp + data.hpPerFloor * floor;
  return { kind, hp, maxHp: hp, turn: 0, frozen: 0 };
}
export function generateFloor(seed: number, floor: number) {
  const rng = random((seed + floor * 104729) >>> 0),
    grid = Array.from({ length: 7 }, () => Array(7).fill("#"));
  const visited = new Set(["3,5"]);
  const stack = [[3, 5]];
  grid[5][3] = ".";
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const choices = shuffle(
      [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ],
      rng,
    ).filter(
      ([dx, dy]) =>
        x + dx > 0 &&
        x + dx < 6 &&
        y + dy > 0 &&
        y + dy < 6 &&
        !visited.has(`${x + dx},${y + dy}`),
    );
    if (!choices.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = choices[0];
    grid[y + dy / 2][x + dx / 2] = ".";
    grid[y + dy][x + dx] = ".";
    visited.add(`${x + dx},${y + dy}`);
    stack.push([x + dx, y + dy]);
  }
  const walls: number[][] = [];
  for (let y = 1; y < 6; y++)
    for (let x = 1; x < 6; x++)
      if (
        grid[y][x] === "#" &&
        ((x % 2 === 0 && y % 2 === 1) || (x % 2 === 1 && y % 2 === 0))
      )
        walls.push([x, y]);
  for (const [x, y] of shuffle(walls, rng).slice(0, 2)) grid[y][x] = ".";
  const nodes = shuffle(
    [
      [1, 1],
      [3, 1],
      [5, 1],
      [1, 3],
      [3, 3],
      [5, 3],
      [1, 5],
      [5, 5],
    ],
    rng,
  );
  const exit = nodes.find(([, y]) => y === 1)!;
  const types: RoomType[] = shuffle(
    [
      "enemy",
      "enemy",
      "treasure",
      "camp",
      "merchant",
      "shrine",
      "npc",
    ] as RoomType[],
    rng,
  );
  const rooms: Room[] = [
    { id: "3,5", x: 3, y: 5, type: "entry", cleared: true, purchases: [] },
  ];
  for (const [x, y] of nodes) {
    const isExit = x === exit[0] && y === exit[1];
    const type = isExit ? (floor === 3 ? "boss" : "gate") : types.pop()!;
    const room: Room = {
      id: `${x},${y}`,
      x,
      y,
      type,
      cleared: false,
      purchases: [],
    };
    if (type === "enemy")
      room.enemy = makeEnemy(rng() < 0.5 ? "sentry" : "wraith", floor);
    if (type === "gate" || type === "boss")
      room.enemy = makeEnemy(type === "boss" ? "boss" : "warden", floor);
    rooms.push(room);
  }
  return { layout: grid.map((row) => row.join("")), rooms };
}
