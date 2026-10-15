import assert from "node:assert/strict";
import test from "node:test";
import type { LifeModuleEntryRecord } from "@/lib/domain";
import { canTransitionApplicationStatus, createLifeEntry, createLifeQuestDraft, isLifeModuleId, listLifeEntries, validateLifeEntry } from "@/lib/life-module-dev-store";
import { careerProgress, filterLifeEntries } from "@/lib/life-module-query";

test("academics subject and topic records validate, edit, complete, and remain session-isolated", () => {
  const session = `academics-test-${Date.now()}`;
  const subject = validateLifeEntry({ title: "Algorithms", kind: "Subject" }, "academics");
  assert.equal(subject.error, null);
  const topic = validateLifeEntry({ title: "Graph traversal", kind: "Topic", date: "2026-10-20", fields: { subject: "Algorithms", studyMinutes: 45 } }, "academics");
  assert.equal(topic.error, null);
  assert.ok(validateLifeEntry({ title: "Missing subject", kind: "Exam", date: "2026-10-20" }, "academics").error);
  assert.ok(topic.value);
  createLifeEntry(session, "academics", topic.value);
  assert.equal(listLifeEntries(session, "academics").length, 1);
  assert.equal(listLifeEntries(`${session}-other`, "academics").length, 0);
  assert.equal(listLifeEntries(session, "academics")[0].fields.subject, "Algorithms");
  assert.equal(isLifeModuleId("academics"), true);
});

test("academic filters support subject, search, status, and deadline", () => {
  const rows = [
    { id: "a", module: "academics", kind: "Assignment", title: "Essay", description: "History paper", date: "2026-10-10", status: "planned", fields: { subject: "History" }, createdAt: "", updatedAt: "" },
    { id: "b", module: "academics", kind: "Assignment", title: "Lab", description: "Chemistry practical", date: "2026-10-30", status: "done", fields: { subject: "Chemistry" }, createdAt: "", updatedAt: "" }
  ] as LifeModuleEntryRecord[];
  assert.deepEqual(filterLifeEntries(rows, { subject: "History", deadlineBefore: "2026-10-15" }).map(row => row.id), ["a"]);
  assert.deepEqual(filterLifeEntries(rows, { search: "practical", status: "done" }).map(row => row.id), ["b"]);
});

test("application stage changes follow a forward-only pipeline", () => {
  assert.equal(canTransitionApplicationStatus("saved", "applied"), true);
  assert.equal(canTransitionApplicationStatus("assessment", "interview"), true);
  assert.equal(canTransitionApplicationStatus("interview", "applied"), false);
  assert.equal(canTransitionApplicationStatus("offer", "applied"), false);
  assert.equal(canTransitionApplicationStatus("offer", "offer"), true);
  assert.ok(validateLifeEntry({ title: "Application", kind: "Job application", fields: { pipelineStatus: "invented" } }, "career").error);
});

test("career summaries count only marked DSA progress and real dated follow-ups", () => {
  const rows = [
    { id: "1", module: "career", kind: "DSA problem", title: "Two Sum", description: "", status: "done", fields: { attempts: 2, revisionDate: "2026-10-12" }, createdAt: "", updatedAt: "" },
    { id: "2", module: "career", kind: "DSA problem", title: "Tree walk", description: "", status: "planned", fields: { attempts: 1, revisionDate: "2026-10-11" }, createdAt: "", updatedAt: "" },
    { id: "3", module: "career", kind: "Job application", title: "Engineer", description: "", status: "planned", fields: { pipelineStatus: "interview" }, createdAt: "", updatedAt: "" },
    { id: "4", module: "career", kind: "Interview round", title: "Technical", description: "", status: "planned", date: "2026-10-20", fields: {}, createdAt: "", updatedAt: "" }
  ] as LifeModuleEntryRecord[];
  assert.deepEqual(careerProgress(rows, "2026-10-12"), { solved: 1, revisionDue: 2, inProgress: 1, interviews: 1 });
});

test("academic quest draft retries return one session-owned draft", () => {
  const session = `academic-quest-${Date.now()}`;
  const parsed = validateLifeEntry({ title: "Calculus exam", kind: "Exam", date: "2026-11-01", fields: { subject: "Math" } }, "academics");
  assert.ok(parsed.value);
  const entry = createLifeEntry(session, "academics", parsed.value);
  const first = createLifeQuestDraft(session, "academics", entry.id);
  const retry = createLifeQuestDraft(session, "academics", entry.id);
  assert.equal(first.draft?.id, retry.draft?.id);
  assert.equal(first.draft?.module, "academics");
});
