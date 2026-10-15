import "server-only";
import mongoose, { Schema } from "mongoose";

const { ObjectId } = Schema.Types;
const settingsSchema = new Schema({
  timezone: { type: String, required: true, default: "Asia/Kolkata" },
  campaignDate: { type: String, required: false },
  reducedMotion: { type: Boolean, default: false }
}, { _id: false });

const userSchema = new Schema({
  provider: { type: String, required: true, enum: ["google"] },
  providerSubject: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  displayName: { type: String, required: true, maxlength: 120 },
  settings: { type: settingsSchema, default: () => ({}) }
}, { timestamps: true });
userSchema.index({ provider: 1, providerSubject: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });

const attributesSchema = new Schema({
  strength: { type: Number, min: 0, max: 100, default: 0 }, agility: { type: Number, min: 0, max: 100, default: 0 },
  vitality: { type: Number, min: 0, max: 100, default: 0 }, focus: { type: Number, min: 0, max: 100, default: 0 },
  discipline: { type: Number, min: 0, max: 100, default: 0 }, creativity: { type: Number, min: 0, max: 100, default: 0 }
}, { _id: false });
const playerProfileSchema = new Schema({ userId: { type: ObjectId, ref: "AwakeningUser", required: true, unique: true }, totalXp: { type: Number, min: 0, default: 0 }, level: { type: Number, min: 1, default: 1 }, rank: { type: String, enum: ["E", "D", "C", "B", "A", "S"], default: "E" }, attributes: { type: attributesSchema, default: () => ({}) }, avatarUrl: { type: String, maxlength: 2048 } }, { timestamps: true });

const questSchema = new Schema({
  userId: { type: ObjectId, ref: "AwakeningUser", required: true, index: true },
  title: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000, default: "" },
  category: { type: String, required: true, trim: true, maxlength: 60 },
  difficulty: { type: String, enum: ["easy", "normal", "hard", "elite"], default: "normal" },
  estimatedMinutes: { type: Number, min: 1, max: 1440, default: 30 },
  xpReward: { type: Number, min: 0, max: 10000, required: true },
  recurrence: { type: String, enum: ["once", "daily", "weekly"], default: "once" },
  weekdays: { type: [Number], default: [] },
  dueDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  sourceEntryId: { type: String, maxlength: 80 },
  archivedAt: { type: Date, default: null }
}, { timestamps: true });
questSchema.index({ userId: 1, archivedAt: 1, dueDate: 1 });
questSchema.index({ userId: 1, sourceEntryId: 1 }, { unique: true, partialFilterExpression: { sourceEntryId: { $type: "string" } } });

const questCompletionSchema = new Schema({
  userId: { type: ObjectId, ref: "AwakeningUser", required: true },
  questId: { type: ObjectId, ref: "AwakeningQuest", required: true },
  occurrenceKey: { type: String, required: true },
  idempotencyKey: { type: String, required: true, maxlength: 128 },
  completedAt: { type: Date, required: true, default: Date.now },
  xpAmount: { type: Number, min: 0, max: 10000, required: true }
}, { timestamps: true });
questCompletionSchema.index({ userId: 1, questId: 1, occurrenceKey: 1 }, { unique: true });
questCompletionSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
questCompletionSchema.index({ userId: 1, completedAt: -1 });

const xpTransactionSchema = new Schema({
  userId: { type: ObjectId, ref: "AwakeningUser", required: true, index: true },
  sourceKey: { type: String, required: true, maxlength: 200 },
  kind: { type: String, enum: ["quest-award", "reversal"], required: true },
  amount: { type: Number, required: true, min: -10000, max: 10000 },
  description: { type: String, required: true, maxlength: 200 }
}, { timestamps: true });
xpTransactionSchema.index({ userId: 1, sourceKey: 1 }, { unique: true });
xpTransactionSchema.index({ userId: 1, createdAt: -1 });

const habitSchema = new Schema({
  userId: { type: ObjectId, ref: "AwakeningUser", required: true, index: true },
  title: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500, default: "" },
  weekdays: { type: [Number], required: true, validate: [(days: number[]) => days.length > 0 && days.every(day => Number.isInteger(day) && day >= 0 && day <= 6), "Choose at least one valid weekday"] },
  restDays: { type: [Number], default: [], validate: [(days: number[]) => days.every(day => Number.isInteger(day) && day >= 0 && day <= 6), "Rest days must be valid weekdays"] },
  archivedAt: { type: Date, default: null }
}, { timestamps: true });
habitSchema.pre("validate", function validateRestSchedule() {
  if (this.weekdays.some(day => this.restDays.includes(day))) this.invalidate("restDays", "A day cannot be both a habit day and a planned rest day.");
});
habitSchema.index({ userId: 1, archivedAt: 1 });

const habitLogSchema = new Schema({
  userId: { type: ObjectId, ref: "AwakeningUser", required: true },
  habitId: { type: ObjectId, ref: "AwakeningHabit", required: true },
  localDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  status: { type: String, enum: ["done", "rest"], required: true },
  correctedAt: { type: Date }
}, { timestamps: true });
habitLogSchema.index({ userId: 1, habitId: 1, localDate: 1 }, { unique: true });
habitLogSchema.index({ userId: 1, localDate: 1 });

const campaignSchema = new Schema({ userId: { type: ObjectId, ref: "AwakeningUser", required: true, index: true }, name: { type: String, required: true, maxlength: 120 }, targetDate: { type: String, required: false, match: /^\d{4}-\d{2}-\d{2}$/ } }, { timestamps: true });
campaignSchema.index({ userId: 1, name: 1 }, { unique: true });
const milestoneSchema = new Schema({ userId: { type: ObjectId, ref: "AwakeningUser", required: true, index: true }, campaignId: { type: ObjectId, ref: "AwakeningCampaign", required: true }, title: { type: String, required: true, trim: true, maxlength: 160 }, targetDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ }, completedAt: { type: Date } }, { timestamps: true });
milestoneSchema.index({ userId: 1, campaignId: 1, targetDate: 1 });

const overrideSchema = new Schema({ userId: { type: ObjectId, ref: "AwakeningUser", required: true }, questId: { type: ObjectId, ref: "AwakeningQuest", required: true }, occurrenceKey: { type: String, required: true }, dueDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ } }, { timestamps: true });
overrideSchema.index({ userId: 1, questId: 1, occurrenceKey: 1 }, { unique: true });

// Schemas are assembled dynamically; runtime validators and this shared model registry are authoritative.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function model(name: string, schema: Schema): mongoose.Model<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mongoose.models[name] as mongoose.Model<any> | undefined) ?? mongoose.model(name, schema);
}

export const User = model("AwakeningUser", userSchema);
export const PlayerProfile = model("AwakeningPlayerProfile", playerProfileSchema);
export const Quest = model("AwakeningQuest", questSchema);
export const QuestCompletion = model("AwakeningQuestCompletion", questCompletionSchema);
export const XpTransaction = model("AwakeningXpTransaction", xpTransactionSchema);
export const Habit = model("AwakeningHabit", habitSchema);
export const HabitLog = model("AwakeningHabitLog", habitLogSchema);
export const Campaign = model("AwakeningCampaign", campaignSchema);
export const CampaignMilestone = model("AwakeningCampaignMilestone", milestoneSchema);
export const QuestScheduleOverride = model("AwakeningQuestScheduleOverride", overrideSchema);
