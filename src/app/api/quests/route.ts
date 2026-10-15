import { NextResponse } from "next/server";
import { getRequestUser, readJson, errorResponse } from "@/lib/http";
import { calculateQuestXp, listQuestInstances } from "@/lib/quest-engine";
import { Quest } from "@/models";
import { isValidIsoDate } from "@/lib/domain";
import { localDateKey } from "@/lib/progression";

export async function GET(request: Request) {
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? localDateKey(new Date(), auth.user.settings.timezone);
    if (!isValidIsoDate(date)) return NextResponse.json({ error: "Invalid date filter." }, { status: 400 });
    let quests = await listQuestInstances(auth.user._id, date, auth.user.settings.timezone);
    const categories: string[] = await Quest.distinct("category", { userId: auth.user._id, archivedAt: null });
    const category = url.searchParams.get("category"); const status = url.searchParams.get("status");
    if (category) quests = quests.filter(quest => (quest as unknown as { category: string }).category.toLowerCase() === category.toLowerCase());
    if (status === "open") quests = quests.filter(quest => !quest.completed);
    if (status === "completed") quests = quests.filter(quest => quest.completed);
    if (status && !["open", "completed"].includes(status)) return NextResponse.json({ error: "Invalid quest status filter." }, { status: 400 });
    return NextResponse.json({ quests, date, categories });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const input = parsed.value!;
  if (input.xpReward !== undefined) return NextResponse.json({ error: "XP reward is calculated by the server; do not submit an XP value." }, { status: 400 });
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const category = typeof input.category === "string" ? input.category.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const recurrence = input.recurrence;
  const weekdays = Array.isArray(input.weekdays) ? input.weekdays : [];
  if (!title || title.length > 120 || category.length < 1 || category.length > 60 || description.length > 2000) return NextResponse.json({ error: "Provide a title, category, and description within the allowed lengths." }, { status: 400 });
  if (!["once", "daily", "weekly"].includes(String(recurrence)) || !weekdays.every(day => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6)) return NextResponse.json({ error: "Invalid recurrence or weekdays." }, { status: 400 });
  if (input.dueDate !== undefined && (typeof input.dueDate !== "string" || !isValidIsoDate(input.dueDate))) return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
  if (input.difficulty !== undefined && !["easy", "normal", "hard", "elite"].includes(String(input.difficulty))) return NextResponse.json({ error: "Invalid difficulty." }, { status: 400 });
  if (input.estimatedMinutes !== undefined && typeof input.estimatedMinutes !== "number") return NextResponse.json({ error: "Estimated duration must be a whole number of minutes." }, { status: 400 });
  const minutes = input.estimatedMinutes ?? 30;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return NextResponse.json({ error: "Estimated duration must be 1 to 1440 minutes." }, { status: 400 });
  try {
    const difficulty = (input.difficulty ?? "normal") as "easy" | "normal" | "hard" | "elite";
    const quest = await Quest.create({ userId: auth.user._id, title, category, description, xpReward: calculateQuestXp(difficulty, minutes), recurrence, weekdays, dueDate: input.dueDate, difficulty, estimatedMinutes: minutes });
    return NextResponse.json({ quest }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

