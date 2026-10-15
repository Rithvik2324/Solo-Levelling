import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { awardLocalActivity, getLocalProgression, localActivityKindFor } from "@/lib/local-progression";
import { closeDevDatabaseForTests, setDevDataDirectoryForTests } from "@/lib/dev-persistence";
import { completeLifeEntryWithLocalReward, createLifeEntry, listLifeEntries } from "@/lib/life-module-dev-store";
import { createDevelopmentHabit, recordDevelopmentHabitLog } from "@/lib/life-system-dev-store";

test("local XP is idempotent, session isolated, persistent, and unlocks achievements once", () => {
  const dir = mkdtempSync(join(tmpdir(), "awakening-local-xp-"));
  setDevDataDirectoryForTests(dir);
  try {
    const first = awardLocalActivity("xp-session-a", "fitness:workout-1", "workout", "Training");
    assert.equal(first.event.amount, 20);
    assert.equal(first.progression.totalXp, 20);
    assert.equal(first.unlocked.some(item => item.id === "first-step"), true);
    assert.equal(awardLocalActivity("xp-session-a", "fitness:workout-1", "workout", "Training").alreadyAwarded, true);
    for (let i = 2; i <= 5; i++) awardLocalActivity("xp-session-a", `fitness:workout-${i}`, "workout", `Training ${i}`);
    const fifth = getLocalProgression("xp-session-a");
    assert.equal(fifth.totalXp, 100);
    assert.equal(fifth.level, 1);
    assert.equal(fifth.achievements.filter(item => item.id === "training-five").length, 1);
    awardLocalActivity("xp-session-a", "music:practice-1", "music-practice", "Practice");
    closeDevDatabaseForTests();
    assert.equal(getLocalProgression("xp-session-a").totalXp, 110);
    assert.equal(getLocalProgression("xp-session-b").totalXp, 0);
  } finally { closeDevDatabaseForTests(); rmSync(dir, { recursive: true, force: true }); }
});

test("simultaneous duplicate submissions create one stable event", async () => {
  const dir = mkdtempSync(join(tmpdir(), "awakening-local-xp-race-"));
  setDevDataDirectoryForTests(dir);
  try {
    const results = await Promise.all([
      Promise.resolve().then(() => awardLocalActivity("xp-race", "habit:h1:2026-10-14", "habit", "Habit")),
      Promise.resolve().then(() => awardLocalActivity("xp-race", "habit:h1:2026-10-14", "habit", "Habit")),
    ]);
    assert.equal(results.filter(result => !result.alreadyAwarded).length, 1);
    assert.equal(getLocalProgression("xp-race").totalXp, 5);
  } finally { closeDevDatabaseForTests(); rmSync(dir, { recursive: true, force: true }); }
});

test("only explicit completed activity categories can map to local XP rewards", () => {
  assert.equal(localActivityKindFor("fitness", "Training session"), "workout");
  assert.equal(localActivityKindFor("fitness", "Martial arts technique"), "martial-arts");
  assert.equal(localActivityKindFor("guitar", "Practice session"), "music-practice");
  assert.equal(localActivityKindFor("flute", "Practice session"), "music-practice");
  assert.equal(localActivityKindFor("mind", "Journal entry"), null);
  assert.equal(localActivityKindFor("nutrition", "Meal log"), null);
  assert.equal(localActivityKindFor("finance", "Transaction"), null);
  assert.equal(localActivityKindFor("academics", "Assignment"), null);
});

test("eligible module and habit completion commit with their XP event and do not re-award", () => {
  const dir = mkdtempSync(join(tmpdir(), "awakening-xp-activity-"));
  setDevDataDirectoryForTests(dir);
  try {
    const session = "xp-atomic-session";
    const training = createLifeEntry(session, "fitness", { title: "Strength training", kind: "Training session", description: "", fields: { durationMinutes: 30 } });
    const completed = completeLifeEntryWithLocalReward(session, "fitness", training.id, { title: training.title, kind: training.kind, description: "", date: undefined, fields: training.fields }, "workout");
    assert.equal(completed?.entry.status, "done");
    assert.equal(completed?.reward.event.amount, 20);
    assert.equal(listLifeEntries(session, "fitness")[0].status, "done");
    assert.equal(completeLifeEntryWithLocalReward(session, "fitness", training.id, { title: training.title, kind: training.kind, description: "", fields: training.fields }, "workout")?.reward.alreadyAwarded, true);

    const habit = createDevelopmentHabit(session, { title: "Walk", description: "", weekdays: [1, 2, 3, 4, 5, 6, 0], restDays: [] });
    const logged = recordDevelopmentHabitLog(session, habit.id, "2026-10-14", "done", true);
    assert.ok(logged && "log" in logged);
    assert.equal(logged && "log" in logged ? logged.reward?.event.amount : undefined, 5);
    const repeated = recordDevelopmentHabitLog(session, habit.id, "2026-10-14", "done", true);
    assert.equal(repeated && "log" in repeated ? repeated.reward : null, null);
    assert.equal(getLocalProgression(session).totalXp, 25);
  } finally { closeDevDatabaseForTests(); rmSync(dir, { recursive: true, force: true }); }
});
