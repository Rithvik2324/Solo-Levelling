import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createLifeEntry, exportLifeEntries, replaceLifeEntries, updateLifeEntry } from "@/lib/life-module-dev-store";
import { createDevelopmentHabit, exportDevelopmentHabits, recordDevelopmentHabitLog, replaceDevelopmentHabits, validateDevelopmentHabit } from "@/lib/life-system-dev-store";
import { developmentBackupSchema, developmentBackupVersion, validateDevelopmentBackup } from "@/lib/dev-backup";
import { awardLocalActivity, exportLocalProgression } from "@/lib/local-progression";

const date = "2026-10-13T10:00:00.000Z";
function backup(records: unknown[], habits: unknown[] = []) { return { schema: developmentBackupSchema, version: developmentBackupVersion, exportedAt: date, records, habits, commandCenter: { records: [], dismissedRecommendations: {}, notifications: {}, milestones: [] }, questDrafts: [], localProgression: { events: [], achievements: [] } }; }

test("development backup validates records, rejects unexpected and progression fields, and enforces unique IDs", () => {
  const entry = createLifeEntry("backup-test-valid", "guitar", { title: "Practice", kind: "Practice session", description: "", fields: { durationMinutes: 25 } });
  const exported = exportLifeEntries("backup-test-valid");
  const valid = validateDevelopmentBackup(backup(exported));
  assert.equal(valid.errors.length, 0);
  assert.equal(valid.entries[0]?.id, entry.id);
  assert.ok(validateDevelopmentBackup({ ...backup(exported), unexpected: true }).errors.length);
  assert.ok(validateDevelopmentBackup(backup([{ ...exported[0], fields: { durationMinutes: 25, xp: 500 } }])).errors.length);
  assert.ok(validateDevelopmentBackup(backup([exported[0], exported[0]])).errors.length);
  assert.ok(validateDevelopmentBackup({ ...backup([]), version: 99 }).errors.length);
  const legacy = { schema: developmentBackupSchema, version: 1, exportedAt: date, records: exported };
  assert.equal(validateDevelopmentBackup(legacy).habits, undefined);
});

test("version 4 backup validates local progression with command, campaign, adaptive, habit, and draft categories", () => {
  const sessionId = "backup-v3-source";
  const entry = createLifeEntry(sessionId, "mind", { title: "Private reflection", kind: "Journal entry", description: "sensitive", date: "2026-10-14", fields: {} });
  const habit = createDevelopmentHabit(sessionId, { title: "Read", description: "", weekdays: [1], restDays: [] });
  recordDevelopmentHabitLog(sessionId, habit.id, "2026-10-12", "done");
  const command = { records: [{ id: "33333333-3333-4333-8333-333333333333", kind: "task", title: "Task", description: "", date: "2026-10-14", fields: { priority: "high" }, status: "todo", createdAt: date, updatedAt: date }], milestones: [{ id: "44444444-4444-4444-8444-444444444444", title: "Milestone", targetDate: "2026-10-20" }], dismissedRecommendations: { "2026-10-14": ["task:abc"] }, notifications: { "task:abc": { readAt: date } }, campaignDate: "2026-12-01" };
  const valid = validateDevelopmentBackup({ ...backup(exportLifeEntries(sessionId), exportDevelopmentHabits(sessionId)), commandCenter: command, questDrafts: [] });
  assert.equal(valid.errors.length, 0);
  assert.equal(valid.commandCenter?.records.length, 1);
  assert.equal(valid.commandCenter?.milestones.length, 1);
  assert.equal(valid.habits?.[0].logs[0].status, "done");
  assert.deepEqual(valid.localProgression, { events: [], achievements: [] });
  const v3 = { ...backup([], []), version: 3 }; delete (v3 as Record<string, unknown>).localProgression;
  assert.equal(validateDevelopmentBackup(v3).errors.length, 0);
  const before = exportLifeEntries("backup-v3-target");
  const invalid = validateDevelopmentBackup({ ...backup(exportLifeEntries(sessionId)), commandCenter: { ...command, records: [{ ...command.records[0], status: "unknown" }] } });
  assert.ok(invalid.errors.length > 0);
  assert.deepEqual(exportLifeEntries("backup-v3-target"), before);
  void entry;
});

test("version 4 backup retains validated local XP events and rejects forged rewards", () => {
  const sessionId = "backup-local-xp";
  const practice = createLifeEntry(sessionId, "guitar", { title: "Practice", kind: "Practice session", description: "", fields: {} });
  updateLifeEntry(sessionId, "guitar", practice.id, { title: practice.title, kind: practice.kind, description: practice.description, fields: practice.fields, status: "done" });
  awardLocalActivity(sessionId, `guitar:${practice.id}`, "music-practice", "Practice session");
  const payload = { ...backup(exportLifeEntries(sessionId)), localProgression: exportLocalProgression(sessionId) };
  const checked = validateDevelopmentBackup(payload);
  assert.equal(checked.errors.length, 0);
  assert.equal(checked.localProgression?.events[0].amount, 10);
  const tampered = structuredClone(payload);
  tampered.localProgression.events[0].amount = 5000;
  assert.ok(validateDevelopmentBackup(tampered).errors.length > 0);
  assert.ok(validateDevelopmentBackup({ ...payload, records: [] }).errors.length > 0);
});

test("development backup restore replaces only the target browser session", () => {
  const source = createLifeEntry("backup-test-source", "fitness", { title: "Workout", kind: "Workout", description: "", fields: {} });
  createLifeEntry("backup-test-target", "nutrition", { title: "Meal", kind: "Meal", description: "", fields: {} });
  const validated = validateDevelopmentBackup(backup(exportLifeEntries("backup-test-source")));
  assert.equal(validated.errors.length, 0);
  replaceLifeEntries("backup-test-target", validated.entries);
  assert.deepEqual(exportLifeEntries("backup-test-target").map(row => row.id), [source.id]);
  assert.deepEqual(exportLifeEntries("backup-test-source").map(row => row.id), [source.id]);
});

test("development backup includes validated local habit history and restores only the target session", () => {
  const sourceId = "backup-habit-source"; const targetId = "backup-habit-target";
  const schedule = validateDevelopmentHabit({ title: "Walk", weekdays: [1, 3, 5], restDays: [0, 2, 4, 6] });
  assert.ok(schedule.value);
  const source = createDevelopmentHabit(sourceId, schedule.value!);
  recordDevelopmentHabitLog(sourceId, source.id, "2026-10-12", "done");
  const target = createDevelopmentHabit(targetId, { ...schedule.value!, title: "Old target habit" });
  const exported = exportDevelopmentHabits(sourceId);
  const checked = validateDevelopmentBackup(backup([], exported));
  assert.equal(checked.errors.length, 0);
  replaceDevelopmentHabits(targetId, checked.habits!);
  assert.deepEqual(exportDevelopmentHabits(targetId).map(habit => habit.id), [source.id]);
  assert.deepEqual(exportDevelopmentHabits(sourceId).map(habit => habit.id), [source.id]);
  assert.equal(exportDevelopmentHabits(targetId)[0].logs[0].status, "done");
  assert.ok(validateDevelopmentBackup(backup([], [{ ...exported[0], xp: 10 }])).errors.length);
  assert.ok(validateDevelopmentBackup(backup([], [{ ...exported[0], logs: [exported[0].logs[0], exported[0].logs[0]] }])).errors.length);
  assert.notEqual(target.id, source.id);
});
