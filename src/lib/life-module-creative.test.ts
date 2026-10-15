import assert from "node:assert/strict";
import test from "node:test";
import type { LifeModuleEntryRecord } from "@/lib/domain";
import { canTransitionContentStatus, createLifeEntry, createLifeQuestDraft, isLifeModuleId, listLifeEntries, validateLifeEntry } from "@/lib/life-module-dev-store";
import { filterLifeEntries, lifeEntryDeadline, practiceMinutesForSession, practiceSummary, repertoireProgress } from "@/lib/life-module-query";

test("practice timer calculations respect a paused countdown and whole minutes", () => {
  assert.equal(practiceMinutesForSession(1500, 600), 15);
  assert.equal(practiceMinutesForSession(1500, 1500), 0);
  assert.equal(practiceMinutesForSession(30, 0), 0);
});

test("guitar and flute keep separate practice histories and support session records", () => {
  const session = "music-session-" + Date.now();
  const guitar = validateLifeEntry({ title: "Chord changes", kind: "Practice session", date: "2026-10-12", fields: { durationMinutes: 25, difficulty: "intermediate", progressScore: 3 } }, "guitar");
  const flute = validateLifeEntry({ title: "Long tones", kind: "Practice session", date: "2026-10-12", fields: { durationMinutes: 30, difficulty: "easy" } }, "flute");
  assert.equal(guitar.error, null);
  assert.equal(flute.error, null);
  assert.ok(guitar.value && flute.value);
  createLifeEntry(session, "guitar", guitar.value);
  createLifeEntry(session, "flute", flute.value);
  assert.equal(listLifeEntries(session, "guitar").length, 1);
  assert.equal(listLifeEntries(session, "flute").length, 1);
  assert.equal(listLifeEntries(session + "-other", "guitar").length, 0);
  assert.equal(isLifeModuleId("guitar"), true);
  assert.equal(isLifeModuleId("flute"), true);
  assert.ok(validateLifeEntry({ title: "Bad rating", kind: "Song", fields: { progressScore: 8 } }, "guitar").error);
});

test("repertoire mastery counts only entries explicitly set to mastered", () => {
  const entries = [
    { id: "a", module: "guitar", kind: "Song", title: "Theme", description: "", status: "planned", fields: { masteryStatus: "mastered" }, createdAt: "", updatedAt: "" },
    { id: "b", module: "guitar", kind: "Technique", title: "Arpeggio", description: "", status: "done", fields: { masteryStatus: "learning" }, createdAt: "", updatedAt: "" },
    { id: "c", module: "guitar", kind: "Scale", title: "G major", description: "", status: "done", fields: {}, createdAt: "", updatedAt: "" }
  ] as LifeModuleEntryRecord[];
  assert.deepEqual(repertoireProgress(entries), { total: 1, mastered: 1, learning: 0 });
  assert.deepEqual(practiceSummary([{ ...entries[0], kind: "Practice session", status: "done", date: "2026-10-12", fields: { durationMinutes: 25 } }], "2026-10-06", 4), { sessions: 1, minutes: 25, targetSessions: 4 });
});

test("content pipeline validates forward transitions and rejects invalid metrics", () => {
  assert.equal(canTransitionContentStatus("idea", "planned"), true);
  assert.equal(canTransitionContentStatus("editing", "ready to publish"), true);
  assert.equal(canTransitionContentStatus("published", "editing"), false);
  assert.equal(canTransitionContentStatus("ready to publish", "published"), true);
  assert.ok(validateLifeEntry({ title: "New video", kind: "Video", fields: { pipelineStatus: "imaginary" } }, "content").error);
  assert.ok(validateLifeEntry({ title: "New video", kind: "Video", fields: { views: -2 } }, "content").error);
  assert.ok(validateLifeEntry({ title: "New video", kind: "Video", fields: { publicationDate: "2026-02-30" } }, "content").error);
});

test("content filters include platform, pipeline stage, deadline, and tag search", () => {
  const entries = [
    { id: "1", module: "content", kind: "Video", title: "Practice tips", description: "", date: "2026-10-20", status: "planned", fields: { platform: "YouTube", tags: "guitar,lesson", pipelineStatus: "editing" }, createdAt: "", updatedAt: "" },
    { id: "2", module: "content", kind: "Idea", title: "Breath routine", description: "", date: "2026-11-02", status: "planned", fields: { platform: "Instagram", tags: "flute", pipelineStatus: "idea" }, createdAt: "", updatedAt: "" }
  ] as LifeModuleEntryRecord[];
  assert.deepEqual(filterLifeEntries(entries, { subject: "YouTube", status: "editing", deadlineBefore: "2026-10-25", search: "lesson" }).map(entry => entry.id), ["1"]);
});

test("dated creative records create session-owned idempotent quest drafts", () => {
  const session = "creative-quest-" + Date.now();
  const parsed = validateLifeEntry({ title: "Film practice clip", kind: "Video", date: "2026-10-22" }, "content");
  assert.ok(parsed.value);
  const entry = createLifeEntry(session, "content", parsed.value);
  const first = createLifeQuestDraft(session, "content", entry.id);
  const retry = createLifeQuestDraft(session, "content", entry.id);
  assert.equal(first.draft?.id, retry.draft?.id);
  assert.equal(createLifeQuestDraft(session + "-other", "content", entry.id).error, "Add a date or deadline to this record before creating a quest.");
});

test("quest and calendar deadlines resolve module-specific date fields", () => {
  const career = { id: "career-deadline", module: "career", kind: "Job application", title: "Target role", description: "", status: "planned", fields: { followUpDate: "2026-10-19" }, createdAt: "", updatedAt: "" } as LifeModuleEntryRecord;
  const content = { ...career, module: "content", kind: "Video", fields: { publicationDate: "2026-10-21", dueDate: "2026-10-25" } } as LifeModuleEntryRecord;
  assert.equal(lifeEntryDeadline(career), "2026-10-19");
  assert.equal(lifeEntryDeadline(content), "2026-10-21");
  assert.equal(lifeEntryDeadline({ ...content, fields: { publicationDate: "invalid" }, date: "2026-10-22" }), "2026-10-22");
  const session = "career-deadline-quest-" + Date.now();
  const entry = createLifeEntry(session, "career", { title: career.title, kind: career.kind, description: "", fields: career.fields });
  const draft = createLifeQuestDraft(session, "career", entry.id);
  assert.equal(draft.draft?.dueDate, "2026-10-19");
});
