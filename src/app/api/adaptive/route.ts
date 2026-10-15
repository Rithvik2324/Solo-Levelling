import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { NextResponse } from "next/server";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { listLifeEntries } from "@/lib/life-module-dev-store";
import { addCalendarDays, weekdayForLocalDate } from "@/lib/progression";
import { buildRecommendations, evaluateAchievements, isReviewWeekStart, validateAdaptiveMutation, weeklyReview } from "@/lib/adaptive-progress";
import { dismissRecommendation, getDismissedRecommendations, getNotificationState, listCommandRecords, listSafeModuleCalendarItems, setNotificationState } from "@/lib/life-system-dev-store";
import { type LifeModuleId } from "@/lib/domain";
import { localDateKey } from "@/lib/progression";

export const dynamic = "force-dynamic";
const modules: LifeModuleId[] = ["fitness", "nutrition", "mind", "academics", "career", "guitar", "flute", "content", "bloom-blend", "zyrenox", "finance"];
function unavailable() { return NextResponse.json({ error: "Adaptive development insights are unavailable outside local development." }, { status: 404 }); }

async function handleGET(request: Request) {
  if (process.env.NODE_ENV !== "development") return unavailable();
  const sessionId = await getLifeModuleDevSession();
  const url = new URL(request.url);
  const today = localDateKey(new Date(), "Asia/Kolkata");
  const weekStart = url.searchParams.get("week") ?? addCalendarDays(today, -((weekdayForLocalDate(today) + 6) % 7));
  if (!isReviewWeekStart(weekStart)) return NextResponse.json({ error: "Choose a Monday to review that week." }, { status: 400 });
  const commands = listCommandRecords(sessionId);
  const entries = modules.flatMap(module => listLifeEntries(sessionId, module));
  const linked = listSafeModuleCalendarItems(sessionId);
  const recommendations = buildRecommendations(commands, linked, today, getDismissedRecommendations(sessionId, today));
  const candidates = [
    ...(!commands.some(item => item.kind === "dailyPlan" && item.date === today) ? [{ id: `planning:${today}`, title: "Daily plan not saved", reason: "No morning plan is recorded for today.", href: "/daily-planning", dueDate: today }] : []),
    ...commands.filter(item => item.kind === "task" && !["done", "cancelled"].includes(item.status) && item.date <= addCalendarDays(today, 2)).map(item => ({ id: `task:${item.id}:${item.date}`, title: item.title, reason: item.date < today ? `Overdue since ${item.date}.` : `Scheduled for ${item.date}.`, href: "/tasks", dueDate: item.date })),
    ...commands.filter(item => item.kind === "event" && item.status === "planned" && item.date >= today && item.date <= addCalendarDays(today, 2)).map(item => ({ id: `event:${item.id}:${item.date}`, title: "Upcoming scheduled event", reason: `A personal event is scheduled for ${item.date}.`, href: "/schedule", dueDate: item.date })),
    ...linked.filter(item => item.status !== "done" && item.status !== "cancelled" && item.date <= addCalendarDays(today, 2)).map(item => ({ id: `source:${item.id}:${item.date}`, title: item.title, reason: `${item.kind} from ${item.source} is dated ${item.date}.`, href: item.href, dueDate: item.date }))
  ];
  const notifications = [...new Map(candidates.map(item => [item.id, item])).values()].sort((a,b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 12).map(item => ({ ...item, ...getNotificationState(sessionId, item.id) })).filter(item => !item.dismissedAt);
  return NextResponse.json({ source: "development-sqlite", notice: "Adaptive results use only records in this browser session. They are saved in local SQLite, award no XP, and are not shared with other accounts.", recommendations, achievements: evaluateAchievements(entries, commands), review: weeklyReview(commands, entries, weekStart), notifications });
}

async function handlePATCH(request: Request) {
  if (process.env.NODE_ENV !== "development") return unavailable();
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const today = localDateKey(new Date(), "Asia/Kolkata");
  const mutation = validateAdaptiveMutation(body, today);
  if (!mutation) return NextResponse.json({ error: "Choose a valid read, dismiss, or current-day recommendation action." }, { status: 400 });
  const sessionId = await getLifeModuleDevSession();
  const commands = listCommandRecords(sessionId);
  const linked = listSafeModuleCalendarItems(sessionId);
  const candidateIds = new Set([
    ...buildRecommendations(commands, linked, today).map(item => item.id),
    ...commands.filter(item => item.kind === "task" && !["done", "cancelled"].includes(item.status) && item.date <= addCalendarDays(today, 2)).map(item => `task:${item.id}:${item.date}`),
    ...commands.filter(item => item.kind === "event" && item.status === "planned" && item.date >= today && item.date <= addCalendarDays(today, 2)).map(item => `event:${item.id}:${item.date}`),
    ...(!commands.some(item => item.kind === "dailyPlan" && item.date === today) ? [`planning:${today}`] : []),
    ...linked.filter(item => item.status !== "done" && item.status !== "cancelled" && item.date <= addCalendarDays(today, 2)).map(item => `source:${item.id}:${item.date}`)
  ]);
  if (!candidateIds.has(mutation.id)) return NextResponse.json({ error: "This recommendation or notification is no longer available." }, { status: 404 });
  if (mutation.action === "dismiss-recommendation") { dismissRecommendation(sessionId, today, mutation.id); return NextResponse.json({ saved: true }); }
  const state = setNotificationState(sessionId, mutation.id, mutation.action); return NextResponse.json({ saved: true, state });
}




export const GET = withDevStorageErrors(handleGET);
export const PATCH = withDevStorageErrors(handlePATCH);


