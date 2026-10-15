import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { NextResponse } from "next/server";
import { exportLifeEntries, exportLifeQuestDrafts } from "@/lib/life-module-dev-store";
import { exportDevelopmentHabits, exportDevelopmentSession } from "@/lib/life-system-dev-store";
import { getDevStateRevisions, replaceDevStates } from "@/lib/dev-persistence";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { developmentBackupMaxBytes, developmentBackupSchema, developmentBackupVersion, validateDevelopmentBackup } from "@/lib/dev-backup";
import { exportLocalProgression } from "@/lib/local-progression";

export const dynamic = "force-dynamic";

function unavailable() {
  return process.env.NODE_ENV === "development" ? null : NextResponse.json({ error: "Development backup tools are unavailable outside local development." }, { status: 404 });
}

async function handleGET() {
  const denied = unavailable(); if (denied) return denied;
  const sessionId = await getLifeModuleDevSession();
  const state = exportDevelopmentSession(sessionId);
  const commandCenter: Record<string, unknown> = structuredClone(state);
  delete commandCenter.habits;
  return NextResponse.json({ schema: developmentBackupSchema, version: developmentBackupVersion, exportedAt: new Date().toISOString(), records: exportLifeEntries(sessionId), habits: exportDevelopmentHabits(sessionId), commandCenter, questDrafts: exportLifeQuestDrafts(sessionId), localProgression: exportLocalProgression(sessionId) }, { headers: { "Cache-Control": "no-store" } });
}

async function handlePOST(request: Request) {
  const denied = unavailable(); if (denied) return denied;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > developmentBackupMaxBytes) return NextResponse.json({ error: "Backup exceeds the 3 MB limit." }, { status: 413 });
  let raw: unknown;
  try { const text = await request.text(); if (new TextEncoder().encode(text).byteLength > developmentBackupMaxBytes) return NextResponse.json({ error: "Backup exceeds the 3 MB limit." }, { status: 413 }); raw = JSON.parse(text); }
  catch { return NextResponse.json({ error: "Upload a valid JSON backup." }, { status: 400 }); }
  const checked = validateDevelopmentBackup(raw);
  if (checked.errors.length) return NextResponse.json({ valid: false, errors: checked.errors.slice(0, 20), errorCount: checked.errors.length }, { status: 400 });
  const body = raw as Record<string, unknown>;
  const sessionId = await getLifeModuleDevSession();
  const currentHabits = exportDevelopmentHabits(sessionId);
  const importCount = checked.entries.length + (checked.habits?.length ?? 0) + (checked.commandCenter?.records.length ?? 0) + (checked.commandCenter?.milestones.length ?? 0) + (checked.questDrafts?.length ?? 0) + (checked.localProgression?.events.length ?? 0);
  const currentState = exportDevelopmentSession(sessionId);
  const currentProgression = exportLocalProgression(sessionId);
  const currentCount = exportLifeEntries(sessionId).length + currentHabits.length + currentState.records.length + currentState.milestones.length + exportLifeQuestDrafts(sessionId).length + currentProgression.events.length;
  if (body.confirm !== true || body.action !== "replace") return NextResponse.json({ valid: true, preview: true, importCount, currentCount, restoreToken: getDevStateRevisions(sessionId, ["life_entries", "life_quest_drafts", "command_center", "local_progression"]), warning: checked.commandCenter ? "This replaces this browser session's life-module records, quest drafts, tasks, events, focus blocks, plans, reviews, local habits, campaign milestones, adaptive states, and local XP history/achievements. Journal and finance records are sensitive; protect backup files. Authenticated quests, account habits, profile, and account XP/progression are excluded." : "This legacy backup replaces life-module records and its included local habits only; command-center, campaign, quest draft, adaptive, and local progression records are left unchanged. Authenticated quests, account habits, profile, and account XP/progression are excluded." });
  const expectedNamespaces = ["life_entries", "life_quest_drafts", "command_center", "local_progression"];
  const restoreToken = body.restoreToken;
  if (!restoreToken || typeof restoreToken !== "object" || Array.isArray(restoreToken) || Object.keys(restoreToken).length !== expectedNamespaces.length || expectedNamespaces.some(namespace => !Number.isInteger((restoreToken as Record<string, unknown>)[namespace]) || Number((restoreToken as Record<string, unknown>)[namespace]) < 0)) return NextResponse.json({ error: "Run the backup preview again before confirming restore." }, { status: 409 });
  const retained = exportDevelopmentSession(sessionId);
  if (checked.habits) retained.habits = checked.habits;
  const commandCenter = checked.commandCenter ? { ...checked.commandCenter, habits: checked.habits ?? retained.habits } : retained;
  const questDrafts = checked.questDrafts ?? exportLifeQuestDrafts(sessionId);
  const localProgression = checked.localProgression ?? currentProgression;
  const moduleEntries = Object.fromEntries(["fitness", "nutrition", "mind", "academics", "career", "guitar", "flute", "content", "bloom-blend", "zyrenox", "finance"].map(module => [module, checked.entries.filter(entry => entry.module === module)]));
  replaceDevStates(sessionId, { life_entries: moduleEntries, life_quest_drafts: questDrafts, command_center: commandCenter, local_progression: localProgression }, restoreToken as Record<string, number>);
  return NextResponse.json({ restored: importCount, source: "development-sqlite", notice: "Development data replaced for this browser session. Authenticated quests, account habits, profile, and account progression were not changed." });
}



export const GET = withDevStorageErrors(handleGET);
export const POST = withDevStorageErrors(handlePOST);


