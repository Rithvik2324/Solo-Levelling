import mongoose from "mongoose";
import { Quest, QuestCompletion, QuestScheduleOverride, XpTransaction } from "@/models";
import { addCalendarDays, localDateKey, progressionForXp, weekdayForLocalDate } from "@/lib/progression";
import { PlayerProfile } from "@/models";

export function calculateQuestXp(difficulty: "easy" | "normal" | "hard" | "elite", estimatedMinutes: number) {
  const base: Record<typeof difficulty, number> = { easy: 10, normal: 20, hard: 35, elite: 50 };
  const minutes = Number.isFinite(estimatedMinutes) ? Math.max(1, Math.trunc(estimatedMinutes)) : 30;
  return base[difficulty] * Math.min(4, Math.max(1, Math.ceil(minutes / 30)));
}

export function occurrenceKeyFor(recurrence: "once" | "daily" | "weekly", dateKey: string) {
  if (recurrence === "once") return "once";
  if (recurrence === "daily") return `day:${dateKey}`;
  const weekday = weekdayForLocalDate(dateKey);
  return `week:${addCalendarDays(dateKey, -((weekday + 6) % 7))}`;
}

export async function listQuestInstances(userId: mongoose.Types.ObjectId, dateKey: string, timezone: string) {
  const weekday = weekdayForLocalDate(dateKey);
  const quests = await Quest.find({ userId, archivedAt: null }).sort({ createdAt: -1 }).lean();
  const completions = await QuestCompletion.find({ userId, questId: { $in: quests.map(quest => quest._id) } }).select("questId occurrenceKey completedAt").lean();
  const completionSet = new Set(completions.map(completion => `${String(completion.questId)}:${completion.occurrenceKey}`));
  const overrides = await QuestScheduleOverride.find({ userId, questId: { $in: quests.map(quest => quest._id) } }).lean();
  void timezone;
  return quests.flatMap(quest => {
    const occurrenceKey = occurrenceKeyFor(quest.recurrence, dateKey);
    const override = overrides.find(item => String(item.questId) === String(quest._id) && item.occurrenceKey === occurrenceKey);
    const matchesDate = quest.recurrence === "once" ? (!quest.dueDate || quest.dueDate <= dateKey) : (quest.weekdays.length === 0 || quest.weekdays.includes(weekday));
    const baseDueToday = override ? override.dueDate === dateKey : matchesDate;
    const base = baseDueToday ? [{ ...quest, _id: String(quest._id), occurrenceKey, dueToday: true, completed: completionSet.has(`${String(quest._id)}:${occurrenceKey}`) }] : [];
    const movedToToday = overrides.filter(item => String(item.questId) === String(quest._id) && item.dueDate === dateKey && item.occurrenceKey !== occurrenceKey).map(item => ({ ...quest, _id: String(quest._id), occurrenceKey: item.occurrenceKey, dueToday: true, completed: completionSet.has(`${String(quest._id)}:${item.occurrenceKey}`) }));
    return [...base, ...movedToToday];
  });
}

export async function listQuestInstancesRange(userId: mongoose.Types.ObjectId, from: string, to: string) {
  const quests = await Quest.find({ userId, archivedAt: null }).sort({ createdAt: -1 }).lean();
  const ids = quests.map(quest => quest._id);
  const [completions, overrides] = await Promise.all([
    QuestCompletion.find({ userId, questId: { $in: ids } }).select("questId occurrenceKey").lean(),
    QuestScheduleOverride.find({ userId, questId: { $in: ids }, dueDate: { $gte: from, $lte: to } }).lean()
  ]);
  const completionSet = new Set(completions.map(item => `${String(item.questId)}:${item.occurrenceKey}`));
  const overridesByQuest = new Map<string, typeof overrides>();
  for (const override of overrides) {
    const key = String(override.questId);
    const values = overridesByQuest.get(key) ?? [];
    values.push(override);
    overridesByQuest.set(key, values);
  }
  const result = [];
  for (let date = from; date <= to; date = addCalendarDays(date, 1)) {
    const weekday = weekdayForLocalDate(date);
    for (const quest of quests) {
      const occurrenceKey = occurrenceKeyFor(quest.recurrence, date);
      const overridesForQuest = overridesByQuest.get(String(quest._id)) ?? [];
      const override = overridesForQuest.find(item => item.occurrenceKey === occurrenceKey);
      const matches = quest.recurrence === "once" ? quest.dueDate === date : quest.weekdays.length === 0 || quest.weekdays.includes(weekday);
      if (override ? override.dueDate === date : matches) result.push({ ...quest, _id: String(quest._id), occurrenceKey, dueDate: date, dueToday: true, completed: completionSet.has(`${String(quest._id)}:${occurrenceKey}`) });
      for (const moved of overridesForQuest.filter(item => item.dueDate === date && item.occurrenceKey !== occurrenceKey)) result.push({ ...quest, _id: String(quest._id), occurrenceKey: moved.occurrenceKey, dueDate: date, dueToday: true, completed: completionSet.has(`${String(quest._id)}:${moved.occurrenceKey}`) });
    }
  }
  return result;
}

export async function completeQuest(input: { userId: mongoose.Types.ObjectId; questId: string; idempotencyKey: string; occurrenceKey?: string; timezone: string }) {
  if (!mongoose.isValidObjectId(input.questId)) throw new Error("Validation: quest id is invalid.");
  if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128) throw new Error("Validation: idempotency key must be 8 to 128 characters.");
  const quest = await Quest.findOne({ _id: input.questId, userId: input.userId, archivedAt: null });
  if (!quest) throw new Error("Not found");
  const today = localDateKey(new Date(), input.timezone);
  const weekday = weekdayForLocalDate(today);
  const occurrenceKey = occurrenceKeyFor(quest.recurrence, today);
  const naturalOccurrence = quest.weekdays.length === 0 || quest.weekdays.includes(weekday);
  const activeOccurrenceKey = input.occurrenceKey ?? occurrenceKey;
  if (activeOccurrenceKey.length > 40 || (quest.recurrence === "once" && activeOccurrenceKey !== "once")) throw new Error("Validation: invalid quest occurrence.");
  const rescheduledOccurrence = await QuestScheduleOverride.findOne({ userId: input.userId, questId: quest._id, occurrenceKey: activeOccurrenceKey, dueDate: today });
  const movedAway = await QuestScheduleOverride.exists({ userId: input.userId, questId: quest._id, occurrenceKey: activeOccurrenceKey, dueDate: { $ne: today } });
  const isNaturalOccurrence = activeOccurrenceKey === occurrenceKey && naturalOccurrence && !movedAway;
  if (quest.recurrence !== "once" && !isNaturalOccurrence && !rescheduledOccurrence) throw new Error("Validation: this quest occurrence is not scheduled for today.");
  if (quest.recurrence === "once" && quest.dueDate && quest.dueDate > today) throw new Error("Validation: this quest is not due yet.");

  const session = await mongoose.startSession();
  let committedResult: { completion: InstanceType<typeof QuestCompletion>; totalXp: number; level: number; leveledUp: boolean } | null = null;
  try {
    await session.withTransaction(async () => {
      let transactionCompletion = await QuestCompletion.findOne({ userId: input.userId, questId: quest._id, occurrenceKey: activeOccurrenceKey }).session(session);
      if (!transactionCompletion) {
        transactionCompletion = new QuestCompletion({ userId: input.userId, questId: quest._id, occurrenceKey: activeOccurrenceKey, idempotencyKey: input.idempotencyKey, xpAmount: quest.xpReward });
        await transactionCompletion.save({ session });
      }
      const prior = await XpTransaction.aggregate([{ $match: { userId: input.userId } }, { $group: { _id: null, total: { $sum: "$amount" } } }]).session(session);
      const award = await XpTransaction.updateOne(
        { userId: input.userId, sourceKey: `quest:${String(transactionCompletion._id)}` },
        { $setOnInsert: { kind: "quest-award", amount: transactionCompletion.xpAmount, description: quest.title } },
        { upsert: true, runValidators: true, session }
      );
      const total = await XpTransaction.aggregate([{ $match: { userId: input.userId } }, { $group: { _id: null, total: { $sum: "$amount" } } }]).session(session);
      const totalXp = total[0]?.total ?? 0;
      const step = Math.max(1, Math.trunc(Number(process.env.XP_PER_LEVEL) || 1000));
      const progression = progressionForXp(totalXp, step);
      if (award.upsertedCount === 1) await PlayerProfile.updateOne({ userId: input.userId }, { $set: { totalXp, level: progression.level, rank: progression.rank }, $setOnInsert: { userId: input.userId } }, { upsert: true, session });
      const oldTotal = award.upsertedCount === 1 ? totalXp - transactionCompletion.xpAmount : (prior[0]?.total ?? totalXp);
      committedResult = { completion: transactionCompletion, totalXp, level: progression.level, leveledUp: award.upsertedCount === 1 && Math.floor(oldTotal / step) < Math.floor(totalXp / step) };
    });
  } catch {
    // Standalone Mongo deployments reject transactions; the fallback uses unique
    // occurrence and ledger keys and derives totals from the XP ledger.
    committedResult = null;
  } finally {
    await session.endSession();
  }
  if (committedResult) return committedResult;

  let completion = await QuestCompletion.findOne({ userId: input.userId, questId: quest._id, occurrenceKey: activeOccurrenceKey });
  if (!completion) {
    try {
      completion = await QuestCompletion.create({ userId: input.userId, questId: quest._id, occurrenceKey: activeOccurrenceKey, idempotencyKey: input.idempotencyKey, xpAmount: quest.xpReward });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
      completion = await QuestCompletion.findOne({ userId: input.userId, questId: quest._id, occurrenceKey: activeOccurrenceKey });
      if (!completion) throw new Error("Validation: this idempotency key was used for another completion.");
    }
  }
  let awarded = false;
  try {
    const result = await XpTransaction.updateOne(
      { userId: input.userId, sourceKey: `quest:${String(completion._id)}` },
      { $setOnInsert: { kind: "quest-award", amount: completion.xpAmount, description: quest.title } },
      { upsert: true, runValidators: true }
    );
    awarded = result.upsertedCount === 1;
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
  }
  const after = await XpTransaction.aggregate([{ $match: { userId: input.userId } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
  const totalXp = after[0]?.total ?? 0;
  const oldTotal = awarded ? totalXp - completion.xpAmount : totalXp;
  const step = Math.max(1, Math.trunc(Number(process.env.XP_PER_LEVEL) || 1000));
  const progression = progressionForXp(totalXp, step);
  if (awarded) await PlayerProfile.updateOne({ userId: input.userId }, [{ $set: { totalXp: { $add: [{ $ifNull: ["$totalXp", 0] }, completion.xpAmount] } } }, { $set: { level: { $add: [{ $floor: { $divide: ["$totalXp", step] } }, 1] }, rank: { $switch: { branches: [{ case: { $gte: ["$level", 50] }, then: "S" }, { case: { $gte: ["$level", 40] }, then: "A" }, { case: { $gte: ["$level", 30] }, then: "B" }, { case: { $gte: ["$level", 20] }, then: "C" }, { case: { $gte: ["$level", 10] }, then: "D" }], default: "E" } } } }], { upsert: true });
  return { completion, totalXp, level: progression.level, leveledUp: awarded && Math.floor(oldTotal / step) < Math.floor(totalXp / step) };
}
