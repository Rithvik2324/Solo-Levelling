import type { CommandRecord, LinkedCalendarItem } from "@/lib/life-system-dev-store";
import { isValidIsoDate } from "@/lib/domain";

export function navigateCalendarDate(date: string, mode: "month" | "week" | "day" | "agenda", amount: number) {
  if (!isValidIsoDate(date) || !Number.isInteger(amount)) return date;
  if (mode === "month") {
    const [year, month, day] = date.split("-").map(Number);
    const target = new Date(year, month - 1 + amount, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,"0")}-${String(Math.min(day,lastDay)).padStart(2,"0")}`;
  }
  const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + amount * (mode === "week" ? 7 : 1));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export type TaskView = "today" | "upcoming" | "overdue" | "completed" | "all";
const taskTransitions: Record<string, readonly string[]> = {
  todo: ["in progress", "done", "cancelled"],
  "in progress": ["todo", "done", "cancelled"],
  done: ["todo"],
  cancelled: ["todo"]
};

export function canTransitionTaskStatus(current: string, next: string) {
  return current === next || taskTransitions[current]?.includes(next) === true;
}

export function isScheduledRecordVisible(status: string) {
  return status !== "cancelled" && status !== "archived";
}

export function isOpenScheduledRecord(status: string) {
  return isScheduledRecordVisible(status) && status !== "done" && status !== "rest";
}

export function countsAsWeeklyPractice(source: string, kind: string) {
  return (["Guitar", "Flute"].includes(source) && kind === "Practice session") ||
    (source === "Fitness" && ["Training session", "Workout session", "Martial arts technique"].includes(kind));
}

export function resolvePlanPriorities(idsValue: unknown, records: { id: string; kind: string; title: string }[], linkedItems: Pick<LinkedCalendarItem, "id" | "title" | "href">[]) {
  const ids = typeof idsValue === "string" ? idsValue.split(",").filter(Boolean) : [];
  return ids.map(id => {
    const task = records.find(record => record.id === id && record.kind === "task");
    const linked = linkedItems.find(item => item.id === id);
    return task ? { id, title: task.title, href: "/tasks", unavailable: false } :
      linked ? { id, title: linked.title, href: linked.href, unavailable: false } :
      { id, title: "Selected item is no longer available", href: "/daily-planning", unavailable: true };
  });
}

export function filterCommandTasks(records: CommandRecord[], options: { view: TaskView; today: string; priority?: string; status?: string; category?: string; source?: string; search?: string }) {
  const query = (options.search ?? "").trim().toLowerCase();
  return records.filter(task => task.kind === "task" &&
    (options.view === "all" || options.view === "today" && task.date === options.today || options.view === "upcoming" && task.date > options.today || options.view === "overdue" && task.date < options.today && !["done", "cancelled"].includes(task.status) || options.view === "completed" && task.status === "done") &&
    (!options.priority || options.priority === "all" || String(task.fields.priority ?? "normal") === options.priority) &&
    (!options.status || options.status === "all" || task.status === options.status) &&
    (!options.category || String(task.fields.category ?? "").toLowerCase().includes(options.category.toLowerCase())) &&
    (!options.source || options.source === "all" || String(task.fields.source ?? "Personal") === options.source) &&
    (!query || task.title.toLowerCase().includes(query) || task.description.toLowerCase().includes(query))
  ).sort((a,b) => a.date.localeCompare(b.date));
}

export function filterLinkedTaskItems<T extends Pick<LinkedCalendarItem, "id" | "title" | "date" | "kind" | "source" | "status" | "priority">>(items: T[], options: { view: TaskView; today: string; selectedDate: string; source?: string; status?: string; priority?: string; category?: string; search?: string }) {
  const query = (options.search ?? "").trim().toLowerCase();
  return items.filter(item => {
    if (item.source === "System Engine" && item.date === options.selectedDate) return false;
    const dateMatches = options.view === "all" || options.view === "today" && item.date === options.today || options.view === "upcoming" && item.date > options.today || options.view === "overdue" && item.date < options.today && isOpenScheduledRecord(item.status) || options.view === "completed" && item.status === "done";
    return dateMatches && (options.source === undefined || options.source === "all" || item.source === options.source) &&
      (options.status === undefined || options.status === "all" || item.status === options.status) &&
      (options.priority === undefined || options.priority === "all" || item.priority === options.priority) &&
      (!options.category || item.kind.toLowerCase().includes(options.category.toLowerCase())) &&
      (!query || item.title.toLowerCase().includes(query));
  }).sort((a,b) => a.date.localeCompare(b.date));
}
