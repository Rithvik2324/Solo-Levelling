"use client";

import { useState } from "react";

type Preview = { importCount: number; currentCount: number; warning: string; restoreToken: Record<string, number> };

export function DataSafetyPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [backup, setBackup] = useState<Record<string, unknown> | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function exportData() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/backup", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Export failed.");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `awakening-development-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
      setMessage(`Exported ${data.records.length} life-module records, ${(data.habits ?? []).length} local habits, ${(data.commandCenter?.records ?? []).length} tasks/events/focus/plans/reviews, ${(data.commandCenter?.milestones ?? []).length} milestones, and ${(data.questDrafts ?? []).length} local quest drafts. Authenticated quests, account habits, XP, and progression are not included.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Export failed. Check that the local server is running."); }
    finally { setBusy(false); }
  }

  async function previewImport() {
    if (!file) return;
    setBusy(true); setMessage(""); setPreview(null); setBackup(null);
    try {
      if (file.size > 3_000_000) throw new Error("Backup exceeds the 3 MB limit.");
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      const response = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) });
      const result = await response.json();
      if (!response.ok) throw new Error([result.error, ...(result.errors ?? [])].filter(Boolean).join(" "));
      setBackup(parsed); setPreview({ importCount: result.importCount, currentCount: result.currentCount, warning: result.warning, restoreToken: result.restoreToken });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Import preview failed."); }
    finally { setBusy(false); }
  }

  async function applyImport() {
    if (!backup || !preview || !window.confirm(`Replace ${preview.currentCount} current session records with ${preview.importCount} records from this backup? ${preview.warning}`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...backup, action: "replace", confirm: true, restoreToken: preview.restoreToken }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Restore failed.");
      setMessage(result.notice); setPreview(null); setBackup(null); setFile(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Restore failed. Check that the local server is running."); }
    finally { setBusy(false); }
  }

  return <section className="settings-panel safety-panel"><h2>Local data backup</h2><p>Local records are saved in the private SQLite file under .awakening-data and survive server restarts. Export v3 includes life-module records (including journal and finance data), local habits, tasks, events, focus blocks, plans, reviews, campaign milestones, quest drafts, and adaptive notification state. Keep exported files private. Authenticated quests, account habits, profile, XP, and progression are excluded. Version 1 and 2 backups remain importable; older backups leave categories they did not contain unchanged.</p><div className="record-actions"><button className="button button-quiet" type="button" disabled={busy} onClick={exportData}>Export JSON backup</button><label className="field-label">Import backup JSON<input className="text-input" type="file" accept="application/json,.json" onChange={event => { setFile(event.target.files?.[0] ?? null); setPreview(null); }} /></label><button className="button button-quiet" type="button" disabled={busy || !file} onClick={previewImport}>Validate and preview</button>{preview && <button className="button button-primary" type="button" disabled={busy} onClick={applyImport}>Replace session records</button>}</div>{preview && <p className="field-help" role="status">Validated {preview.importCount} records; current session has {preview.currentCount}. {preview.warning}</p>}{message && <p className="field-help" role="status">{message}</p>}</section>;
}

