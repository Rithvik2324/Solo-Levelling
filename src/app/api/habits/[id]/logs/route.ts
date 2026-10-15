import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getRequestUser, readJson, errorResponse } from "@/lib/http";
import { Habit, HabitLog } from "@/models";
import { isValidIsoDate } from "@/lib/domain";
import { localDateKey, weekdayForLocalDate } from "@/lib/progression";
import { recordHabitLog } from "@/lib/habit-engine";
import { isAuthConfigured } from "@/lib/auth";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { getDevelopmentHabit, recordDevelopmentHabitLog } from "@/lib/life-system-dev-store";

async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === "development" && !isAuthConfigured()) {
    const { id } = await params; const parsed = await readJson(request); if (parsed.response) return parsed.response;
    const input = parsed.value!;
    if (typeof input.localDate !== "string" || !isValidIsoDate(input.localDate) || !["done", "rest"].includes(String(input.status))) return NextResponse.json({ error: "Provide a valid date and either done or rest status." }, { status: 400 });
    const sessionId = await getLifeModuleDevSession(); const habit = getDevelopmentHabit(sessionId, id);
    if (!habit) return NextResponse.json({ error: "Habit not found." }, { status: 404 });
    const today = localDateKey(new Date(), "Asia/Kolkata");
    if (input.localDate > today) return NextResponse.json({ error: "Future habit logs cannot be recorded." }, { status: 400 });
    if (input.localDate < today && !habit.logs.some(log => log.localDate === input.localDate)) return NextResponse.json({ error: "A new habit log can only be created for today. Existing records can be corrected." }, { status: 400 });
    const weekday = weekdayForLocalDate(input.localDate);
    if (input.status === "done" && !habit.weekdays.includes(weekday)) return NextResponse.json({ error: "This date is not scheduled for the habit." }, { status: 400 });
    if (input.status === "rest" && (habit.weekdays.includes(weekday) || (habit.restDays.length > 0 && !habit.restDays.includes(weekday)))) return NextResponse.json({ error: "This date is not a planned rest day." }, { status: 400 });
    const result = recordDevelopmentHabitLog(sessionId, id, input.localDate, input.status as "done" | "rest", true);
    if (!result) return NextResponse.json({ error: "Habit not found." }, { status: 404 });
    return NextResponse.json({ log: "log" in result ? result.log : result, source: "development-sqlite", reward: "log" in result ? result.reward : null });
  }
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid habit id." }, { status: 400 });
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const input = parsed.value!;
  if (typeof input.localDate !== "string" || !isValidIsoDate(input.localDate) || !["done", "rest"].includes(String(input.status))) return NextResponse.json({ error: "Provide a valid date and either done or rest status." }, { status: 400 });
  try {
    const habit = await Habit.findOne({ _id: id, userId: auth.user._id, archivedAt: null }); if (!habit) throw new Error("Not found");
    const today = localDateKey(new Date(), auth.user.settings.timezone);
    if (input.localDate > today) return NextResponse.json({ error: "Future habit logs cannot be recorded." }, { status: 400 });
    if (input.localDate < today && !await HabitLog.exists({ userId: auth.user._id, habitId: habit._id, localDate: input.localDate })) return NextResponse.json({ error: "A new habit log can only be created for today. Existing records can be corrected." }, { status: 400 });
    const weekday = weekdayForLocalDate(input.localDate);
    if (input.status === "done" && !habit.weekdays.includes(weekday)) return NextResponse.json({ error: "This date is not scheduled for the habit." }, { status: 400 });
    if (input.status === "rest" && (habit.weekdays.includes(weekday) || (habit.restDays.length > 0 && !habit.restDays.includes(weekday)))) return NextResponse.json({ error: "This date is not a planned rest day." }, { status: 400 });
    const log = await recordHabitLog({ userId: auth.user._id, habitId: habit._id, localDate: input.localDate, status: input.status as "done" | "rest" });
    return NextResponse.json({ log });
  } catch (error) { return errorResponse(error); }
}



export const POST = withDevStorageErrors(handlePOST);


