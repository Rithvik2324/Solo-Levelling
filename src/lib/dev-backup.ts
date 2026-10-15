import { isLifeModuleId, validateLifeEntry } from "@/lib/life-module-dev-store";
import { validateCommandRecord, validateDevelopmentHabit, type DevelopmentHabit, type DevelopmentSessionData } from "@/lib/life-system-dev-store";
import type { LifeModuleQuestDraftRecord } from "@/lib/domain";
import { isValidIsoDate, type LifeModuleEntryRecord } from "@/lib/domain";
import { validateLocalProgressionBackup } from "@/lib/local-progression";
import type { LocalXpEvent } from "@/lib/local-progression";

export const developmentBackupSchema = "awakening-development-backup";
export const developmentBackupVersion = 4;
export const developmentBackupMaxBytes = 3_000_000;
export const developmentBackupMaxRecords = 2_000;
const allowedStatuses = new Set(["planned", "done", "archived"]);
const allowedEntryKeys = new Set(["id", "module", "kind", "title", "description", "date", "status", "fields", "createdAt", "updatedAt"]);
const allowedHabitKeys = new Set(["id", "title", "description", "weekdays", "restDays", "archivedAt", "logs", "createdAt", "updatedAt"]);
const isTimestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

export function validateDevelopmentBackup(input: unknown): { entries: LifeModuleEntryRecord[]; habits?: DevelopmentHabit[]; commandCenter?: DevelopmentSessionData; questDrafts?: LifeModuleQuestDraftRecord[]; localProgression?: { events: LocalXpEvent[]; achievements: { id: string; title: string; description: string; unlockedAt: string }[] }; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { entries: [], errors: ["Backup must be a JSON object."] };
  const data = input as Record<string, unknown>;
  const version = data.version;
  if (Object.keys(data).some(key => !["exportedAt", "records", "habits", "commandCenter", "questDrafts", "localProgression", "schema", "version", "action", "confirm", "restoreToken"].includes(key)) || data.schema !== developmentBackupSchema || typeof version !== "number" || ![1, 2, 3, developmentBackupVersion].includes(version) || typeof data.exportedAt !== "string" || !Number.isFinite(Date.parse(data.exportedAt)) || !Array.isArray(data.records) || data.action !== undefined && data.action !== "replace" || data.confirm !== undefined && typeof data.confirm !== "boolean" || version === 1 && (data.habits !== undefined || data.commandCenter !== undefined || data.questDrafts !== undefined || data.localProgression !== undefined) || version === 2 && (data.commandCenter !== undefined || data.questDrafts !== undefined || data.localProgression !== undefined) || version === 3 && data.localProgression !== undefined || version >= 2 && !Array.isArray(data.habits) || version >= 3 && (!data.commandCenter || typeof data.commandCenter !== "object" || !Array.isArray(data.questDrafts)) || version === 4 && data.localProgression === undefined) {
    return { entries: [], errors: [`Backup format is invalid or unsupported. Expected AWAKENING development backup versions 1 through ${developmentBackupVersion}.`] };
  }
  const rawHabits = version >= 2 ? data.habits as unknown[] : undefined;
  const rawCommand = data.commandCenter && typeof data.commandCenter === "object" ? data.commandCenter as Record<string, unknown> : {};
  const localProgression = version === 4 ? validateLocalProgressionBackup(data.localProgression) : undefined;
  if (version === 4 && !localProgression) return { entries: [], errors: ["Local progression backup data is invalid."] };
  const itemCount = data.records.length + (rawHabits?.length ?? 0) + (Array.isArray(rawCommand.records) ? rawCommand.records.length : 0) + (Array.isArray(rawCommand.milestones) ? rawCommand.milestones.length : 0) + (Array.isArray(data.questDrafts) ? data.questDrafts.length : 0) + (localProgression?.events.length ?? 0);
  if (itemCount > developmentBackupMaxRecords) return { entries: [], errors: [`Backup exceeds the ${developmentBackupMaxRecords} record limit.`] };
  const ids = new Set<string>();
  const entries: LifeModuleEntryRecord[] = [];
  data.records.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { errors.push(`Record ${index + 1} must be an object.`); return; }
    const row = raw as Record<string, unknown>;
    if (Object.keys(row).some(key => !allowedEntryKeys.has(key))) { errors.push(`Record ${index + 1} contains unexpected fields.`); return; }
    const module = typeof row.module === "string" ? row.module : "";
    if (typeof row.id !== "string" || !/^[0-9a-f-]{36}$/i.test(row.id) || ids.has(row.id) || !isLifeModuleId(module) || !allowedStatuses.has(String(row.status)) || !isTimestamp(row.createdAt) || !isTimestamp(row.updatedAt)) { errors.push(`Record ${index + 1} has invalid identity, module, status, or timestamps.`); return; }
    if (row.date !== undefined && (typeof row.date !== "string" || !isValidIsoDate(row.date))) { errors.push(`Record ${index + 1} has an invalid date.`); return; }
    const parsed = validateLifeEntry({ title: row.title, kind: row.kind, description: row.description, date: row.date, fields: row.fields }, module);
    if (!parsed.value || parsed.error) { errors.push(`Record ${index + 1}: ${parsed.error ?? "invalid record"}`); return; }
    if (Object.keys(parsed.value.fields).some(key => /^(xp|xpReward|totalXp|level|userId|sessionId|ownerId)$/i.test(key))) { errors.push(`Record ${index + 1} contains a reserved progression or ownership field.`); return; }
    ids.add(row.id);
    entries.push({ id: row.id, module, ...parsed.value, status: row.status as LifeModuleEntryRecord["status"], createdAt: row.createdAt, updatedAt: row.updatedAt });
  });

  const habits: DevelopmentHabit[] = [];
  rawHabits?.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { errors.push(`Habit ${index + 1} must be an object.`); return; }
    const row = raw as Record<string, unknown>;
    if (Object.keys(row).some(key => !allowedHabitKeys.has(key))) { errors.push(`Habit ${index + 1} contains unexpected fields.`); return; }
    if (typeof row.id !== "string" || !/^[0-9a-f-]{36}$/i.test(row.id) || ids.has(row.id) || !isTimestamp(row.createdAt) || !isTimestamp(row.updatedAt) || row.archivedAt !== undefined && !isTimestamp(row.archivedAt) || !Array.isArray(row.logs)) { errors.push(`Habit ${index + 1} has invalid identity, timestamps, or logs.`); return; }
    const parsed = validateDevelopmentHabit({ title: row.title, description: row.description, weekdays: row.weekdays, restDays: row.restDays });
    if (!parsed.value || parsed.error) { errors.push(`Habit ${index + 1}: ${parsed.error ?? "invalid habit"}`); return; }
    const logDates = new Set<string>();
    const logs = row.logs.flatMap((log, logIndex) => {
      if (!log || typeof log !== "object" || Array.isArray(log)) { errors.push(`Habit ${index + 1}, log ${logIndex + 1} must be an object.`); return []; }
      const item = log as Record<string, unknown>;
      if (Object.keys(item).some(key => !["localDate", "status", "updatedAt"].includes(key)) || typeof item.localDate !== "string" || !isValidIsoDate(item.localDate) || !["done", "rest"].includes(String(item.status)) || !isTimestamp(item.updatedAt) || logDates.has(item.localDate)) { errors.push(`Habit ${index + 1}, log ${logIndex + 1} is invalid or duplicates a date.`); return []; }
      logDates.add(item.localDate);
      return [{ localDate: item.localDate, status: item.status as "done" | "rest", updatedAt: item.updatedAt }];
    });
    if (logs.length !== row.logs.length) return;
    ids.add(row.id);
    habits.push({ id: row.id, ...parsed.value, ...(typeof row.archivedAt === "string" ? { archivedAt: row.archivedAt } : {}), logs, createdAt: row.createdAt, updatedAt: row.updatedAt });
  });
  let commandCenter: DevelopmentSessionData | undefined;
  let questDrafts: LifeModuleQuestDraftRecord[] | undefined;
  if (version >= 3) {
    const raw = data.commandCenter as Record<string, unknown>;
    const keys = ["records", "dismissedRecommendations", "notifications", "campaignDate", "milestones"];
    if (Object.keys(raw).some(key => !keys.includes(key)) || !Array.isArray(raw.records) || !Array.isArray(raw.milestones) || !raw.dismissedRecommendations || typeof raw.dismissedRecommendations !== "object" || !raw.notifications || typeof raw.notifications !== "object") errors.push("Command-center backup data is invalid.");
    else {
      const records = raw.records.flatMap((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) { errors.push(`Command record ${index + 1} is invalid.`); return []; }
        const row = item as Record<string, unknown>;
        const parsed = validateCommandRecord(row);
        if (typeof row.id !== "string" || !/^[0-9a-f-]{36}$/i.test(row.id) || ids.has(row.id) || !isTimestamp(row.createdAt) || !isTimestamp(row.updatedAt) || !parsed.value) { errors.push(`Command record ${index + 1} is invalid.`); return []; }
        ids.add(row.id);
        return [{ ...parsed.value, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt }];
      });
      const milestones = raw.milestones.flatMap((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) { errors.push(`Milestone ${index + 1} is invalid.`); return []; }
        const row = item as Record<string, unknown>;
        if (Object.keys(row).some(key => !["id", "title", "targetDate", "completedAt"].includes(key)) || typeof row.id !== "string" || !/^[0-9a-f-]{36}$/i.test(row.id) || ids.has(row.id) || typeof row.title !== "string" || !row.title.trim() || row.title.length > 160 || row.targetDate !== undefined && !isValidIsoDate(String(row.targetDate)) || row.completedAt !== undefined && !isTimestamp(row.completedAt)) { errors.push(`Milestone ${index + 1} is invalid.`); return []; }
        ids.add(row.id);
        return [row as unknown as DevelopmentSessionData["milestones"][number]];
      });
      const checkedHabits = validateDevelopmentBackup({ schema: developmentBackupSchema, version: 2, exportedAt: data.exportedAt, records: [], habits: rawHabits });
      if (checkedHabits.errors.length) errors.push(...checkedHabits.errors);
      const dismissals = raw.dismissedRecommendations as Record<string, unknown>;
      const notifications = raw.notifications as Record<string, unknown>;
      if (Object.entries(dismissals).some(([date, ids]) => !isValidIsoDate(date) || !Array.isArray(ids) || ids.some(id => typeof id !== "string")) || Object.entries(notifications).some(([id, state]) => !id || !state || typeof state !== "object" || Array.isArray(state) || Object.keys(state).some(key => !["readAt", "dismissedAt"].includes(key)) || Object.values(state as Record<string, unknown>).some(value => !isTimestamp(value)))) errors.push("Adaptive backup state is invalid.");
      if (raw.campaignDate !== undefined && !isValidIsoDate(String(raw.campaignDate))) errors.push("Campaign date is invalid.");
      if (checkedHabits.habits) commandCenter = { records, milestones, dismissedRecommendations: dismissals as Record<string, string[]>, notifications: notifications as DevelopmentSessionData["notifications"], ...(typeof raw.campaignDate === "string" ? { campaignDate: raw.campaignDate } : {}), habits: checkedHabits.habits };
    }
    questDrafts = (data.questDrafts as unknown[]).flatMap((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) { errors.push(`Quest draft ${index + 1} is invalid.`); return []; }
      const row = item as Record<string, unknown>;
      const sourceEntry = entries.find(entry => entry.id === row.entryId);
      if (Object.keys(row).some(key => !["id", "entryId", "module", "title", "category", "dueDate", "description", "createdAt"].includes(key)) || typeof row.id !== "string" || !/^[0-9a-f-]{36}$/i.test(row.id) || ids.has(row.id) || typeof row.entryId !== "string" || !sourceEntry || !isLifeModuleId(String(row.module)) || sourceEntry.module !== row.module || typeof row.title !== "string" || typeof row.category !== "string" || !isValidIsoDate(String(row.dueDate)) || typeof row.description !== "string" || !isTimestamp(row.createdAt)) { errors.push(`Quest draft ${index + 1} is invalid or references a missing module record.`); return []; }
      ids.add(row.id);
      return [row as unknown as LifeModuleQuestDraftRecord];
    });
  }
  if (localProgression) {
    for (const event of localProgression.events) {
      const [sourceType, ...sourceIdParts] = event.activityId.split(":");
      const sourceId = sourceType === "habit" ? sourceIdParts.slice(0, -1).join(":") : sourceIdParts.join(":");
      const sourceExists = sourceType === "habit"
        ? habits.some(habit => habit.id === sourceId)
        : (sourceType === "fitness" || sourceType === "guitar" || sourceType === "flute") && entries.some(entry => entry.id === sourceId && entry.module === sourceType);
      if (!sourceExists) errors.push("Local progression event references a source record that is not included in this backup.");
    }
  }
  return { entries, ...(rawHabits ? { habits } : {}), ...(commandCenter ? { commandCenter } : {}), ...(questDrafts ? { questDrafts } : {}), ...(localProgression ? { localProgression } : {}), errors };
}
