/**
 * Shared domain contracts for the persisted account and progression system.
 * API handlers derive ownership from the authenticated server session and
 * calculate XP and levels from the server-controlled ledger.
 */
export type Id = string;
export type ISODate = string;

export interface UserRecord {
  id: Id;
  email: string;
  displayName: string;
  createdAt: ISODate;
}

export interface UserSettingsRecord {
  userId: Id;
  timezone: string;
  campaignDate?: ISODate;
  reducedMotion: boolean;
}

export type PlayerAttribute = "strength" | "agility" | "vitality" | "focus" | "discipline" | "creativity";
export type PlayerAttributes = Record<PlayerAttribute, number>;

export type LifeModuleId = "fitness" | "nutrition" | "mind" | "academics" | "career" | "guitar" | "flute" | "content" | "bloom-blend" | "zyrenox" | "finance";
export type LifeEntryStatus = "planned" | "done" | "archived";
export type LifeFieldValue = string | number | boolean;
export const applicationStatuses = ["saved", "applied", "assessment", "interview", "offer", "rejected", "withdrawn"] as const;
export const contentStatuses = ["idea", "planned", "scripting", "filming", "editing", "ready to publish", "published", "archived"] as const;
export const workshopStatuses = ["idea", "planning", "ready", "published", "completed", "cancelled"] as const;
export const registrationPaymentStatuses = ["unpaid", "partially paid", "paid", "refunded"] as const;
export const leadStatuses = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] as const;
export const projectStatuses = ["planned", "active", "on hold", "delivered", "cancelled"] as const;
export const financeTypes = ["income", "expense"] as const;
export const recurringCadences = ["weekly", "monthly", "yearly"] as const;
export const promotionStatuses = ["idea", "draft", "scheduled", "posted"] as const;

/** Records stored only in the isolated local development adapter for Phase 3 UI work. */
export interface LifeModuleEntryRecord {
  id: Id;
  module: LifeModuleId;
  kind: string;
  title: string;
  description: string;
  date?: ISODate;
  status: LifeEntryStatus;
  fields: Record<string, LifeFieldValue>;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface LifeModuleQuestDraftRecord {
  id: Id;
  entryId: Id;
  module: LifeModuleId;
  title: string;
  category: string;
  dueDate: ISODate;
  description: string;
  createdAt: ISODate;
}

export interface PlayerProfileRecord {
  userId: Id;
  avatarUrl?: string;
  attributes: PlayerAttributes;
  /** Persisted server-maintained snapshot; the XP ledger remains authoritative. */
  totalXp: number;
  level: number;
  rank: "E" | "D" | "C" | "B" | "A" | "S";
}

export interface QuestDefinitionRecord {
  id: Id;
  userId: Id;
  title: string;
  description?: string;
  category: string;
  difficulty: "easy" | "normal" | "hard" | "elite";
  estimatedMinutes: number;
  xpReward: number;
  recurrence: "once" | "daily" | "weekly";
  weekdays: number[];
  dueDate?: ISODate;
  archivedAt?: ISODate;
  createdAt: ISODate;
}

export interface QuestCompletionRecord {
  id: Id;
  userId: Id;
  questId: Id;
  completedAt: ISODate;
  occurrenceKey: string;
  xpAmount: number;
  /** Unique idempotency key; enforce a unique (userId, idempotencyKey) index. */
  idempotencyKey: string;
}

export interface XpTransactionRecord {
  id: Id;
  userId: Id;
  sourceKey: string;
  kind: "quest-award" | "reversal";
  amount: number;
  description: string;
  createdAt: ISODate;
  /** Enforce uniqueness by questCompletionId to prevent retry double-awards. */
}

export interface HabitRecord {
  id: Id;
  userId: Id;
  title: string;
  description?: string;
  weekdays: number[];
  restDays: number[];
  archivedAt?: ISODate;
  createdAt: ISODate;
}

export interface HabitLogRecord {
  id: Id;
  userId: Id;
  habitId: Id;
  localDate: ISODate;
  status: "done" | "rest";
  correctedAt?: ISODate;
}

export interface CampaignRecord {
  id: Id;
  userId: Id;
  name: string;
  targetDate: ISODate;
  createdAt: ISODate;
}

export interface CampaignMilestoneRecord {
  id: Id;
  userId: Id;
  campaignId: Id;
  title: string;
  targetDate?: ISODate;
  completedAt?: ISODate;
}

export function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
}

export function validateQuestInput(input: { title: unknown; category: unknown; xpReward: unknown }): string[] {
  const errors: string[] = [];
  if (typeof input.title !== "string" || input.title.trim().length < 1 || input.title.trim().length > 120) errors.push("Title must be between 1 and 120 characters.");
  if (typeof input.category !== "string" || input.category.trim().length < 1 || input.category.trim().length > 60) errors.push("Category must be between 1 and 60 characters.");
  if (typeof input.xpReward !== "number" || !Number.isInteger(input.xpReward) || input.xpReward < 0 || input.xpReward > 10000) errors.push("XP reward must be a whole number from 0 to 10000.");
  return errors;
}

