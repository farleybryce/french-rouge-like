import type { Evidence, Learner } from "./learner";
export type Support = 0 | 1 | 2;
export type RoomType =
  | "entry"
  | "enemy"
  | "treasure"
  | "camp"
  | "merchant"
  | "shrine"
  | "npc"
  | "gate"
  | "boss";
export type Kit = "frost" | "mirror" | "blood";
export interface Enemy {
  kind: "sentry" | "wraith" | "warden" | "boss";
  hp: number;
  maxHp: number;
  turn: number;
  frozen: number;
}
export interface Room {
  id: string;
  x: number;
  y: number;
  type: RoomType;
  cleared: boolean;
  enemy?: Enemy;
  purchases: string[];
}
export interface Challenge {
  spell: string;
  person: number;
  tiles: string[];
  selected: number[];
  assisted: boolean;
  attempts: number;
}
export interface Run {
  seed: number;
  floor: number;
  layout: string[];
  rooms: Room[];
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  potions: number;
  ether: number;
  bombs: number;
  gold: number;
  relics: string[];
  knownSpells: string[];
  kit: Kit;
  turns: number;
  kills: number;
  status: "playing" | "won" | "dead";
  log: string;
  logEn: string;
  events: Evidence[];
  startedAt: number;
  support: Record<string, Support>;
  tier: "A1" | "A2";
  exitSide: "left" | "right";
  gateRead: boolean;
  gateHeard: boolean;
  gateAssisted: boolean;
  challenge?: Challenge;
}
export interface History {
  won: boolean;
  at: number;
  turns: number;
  newWords: string[];
  struggled: string[];
  mistake?: string;
  floor?: number;
  kit?: Kit;
}
export interface Save {
  version: 2;
  learner: Learner;
  run: Run | null;
  history: History[];
  settings: { muted: boolean; captions: boolean; translations: boolean };
  migrated: boolean;
}
