import "server-only";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

type Statement = { get(...values: unknown[]): Record<string, unknown> | undefined; run(...values: unknown[]): { changes: number } };
type Database = { exec(sql: string): void; prepare(sql: string): Statement; close(): void };
let dataDirectory = process.env.AWAKENING_DATA_DIR || (process.env.NODE_TEST_CONTEXT ? join(tmpdir(), `awakening-test-${process.pid}`) : join(process.cwd(), ".awakening-data"));
let database: Database | undefined;

function db() {
  if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Local persistence requires Node.js 24 or newer (node:sqlite).");
  if (!database) {
    try {
      mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
      database = new DatabaseSync(join(dataDirectory, "awakening-dev.sqlite"));
      database.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS dev_sessions (namespace TEXT NOT NULL, session_id TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(namespace, session_id));");
    } catch (error) {
      database = undefined;
      throw new Error(`Local development storage could not be opened: ${error instanceof Error ? error.message : "unknown storage error"}`);
    }
  }
  return database;
}

export type Stored<T> = { value: T; revision: number; exists: boolean };
export function readDevState<T>(namespace: string, sessionId: string, initial: T): Stored<T> {
  try {
    const row = db().prepare("SELECT revision, payload FROM dev_sessions WHERE namespace = ? AND session_id = ?").get(namespace, sessionId);
    return row ? { value: JSON.parse(String(row.payload)) as T, revision: Number(row.revision), exists: true } : { value: initial, revision: 0, exists: false };
  } catch (error) { throw new Error(`Local development data could not be read: ${error instanceof Error ? error.message : "unknown storage error"}`); }
}

export function writeDevState<T>(namespace: string, sessionId: string, state: Stored<T>, value: T): Stored<T> {
  const connection = db();
  try {
    connection.exec("BEGIN IMMEDIATE");
    const payload = JSON.stringify(value);
    let result: { changes: number };
    if (state.exists) result = connection.prepare("UPDATE dev_sessions SET revision = revision + 1, payload = ?, updated_at = ? WHERE namespace = ? AND session_id = ? AND revision = ?").run(payload, new Date().toISOString(), namespace, sessionId, state.revision);
    else result = connection.prepare("INSERT OR IGNORE INTO dev_sessions(namespace, session_id, revision, payload, updated_at) VALUES (?, ?, 1, ?, ?)").run(namespace, sessionId, payload, new Date().toISOString());
    if (!result.changes) throw new Error("This session changed in another application process. Reload the page and retry; no data was overwritten.");
    connection.exec("COMMIT");
    return { value, revision: state.revision + 1, exists: true };
  } catch (error) {
    try { connection.exec("ROLLBACK"); } catch { /* transaction already closed */ }
    throw new Error(`Local development data could not be saved: ${error instanceof Error ? error.message : "unknown storage error"}`);
  }
}

export function getDevStateRevisions(sessionId: string, namespaces: string[]) {
  const connection = db();
  return Object.fromEntries(namespaces.map(namespace => [namespace, Number(connection.prepare("SELECT revision FROM dev_sessions WHERE namespace = ? AND session_id = ?").get(namespace, sessionId)?.revision ?? 0)]));
}

export function replaceDevStates<T>(sessionId: string, values: Record<string, T>, expectedRevisions?: Record<string, number>) {
  const connection = db();
  try {
    connection.exec("BEGIN IMMEDIATE");
    if (expectedRevisions) for (const namespace of Object.keys(values)) {
      const revision = Number(connection.prepare("SELECT revision FROM dev_sessions WHERE namespace = ? AND session_id = ?").get(namespace, sessionId)?.revision ?? 0);
      if (revision !== expectedRevisions[namespace]) throw new Error("Session data changed after the preview. Run the backup preview again; no data was replaced.");
    }
    for (const [namespace, value] of Object.entries(values)) connection.prepare("INSERT INTO dev_sessions(namespace, session_id, revision, payload, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(namespace, session_id) DO UPDATE SET revision = dev_sessions.revision + 1, payload = excluded.payload, updated_at = excluded.updated_at").run(namespace, sessionId, JSON.stringify(value), new Date().toISOString());
    connection.exec("COMMIT");
  } catch (error) {
    try { connection.exec("ROLLBACK"); } catch { /* transaction already closed */ }
    throw new Error(`Local development backup restore failed without replacing data: ${error instanceof Error ? error.message : "unknown storage error"}`);
  }
}

export function closeDevDatabaseForTests() { database?.close(); database = undefined; }
export function setDevDataDirectoryForTests(path: string) { closeDevDatabaseForTests(); dataDirectory = path; }
