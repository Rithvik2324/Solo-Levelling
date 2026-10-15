import type { LifeModuleEntryRecord } from "@/lib/domain";
import type { CommandRecord } from "@/lib/life-system-dev-store";
import { isValidIsoDate } from "@/lib/domain";
import { weekdayForLocalDate } from "@/lib/progression";

export type AchievementDefinition = { id: string; name: string; description: string; category: string; goal: number; unit: string; modules: string[] };
export function isReviewWeekStart(value: string) { return isValidIsoDate(value) && weekdayForLocalDate(value) === 1; }
export function validateAdaptiveMutation(input: unknown, today: string): { id: string; action: "dismiss-recommendation" | "read" | "dismiss"; date?: string } | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (typeof value.id !== "string" || value.id.length > 300 || !/^(overdue|task|deadline|event|source|planning):/.test(value.id)) return null;
  if (value.action === "dismiss-recommendation" && value.date === today) return { id: value.id, action: value.action, date: today };
  if (value.action === "read" || value.action === "dismiss") return { id: value.id, action: value.action };
  return null;
}
export const achievementDefinitions: AchievementDefinition[] = [
  { id: "first-workout", name: "First Training", description: "Log your first completed fitness or martial arts session.", category: "Fitness", goal: 1, unit: "session", modules: ["fitness"] },
  { id: "ten-music-practices", name: "Practice Rhythm", description: "Complete ten guitar or flute practice sessions.", category: "Music", goal: 10, unit: "sessions", modules: ["guitar", "flute"] },
  { id: "first-publication", name: "Published", description: "Record your first published content item.", category: "Creation", goal: 1, unit: "item", modules: ["content"] },
  { id: "first-workshop", name: "Gathering", description: "Record a completed Bloom & Blend workshop.", category: "Business", goal: 1, unit: "workshop", modules: ["bloom-blend"] },
  { id: "first-delivery", name: "Delivered", description: "Record a delivered Zyrenox project.", category: "Business", goal: 1, unit: "project", modules: ["zyrenox"] },
  { id: "five-focus-blocks", name: "Deep Work", description: "Finish five recorded focus blocks.", category: "Focus", goal: 5, unit: "blocks", modules: ["planning"] },
  { id: "seven-daily-plans", name: "Intentional Week", description: "Save daily plans on seven distinct dates.", category: "Planning", goal: 7, unit: "plans", modules: ["planning"] },
  { id: "first-quest", name: "First Quest", description: "Complete a verified System Engine quest.", category: "Quests", goal: 1, unit: "quests", modules: ["system-engine"] },
  { id: "seven-habits", name: "Habit Rhythm", description: "Record seven valid scheduled habit completions.", category: "Habits", goal: 7, unit: "logs", modules: ["system-engine"] }
];

export type AchievementProgress = AchievementDefinition & { progress: number; unlocked: boolean; unlockedAt?: string; available: boolean };
export function evaluateAchievements(entries: LifeModuleEntryRecord[], commands: CommandRecord[]): AchievementProgress[] {
  const completed = (module: string, kinds: string[]) => entries.filter(entry => entry.module === module && entry.status === "done" && kinds.includes(entry.kind));
  const measures: Record<string, { count: number; at?: string }> = {
    "first-workout": (() => { const records = completed("fitness", ["Training session", "Workout session", "Martial arts technique"]); return { count: records.length, at: records.sort((a,b) => a.updatedAt.localeCompare(b.updatedAt))[0]?.updatedAt }; })(),
    "ten-music-practices": (() => { const records = entries.filter(entry => ["guitar", "flute"].includes(entry.module) && entry.kind === "Practice session" && entry.status === "done"); return { count: records.length, at: records.sort((a,b) => a.updatedAt.localeCompare(b.updatedAt))[9]?.updatedAt }; })(),
    "first-publication": (() => { const records = entries.filter(entry => entry.module === "content" && entry.fields.pipelineStatus === "published"); return { count: records.length, at: records.sort((a,b) => a.updatedAt.localeCompare(b.updatedAt))[0]?.updatedAt }; })(),
    "first-workshop": (() => { const records = entries.filter(entry => entry.module === "bloom-blend" && entry.kind === "Workshop" && entry.fields.workshopStatus === "completed"); return { count: records.length, at: records.sort((a,b) => a.updatedAt.localeCompare(b.updatedAt))[0]?.updatedAt }; })(),
    "first-delivery": (() => { const records = entries.filter(entry => entry.module === "zyrenox" && entry.kind === "Client project" && entry.fields.projectStatus === "delivered"); return { count: records.length, at: records.sort((a,b) => a.updatedAt.localeCompare(b.updatedAt))[0]?.updatedAt }; })(),
    "five-focus-blocks": (() => { const records = commands.filter(record => record.kind === "focusBlock" && record.status === "done"); return { count: records.length, at: records.sort((a,b) => a.updatedAt.localeCompare(b.updatedAt))[4]?.updatedAt }; })(),
    "seven-daily-plans": (() => { const records = [...new Map(commands.filter(record => record.kind === "dailyPlan").map(record => [record.date, record])).values()]; return { count: records.length, at: records.sort((a,b) => a.date.localeCompare(b.date))[6]?.updatedAt }; })(),
    "first-quest": { count: 0 }, "seven-habits": { count: 0 }
  };
  return achievementDefinitions.map(definition => {
    const sourceAvailable = !definition.modules.includes("system-engine");
    const measure = measures[definition.id] ?? { count: 0 };
    const unlocked = sourceAvailable && measure.count >= definition.goal && !!measure.at;
    return { ...definition, progress: Math.min(definition.goal, measure.count), unlocked, ...(unlocked ? { unlockedAt: measure.at } : {}), available: sourceAvailable };
  });
}

export type Recommendation = { id: string; title: string; reason: string; href: string; priority: "high" | "normal"; date: string };
export function buildRecommendations(commands: CommandRecord[], linked: { id: string; title: string; date: string; kind: string; source: string; status: string; href: string; priority: string }[], today: string, dismissed: string[] = []): Recommendation[] {
  const openTasks = commands.filter(item => item.kind === "task" && !["done", "cancelled"].includes(item.status));
  const pool: Recommendation[] = [];
  for (const task of openTasks.filter(item => item.date < today).sort((a,b) => a.date.localeCompare(b.date)).slice(0, 2)) pool.push({ id: `overdue:${task.id}:${today}`, title: task.title, reason: `This personal task is overdue since ${task.date}.`, href: "/tasks", priority: "high", date: today });
  for (const task of openTasks.filter(item => item.date === today || ["high", "urgent"].includes(String(item.fields.priority))).sort((a,b) => String(b.fields.priority).localeCompare(String(a.fields.priority))).slice(0, 3)) pool.push({ id: `task:${task.id}:${today}`, title: task.title, reason: task.date === today ? "This task is scheduled for today." : `This task is marked ${task.fields.priority} priority.`, href: "/tasks", priority: ["high", "urgent"].includes(String(task.fields.priority)) ? "high" : "normal", date: today });
  for (const item of linked.filter(entry => (entry.date < today || entry.date <= addDays(today, 3)) && !["done", "cancelled", "archived", "rest"].includes(entry.status)).sort((a,b) => a.date.localeCompare(b.date)).slice(0, 4)) pool.push({ id: `deadline:${item.id}:${today}`, title: item.title, reason: item.date < today ? `This ${item.kind.toLowerCase()} from ${item.source} is overdue since ${item.date}.` : `${item.kind} from ${item.source} is dated ${item.date}.`, href: item.href, priority: item.date <= today ? "high" : "normal", date: today });
  const seen = new Set<string>();
  return pool.filter(item => { const sourceId = item.id.split(":").slice(0, -1).join(":").replace(/^(overdue|task|deadline):/, ""); if (seen.has(sourceId) || dismissed.includes(item.id)) return false; seen.add(sourceId); return true; }).slice(0, 5);
}
function addDays(date: string, days: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0,10); }

export function weeklyReview(commands: CommandRecord[], entries: LifeModuleEntryRecord[], weekStart: string) {
  const end = addDays(weekStart, 6);
  const inWeek = (date?: string) => !!date && date >= weekStart && date <= end;
  const doneTasks = commands.filter(item => item.kind === "task" && item.status === "done" && inWeek(item.date));
  const focuses = commands.filter(item => item.kind === "focusBlock" && item.status === "done" && inWeek(item.date));
  const plans = commands.filter(item => item.kind === "dailyPlan" && inWeek(item.date));
  const reviews = commands.filter(item => item.kind === "dailyReview" && inWeek(item.date));
  const count = (module: string, kinds: string[]) => entries.filter(item => item.module === module && item.status === "done" && kinds.includes(item.kind) && inWeek(item.date)).length;
  const moduleCounts = [
    { module: "Fitness", count: count("fitness", ["Training session", "Workout session", "Martial arts technique"]), covered: entries.some(item => item.module === "fitness") },
    { module: "Guitar", count: count("guitar", ["Practice session"]), covered: entries.some(item => item.module === "guitar") },
    { module: "Flute", count: count("flute", ["Practice session"]), covered: entries.some(item => item.module === "flute") },
    { module: "Content", count: entries.filter(item => item.module === "content" && item.fields.pipelineStatus === "published" && inWeek(String(item.fields.publicationDate ?? item.date))).length, covered: entries.some(item => item.module === "content") }
  ];
  return { weekStart, weekEnd: end, personalTasksCompleted: doneTasks.length, focusSessions: focuses.length, focusMinutes: Math.floor(focuses.reduce((sum,item)=>sum + Number(item.fields.elapsedSeconds ?? 0),0)/60), plansSaved: new Set(plans.map(item=>item.date)).size, reviewsSaved: new Set(reviews.map(item=>item.date)).size, modules: moduleCounts, coverage: { quests: "Requires authenticated System Engine", xp: "Requires authenticated XP ledger", habits: "Requires authenticated System Engine" } };
}
