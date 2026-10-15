import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { NextResponse } from "next/server";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { createCommandRecord, deletePersonalCommandRecord, developmentHabitCalendarItems, listCommandRecords, listSafeModuleCalendarItems, summarizeDevelopmentHabits, updateCommandRecord, validateCommandRecord } from "@/lib/life-system-dev-store";
import { isValidIsoDate } from "@/lib/domain";
import { addCalendarDays, weekdayForLocalDate } from "@/lib/progression";
import { listQuestInstancesRange } from "@/lib/quest-engine";
import { canTransitionTaskStatus } from "@/lib/life-system-query";
import { getRequestUser } from "@/lib/http";
import { Habit, HabitLog } from "@/models";
import { isAuthConfigured } from "@/lib/auth";

function unavailable() { return NextResponse.json({ error: "Unified planning records are available only in local development." }, { status: 404 }); }
async function handleGET(request: Request) {
  if (process.env.NODE_ENV !== "development") return unavailable();
  const sessionId = await getLifeModuleDevSession();
  const url = new URL(request.url); const now = new Date(); const localToday = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const requestedToday = url.searchParams.get("today"); const today = requestedToday && isValidIsoDate(requestedToday) ? requestedToday : localToday;
  const from = url.searchParams.get("from") ?? today; const to = url.searchParams.get("to") ?? addCalendarDays(today, 7);
  if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to || (new Date(`${to}T00:00:00`).getTime()-new Date(`${from}T00:00:00`).getTime())/86400000 > 62) return NextResponse.json({ error: "Provide a valid date range of up to 63 days." }, { status: 400 });
  const localDevelopment = process.env.NODE_ENV === "development" && !isAuthConfigured();
  let linkedItems = [...listSafeModuleCalendarItems(sessionId), ...(localDevelopment ? developmentHabitCalendarItems(sessionId, from, to) : [])]; let engineError: string | undefined;
  const auth = await getRequestUser();
  if (auth.response) engineError = auth.response.status === 503 ? "Authenticated System Engine data is not configured or currently available." : "Sign in to load your quests and habits.";
  else try {
    const userId = auth.user._id;
    const [quests, habits, logs] = await Promise.all([
      listQuestInstancesRange(userId, from, to),
      Habit.find({ userId, archivedAt: null }).select("title weekdays restDays").lean(),
      HabitLog.find({ userId, localDate: { $gte: from, $lte: to } }).select("habitId localDate status").lean()
    ]);
    const questItems = quests.map(item => ({ id: `quest:${item._id}:${item.occurrenceKey}`, title: String((item as unknown as { title: string }).title), date: item.dueDate!, kind: "Quest", source: "System Engine", status: item.completed ? "done" : "planned", href: `/quests#quest-${item._id}`, priority: "normal" }));
    const habitItems = habits.flatMap(habit => {
      const habitLogs = logs.filter(log => String(log.habitId) === String(habit._id));
      return Array.from({ length: (new Date(`${to}T00:00:00`).getTime()-new Date(`${from}T00:00:00`).getTime())/86400000+1 }, (_, index) => addCalendarDays(from,index)).flatMap(date => {
        const weekday = weekdayForLocalDate(date); const restDays = habit.restDays ?? []; const weekdays = habit.weekdays ?? [];
        if (!weekdays.includes(weekday) && !restDays.includes(weekday)) return [];
        const log = habitLogs.find(item => item.localDate === date);
        return [{ id: `habit:${String(habit._id)}:${date}`, title: habit.title, date, kind: "Habit", source: "Habits", status: log?.status === "done" ? "done" : log?.status === "rest" ? "rest" : restDays.includes(weekday) ? "rest" : "planned", href: `/habits#habit-${String(habit._id)}`, priority: "normal" }];
      });
    });
    linkedItems = [...linkedItems, ...questItems, ...habitItems];
  } catch { engineError = "Authenticated System Engine data is not currently available."; }
  const records = listCommandRecords(sessionId); const detail = url.searchParams.get("detail") === "1";
  const responseRecords = detail ? records : records.filter(item => item.kind !== "dailyReview").map(item => ({ ...item, description: "", fields: item.kind === "dailyPlan" ? { intention: item.fields.intention ?? "", availableMinutes: item.fields.availableMinutes ?? 0, topPriorities: item.fields.topPriorities ?? "" } : item.kind === "focusBlock" ? { priority: item.fields.priority ?? "normal", elapsedSeconds: item.fields.elapsedSeconds ?? 0, plannedMinutes: item.fields.plannedMinutes ?? 0 } : item.kind === "event" ? { priority: item.fields.priority ?? "normal", category: item.fields.category ?? "Personal", startTime: item.fields.startTime ?? "", endTime: item.fields.endTime ?? "", location: item.fields.location ?? "" } : { priority: item.fields.priority ?? "normal", category: item.fields.category ?? "", source: item.fields.source ?? "Personal", estimatedMinutes: item.fields.estimatedMinutes ?? 0 } }));
  return NextResponse.json({ records: responseRecords, linkedItems, developmentHabits: localDevelopment ? summarizeDevelopmentHabits(sessionId, today) : undefined, engineError, range: { from, to }, source: "development-sqlite", notice: "Command center records are persistent on this development server." });
}
async function handlePOST(request: Request) {
  if (process.env.NODE_ENV !== "development") return unavailable();
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = validateCommandRecord(body); if (!parsed.value) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const sessionId = await getLifeModuleDevSession();
  if (parsed.value.kind === "focusBlock" && typeof parsed.value.fields.relatedId === "string" && parsed.value.fields.relatedId) {
    const relation = String(parsed.value.fields.relatedId);
    const localIds = new Set([...listCommandRecords(sessionId).filter(item => item.kind === "task" && item.status !== "cancelled").map(item => item.id), ...listSafeModuleCalendarItems(sessionId).map(item => item.id)]);
    if (!relation.startsWith("quest:") && !localIds.has(relation)) return NextResponse.json({ error: "The linked task or source record is not available in this session." }, { status: 404 });
    if (relation.startsWith("quest:")) {
      const auth = await getRequestUser(); if (auth.response) return NextResponse.json({ error: "Sign in and connect the System Engine before linking a quest." }, { status: 401 });
      const [prefix, questId, ...occurrenceParts] = relation.split(":"); const occurrenceKey = occurrenceParts.join(":"); const scheduled = await listQuestInstancesRange(auth.user._id, parsed.value.date, parsed.value.date);
      if (prefix !== "quest" || !scheduled.some(item => item._id === questId && item.occurrenceKey === occurrenceKey)) return NextResponse.json({ error: "The linked quest is not scheduled for this date." }, { status: 404 });
    }
  }
  if (parsed.value.kind === "dailyPlan") {
    const selected = String(parsed.value.fields.topPriorities ?? "").split(",").filter(Boolean);
    const safeIds = new Set([...listCommandRecords(sessionId).filter(item => item.kind === "task" && item.status !== "done").map(item => item.id), ...listSafeModuleCalendarItems(sessionId).filter(item => item.status !== "done").map(item => item.id)]);
    const questIds = selected.filter(id => id.startsWith("quest:"));
    for (const id of selected.filter(value => !value.startsWith("quest:"))) if (!safeIds.has(id)) return NextResponse.json({ error: "A selected priority is no longer available in this session." }, { status: 400 });
    if (questIds.length) {
      const auth = await getRequestUser(); if (auth.response) return NextResponse.json({ error: "Sign in and connect the System Engine before including a quest in this plan." }, { status: 401 });
      const scheduled = await listQuestInstancesRange(auth.user._id, parsed.value.date, parsed.value.date);
      for (const id of questIds) { const [prefix, questId, ...occurrenceParts] = id.split(":"); const occurrenceKey = occurrenceParts.join(":"); if (prefix !== "quest" || !scheduled.some(item => item._id === questId && item.occurrenceKey === occurrenceKey && !item.completed)) return NextResponse.json({ error: "A selected quest occurrence is not scheduled for this plan date." }, { status: 404 }); }
    }
  }
  const record = createCommandRecord(sessionId, parsed.value);
  return NextResponse.json({ record }, { status: 201 });
}
async function handlePATCH(request: Request) {
  if (process.env.NODE_ENV !== "development") return unavailable();
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Provide a valid record update." }, { status: 400 });
  const input = body as Record<string, unknown>; if (typeof input.id !== "string") return NextResponse.json({ error: "Record id is required." }, { status: 400 });
  const sessionId = await getLifeModuleDevSession(); const existing = listCommandRecords(sessionId).find(item => item.id === input.id);
  if (!existing) return NextResponse.json({ error: "Record not found." }, { status: 404 });
  if (input.kind !== undefined && input.kind !== existing.kind) return NextResponse.json({ error: "Record type cannot be changed." }, { status: 400 });
  if (existing.kind === "task" && typeof input.status === "string" && !canTransitionTaskStatus(existing.status, input.status)) return NextResponse.json({ error: "That task status transition is not allowed." }, { status: 409 });
  const parsed = validateCommandRecord({ ...existing, ...input, kind: existing.kind, status: existing.kind === "focusBlock" ? existing.status : input.status ?? existing.status, fields: existing.kind === "focusBlock" ? existing.fields : input.fields ?? existing.fields });
  if (!parsed.value) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const record = updateCommandRecord(sessionId, existing.id, parsed.value);
  return record ? NextResponse.json({ record }) : NextResponse.json({ error: "Record not found." }, { status: 404 });
}
async function handleDELETE(request: Request) {
  if (process.env.NODE_ENV !== "development") return unavailable();
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as Record<string, unknown>).id !== "string") return NextResponse.json({ error: "Provide a personal task or event id." }, { status: 400 });
  const deleted = deletePersonalCommandRecord(await getLifeModuleDevSession(), String((body as Record<string, unknown>).id));
  return deleted ? NextResponse.json({ deleted: true, id: deleted.id }) : NextResponse.json({ error: "Personal task or event not found." }, { status: 404 });
}



export const GET = withDevStorageErrors(handleGET);
export const POST = withDevStorageErrors(handlePOST);
export const PATCH = withDevStorageErrors(handlePATCH);
export const DELETE = withDevStorageErrors(handleDELETE);


