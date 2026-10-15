import { NextResponse } from "next/server";
import { getRequestUser, readJson, errorResponse } from "@/lib/http";
import { PlayerProfile, XpTransaction } from "@/models";
import { progressionForXp, localDateKey, addCalendarDays, weekdayForLocalDate } from "@/lib/progression";
import { QuestCompletion, HabitLog } from "@/models";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { listLifeEntries } from "@/lib/life-module-dev-store";
import { listCommandRecords } from "@/lib/life-system-dev-store";
const names = ["strength", "agility", "vitality", "focus", "discipline", "creativity"] as const;

export async function GET() {
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  try {
    const userId = auth.user._id;
    const timezone = auth.user.settings.timezone;
    const today = localDateKey(new Date(), timezone);
    const weekday = weekdayForLocalDate(today);
    const weekStart = addCalendarDays(today, -((weekday + 6) % 7));
    const weekEnd = addCalendarDays(weekStart, 7);
    const windowStart = new Date(new Date(`${weekStart}T00:00:00.000Z`).getTime() - 14 * 3600000);
    const windowEnd = new Date(new Date(`${weekEnd}T00:00:00.000Z`).getTime() + 14 * 3600000);
    const [totals, history, questsCompleted, habitsCompleted, habitTotal, profile] = await Promise.all([
      XpTransaction.aggregate([{ $match: { userId } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      XpTransaction.find({ userId }).sort({ createdAt: -1 }).limit(20).select("kind amount description createdAt sourceKey").lean(),
      QuestCompletion.countDocuments({ userId }),
      HabitLog.countDocuments({ userId, status: "done" }),
      HabitLog.countDocuments({ userId }),
      PlayerProfile.findOneAndUpdate({ userId }, { $setOnInsert: { userId } }, { upsert: true, new: true })
    ]);
    const progression = progressionForXp(totals[0]?.total ?? 0, Number(process.env.XP_PER_LEVEL) || 1000);
    const synchronized = await PlayerProfile.findOneAndUpdate({ userId }, { $set: { totalXp: progression.totalXp, level: progression.level, rank: progression.rank } }, { new: true });
    const weeklyLedger = await XpTransaction.find({ userId, createdAt: { $gte: windowStart, $lt: windowEnd } }).select("amount createdAt").lean();
    const weeklyXp = weeklyLedger.filter(item => { const date = localDateKey(item.createdAt, timezone); return date >= weekStart && date <= today; }).reduce((sum, item) => sum + item.amount, 0);
    let development: { focusMinutes: number | null; practiceMinutes: number | null; coverage: string } = { focusMinutes: null, practiceMinutes: null, coverage: "unavailable" };
    if (process.env.NODE_ENV === "development") {
      const sessionId = await getLifeModuleDevSession();
      const focusMinutes = Math.floor(listCommandRecords(sessionId).filter(item => item.kind === "focusBlock" && item.status === "done").reduce((sum, item) => sum + Number(item.fields.elapsedSeconds ?? 0), 0) / 60);
      const entries = (["fitness", "guitar", "flute"] as const).flatMap(module => listLifeEntries(sessionId, module));
      const practiceMinutes = entries.filter(item => item.status === "done" && ["Practice session", "Training session", "Workout session", "Martial arts technique"].includes(item.kind)).reduce((sum, item) => sum + Number(item.fields.durationMinutes ?? 0), 0);
      development = { focusMinutes, practiceMinutes, coverage: "development-session" };
    }
    return NextResponse.json({ attributes: synchronized?.attributes ?? profile?.attributes, totalXp: progression.totalXp, level: progression.level, rank: progression.rank, xp: { earnedThisWeek: weeklyXp, currentLevelXp: progression.progressXp, requiredForNextLevel: progression.nextLevelXp - progression.currentLevelXp, progressPercent: progression.progressPercent }, activity: { questsCompleted, habitsCompleted, habitLogs: habitTotal, focusMinutes: development.focusMinutes, practiceMinutes: development.practiceMinutes, source: development.coverage }, history: history.map(item => ({ id: String(item._id), kind: item.kind, amount: item.amount, description: item.description, createdAt: item.createdAt })) });
  }
  catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const input = parsed.value!; const attributes = input.attributes;
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes) || names.some(name => !Number.isInteger((attributes as Record<string, unknown>)[name]) || Number((attributes as Record<string, unknown>)[name]) < 0 || Number((attributes as Record<string, unknown>)[name]) > 100)) return NextResponse.json({ error: "Set all six attributes to whole numbers from 0 to 100." }, { status: 400 });
  try { const profile = await PlayerProfile.findOneAndUpdate({ userId: auth.user._id }, { $set: { attributes } , $setOnInsert: { userId: auth.user._id } }, { upsert: true, new: true, runValidators: true }); return NextResponse.json({ attributes: profile.attributes }); }
  catch (error) { return errorResponse(error); }
}

