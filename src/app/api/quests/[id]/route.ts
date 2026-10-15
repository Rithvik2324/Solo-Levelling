import { NextResponse } from "next/server";
import { getRequestUser, readJson, errorResponse } from "@/lib/http";
import { Quest, QuestCompletion, QuestScheduleOverride } from "@/models";
import mongoose from "mongoose";
import { isValidIsoDate } from "@/lib/domain";
import { localDateKey, weekdayForLocalDate } from "@/lib/progression";
import { calculateQuestXp, occurrenceKeyFor } from "@/lib/quest-engine";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid quest id." }, { status: 400 });
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const input = parsed.value!;
  try {
    if (input.rescheduleDate !== undefined) {
      if (typeof input.rescheduleDate !== "string" || !isValidIsoDate(input.rescheduleDate) || typeof input.occurrenceKey !== "string" || input.occurrenceKey.length > 40) return NextResponse.json({ error: "Provide a valid reschedule date and occurrence." }, { status: 400 });
      const quest = await Quest.findOne({ _id: id, userId: auth.user._id, archivedAt: null }); if (!quest) throw new Error("Not found");
      const today = localDateKey(new Date(), auth.user.settings.timezone);
      if (quest.recurrence === "once") {
        if (input.occurrenceKey !== "once") return NextResponse.json({ error: "Invalid one-time quest occurrence." }, { status: 400 });
        const completed = await QuestCompletion.exists({ userId: auth.user._id, questId: quest._id, occurrenceKey: "once" });
        if (completed) return NextResponse.json({ error: "Completed quests cannot be rescheduled." }, { status: 409 });
        quest.dueDate = input.rescheduleDate;
      }
      if (quest.recurrence !== "once") {
        const expected = occurrenceKeyFor(quest.recurrence, today);
        const scheduleEligible = quest.weekdays.length === 0 || quest.weekdays.includes(weekdayForLocalDate(today));
        const existsToday = await QuestScheduleOverride.exists({ userId: auth.user._id, questId: quest._id, occurrenceKey: input.occurrenceKey, dueDate: today });
        if (input.occurrenceKey !== expected && !existsToday) return NextResponse.json({ error: "Only today's scheduled occurrence can be rescheduled." }, { status: 400 });
        if (input.occurrenceKey === expected && !scheduleEligible && !existsToday) return NextResponse.json({ error: "This occurrence is not scheduled for today." }, { status: 400 });
        const completed = await QuestCompletion.exists({ userId: auth.user._id, questId: quest._id, occurrenceKey: input.occurrenceKey });
        if (completed) return NextResponse.json({ error: "Completed quest occurrences cannot be rescheduled." }, { status: 409 });
        await QuestScheduleOverride.findOneAndUpdate({ userId: auth.user._id, questId: quest._id, occurrenceKey: input.occurrenceKey }, { $set: { dueDate: input.rescheduleDate }, $setOnInsert: { userId: auth.user._id, questId: quest._id, occurrenceKey: input.occurrenceKey } }, { upsert: true, new: true, runValidators: true });
      }
      if (quest.recurrence === "once") await quest.save();
      return NextResponse.json({ ok: true });
    }
    const update: Record<string, unknown> = {};
    if (input.archived === true) update.archivedAt = new Date();
    if (input.archived !== undefined && typeof input.archived !== "boolean") return NextResponse.json({ error: "archived must be boolean." }, { status: 400 });
    if (input.title !== undefined) { if (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 120) return NextResponse.json({ error: "Title must be 1 to 120 characters." }, { status: 400 }); update.title = input.title.trim(); }
    if (input.category !== undefined) { if (typeof input.category !== "string" || !input.category.trim() || input.category.trim().length > 60) return NextResponse.json({ error: "Category must be 1 to 60 characters." }, { status: 400 }); update.category = input.category.trim(); }
    if (input.description !== undefined) { if (typeof input.description !== "string" || input.description.length > 2000) return NextResponse.json({ error: "Description must be 2000 characters or fewer." }, { status: 400 }); update.description = input.description; }
    if (input.xpReward !== undefined) return NextResponse.json({ error: "XP reward is calculated by the server from quest difficulty and duration." }, { status: 400 });
    if (input.recurrence !== undefined) { if (!["once", "daily", "weekly"].includes(String(input.recurrence))) return NextResponse.json({ error: "Invalid recurrence." }, { status: 400 }); update.recurrence = input.recurrence; }
    if (input.weekdays !== undefined) { if (!Array.isArray(input.weekdays) || input.weekdays.some(day => !Number.isInteger(day) || Number(day) < 0 || Number(day) > 6)) return NextResponse.json({ error: "Invalid weekdays." }, { status: 400 }); const days = input.weekdays as number[]; update.weekdays = days.filter((day, index) => days.indexOf(day) === index); }
    if (input.dueDate !== undefined) { if (typeof input.dueDate !== "string" || !isValidIsoDate(input.dueDate)) return NextResponse.json({ error: "Invalid due date." }, { status: 400 }); update.dueDate = input.dueDate; }
    if (input.difficulty !== undefined) { if (!["easy", "normal", "hard", "elite"].includes(String(input.difficulty))) return NextResponse.json({ error: "Invalid difficulty." }, { status: 400 }); update.difficulty = input.difficulty; }
    if (input.estimatedMinutes !== undefined) { if (typeof input.estimatedMinutes !== "number" || !Number.isInteger(input.estimatedMinutes) || input.estimatedMinutes < 1 || input.estimatedMinutes > 1440) return NextResponse.json({ error: "Estimated duration must be 1 to 1440 minutes." }, { status: 400 }); update.estimatedMinutes = input.estimatedMinutes; }
    const current = await Quest.findOne({ _id: id, userId: auth.user._id, archivedAt: null });
    if (!current) throw new Error("Not found");
    if (input.difficulty !== undefined || input.estimatedMinutes !== undefined) update.xpReward = calculateQuestXp((update.difficulty ?? current.difficulty) as "easy" | "normal" | "hard" | "elite", Number(update.estimatedMinutes ?? current.estimatedMinutes));
    const quest = await Quest.findOneAndUpdate({ _id: id, userId: auth.user._id, archivedAt: null }, { $set: update }, { new: true, runValidators: true });
    if (!quest) throw new Error("Not found");
    return NextResponse.json({ quest });
  } catch (error) { return errorResponse(error); }
}

