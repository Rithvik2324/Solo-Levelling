import assert from "node:assert/strict";
import test from "node:test";
import { habitSummary, localDateKey, levelForXp, progressionForXp, rankForLevel, xpProgress } from "@/lib/progression";
import { isValidIsoDate, validateQuestInput } from "@/lib/domain";
import { Quest } from "@/models";
import { calculateQuestXp } from "@/lib/quest-engine";

test("level thresholds are consistent at boundaries", () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(999), 1);
  assert.equal(levelForXp(1000), 2);
  assert.equal(levelForXp(2000), 3);
  assert.deepEqual(xpProgress(1050), { level: 2, totalXp: 1050, currentLevelXp: 1000, nextLevelXp: 2000, progressXp: 50, progressPercent: 5 });
});

test("player ranks follow server level thresholds", () => {
  assert.equal(rankForLevel(1), "E");
  assert.equal(rankForLevel(9), "E");
  assert.equal(rankForLevel(10), "D");
  assert.equal(rankForLevel(50), "S");
  assert.deepEqual(progressionForXp(39000), { ...xpProgress(39000), rank: "A" });
});

test("quest XP reward is server-calculated from difficulty and duration bands", () => {
  assert.equal(calculateQuestXp("easy", 1), 10);
  assert.equal(calculateQuestXp("normal", 30), 20);
  assert.equal(calculateQuestXp("hard", 31), 70);
  assert.equal(calculateQuestXp("elite", 10000), 200);
  assert.equal(calculateQuestXp("normal", Number.NaN), 20);
});

test("local date keys respect IANA timezone day boundaries", () => {
  assert.equal(localDateKey(new Date("2026-01-01T02:00:00.000Z"), "America/Los_Angeles"), "2025-12-31");
  assert.equal(localDateKey(new Date("2026-01-01T02:00:00.000Z"), "Asia/Kolkata"), "2026-01-01");
});

test("quest date validation rejects impossible dates and invalid XP rewards", () => {
  assert.equal(isValidIsoDate("2026-02-28"), true);
  assert.equal(isValidIsoDate("2026-02-29"), false);
  assert.deepEqual(validateQuestInput({ title: "Practice", category: "music", xpReward: 10001 }), ["XP reward must be a whole number from 0 to 10000."]);
});

test("quest schema rejects an XP reward outside its server-side bounds", async () => {
  await assert.rejects(() => new Quest({ title: "Invalid reward", category: "testing", xpReward: 10001 }).validate(), /xpReward/);
});

test("habit summary counts scheduled completions and breaks an incomplete streak", () => {
  const summary = habitSummary({
    weekdays: [1, 2, 3, 4, 5], restDays: [], today: "2026-01-07",
    logs: ["2026-01-05", "2026-01-06", "2026-01-07"].map(localDate => ({ localDate, status: "done" as const }))
  });
  assert.equal(summary.streak, 3);
  assert.equal(summary.completedThisWeek, 3);
  assert.equal(summary.plannedThisWeek, 3);
  assert.equal(summary.completionPercent, 100);
});

test("planned rest days do not count as scheduled missed days", () => {
  const summary = habitSummary({ weekdays: [1, 2, 3, 4, 5], restDays: [0], logs: [], today: "2026-01-04" });
  assert.equal(summary.plannedToday, false);
  assert.equal(summary.restToday, true);
});

test("an unfinished scheduled day keeps the previous streak alive until day-end", () => {
  const summary = habitSummary({ weekdays: [1, 2, 3, 4, 5], restDays: [], today: "2026-01-07", logs: ["2026-01-05", "2026-01-06"].map(localDate => ({ localDate, status: "done" as const })) });
  assert.equal(summary.streak, 2);
});
