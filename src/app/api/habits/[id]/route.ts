import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getRequestUser, readJson, errorResponse } from "@/lib/http";
import { Habit } from "@/models";
import { isAuthConfigured } from "@/lib/auth";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { getDevelopmentHabit, updateDevelopmentHabit, validateDevelopmentHabit } from "@/lib/life-system-dev-store";

async function handlePATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === "development" && !isAuthConfigured()) {
    const { id } = await params; const parsed = await readJson(request); if (parsed.response) return parsed.response;
    const input = parsed.value!;
    if (input.archived !== undefined && typeof input.archived !== "boolean") return NextResponse.json({ error: "archived must be boolean." }, { status: 400 });
    if (input.archived === true) {
      const result = updateDevelopmentHabit(await getLifeModuleDevSession(), id, { archived: true });
      if (!result) return NextResponse.json({ error: "Habit not found." }, { status: 404 });
      const habit = "habit" in result ? result.habit : result;
      return NextResponse.json({ habit, source: "development-sqlite" });
    }
    const sessionId = await getLifeModuleDevSession(); const existing = getDevelopmentHabit(sessionId, id);
    if (!existing) return NextResponse.json({ error: "Habit not found." }, { status: 404 });
    const current = validateDevelopmentHabit({ ...existing, ...input });
    if (!current.value) return NextResponse.json({ error: current.error }, { status: 400 });
    const result = updateDevelopmentHabit(sessionId, id, current.value);
    if (!result) return NextResponse.json({ error: "Habit not found." }, { status: 404 });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ habit: result.habit, source: "development-sqlite" });
  }
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid habit id." }, { status: 400 });
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const input = parsed.value!; const update: Record<string, unknown> = {};
  if (input.title !== undefined && (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 120)) return NextResponse.json({ error: "Title must be 1 to 120 characters." }, { status: 400 });
  if (input.description !== undefined && (typeof input.description !== "string" || input.description.length > 500)) return NextResponse.json({ error: "Description must be 500 characters or fewer." }, { status: 400 });
  if (input.weekdays !== undefined && (!Array.isArray(input.weekdays) || input.weekdays.length === 0 || input.weekdays.some(day => !Number.isInteger(day) || Number(day) < 0 || Number(day) > 6))) return NextResponse.json({ error: "Choose valid habit weekdays." }, { status: 400 });
  if (input.restDays !== undefined && (!Array.isArray(input.restDays) || input.restDays.some(day => !Number.isInteger(day) || Number(day) < 0 || Number(day) > 6))) return NextResponse.json({ error: "Choose valid planned rest days." }, { status: 400 });
  const weekdays = (input.weekdays ?? []) as number[]; const restDays = (input.restDays ?? []) as number[];
  if (weekdays.some(day => restDays.includes(day))) return NextResponse.json({ error: "A weekday cannot be both scheduled and a planned rest day." }, { status: 400 });
  if (input.archived !== undefined && typeof input.archived !== "boolean") return NextResponse.json({ error: "archived must be boolean." }, { status: 400 });
  if (input.title !== undefined) update.title = input.title.trim();
  if (input.description !== undefined) update.description = input.description;
  if (input.weekdays !== undefined) update.weekdays = (input.weekdays as number[]).filter((day, index, values) => values.indexOf(day) === index);
  if (input.restDays !== undefined) update.restDays = (input.restDays as number[]).filter((day, index, values) => values.indexOf(day) === index);
  if (input.archived === true) update.archivedAt = new Date();
  try { const habit = await Habit.findOneAndUpdate({ _id: id, userId: auth.user._id, archivedAt: null }, { $set: update }, { new: true, runValidators: true }); if (!habit) throw new Error("Not found"); return NextResponse.json({ habit }); }
  catch (error) { return errorResponse(error); }
}



export const PATCH = withDevStorageErrors(handlePATCH);


