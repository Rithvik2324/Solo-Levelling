import assert from "node:assert/strict";
import test from "node:test";
import { archiveLifeEntry, createLifeEntry, createLifeQuestDraft, isLifeModuleId, listLifeEntries, listLifeQuestDrafts, updateLifeEntry, validateLifeEntry } from "@/lib/life-module-dev-store";

test("development module records support create, edit, complete, and archive per session", () => {
  const input = validateLifeEntry({ title: "Evening mobility", kind: "Mobility", date: "2026-10-12", description: "Light session", fields: { durationMinutes: 20 } });
  assert.equal(input.error, null);
  assert.ok(input.value);
  const entry = createLifeEntry("test-session-a", "fitness", input.value);
  assert.equal(listLifeEntries("test-session-a", "fitness").length, 1);
  assert.equal(listLifeEntries("test-session-b", "fitness").length, 0);
  assert.equal(updateLifeEntry("test-session-a", "fitness", entry.id, { status: "done" })?.status, "done");
  assert.equal(archiveLifeEntry("test-session-a", "fitness", entry.id)?.status, "archived");
  assert.equal(listLifeEntries("test-session-a", "fitness").length, 0);
});

test("development module validation rejects invalid dates and structured payloads", () => {
  assert.ok(validateLifeEntry({ title: "bad date", kind: "Sleep", date: "2026-02-31" }).error);
  assert.ok(validateLifeEntry({ title: "nested data", kind: "Journal", fields: { unsafe: { body: "x" } } }).error);
  assert.equal(isLifeModuleId("finance"), true);
  assert.equal(isLifeModuleId("mind"), true);
});

test("dated life records can produce isolated, idempotent development quest drafts", () => {
  const sessionId = "test-quest-draft-session";
  const parsed = validateLifeEntry({ title: "Chemistry revision", kind: "Training session", date: "2026-10-20" });
  assert.ok(parsed.value);
  const entry = createLifeEntry(sessionId, "fitness", parsed.value);
  const first = createLifeQuestDraft(sessionId, "fitness", entry.id);
  const second = createLifeQuestDraft(sessionId, "fitness", entry.id);
  assert.ok(first.draft);
  assert.equal(first.draft.id, second.draft?.id);
  assert.equal(listLifeQuestDrafts(sessionId, "fitness").length, 1);
  assert.equal(listLifeQuestDrafts("other-session", "fitness").length, 0);
});
