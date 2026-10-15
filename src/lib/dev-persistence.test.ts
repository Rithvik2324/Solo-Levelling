import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { closeDevDatabaseForTests, getDevStateRevisions, readDevState, replaceDevStates, setDevDataDirectoryForTests, writeDevState } from "@/lib/dev-persistence";
import { createLifeEntry, listLifeEntries } from "@/lib/life-module-dev-store";
import { createCommandRecord, validateCommandRecord } from "@/lib/life-system-dev-store";

test("SQLite state survives closing and reopening the store and remains session isolated", () => {
  const dir = mkdtempSync(join(tmpdir(), "awakening-restart-"));
  setDevDataDirectoryForTests(dir);
  try {
    const entry = createLifeEntry("persist-session-a", "mind", { title: "Private note", kind: "Journal entry", description: "keep", fields: { mood: "calm" } });
    const parsed = validateCommandRecord({ kind: "task", title: "Task", description: "", date: "2026-10-14", fields: { priority: "normal" } });
    assert.ok(parsed.value);
    createCommandRecord("persist-session-a", parsed.value!);
    closeDevDatabaseForTests(); // Simulate closing the app's database connection.
    assert.equal(listLifeEntries("persist-session-a", "mind")[0].id, entry.id);
    assert.equal(listLifeEntries("persist-session-b", "mind").length, 0);
  } finally { closeDevDatabaseForTests(); rmSync(dir, { recursive: true, force: true }); }
});

test("stale concurrent writes fail visibly and do not overwrite the committed state", () => {
  const dir = mkdtempSync(join(tmpdir(), "awakening-concurrency-"));
  setDevDataDirectoryForTests(dir);
  try {
    const initial = readDevState("concurrent", "same-session", { items: [] as string[] });
    const committed = writeDevState("concurrent", "same-session", initial, { items: ["first"] });
    assert.throws(() => writeDevState("concurrent", "same-session", initial, { items: ["stale"] }), /changed in another application process/);
    assert.deepEqual(readDevState("concurrent", "same-session", { items: [] }).value, committed.value);
  } finally { closeDevDatabaseForTests(); rmSync(dir, { recursive: true, force: true }); }
});

test("unavailable storage is surfaced instead of accepting a volatile write", () => {
  const dir = mkdtempSync(join(tmpdir(), "awakening-failure-"));
  const blocker = join(dir, "not-a-directory");
  writeFileSync(blocker, "file");
  setDevDataDirectoryForTests(blocker);
  try { assert.throws(() => readDevState("failure", "session", {}), /could not be read.*could not be opened/i); }
  finally { closeDevDatabaseForTests(); rmSync(dir, { recursive: true, force: true }); }
});

test("restore rejects changes made after preview and rolls back all categories on a failed write", () => {
  const dir = mkdtempSync(join(tmpdir(), "awakening-restore-"));
  setDevDataDirectoryForTests(dir);
  try {
    const sessionId = "restore-race";
    writeDevState("one", sessionId, { value: null, revision: 0, exists: false }, { rows: ["original"] });
    writeDevState("two", sessionId, { value: null, revision: 0, exists: false }, { rows: ["keep"] });
    const token = getDevStateRevisions(sessionId, ["one", "two"]);
    const first = readDevState("one", sessionId, { rows: [] as string[] });
    writeDevState("one", sessionId, first, { rows: ["changed after preview"] });
    assert.throws(() => replaceDevStates(sessionId, { one: { rows: ["restore"] }, two: { rows: [] } }, token), /changed after the preview/);
    assert.deepEqual(readDevState("two", sessionId, { rows: [] }).value, { rows: ["keep"] });
    const refreshed = getDevStateRevisions(sessionId, ["one", "two"]);
    assert.throws(() => replaceDevStates(sessionId, { one: { rows: ["restore"] }, two: { invalid: BigInt(1) } }, refreshed), /backup restore failed/i);
    assert.deepEqual(readDevState("one", sessionId, { rows: [] }).value, { rows: ["changed after preview"] });
  } finally { closeDevDatabaseForTests(); rmSync(dir, { recursive: true, force: true }); }
});
