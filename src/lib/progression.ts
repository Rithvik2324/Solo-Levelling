export function levelForXp(totalXp: number, xpPerLevel = 1000) {
  if (!Number.isFinite(totalXp) || totalXp <= 0) return 1;
  const threshold = Number.isFinite(xpPerLevel) && xpPerLevel > 0 ? xpPerLevel : 1000;
  return Math.floor(totalXp / threshold) + 1;
}

export function rankForLevel(level: number) {
  if (level >= 50) return "S";
  if (level >= 40) return "A";
  if (level >= 30) return "B";
  if (level >= 20) return "C";
  if (level >= 10) return "D";
  return "E";
}

export function progressionForXp(totalXp: number, xpPerLevel = 1000) {
  const progression = xpProgress(totalXp, xpPerLevel);
  return { ...progression, rank: rankForLevel(progression.level) };
}

export function xpProgress(totalXp: number, xpPerLevel = 1000) {
  const safeXp = Math.max(0, Math.floor(Number.isFinite(totalXp) ? totalXp : 0));
  const step = Number.isFinite(xpPerLevel) && xpPerLevel > 0 ? xpPerLevel : 1000;
  const level = levelForXp(safeXp, step);
  const currentLevelXp = (level - 1) * step;
  return { level, totalXp: safeXp, currentLevelXp, nextLevelXp: level * step, progressXp: safeXp - currentLevelXp, progressPercent: Math.floor(((safeXp - currentLevelXp) / step) * 100) };
}

export function localDateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function weekdayForLocalDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addCalendarDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function habitSummary(input: { weekdays: number[]; restDays: number[]; logs: { localDate: string; status: "done" | "rest" }[]; today: string }) {
  const byDate = new Map(input.logs.map(log => [log.localDate, log.status]));
  const todayWeekday = weekdayForLocalDate(input.today);
  const plannedToday = input.weekdays.includes(todayWeekday);
  const restToday = input.restDays.includes(todayWeekday) || (!plannedToday && input.restDays.length === 0);
  const mondayOffset = (todayWeekday + 6) % 7;
  let scheduled = 0;
  let completed = 0;
  for (let offset = -mondayOffset; offset <= 0; offset += 1) {
    const date = addCalendarDays(input.today, offset);
    const weekday = weekdayForLocalDate(date);
    if (!input.weekdays.includes(weekday)) continue;
    scheduled += 1;
    if (byDate.get(date) === "done") completed += 1;
  }
  let streak = 0;
  let cursor = input.today;
  if (input.weekdays.includes(todayWeekday) && byDate.get(input.today) !== "done") cursor = addCalendarDays(input.today, -1);
  for (let guard = 0; guard < 370; guard += 1) {
    const weekday = weekdayForLocalDate(cursor);
    if (input.weekdays.includes(weekday)) {
      if (byDate.get(cursor) !== "done") break;
      streak += 1;
    }
    cursor = addCalendarDays(cursor, -1);
  }
  return { plannedToday, restToday, completedThisWeek: completed, plannedThisWeek: scheduled, completionPercent: scheduled ? Math.round((completed / scheduled) * 100) : 0, streak };
}
