import "server-only";
import { randomUUID } from "node:crypto";
import { isValidIsoDate, type LifeModuleEntryRecord, type LifeModuleId } from "@/lib/domain";
import { listLifeEntries } from "@/lib/life-module-dev-store";
import { lifeEntryDeadline } from "@/lib/life-module-query";
import { addCalendarDays, habitSummary, weekdayForLocalDate } from "@/lib/progression";
import { readDevState, writeDevState, replaceDevStates, type Stored } from "@/lib/dev-persistence";
import { applyLocalActivityAward, getLocalProgression, readLocalProgressionState } from "@/lib/local-progression";

export type CommandKind = "event" | "task" | "focusBlock" | "dailyPlan" | "dailyReview";
export type CommandRecord = {
  id: string; kind: CommandKind; title: string; description: string; date: string;
  fields: Record<string, string | number | boolean>; status: string;
  createdAt: string; updatedAt: string;
};
export type DevelopmentMilestone = { id: string; title: string; targetDate?: string; completedAt?: string };
export type DevelopmentHabit = { id: string; title: string; description: string; weekdays: number[]; restDays: number[]; archivedAt?: string; logs: { localDate: string; status: "done" | "rest"; updatedAt: string }[]; createdAt: string; updatedAt: string };
type SessionData = { records: CommandRecord[]; dismissedRecommendations: Record<string, string[]>; notifications: Record<string, { readAt?: string; dismissedAt?: string }>; campaignDate?: string; milestones: DevelopmentMilestone[]; habits: DevelopmentHabit[] };
const globalData = globalThis as typeof globalThis & { awakeningCommandCenterDev?: Record<string, SessionData> };
const data = globalData.awakeningCommandCenterDev ?? {};
globalData.awakeningCommandCenterDev = data;
const revisions = new Map<string, Stored<SessionData>>();
function session(sessionId: string) { const initial = data[sessionId] ?? { records: [], dismissedRecommendations: {}, notifications: {}, milestones: [], habits: [] }; const loaded = readDevState("command_center", sessionId, initial); const current = loaded.value; current.dismissedRecommendations ??= {}; current.notifications ??= {}; current.milestones ??= []; current.habits ??= []; data[sessionId] = current; revisions.set(sessionId, loaded.exists ? loaded : writeDevState("command_center", sessionId, loaded, current)); return current; }
function save(sessionId: string) { const state = revisions.get(sessionId); if (!state) throw new Error("Local command-center storage is not initialized."); revisions.set(sessionId, writeDevState("command_center", sessionId, state, data[sessionId])); }
export type DevelopmentSessionData = SessionData;
export function exportDevelopmentSession(sessionId: string): DevelopmentSessionData { return structuredClone(session(sessionId)); }
export function replaceDevelopmentSession(sessionId: string, value: DevelopmentSessionData) { session(sessionId); data[sessionId] = structuredClone(value); save(sessionId); }

export function validateDevelopmentHabit(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { value: null, error: "Provide a valid habit." };
  const value = input as Record<string, unknown>; const title = typeof value.title === "string" ? value.title.trim() : "";
  const weekdays = value.weekdays; const restDays = value.restDays ?? [];
  if (!title || title.length > 120) return { value: null, error: "Habit title must contain 1 to 120 characters." };
  if (value.description !== undefined && (typeof value.description !== "string" || value.description.length > 500)) return { value: null, error: "Description must be 500 characters or fewer." };
  const validDays = (days: unknown): days is number[] => Array.isArray(days) && days.every(day => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6);
  if (!validDays(weekdays) || weekdays.length < 1) return { value: null, error: "Choose at least one weekday from 0 (Sunday) to 6 (Saturday)." };
  if (!validDays(restDays) || weekdays.some(day => restDays.includes(day))) return { value: null, error: "Planned rest days must be valid and cannot overlap scheduled weekdays." };
  return { value: { title, description: typeof value.description === "string" ? value.description : "", weekdays: [...new Set(weekdays)], restDays: [...new Set(restDays)] }, error: null };
}
export function listDevelopmentHabits(sessionId: string, from: string, to: string, today: string) {
  const since = addCalendarDays(today, -370);
  return session(sessionId).habits.filter(habit => !habit.archivedAt).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(habit => {
    const summary = habitSummary({ weekdays: habit.weekdays, restDays: habit.restDays, logs: habit.logs.filter(log => log.localDate >= since && log.localDate <= today), today });
    return { ...habit, _id: habit.id, summary, logs: habit.logs.filter(log => log.localDate >= from && log.localDate <= to).map(({ localDate, status }) => ({ localDate, status })) };
  });
}
export function createDevelopmentHabit(sessionId: string, input: NonNullable<ReturnType<typeof validateDevelopmentHabit>["value"]>) {
  const now = new Date().toISOString(); const habit: DevelopmentHabit = { ...input, id: randomUUID(), logs: [], createdAt: now, updatedAt: now };
  session(sessionId).habits.unshift(habit); save(sessionId); return habit;
}
export function updateDevelopmentHabit(sessionId: string, id: string, input: unknown) {
  const habit = session(sessionId).habits.find(item => item.id === id && !item.archivedAt); if (!habit) return null;
  if (input && typeof input === "object" && !Array.isArray(input) && (input as Record<string, unknown>).archived === true) { habit.archivedAt = new Date().toISOString(); habit.updatedAt = habit.archivedAt; save(sessionId); return { habit } as const; }
  const parsed = validateDevelopmentHabit({ ...habit, ...(input as Record<string, unknown>) }); if (!parsed.value) return { error: parsed.error } as const;
  Object.assign(habit, parsed.value, { updatedAt: new Date().toISOString() }); save(sessionId); return { habit } as const;
}
export function getDevelopmentHabit(sessionId: string, id: string) { return session(sessionId).habits.find(item => item.id === id && !item.archivedAt) ?? null; }
export function recordDevelopmentHabitLog(sessionId: string, id: string, localDate: string, status: "done" | "rest", awardXp = false) {
  const habit = getDevelopmentHabit(sessionId, id); if (!habit) return null;
  const previous = structuredClone(habit);
  const now = new Date().toISOString(); const existing = habit.logs.find(log => log.localDate === localDate);
  let log;
  if (existing) { existing.status = status; existing.updatedAt = now; log = existing; }
  else { log = { localDate, status, updatedAt: now }; habit.logs.push(log); }
  habit.updatedAt = now;
  if (awardXp && status === "done" && previous.logs.find(item => item.localDate === localDate)?.status !== "done") {
    const commandState = revisions.get(sessionId);
    if (!commandState) { Object.assign(habit, previous); throw new Error("Local command-center storage is not initialized."); }
    const progression = readLocalProgressionState(sessionId);
    const reward = applyLocalActivityAward(progression.state, `habit:${id}:${localDate}`, "habit", habit.title);
    try {
      replaceDevStates(sessionId, { command_center: data[sessionId], local_progression: reward.state }, { command_center: commandState.revision, local_progression: progression.stored.revision });
      revisions.set(sessionId, { value: data[sessionId], revision: commandState.revision + 1, exists: true });
      return { log, reward: { ...reward, progression: getLocalProgression(sessionId) } };
    } catch (error) { Object.assign(habit, previous); throw new Error(`Local development data could not be committed: ${error instanceof Error ? error.message : "storage conflict"}`); }
  }
  save(sessionId);
  return awardXp ? { log, reward: null } : log;
}
export function developmentHabitCalendarItems(sessionId: string, from: string, to: string): LinkedCalendarItem[] {
  const count = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000 + 1;
  return session(sessionId).habits.filter(habit => !habit.archivedAt).flatMap(habit => Array.from({ length: count }, (_, index) => addCalendarDays(from, index)).flatMap(date => {
    const weekday = weekdayForLocalDate(date); if (!habit.weekdays.includes(weekday) && !habit.restDays.includes(weekday)) return [];
    const log = habit.logs.find(item => item.localDate === date);
    return [{ id: `habit:${habit.id}:${date}`, title: habit.title, date, kind: "Habit", source: "Habits", status: log?.status ?? (habit.restDays.includes(weekday) ? "rest" : "planned"), href: `/habits#habit-${habit.id}`, priority: "normal" }];
  }));
}
export function summarizeDevelopmentHabits(sessionId: string, today: string) {
  const entries = listDevelopmentHabits(sessionId, today, today, today);
  const weekStart = addCalendarDays(today, -((weekdayForLocalDate(today) + 6) % 7));
  const schedule = developmentHabitCalendarItems(sessionId, weekStart, today).filter(item => item.status !== "rest");
  return { active: entries.length, completedToday: entries.filter(item => item.logs.some(log => log.localDate === today && log.status === "done")).length, completed: schedule.filter(item => item.status === "done").length, scheduled: schedule.length };
}
export function developmentHabitSummary(sessionId: string, today: string) { return summarizeDevelopmentHabits(sessionId, today); }
export function exportDevelopmentHabits(sessionId: string): DevelopmentHabit[] {
  return session(sessionId).habits.map(habit => ({ ...habit, weekdays: [...habit.weekdays], restDays: [...habit.restDays], logs: habit.logs.map(log => ({ ...log })) }));
}
export function replaceDevelopmentHabits(sessionId: string, habits: DevelopmentHabit[]) {
  session(sessionId).habits = habits.map(habit => ({ ...habit, weekdays: [...habit.weekdays], restDays: [...habit.restDays], logs: habit.logs.map(log => ({ ...log })) }));
  save(sessionId);
}

export function getDevelopmentCampaignDate(sessionId: string) { return session(sessionId).campaignDate; }
export function setDevelopmentCampaignDate(sessionId: string, date?: string) { const store = session(sessionId); if (date) store.campaignDate = date; else delete store.campaignDate; save(sessionId); return store.campaignDate; }
export function listDevelopmentMilestones(sessionId: string) { return [...session(sessionId).milestones].sort((a,b) => (a.targetDate ?? "9999-12-31").localeCompare(b.targetDate ?? "9999-12-31")); }
export function createDevelopmentMilestone(sessionId: string, input: Omit<DevelopmentMilestone, "id">) { const item = { ...input, id: randomUUID() }; session(sessionId).milestones.push(item); save(sessionId); return item; }
export function updateDevelopmentMilestone(sessionId: string, id: string, patch: Partial<Omit<DevelopmentMilestone, "id">>) { const item = session(sessionId).milestones.find(entry => entry.id === id); if (!item) return null; Object.assign(item, patch); save(sessionId); return item; }
export function deleteDevelopmentMilestone(sessionId: string, id: string) { const store = session(sessionId); const index = store.milestones.findIndex(item => item.id === id); if (index < 0) return null; const removed = store.milestones.splice(index, 1)[0]; save(sessionId); return removed; }

export function getDismissedRecommendations(sessionId: string, date: string) { return [...(session(sessionId).dismissedRecommendations[date] ?? [])]; }
export function dismissRecommendation(sessionId: string, date: string, id: string) { const store = session(sessionId); const values = store.dismissedRecommendations[date] ??= []; if (!values.includes(id)) { values.push(id); save(sessionId); } }
export function setNotificationState(sessionId: string, id: string, action: "read" | "dismiss", now = new Date().toISOString()) { const store = session(sessionId); const value = store.notifications[id] ??= {}; if (action === "read") value.readAt ??= now; else value.dismissedAt ??= now; save(sessionId); return value; }
export function getNotificationState(sessionId: string, id: string) { return session(sessionId).notifications[id] ?? {}; }

export function listCommandRecords(sessionId: string) { return [...session(sessionId).records].sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }
export function getCommandRecord(sessionId: string, id: string) { return session(sessionId).records.find(record => record.id === id) ?? null; }

const priorities = ["low", "normal", "high", "urgent"];
const statuses: Record<CommandKind, string[]> = {
  event: ["planned", "done", "cancelled"], task: ["todo", "in progress", "done", "cancelled"],
  focusBlock: ["planned", "running", "paused", "done", "cancelled"], dailyPlan: ["planned"], dailyReview: ["saved"]
};
export function validateCommandRecord(input: unknown): { value: Omit<CommandRecord, "id" | "createdAt" | "updatedAt"> | null; error: string | null } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { value: null, error: "Provide a valid record." };
  const value = input as Record<string, unknown>;
  if (!(value.kind === "event" || value.kind === "task" || value.kind === "focusBlock" || value.kind === "dailyPlan" || value.kind === "dailyReview")) return { value: null, error: "Choose a valid record type." };
  if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 140) return { value: null, error: "Title must contain 1 to 140 characters." };
  if (typeof value.description !== "string" || value.description.length > 3000) return { value: null, error: "Description must be 3000 characters or fewer." };
  if (typeof value.date !== "string" || !isValidIsoDate(value.date)) return { value: null, error: "Enter a valid date." };
  if (!value.fields || typeof value.fields !== "object" || Array.isArray(value.fields)) return { value: null, error: "Provide valid record details." };
  const fields: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value.fields as Record<string, unknown>)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) || !(typeof raw === "string" && raw.length <= (key === "reflection" ? 2000 : 1000) || typeof raw === "number" && Number.isFinite(raw) || typeof raw === "boolean")) return { value: null, error: "One or more details are invalid." };
    if (raw !== "") fields[key] = raw;
  }
  const kind = value.kind as CommandKind;
  if (value.status !== undefined && (typeof value.status !== "string" || !statuses[kind].includes(value.status))) return { value: null, error: "Choose a valid record status." };
  const priority = String(fields.priority ?? "normal");
  if (["event", "task"].includes(kind) && !priorities.includes(priority)) return { value: null, error: "Choose a valid priority." };
  const validTime = (input: unknown) => input === undefined || typeof input === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(input);
  if (kind === "event" && (typeof fields.category !== "string" || !String(fields.category).trim() || String(fields.category).length > 100 || !validTime(fields.startTime) || !validTime(fields.endTime) || fields.endTime && !fields.startTime || fields.startTime && fields.endTime && fields.endTime <= fields.startTime)) return { value: null, error: "Choose a category and use valid local times with the end later than the start." };
  if (kind === "task" && fields.estimatedMinutes !== undefined && (typeof fields.estimatedMinutes !== "number" || !Number.isInteger(fields.estimatedMinutes) || fields.estimatedMinutes < 1 || fields.estimatedMinutes > 1440)) return { value: null, error: "Estimated task duration must be from 1 to 1440 whole minutes." };
  for (const key of Object.keys(fields).filter(key => key.endsWith("Date"))) if (typeof fields[key] !== "string" || !isValidIsoDate(String(fields[key]))) return { value: null, error: `Enter a valid date for ${key}.` };
  if (kind === "task" && typeof fields.startDate === "string" && fields.startDate > value.date) return { value: null, error: "Task start date cannot be after its due date." };
  if (kind === "focusBlock") {
    if (typeof fields.plannedMinutes !== "number" || !Number.isInteger(fields.plannedMinutes) || fields.plannedMinutes < 1 || fields.plannedMinutes > 240) return { value: null, error: "Focus duration must be a whole number from 1 to 240 minutes." };
    if (typeof fields.breakMinutes !== "number" || !Number.isInteger(fields.breakMinutes) || fields.breakMinutes < 0 || fields.breakMinutes > 60) return { value: null, error: "Break duration must be a whole number from 0 to 60 minutes." };
  }
  if (kind === "dailyPlan") {
    const top = String(fields.topPriorities ?? "").split(",").filter(Boolean);
    if (top.length > 3 || top.some(item => item.length > 100)) return { value: null, error: "Choose up to three priorities." };
    if (typeof fields.availableMinutes !== "number" || !Number.isInteger(fields.availableMinutes) || fields.availableMinutes < 0 || fields.availableMinutes > 1440) return { value: null, error: "Available focus time must be from 0 to 1440 minutes." };
  }
  return { value: { kind, title: value.title.trim(), description: value.description, date: value.date, fields, status: typeof value.status === "string" && statuses[kind].includes(value.status) ? value.status : kind === "task" ? "todo" : kind === "dailyReview" ? "saved" : "planned" }, error: null };
}

export function createCommandRecord(sessionId: string, input: Omit<CommandRecord, "id" | "createdAt" | "updatedAt">) {
  const store = session(sessionId);
  const dedupeKey = input.fields.dedupeKey;
  if (typeof dedupeKey === "string") {
    const duplicate = store.records.find(item => item.kind === input.kind && item.fields.dedupeKey === dedupeKey);
    if (duplicate) return duplicate;
  }
  if (input.kind === "dailyPlan" || input.kind === "dailyReview") {
    const previous = store.records.find(item => item.kind === input.kind && item.date === input.date);
    if (previous) return updateCommandRecord(sessionId, previous.id, input)!;
  }
  const now = new Date().toISOString(); const record = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
  store.records.unshift(record); save(sessionId); return record;
}
export function updateCommandRecord(sessionId: string, id: string, patch: Partial<Omit<CommandRecord, "id" | "createdAt" | "updatedAt">>) {
  const item = getCommandRecord(sessionId, id); if (!item) return null;
  if (item.kind === "focusBlock" && item.status === "done") return item;
  Object.assign(item, patch, { updatedAt: new Date().toISOString() }); save(sessionId); return item;
}
export function deletePersonalCommandRecord(sessionId: string, id: string) {
  const store = session(sessionId);
  const index = store.records.findIndex(item => item.id === id && ["task", "event"].includes(item.kind));
  if (index < 0) return null;
  const removed = store.records.splice(index, 1)[0]; save(sessionId); return removed;
}
export function transitionFocusRecord(sessionId: string, id: string, action: string, now = Date.now()) {
  const record = getCommandRecord(sessionId, id);
  if (!record || record.kind !== "focusBlock") return { error: "Focus block not found." } as const;
  if (action === "finish" && record.status === "done") return { record, alreadyFinished: true } as const;
  const fields = record.fields;
  if (action === "start" && record.status === "planned") { record.status = "running"; fields.startedAt = now; fields.elapsedSeconds = 0; }
  else if (action === "resume" && record.status === "paused") { record.status = "running"; fields.startedAt = now; }
  else if (action === "pause" && record.status === "running") { fields.elapsedSeconds = Number(fields.elapsedSeconds ?? 0) + Math.max(0, Math.floor((now - Number(fields.startedAt)) / 1000)); delete fields.startedAt; record.status = "paused"; }
  else if (action === "finish" && record.status !== "done" && record.status !== "cancelled") {
    if (record.status === "running") fields.elapsedSeconds = Number(fields.elapsedSeconds ?? 0) + Math.max(0, Math.floor((now - Number(fields.startedAt)) / 1000));
    delete fields.startedAt; fields.finishedAt = now; record.status = "done";
  } else if (action === "cancel" && record.status !== "done") { delete fields.startedAt; record.status = "cancelled"; }
  else if (action !== "finish" || record.status !== "done") return { error: "That focus action is not valid for this block." } as const;
  record.updatedAt = new Date(now).toISOString(); save(sessionId); return { record, alreadyFinished: false } as const;
}

const integrations: [LifeModuleId, string][] = [["fitness", "Fitness"], ["nutrition", "Nutrition"], ["mind", "Mind"], ["academics", "Academics"], ["career", "Career"], ["guitar", "Guitar"], ["flute", "Flute"], ["content", "Content"], ["bloom-blend", "Bloom & Blend"], ["zyrenox", "Zyrenox"]];
const modulePaths: Record<LifeModuleId, string> = { fitness: "fitness", nutrition: "nutrition", mind: "mind", academics: "academics", career: "career", guitar: "guitar", flute: "flute", content: "content", "bloom-blend": "bloom-blend", zyrenox: "zyrenox", finance: "finance" };
export type LinkedCalendarItem = { id: string; title: string; date: string; kind: string; source: string; status: string; href: string; priority: string; durationMinutes?: number };
export function listSafeModuleCalendarItems(sessionId: string): LinkedCalendarItem[] {
  return integrations.flatMap(([module, source]) => listLifeEntries(sessionId, module).flatMap((entry: LifeModuleEntryRecord) => {
    const date = lifeEntryDeadline(entry);
    if (!date || entry.status === "archived") return [];
    if (entry.kind === "Business activity" || entry.kind === "Payment" || entry.kind === "Registration" || entry.kind === "Transaction" || entry.kind === "Savings contribution") return [];
    const privateReminder = module === "mind" || module === "nutrition";
    if (module === "mind" && !["Focus session", "Journal entry", "Gratitude note"].includes(entry.kind)) return [];
    if (module === "nutrition" && entry.kind !== "Meal plan") return [];
    return [{ id: `${module}:${entry.id}`, title: privateReminder ? module === "mind" ? "Private reflection reminder" : "Planned meal reminder" : entry.title, date, kind: privateReminder ? "Private reminder" : entry.kind, source, status: entry.status, href: `/${modulePaths[module]}#record-${entry.id}`, priority: typeof entry.fields.priority === "string" ? entry.fields.priority : "normal", ...(typeof entry.fields.durationMinutes === "number" ? { durationMinutes: entry.fields.durationMinutes } : {}) }];
  }));
}
