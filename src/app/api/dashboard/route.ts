import { NextResponse } from "next/server";
import { getRequestUser, errorResponse } from "@/lib/http";
import { Habit, HabitLog, PlayerProfile, Quest, QuestCompletion, XpTransaction } from "@/models";
import { listQuestInstances } from "@/lib/quest-engine";
import { addCalendarDays, habitSummary, localDateKey, progressionForXp, weekdayForLocalDate } from "@/lib/progression";

export async function GET() {
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  try {
    const userId = auth.user._id; const timezone = auth.user.settings.timezone; const today = localDateKey(new Date(), timezone);
    await PlayerProfile.updateOne({ userId }, { $setOnInsert: { userId } }, { upsert: true });
    const [quests, habits, logs, xpResult, recent, profile, upcoming] = await Promise.all([
      listQuestInstances(userId, today, timezone),
      Habit.find({ userId, archivedAt: null }).lean(),
      HabitLog.find({ userId, localDate: { $gte: `${today.slice(0, 4)}-01-01`, $lte: today } }).lean(),
      XpTransaction.aggregate([{ $match: { userId } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      QuestCompletion.find({ userId }).sort({ completedAt: -1 }).limit(6).populate("questId", "title category").lean(),
      PlayerProfile.findOne({ userId }).lean(),
      Quest.find({ userId, archivedAt: null, dueDate: { $gte: today } }).sort({ dueDate: 1 }).limit(5).select("title category dueDate").lean()
    ]);
    const step = Math.max(1, Math.trunc(Number(process.env.XP_PER_LEVEL) || 1000)); const progression = progressionForXp(xpResult[0]?.total ?? 0, step); const { totalXp, level } = progression;
    await PlayerProfile.updateOne({ userId }, { $set: { totalXp, level, rank: progression.rank }, $setOnInsert: { userId } }, { upsert: true });
    const habitItems = habits.map(habit => ({ id: String(habit._id), title: habit.title, ...habitSummary({ weekdays: habit.weekdays, restDays: habit.restDays, logs: logs.filter(log => String(log.habitId) === String(habit._id)).map(log => ({ localDate: log.localDate, status: log.status })), today }) }));
    const mondayOffset = (weekdayForLocalDate(today) + 6) % 7; const weekStartKey = addCalendarDays(today, -mondayOffset);
    const weekLogs = await XpTransaction.find({ userId, createdAt: { $gte: new Date(Date.now() - 8 * 86400000) } }).lean();
    return NextResponse.json({
      player: { name: auth.user.displayName, level, rank: progression.rank, totalXp, xpProgress: totalXp % step, nextLevelXp: step, progressPercent: Math.floor((totalXp % step) / step * 100), attributes: (profile as { attributes?: unknown } | null)?.attributes ?? null },
      quests: { due: quests.length, completed: quests.filter(quest => quest.completed).length, items: quests.slice(0, 5) },
      habits: { active: habitItems.length, completedToday: habitItems.filter(habit => habit.plannedToday && logs.some(log => String(log.habitId) === habit.id && log.localDate === today && log.status === "done")).length, items: habitItems.slice(0, 5) },
      weeklyHabits: { completed: habitItems.reduce((sum, habit) => sum + habit.completedThisWeek, 0), scheduled: habitItems.reduce((sum, habit) => sum + habit.plannedThisWeek, 0) },
      recentActivity: recent.map(item => ({ id: String(item._id), title: (item.questId as unknown as { title?: string } | null)?.title ?? "Archived quest", completedAt: item.completedAt, xp: item.xpAmount })),
      upcomingDeadlines: upcoming.map(item => ({ id: String(item._id), title: item.title, category: item.category, date: item.dueDate })),
      weeklyXp: weekLogs.filter(record => localDateKey(record.createdAt, timezone) >= weekStartKey).reduce((sum, record) => sum + record.amount, 0), today
    });
  } catch (error) { return errorResponse(error); }
}

