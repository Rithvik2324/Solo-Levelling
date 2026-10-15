import assert from "node:assert/strict";
import test from "node:test";
import { createCommandRecord, createDevelopmentHabit, deletePersonalCommandRecord, developmentHabitCalendarItems, developmentHabitSummary, getDevelopmentHabit, listCommandRecords, listDevelopmentHabits, listSafeModuleCalendarItems, recordDevelopmentHabitLog, transitionFocusRecord, updateCommandRecord, updateDevelopmentHabit, validateCommandRecord, validateDevelopmentHabit } from "@/lib/life-system-dev-store";
import { archiveLifeEntry, createLifeEntry, updateLifeEntry } from "@/lib/life-module-dev-store";
import { canTransitionTaskStatus, countsAsWeeklyPractice, filterCommandTasks, filterLinkedTaskItems, isOpenScheduledRecord, isScheduledRecordVisible, navigateCalendarDate, resolvePlanPriorities } from "@/lib/life-system-query";

function focus(sessionId: string) {
  const parsed = validateCommandRecord({ kind: "focusBlock", title: "Study focus", description: "", date: "2026-10-12", fields: { plannedMinutes: 25, breakMinutes: 5, elapsedSeconds: 0 } });
  assert.equal(parsed.error, null); assert.ok(parsed.value);
  return createCommandRecord(sessionId, parsed.value);
}

test("calendar dates, local times, ranges, and focus durations are validated", () => {
  assert.ok(validateCommandRecord({ kind: "event", title: "Bad date", description: "", date: "2026-02-31", fields: {} }).error);
  assert.ok(validateCommandRecord({ kind: "event", title: "Bad range", description: "", date: "2026-10-12", fields: { startTime: "14:00", endTime: "13:00" } }).error);
  assert.ok(validateCommandRecord({ kind: "event", title: "Bad clock", description: "", date: "2026-10-12", fields: { startTime: "25:00" } }).error);
  assert.equal(validateCommandRecord({ kind: "event", title: "Local appointment", description: "", date: "2026-10-12", fields: { category: "Personal", startTime: "14:00" } }).error, null);
  assert.ok(validateCommandRecord({ kind: "event", title: "Orphan end", description: "", date: "2026-10-12", fields: { category: "Personal", endTime: "15:00" } }).error);
  assert.ok(validateCommandRecord({ kind: "task", title: "Bad task range", description: "", date: "2026-10-12", fields: { startDate: "2026-10-13", estimatedMinutes: 30 } }).error);
  assert.ok(validateCommandRecord({ kind: "focusBlock", title: "Too long", description: "", date: "2026-10-12", fields: { plannedMinutes: 500, breakMinutes: 5 } }).error);
});

test("calendar navigation moves month, week, and day views by calendar boundaries", () => {
  assert.equal(navigateCalendarDate("2026-01-31", "month", 1), "2026-02-28");
  assert.equal(navigateCalendarDate("2026-12-31", "month", 1), "2027-01-31");
  assert.equal(navigateCalendarDate("2026-10-12", "week", 1), "2026-10-19");
  assert.equal(navigateCalendarDate("2026-10-12", "day", -1), "2026-10-11");
});

test("daily plans and reviews upsert by session and date; sessions stay isolated", () => {
  const makePlan = (title: string) => { const value = validateCommandRecord({ kind: "dailyPlan", title, description: "notes", date: "2026-10-12", fields: { availableMinutes: 60, topPriorities: "task-a,task-b", intention: "show up" } }); assert.ok(value.value); return value.value!; };
  const first = createCommandRecord("planning-a", makePlan("Plan one"));
  const second = createCommandRecord("planning-a", makePlan("Plan revised"));
  assert.equal(first.id, second.id); assert.equal(listCommandRecords("planning-a").length, 1); assert.equal(listCommandRecords("planning-b").length, 0);
});

test("focus timer starts, pauses, resumes, finishes once, and rejects changes after finish", () => {
  const record = focus("focus-state-a"); const base = 1_800_000_000_000;
  assert.equal(transitionFocusRecord("focus-state-a", record.id, "start", base).record?.status, "running");
  assert.equal(transitionFocusRecord("focus-state-a", record.id, "pause", base + 10_500).record?.fields.elapsedSeconds, 10);
  assert.equal(transitionFocusRecord("focus-state-a", record.id, "resume", base + 20_000).record?.status, "running");
  const finished = transitionFocusRecord("focus-state-a", record.id, "finish", base + 31_900);
  assert.equal(finished.record?.status, "done"); assert.equal(finished.record?.fields.elapsedSeconds, 21);
  assert.equal(transitionFocusRecord("focus-state-a", record.id, "finish", base + 40_000).alreadyFinished, true);
  assert.equal(transitionFocusRecord("focus-state-a", record.id, "start", base + 50_000).error, "That focus action is not valid for this block.");
});

test("repeating request keys deduplicate; personal event dates do not create copies of linked module records", () => {
  const input = validateCommandRecord({ kind: "task", title: "Repeat task", description: "", date: "2026-10-12", fields: { priority: "high", dedupeKey: "weekly:2026-10-12" } });
  assert.ok(input.value); const a = createCommandRecord("dedupe-a", input.value!); const b = createCommandRecord("dedupe-a", input.value!);
  assert.equal(a.id, b.id); assert.equal(listCommandRecords("dedupe-a").length, 1);
  assert.equal(listSafeModuleCalendarItems("dedupe-a").length, 0);
});

test("task board filters actual dates, status, category, priority, source, and search; transitions stay explicit", () => {
  const build = (title: string, date: string, status: string, fields: Record<string, string|number|boolean>) => { const input = validateCommandRecord({ kind: "task", title, description: "notes", date, status, fields }); assert.ok(input.value); return createCommandRecord("task-filter-a", input.value!); };
  build("Urgent algorithms", "2026-10-11", "todo", { priority: "urgent", category: "Study", source: "Personal" });
  build("Finished project", "2026-10-12", "done", { priority: "normal", category: "Career", source: "Personal" });
  build("Future guitar", "2026-10-15", "todo", { priority: "high", category: "Music", source: "Personal" });
  assert.equal(filterCommandTasks(listCommandRecords("task-filter-a"), { view: "overdue", today: "2026-10-12" }).length, 1);
  assert.equal(filterCommandTasks(listCommandRecords("task-filter-a"), { view: "completed", today: "2026-10-12", category: "career" })[0].title, "Finished project");
  assert.equal(filterCommandTasks(listCommandRecords("task-filter-a"), { view: "upcoming", today: "2026-10-12", priority: "high", search: "guitar" }).length, 1);
  assert.equal(canTransitionTaskStatus("todo", "in progress"), true); assert.equal(canTransitionTaskStatus("in progress", "done"), true); assert.equal(canTransitionTaskStatus("done", "in progress"), false);
});

test("schedule summaries exclude cancelled and archived records but preserve completed and planned rest entries", () => {
  assert.equal(isScheduledRecordVisible("cancelled"), false);
  assert.equal(isScheduledRecordVisible("archived"), false);
  assert.equal(isScheduledRecordVisible("done"), true);
  assert.equal(isScheduledRecordVisible("rest"), true);
  assert.equal(isOpenScheduledRecord("done"), false);
  assert.equal(isOpenScheduledRecord("rest"), false);
  assert.equal(isOpenScheduledRecord("cancelled"), false);
  assert.equal(isOpenScheduledRecord("todo"), true);
  assert.equal(countsAsWeeklyPractice("Fitness", "Workout session"), true);
  assert.equal(countsAsWeeklyPractice("Fitness", "Martial arts technique"), true);
  assert.equal(countsAsWeeklyPractice("Guitar", "Practice session"), true);
  assert.equal(countsAsWeeklyPractice("Flute", "Workout session"), false);
});

test("linked task overdue view excludes cancelled, archived, completed, and planned-rest entries", () => {
  const items = ["planned", "cancelled", "archived", "done", "rest"].map(status => ({ id: status, title: status, date: "2026-10-11", kind: "Habit", source: "Habits", status, href: "/habits", priority: "normal" }));
  const overdue = filterLinkedTaskItems(items, { view: "overdue", today: "2026-10-12", selectedDate: "2026-10-12" });
  assert.deepEqual(overdue.map(item => item.status), ["planned"]);
  const quests = [{ id: "quest-occurrence", title: "Quest", date: "2026-10-12", kind: "Quest", source: "System Engine", status: "planned", href: "/quests", priority: "normal" }];
  assert.equal(filterLinkedTaskItems(quests, { view: "today", today: "2026-10-12", selectedDate: "2026-10-12" }).length, 0);
});

test("editing a dated task updates its task-board date without creating a second record", () => {
  const session = `task-edit-${Date.now()}`;
  const parsed = validateCommandRecord({ kind: "task", title: "Study topic", description: "", date: "2026-10-12", fields: { priority: "high", source: "Personal" } });
  assert.ok(parsed.value);
  const original = createCommandRecord(session, parsed.value!);
  const update = validateCommandRecord({ ...original, date: "2026-10-14", status: "done" });
  assert.ok(update.value);
  updateCommandRecord(session, original.id, update.value!);
  const records = listCommandRecords(session);
  assert.equal(records.length, 1);
  assert.equal(filterCommandTasks(records, { view: "completed", today: "2026-10-12" })[0].date, "2026-10-14");
  assert.ok(validateCommandRecord({ ...original, date: "2026-02-31" }).error);
});

test("personal task and event deletion removes only the owned command record", () => {
  const session = `delete-command-${Date.now()}`;
  const taskInput = validateCommandRecord({ kind: "task", title: "Remove task", description: "", date: "2026-10-12", fields: {} });
  const eventInput = validateCommandRecord({ kind: "event", title: "Remove event", description: "", date: "2026-10-12", fields: { category: "Personal" } });
  const focusInput = validateCommandRecord({ kind: "focusBlock", title: "Keep focus history", description: "", date: "2026-10-12", fields: { plannedMinutes: 25, breakMinutes: 5 } });
  assert.ok(taskInput.value && eventInput.value && focusInput.value);
  const task = createCommandRecord(session, taskInput.value);
  const event = createCommandRecord(session, eventInput.value);
  const focusRecord = createCommandRecord(session, focusInput.value);
  assert.equal(deletePersonalCommandRecord(session, task.id)?.id, task.id);
  assert.equal(deletePersonalCommandRecord(session, event.id)?.id, event.id);
  assert.equal(deletePersonalCommandRecord(session, focusRecord.id), null);
  assert.equal(deletePersonalCommandRecord(session, task.id), null);
  assert.deepEqual(listCommandRecords(session).map(item => item.id), [focusRecord.id]);
  assert.equal(listCommandRecords(`${session}-other`).length, 0);
});

test("dashboard resolves saved plan priorities to their current source records", () => {
  const session = `plan-priority-${Date.now()}`;
  const parsed = validateCommandRecord({ kind: "task", title: "Read chapter", description: "", date: "2026-10-12", fields: { priority: "high" } });
  assert.ok(parsed.value);
  const task = createCommandRecord(session, parsed.value!);
  const linked = { id: "fitness:workout", title: "Strength session", date: "2026-10-12", kind: "Workout session", source: "Fitness", status: "planned", href: "/fitness#record-workout", priority: "normal" };
  assert.deepEqual(resolvePlanPriorities(`${task.id},fitness:workout,removed-id`, [task], [linked]), [
    { id: task.id, title: "Read chapter", href: "/tasks", unavailable: false },
    { id: "fitness:workout", title: "Strength session", href: "/fitness#record-workout", unavailable: false },
    { id: "removed-id", title: "Selected item is no longer available", href: "/daily-planning", unavailable: true }
  ]);
});

test("local habits support validated schedules, idempotent daily logs, history, summaries, and archive", () => {
  const session = `local-habit-${Date.now()}`;
  assert.ok(validateDevelopmentHabit({ title: "Invalid overlap", weekdays: [1], restDays: [1] }).error);
  const parsed = validateDevelopmentHabit({ title: "Mobility", description: "Easy daily movement", weekdays: [1, 2], restDays: [0] });
  assert.ok(parsed.value);
  const habit = createDevelopmentHabit(session, parsed.value!);
  assert.equal(listDevelopmentHabits(session, "2026-10-12", "2026-10-12", "2026-10-12").length, 1);
  recordDevelopmentHabitLog(session, habit.id, "2026-10-12", "done");
  recordDevelopmentHabitLog(session, habit.id, "2026-10-12", "done");
  assert.equal(getDevelopmentHabit(session, habit.id)?.logs.length, 1);
  assert.equal(developmentHabitSummary(session, "2026-10-12").completedToday, 1);
  assert.equal(developmentHabitSummary(session, "2026-10-12").scheduled, 1);
  assert.equal(developmentHabitCalendarItems(session, "2026-10-12", "2026-10-13").filter(item => item.status === "done").length, 1);
  assert.equal(listDevelopmentHabits(`${session}-other`, "2026-10-12", "2026-10-12", "2026-10-12").length, 0);
  assert.ok(updateDevelopmentHabit(session, habit.id, { archived: true }));
  assert.equal(listDevelopmentHabits(session, "2026-10-12", "2026-10-12", "2026-10-12").length, 0);
});

test("calendar integrations reference source records once and redact private journal and finance details", () => {
  const practice = createLifeEntry("calendar-source-a", "guitar", { title: "Scale practice", kind: "Practice session", description: "notes", date: "2026-10-12", fields: { durationMinutes: 30 } });
  createLifeEntry("calendar-source-a", "mind", { title: "Very private journal title", kind: "Journal entry", description: "private body", date: "2026-10-12", fields: {} });
  createLifeEntry("calendar-source-a", "finance", { title: "Private transaction", kind: "Transaction", description: "cash", date: "2026-10-12", fields: { amount: 9000, flowType: "expense" } });
  const links = listSafeModuleCalendarItems("calendar-source-a");
  assert.equal(links.length, 2);
  assert.equal(links.filter(item => item.id === `guitar:${practice.id}`).length, 1);
  assert.equal(links.find(item => item.source === "Mind")?.title, "Private reflection reminder");
  assert.equal(listCommandRecords("calendar-source-a").length, 0);
  assert.equal(updateLifeEntry("calendar-source-a", "guitar", practice.id, { date: "2026-10-15" })?.date, "2026-10-15");
  assert.equal(listSafeModuleCalendarItems("calendar-source-a").find(item => item.id === `guitar:${practice.id}`)?.date, "2026-10-15");
  archiveLifeEntry("calendar-source-a", "guitar", practice.id);
  assert.equal(listSafeModuleCalendarItems("calendar-source-a").some(item => item.id === `guitar:${practice.id}`), false);
});
