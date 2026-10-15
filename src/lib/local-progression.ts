import "server-only";
import { readDevState, writeDevState, type Stored } from "@/lib/dev-persistence";
import { progressionForXp } from "@/lib/progression";

export type LocalActivityKind = "habit" | "workout" | "martial-arts" | "music-practice";
export type LocalXpEvent = { id: string; activityId: string; kind: LocalActivityKind; title: string; amount: number; createdAt: string };
type LocalAchievement = { id: string; title: string; description: string; unlockedAt: string };
export type LocalProgressionState = { events: LocalXpEvent[]; achievements: LocalAchievement[] };
type State = LocalProgressionState;
const empty = (): State => ({ events: [], achievements: [] });
const rewards: Record<LocalActivityKind, number> = { habit: 5, workout: 20, "martial-arts": 20, "music-practice": 10 };

function read(sessionId: string): { state: State; stored: Stored<State> } {
  const stored = readDevState("local_progression", sessionId, empty());
  return { stored, state: stored.value };
}

function evaluateAchievements(state: State) {
  const ordered = [...state.events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const rules = [
    { id: "first-step", title: "First Step", description: "Complete your first eligible local activity.", trigger: ordered[0] },
    { id: "habit-rhythm", title: "Habit Rhythm", description: "Record seven completed habit occurrences.", trigger: ordered.filter(event => event.kind === "habit")[6] },
    { id: "training-five", title: "Training Foundation", description: "Complete five workouts or martial arts sessions.", trigger: ordered.filter(event => event.kind === "workout" || event.kind === "martial-arts")[4] },
    { id: "practice-ten", title: "Practice Rhythm", description: "Complete ten guitar or flute practice sessions.", trigger: ordered.filter(event => event.kind === "music-practice")[9] },
  ];
  for (const rule of rules) {
    if (rule.trigger && !state.achievements.some(item => item.id === rule.id)) state.achievements.push({ id: rule.id, title: rule.title, description: rule.description, unlockedAt: rule.trigger.createdAt });
  }
}

export function getLocalProgression(sessionId: string) {
  const { state } = read(sessionId);
  const totalXp = state.events.reduce((sum, event) => sum + event.amount, 0);
  const progress = progressionForXp(totalXp);
  const monday = new Date();
  const offset = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - offset);
  monday.setHours(0, 0, 0, 0);
  const earnedThisWeek = state.events.filter(event => Date.parse(event.createdAt) >= monday.getTime()).reduce((sum, event) => sum + event.amount, 0);
  return { source: "development-sqlite", totalXp, level: progress.level, rank: progress.rank, xp: { earnedThisWeek, currentLevelXp: progress.progressXp, requiredForNextLevel: progress.nextLevelXp - progress.currentLevelXp, progressPercent: progress.progressPercent }, history: [...state.events].reverse().slice(0, 20), achievements: state.achievements };
}

export function awardLocalActivity(sessionId: string, activityId: string, kind: LocalActivityKind, title: string) {
  const { state, stored } = read(sessionId);
  const result = applyLocalActivityAward(state, activityId, kind, title);
  if (!result.alreadyAwarded) writeDevState("local_progression", sessionId, stored, result.state);
  return { ...result, progression: getLocalProgression(sessionId) };
}

export function localActivityKindFor(module: string, kind: string): LocalActivityKind | null {
  if (module === "fitness" && kind === "Training session") return "workout";
  if (module === "fitness" && kind === "Martial arts technique") return "martial-arts";
  if ((module === "guitar" || module === "flute") && kind === "Practice session") return "music-practice";
  return null;
}

export function readLocalProgressionState(sessionId: string) { return read(sessionId); }

export function applyLocalActivityAward(state: State, activityId: string, kind: LocalActivityKind, title: string) {
  if (!/^[A-Za-z0-9:_-]{1,220}$/.test(activityId)) throw new Error("Validation: activity identity is invalid.");
  if (!title.trim() || title.length > 160) throw new Error("Validation: activity title is invalid.");
  const next = structuredClone(state);
  const previous = next.events.find(event => event.activityId === activityId);
  if (previous) return { state: next, event: previous, alreadyAwarded: true, unlocked: [] as LocalAchievement[] };
  const event = { id: activityId, activityId, kind, title: title.trim(), amount: rewards[kind], createdAt: new Date().toISOString() };
  const before = new Set(next.achievements.map(item => item.id));
  next.events.push(event);
  evaluateAchievements(next);
  return { state: next, event, alreadyAwarded: false, unlocked: next.achievements.filter(item => !before.has(item.id)) };
}

export function exportLocalProgression(sessionId: string): State {
  const state = read(sessionId).state;
  return structuredClone(state);
}

export function validateLocalProgressionBackup(input: unknown): State | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).some(key => !["events", "achievements"].includes(key)) || !Array.isArray(raw.events) || raw.events.length > 2000 || !Array.isArray(raw.achievements)) return null;
  const amounts: Record<LocalActivityKind, number> = rewards;
  const events: LocalXpEvent[] = [];
  const seen = new Set<string>();
  for (const item of raw.events) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const event = item as Record<string, unknown>;
    if (Object.keys(event).some(key => !["id", "activityId", "kind", "title", "amount", "createdAt"].includes(key)) || typeof event.activityId !== "string" || !/^[A-Za-z0-9:_-]{1,220}$/.test(event.activityId) || event.id !== event.activityId || seen.has(event.activityId) || !["habit", "workout", "martial-arts", "music-practice"].includes(String(event.kind)) || typeof event.title !== "string" || !event.title.trim() || event.title.length > 160 || !Number.isFinite(Date.parse(String(event.createdAt)))) return null;
    const kind = event.kind as LocalActivityKind;
    if (event.amount !== amounts[kind]) return null;
    seen.add(event.activityId);
    events.push({ id: event.activityId, activityId: event.activityId, kind, title: event.title.trim(), amount: amounts[kind], createdAt: String(event.createdAt) });
  }
  const state: State = { events, achievements: [] };
  evaluateAchievements(state);
  const supplied = raw.achievements;
  if (supplied.length !== state.achievements.length || supplied.some((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return true;
    const row = item as Record<string, unknown>; const expected = state.achievements[index];
    return Object.keys(row).some(key => !["id", "title", "description", "unlockedAt"].includes(key)) || row.id !== expected.id || row.title !== expected.title || row.description !== expected.description || row.unlockedAt !== expected.unlockedAt;
  })) return null;
  return state;
}

export function replaceLocalProgression(sessionId: string, state: State) {
  const stored = read(sessionId).stored;
  writeDevState("local_progression", sessionId, stored, structuredClone(state));
}
