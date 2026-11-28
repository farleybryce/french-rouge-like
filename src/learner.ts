export interface Item {
  seen: number;
  understood: number;
  producedCorrectly: number;
  failed: number;
  hintsUsed: number;
  repetitions: number;
  intervalDays: number;
  dueAt: number;
}
export interface Evidence {
  id: string;
  kind: "seen" | "understood" | "produced" | "failed" | "hint";
  at: number;
}
export interface Learner {
  items: Record<string, Item>;
  recent: Evidence[];
  tier: "A1" | "A2";
}
export const freshLearner = (): Learner => ({
  items: {},
  recent: [],
  tier: "A1",
});
export function record(
  learner: Learner,
  id: string,
  kind: Evidence["kind"],
  now = Date.now(),
) {
  const item = (learner.items[id] ??= {
    seen: 0,
    understood: 0,
    producedCorrectly: 0,
    failed: 0,
    hintsUsed: 0,
    repetitions: 0,
    intervalDays: 0,
    dueAt: now,
  });
  if (kind === "seen") item.seen++;
  if (kind === "understood") item.understood++;
  if (kind === "produced") item.producedCorrectly++;
  if (kind === "failed" || kind === "hint") {
    if (kind === "failed") item.failed++;
    else item.hintsUsed++;
    item.repetitions = 0;
    item.intervalDays = 0;
    item.dueAt = now + 10 * 60_000;
  }
  if (kind === "understood" || kind === "produced") {
    // Only one independent success per item per ten minutes changes the schedule.
    const last = learner.recent.findLast(
      (e) => e.id === id && e.kind !== "seen",
    );
    if (!last || now - last.at >= 10 * 60_000) {
      item.repetitions++;
      item.intervalDays =
        item.repetitions === 1
          ? 1
          : Math.min(90, Math.round(item.intervalDays * 2.2));
      item.dueAt = now + item.intervalDays * 86_400_000;
    }
  }
  learner.recent.push({ id, kind, at: now });
  learner.recent = learner.recent.slice(-200);
  const attempts = learner.recent
    .filter((e) =>
      ["produced", "understood", "failed", "hint"].includes(e.kind),
    )
    .slice(-20);
  if (attempts.length >= 12) {
    const accuracy =
      attempts.filter((e) => e.kind === "produced" || e.kind === "understood")
        .length / attempts.length;
    if (accuracy >= 0.85) learner.tier = "A2";
    else if (accuracy < 0.55) learner.tier = "A1";
  }
}
export function dueFirst(learner: Learner, ids: string[], now = Date.now()) {
  return [...ids].sort(
    (a, b) =>
      (learner.items[a]?.dueAt ?? now) - (learner.items[b]?.dueAt ?? now),
  );
}

// A run snapshots this value. Dungeon stats never depend on language performance.
export function supportFor(learner: Learner, id: string): 0 | 1 | 2 {
  const item = learner.items[id];
  if (!item) return 0;
  const recent = learner.recent
    .filter((e) => e.id === id && e.kind !== "seen")
    .slice(-12);
  const success = recent.filter(
    (e) => e.kind === "understood" || e.kind === "produced",
  ).length;
  const accuracy = recent.length ? success / recent.length : 0;
  if (
    item.producedCorrectly + item.understood >= 6 &&
    item.repetitions >= 2 &&
    accuracy >= 0.8
  )
    return 2;
  if (
    item.producedCorrectly + item.understood >= 3 &&
    item.repetitions >= 1 &&
    accuracy >= 0.65
  )
    return 1;
  return 0;
}
