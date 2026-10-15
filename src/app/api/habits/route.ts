import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { NextResponse } from "next/server";
import { getRequestUser, readJson, errorResponse } from "@/lib/http";
import { Habit, HabitLog } from "@/models";
import { addCalendarDays, localDateKey, habitSummary } from "@/lib/progression";
import { isValidIsoDate } from "@/lib/domain";
import { isAuthConfigured } from "@/lib/auth";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { createDevelopmentHabit, listDevelopmentHabits, validateDevelopmentHabit } from "@/lib/life-system-dev-store";

function useDevelopmentHabits() { return process.env.NODE_ENV === "development" && !isAuthConfigured(); }

async function handleGET(request: Request) {
  if (useDevelopmentHabits()) {
    const today = localDateKey(new Date(), "Asia/Kolkata"); const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? `${today.slice(0, 4)}-${today.slice(5, 7)}-01`; const to = url.searchParams.get("to") ?? today;
    if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) return NextResponse.json({ error: "Invalid history date range." }, { status: 400 });
    const habits = listDevelopmentHabits(await getLifeModuleDevSession(), from, to, today);
    return NextResponse.json({ habits, today, from, to, source: "development-sqlite", notice: "Habit records are persistent on this development server." });
  }
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  try {
    const today = localDateKey(new Date(), auth.user.settings.timezone);
    const url = new URL(request.url); const from = url.searchParams.get("from") ?? `${today.slice(0, 4)}-${today.slice(5, 7)}-01`; const to = url.searchParams.get("to") ?? today;
    if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) return NextResponse.json({ error: "Invalid history date range." }, { status: 400 });
    const habits = await Habit.find({ userId: auth.user._id, archivedAt: null }).sort({ createdAt: -1 }).lean();
    const [streakLogs, rangeLogs] = await Promise.all([
      HabitLog.find({ userId: auth.user._id, localDate: { $gte: addCalendarDays(today, -370), $lte: today } }).lean(),
      HabitLog.find({ userId: auth.user._id, localDate: { $gte: from, $lte: to } }).lean()
    ]);
    const items = habits.map(habit => {
      const habitLogs = streakLogs.filter(log => String(log.habitId) === String(habit._id));
      const summary = habitSummary({ weekdays: habit.weekdays, restDays: habit.restDays, logs: habitLogs.map(log => ({ localDate: log.localDate, status: log.status })), today });
      return { ...habit, _id: String(habit._id), summary, logs: rangeLogs.filter(log => String(log.habitId) === String(habit._id)) };
    });
    return NextResponse.json({ habits: items, today, from, to });
  } catch (error) { return errorResponse(error); }
}

async function handlePOST(request: Request) {
  if (useDevelopmentHabits()) {
    const parsed = await readJson(request); if (parsed.response) return parsed.response;
    const value = validateDevelopmentHabit(parsed.value);
    if (!value.value) return NextResponse.json({ error: value.error }, { status: 400 });
    const habit = createDevelopmentHabit(await getLifeModuleDevSession(), value.value);
    return NextResponse.json({ habit, source: "development-sqlite" }, { status: 201 });
  }
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const input = parsed.value!; const title = typeof input.title === "string" ? input.title.trim() : ""; const weekdays = input.weekdays;
  if (!title || title.length > 120 || !Array.isArray(weekdays) || weekdays.length < 1 || weekdays.some(day => !Number.isInteger(day) || Number(day) < 0 || Number(day) > 6)) return NextResponse.json({ error: "Provide a title and at least one weekday from 0 (Sunday) to 6 (Saturday)." }, { status: 400 });
  if (input.restDays !== undefined && (!Array.isArray(input.restDays) || input.restDays.some(day => !Number.isInteger(day) || Number(day) < 0 || Number(day) > 6))) return NextResponse.json({ error: "Rest days must be weekdays from 0 to 6." }, { status: 400 });
  if ((input.restDays as number[] | undefined)?.some(day => (weekdays as number[]).includes(day))) return NextResponse.json({ error: "A weekday cannot be both scheduled and a planned rest day." }, { status: 400 });
  try { const restDays = (input.restDays as number[] | undefined) ?? []; const habit = await Habit.create({ userId: auth.user._id, title, description: typeof input.description === "string" ? input.description.slice(0, 500) : "", weekdays: weekdays.filter((day, index) => (weekdays as number[]).indexOf(day) === index), restDays: restDays.filter((day, index) => restDays.indexOf(day) === index) }); return NextResponse.json({ habit }, { status: 201 }); }
  catch (error) { return errorResponse(error); }
}



export const GET = withDevStorageErrors(handleGET);
export const POST = withDevStorageErrors(handlePOST);


