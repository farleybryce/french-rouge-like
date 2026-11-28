import type { Evidence, Learner } from "./learner";
export interface LegacyRun {
  seed: number;
  x: number;
  y: number;
  hp: number;
  light: number;
  floor: number;
  turns: number;
  enemyHp: number;
  enemyTurn: number;
  npcDone: boolean;
  key: boolean;
  potionTaken: boolean;
  potionSide: "left" | "right";
  doorSide: "left" | "right";
  doorRevealed: boolean;
  heard: boolean;
  doorAssisted: boolean;
  status: "playing" | "won" | "dead";
  log: string;
  events: Evidence[];
  startedAt: number;
  spell?: string;
  person?: number;
  tiles?: string[];
  selected?: number[];
  assisted?: boolean;
}
export interface History {
  won: boolean;
  at: number;
  turns: number;
  newWords: string[];
  struggled: string[];
  mistake?: string;
}
export interface LegacySave {
  version: 1;
  learner: Learner;
  run: LegacyRun | null;
  history: History[];
  settings: { muted: boolean; captions: boolean };
}
