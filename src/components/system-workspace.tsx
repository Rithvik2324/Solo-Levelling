"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { InlineEditForm } from "@/components/inline-edit-form";

type QuestItem = { _id: string; title: string; description: string; category: string; xpReward: number; recurrence: string; difficulty: string; estimatedMinutes: number; dueDate?: string; occurrenceKey: string; dueToday: boolean; completed: boolean };
type HabitItem = { _id: string; title: string; description: string; weekdays: number[]; restDays: number[]; summary: { streak: number; completionPercent: number; completedThisWeek: number; plannedThisWeek: number; plannedToday: boolean; restToday: boolean }; logs: { localDate: string; status: string }[] };
type HistoryItem = { _id: string; completedAt: string; xpAmount: number; questId?: { title?: string; category?: string } };
type ProfileData = { totalXp: number; level: number; rank: string; xp: { earnedThisWeek: number; currentLevelXp: number; requiredForNextLevel: number; progressPercent: number }; activity: { questsCompleted: number; habitsCompleted: number; habitLogs: number; focusMinutes: number | null; practiceMinutes: number | null; source: string }; history: { id: string; kind: string; amount: number; description: string; createdAt: string }[] };
const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function parseResponse(response: Response) {
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Request failed.");
  return value;
}

export function SystemWorkspace({ section, localDevelopment = false }: { section: "quests" | "habits" | "player-stats"; localDevelopment?: boolean }) {
  const [items, setItems] = useState<QuestItem[] | HabitItem[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [restDays, setRestDays] = useState<number[]>([0, 6]);
  const [attributes, setAttributes] = useState<Record<string, number> | null>(null);
  const [playerProgress, setPlayerProgress] = useState<ProfileData | null>(null);
  const [filter, setFilter] = useState("all");
  const [todayKey, setTodayKey] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [questDate, setQuestDate] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [localProgress, setLocalProgress] = useState<{ totalXp: number; level: number; rank: string; xp: { earnedThisWeek: number; currentLevelXp: number; requiredForNextLevel: number; progressPercent: number }; history: { activityId: string; title: string; amount: number; createdAt: string }[]; achievements: { id: string; title: string; description: string; unlockedAt: string }[] } | null>(null);

  const refresh = useCallback(async () => {
    setError("");
    try {
      if (section === "player-stats") {
        if (localDevelopment) { const value = await parseResponse(await fetch("/api/local-progression")); setLocalProgress(value); return; }
        const value = await parseResponse(await fetch("/api/profile")); setAttributes(value.attributes); setPlayerProgress(value); return;
      }
      const query = section === "quests" ? `?${new URLSearchParams({ ...(questDate ? { date: questDate } : {}), ...(categoryFilter ? { category: categoryFilter } : {}), ...(filter !== "all" ? { status: filter === "open" ? "open" : "completed" } : {}) })}` : "";
      const value = await parseResponse(await fetch(`/api/${section}${query}`));
      if (value.today || value.date) setTodayKey(value.today || value.date);
      if (value.categories) setCategories(value.categories);
      setItems(section === "quests" ? value.quests : value.habits);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load this area."); }
  }, [section, questDate, categoryFilter, filter, localDevelopment]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      if (section === "quests") {
        const payload = { title: form.get("title"), description: form.get("description"), category: form.get("category"), recurrence: form.get("recurrence"), difficulty: form.get("difficulty"), estimatedMinutes: Number(form.get("estimatedMinutes")), dueDate: form.get("dueDate") || undefined, weekdays };
        await parseResponse(await fetch("/api/quests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
        formElement.reset(); setNotice("Quest saved.");
      } else {
        const payload = { title: form.get("title"), description: form.get("description"), weekdays, restDays };
        await parseResponse(await fetch("/api/habits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
        formElement.reset(); setNotice("Habit saved.");
      }
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save."); }
    finally { setBusy(false); }
  }

  async function action(url: string, method: string, body?: unknown) {
    setBusy(true); setError(""); setNotice("");
    try { const result = await parseResponse(await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })); await refresh(); setNotice(result.reward ? `${result.reward.alreadyAwarded ? "Already recorded" : `+${result.reward.event.amount} local XP`}${result.reward.unlocked?.length ? ` · unlocked ${result.reward.unlocked.map((item: { title: string }) => item.title).join(", ")}` : ""}.` : result.leveledUp ? `LEVEL UP — Level ${result.level}. ${result.totalXp} total XP.` : "Saved."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Request failed."); }
    finally { setBusy(false); }
  }

  async function saveAttributes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!attributes) return;
    await action("/api/profile", "PATCH", { attributes });
  }

  async function loadHistory() {
    setShowHistory(!showHistory);
    if (showHistory || history.length) return;
    try { const value = await parseResponse(await fetch("/api/quests/history")); setHistory(value.completions); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load completion history."); }
  }

  const title = section === "quests" ? "Quest Board" : section === "habits" ? "Habit Tracker" : "Player Attributes";
  const filteredQuests = section === "quests" ? (items as QuestItem[]).filter(item => filter === "all" || (filter === "open" ? !item.completed : item.completed)) : [];
  if (section === "quests" && localDevelopment) return <div className="workspace-page"><div className="eyebrow"><span className="status-pip" /> LOCAL DEVELOPMENT <span className="eyebrow-separator">/</span> QUESTS</div><h1>Quest Board</h1><p className="page-subtitle">Account-backed daily quests and their XP rewards are deferred.</p><div className="development-notice" role="note"><strong>QUEST SERVICE UNAVAILABLE LOCALLY</strong><span>Local XP only comes from recorded habit completions, workouts, martial arts techniques, and guitar or flute practice sessions. Module quest drafts are planning references, not completable quests, and do not grant XP.</span></div><section className="panel workspace-panel"><h2>Continue locally</h2><p>Use the task board for general actions (tasks do not grant XP), or record a supported activity in its own workspace.</p><div className="action-links"><Link className="button button-secondary" href="/tasks">Open task board</Link><Link className="button button-secondary" href="/habits">Record a habit</Link><Link className="button button-secondary" href="/fitness">Record training</Link><Link className="button button-secondary" href="/guitar">Record music practice</Link></div></section></div>;
  if (section === "player-stats" && localDevelopment) return <div className="workspace-page"><div className="eyebrow"><span className="status-pip" /> LOCAL DEVELOPMENT <span className="eyebrow-separator">/</span> PROGRESSION</div><h1>Player Stats</h1><p className="page-subtitle">Session-scoped progression calculated from eligible activity records.</p><div className="development-notice" role="note"><strong>LOCAL SESSION PROGRESSION</strong><span>Account attributes and cloud progression are unavailable. Local progression remains separate from the account XP system.</span></div>{error && <div className="error-banner" role="alert">{error}</div>}{!localProgress ? <p className="panel workspace-panel" role="status">Loading local progression…</p> : <><section className="panel workspace-panel"><h2>Player progression</h2><div className="profile-progression-grid"><span>Rank<b>{localProgress.rank}</b></span><span>Level<b>{localProgress.level}</b></span><span>Lifetime XP<b>{localProgress.totalXp.toLocaleString()}</b></span><span>XP this week<b>{localProgress.xp.earnedThisWeek.toLocaleString()}</b></span></div><div className="progress-track profile-xp-track" role="progressbar" aria-label="Progress to next level" aria-valuenow={localProgress.xp.progressPercent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${localProgress.xp.progressPercent}%` }} /></div><p className="field-help">{localProgress.xp.currentLevelXp.toLocaleString()} / {localProgress.xp.requiredForNextLevel.toLocaleString()} XP within this level. Values come from the stored local XP events.</p></section><section className="panel workspace-panel"><h2>Earned achievements</h2>{localProgress.achievements.length ? <div className="deadline-list">{localProgress.achievements.map(item => <div className="deadline-row" key={item.id}><span><strong>{item.title}</strong><small>{item.description}</small></span><time dateTime={item.unlockedAt}>{new Date(item.unlockedAt).toLocaleDateString()}</time></div>)}</div> : <p className="empty-workspace">No achievements unlocked yet.</p>}</section><section className="panel workspace-panel"><h2>XP history</h2>{localProgress.history.length ? <div className="deadline-list">{localProgress.history.map(item => <div className="deadline-row" key={item.activityId}><span><strong>{item.title}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></span><b>+{item.amount} XP</b></div>)}</div> : <p className="empty-workspace">No eligible local activity has earned XP yet.</p>}</section></>}</div>;
  return <div className="workspace-page">
    <div className="eyebrow"><span className="status-pip" /> PRIVATE SYSTEM <span className="eyebrow-separator">/</span> LIVE DATA</div>
    <h1>{title}</h1><p className="page-subtitle">{section === "quests" ? "Create quests, track real completions, and earn server-calculated XP." : section === "habits" ? "Set a weekly rhythm and record done days or planned rest days." : "Set your starting attributes. These are personal ratings and do not alter earned XP."}</p>
    {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="success-banner" role="status">{notice}</div>}
    {section === "player-stats" ? <><section className="panel workspace-panel"><h2>Player progression</h2>{playerProgress ? <><div className="profile-progression-grid"><span>Rank<b>{playerProgress.rank}</b></span><span>Level<b>{playerProgress.level}</b></span><span>Lifetime XP<b>{playerProgress.totalXp.toLocaleString()}</b></span><span>XP this week<b>{playerProgress.xp.earnedThisWeek.toLocaleString()}</b></span></div><div className="progress-track profile-xp-track" role="progressbar" aria-label="Progress to next level" aria-valuenow={playerProgress.xp.progressPercent} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${playerProgress.xp.progressPercent}%`}} /></div><p className="field-help">{playerProgress.xp.currentLevelXp.toLocaleString()} / {playerProgress.xp.requiredForNextLevel.toLocaleString()} XP within this level. Lifetime XP is ledger-derived; the progress bar uses the same total.</p></> : <p>Sign in and connect your account to load your progression.</p>}</section><section className="panel workspace-panel"><h2>Recorded activity</h2>{playerProgress ? <><div className="weekly-review-stats"><span>Quests completed lifetime<b>{playerProgress.activity.questsCompleted}</b></span><span>Habit completions lifetime<b>{playerProgress.activity.habitsCompleted}</b></span><span>Focus time {playerProgress.activity.source === "development-session" ? "Â· development" : ""}<b>{playerProgress.activity.focusMinutes} min</b></span><span>Practice and training {playerProgress.activity.source === "development-session" ? "Â· development" : ""}<b>{playerProgress.activity.practiceMinutes} min</b></span></div><p className="field-help">Quest and habit totals use canonical records. Focus and practice totals are temporary session records when the development adapter is active.</p></> : <p>Activity totals are not available until your profile loads.</p>}</section><section className="panel workspace-panel"><h2>Attributes</h2>{attributes ? <form onSubmit={saveAttributes} className="attribute-form">{Object.entries(attributes).map(([name, value]) => <label key={name} className="field-label">{name}<input className="text-input" type="number" min="0" max="100" value={value} onChange={event => setAttributes({ ...attributes, [name]: Number(event.target.value) })} /></label>)}<button className="button button-primary" disabled={busy}>Save attributes</button></form> : <p>Sign in and connect your account to set attributes.</p>}<p className="field-help">These are user-set baseline ratings. Existing quest XP does not automatically change attributes.</p></section><section className="panel workspace-panel"><h2>XP ledger history</h2>{playerProgress?.history.length ? <div className="deadline-list">{playerProgress.history.map(item=><div className="deadline-row" key={item.id}><span><strong>{item.description}</strong><small>{item.kind} Â· {new Date(item.createdAt).toLocaleString()}</small></span><b className={item.amount<0?"xp-negative":"xp-positive"}>{item.amount>0?"+":""}{item.amount} XP</b></div>)}</div> : <p className="empty-workspace">No XP ledger events have been recorded yet.</p>}<p className="field-help">Showing the latest 20 account-owned ledger events. No activity is filled in for an empty ledger.</p></section></> : <div className="workspace-grid">
      <section className="panel workspace-panel"><h2>{section === "quests" ? "Create a quest" : "Create a habit"}</h2><form onSubmit={submit} className="workspace-form">
        <label className="field-label">Title<input required name="title" maxLength={120} className="text-input" placeholder={section === "quests" ? "e.g. Solve one array problem" : "e.g. Morning mobility"} /></label>
        <label className="field-label">Description<textarea name="description" maxLength={section === "quests" ? 2000 : 500} className="text-input text-area" /></label>
        {section === "quests" ? <>
          <label className="field-label">Category<input required name="category" maxLength={60} className="text-input" placeholder="Study, fitness, musicâ€¦" /></label>
          <div className="form-two"><label className="field-label">Duration (min)<input name="estimatedMinutes" type="number" min="1" max="1440" defaultValue="30" className="text-input" /></label><label className="field-label">Difficulty<select name="difficulty" className="text-input" defaultValue="normal"><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option><option value="elite">Elite</option></select></label></div>
          <label className="field-label">Schedule<select name="recurrence" className="text-input"><option value="once">One time</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
          <p className="field-help">XP reward is set by the server from the selected difficulty and estimated duration.</p>
          <label className="field-label">Due date (optional)<input type="date" name="dueDate" className="text-input" /></label>
          <p className="field-help">Select weekdays when this quest should repeat. Leave all days clear for a weekly quest with no fixed day.</p>
        </> : <><p className="field-help">Choose planned training days. Days outside this schedule are not counted as missed.</p><span className="field-label">Planned days</span></>}
        <div className="weekday-picker" aria-label="Scheduled weekdays">{weekdayNames.map((day, index) => <button type="button" key={day} className={`weekday-button ${weekdays.includes(index) ? "weekday-selected" : ""}`} aria-pressed={weekdays.includes(index)} onClick={() => setWeekdays(weekdays.includes(index) ? weekdays.filter(item => item !== index) : [...weekdays, index].sort())}>{day}</button>)}</div>
        {section === "habits" && <><span className="field-label">Planned rest days</span><div className="weekday-picker" aria-label="Planned rest weekdays">{weekdayNames.map((day, index) => <button type="button" key={day} className={`weekday-button ${restDays.includes(index) ? "weekday-selected" : ""}`} aria-pressed={restDays.includes(index)} onClick={() => setRestDays(restDays.includes(index) ? restDays.filter(item => item !== index) : [...restDays, index].sort())}>{day}</button>)}</div></>}
        <button className="button button-primary" disabled={busy || weekdays.length === 0}>{busy ? "Savingâ€¦" : `Create ${section === "quests" ? "quest" : "habit"}`}</button>
      </form></section>
      <section className="panel workspace-panel"><div className="workspace-list-head"><h2>{section === "quests" ? "Quest instances" : "Your habits"}</h2>{section === "quests" && <div className="quest-filters"><input className="filter-select" type="date" value={questDate || todayKey} onChange={event => setQuestDate(event.target.value)} aria-label="Filter by date" /><select className="filter-select" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} aria-label="Filter by category"><option value="">All categories</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select><select className="filter-select" value={filter} onChange={event => setFilter(event.target.value)} aria-label="Filter quests by status"><option value="all">All statuses</option><option value="open">Open</option><option value="completed">Completed</option></select></div>}</div>
        {section === "quests" ? <><>{filteredQuests.length ? <div className="record-list">{filteredQuests.map(item => <article className="record-card" id={`quest-${item._id}`} key={`${item._id}-${item.occurrenceKey}`}><div className="record-head"><div><h3>{item.title}</h3><span className="record-meta">{item.category} Â· {item.difficulty} Â· {item.estimatedMinutes} min</span></div><span className="xp-pill">{item.xpReward} XP</span></div>{item.description && <p>{item.description}</p>}<div className="record-actions">{item.completed ? <span className="status-badge">COMPLETED</span> : <button className="button button-primary" disabled={busy} onClick={() => action(`/api/quests/${item._id}/complete`, "POST", { idempotencyKey: crypto.randomUUID(), occurrenceKey: item.occurrenceKey })}>Complete quest</button>}<InlineEditForm trigger="Edit quest" disabled={busy} fields={[{ name: "title", label: "Quest title", value: item.title, required: true, maxLength: 120 }, { name: "category", label: "Category", value: item.category, required: true, maxLength: 60 }]} onSave={values => action(`/api/quests/${item._id}`, "PATCH", values)} /><InlineEditForm trigger="Reschedule" disabled={busy} fields={[{ name: "rescheduleDate", label: "New occurrence date", type: "date", required: true }]} onSave={values => action(`/api/quests/${item._id}`, "PATCH", { occurrenceKey: item.occurrenceKey, rescheduleDate: values.rescheduleDate })} /><button className="text-button" disabled={busy} onClick={() => void action(`/api/quests/${item._id}`, "PATCH", { archived: true })}>Archive</button></div></article>)}</div> : <p className="empty-workspace">No quests match this view. Add one when youâ€™re ready.</p>}</><button className="button button-secondary history-toggle" onClick={() => void loadHistory()}>{showHistory ? "Hide completion history" : "View completion history"}</button>{showHistory && <div className="record-list">{history.length ? history.map(item => <div className="recent-row" key={item._id}><span>{item.questId?.title ?? "Archived quest"} Â· {item.completedAt ? new Date(item.completedAt).toLocaleString() : ""}</span><span>+{item.xpAmount} XP</span></div>) : <p className="empty-workspace">No completions recorded yet.</p>}</div>}</>
        : (items as HabitItem[]).length ? <div className="record-list">{(items as HabitItem[]).map(habit => { const today = todayKey || new Intl.DateTimeFormat("en-CA").format(new Date()); const log = habit.logs.find(item => item.localDate === today); return <article className="record-card" id={`habit-${habit._id}`} key={habit._id}><div className="record-head"><div><h3>{habit.title}</h3><span className="record-meta">{habit.summary.streak} day streak Â· {habit.summary.completionPercent}% this week</span></div><span className="status-badge">{habit.summary.completedThisWeek}/{habit.summary.plannedThisWeek} THIS WEEK</span></div>{habit.description && <p>{habit.description}</p>}<div className="record-actions"><button className={`button ${log?.status === "done" ? "button-primary" : "button-secondary"}`} disabled={busy || !habit.summary.plannedToday} onClick={() => void action(`/api/habits/${habit._id}/logs`, "POST", { localDate: today, status: "done" })}>Mark done today</button><button className={`button ${log?.status === "rest" ? "button-primary" : "button-secondary"}`} disabled={busy || !habit.summary.restToday} onClick={() => void action(`/api/habits/${habit._id}/logs`, "POST", { localDate: today, status: "rest" })}>Planned rest</button><InlineEditForm trigger="Edit schedule" disabled={busy} fields={[{ name: "title", label: "Habit title", value: habit.title, required: true, maxLength: 120 }, { name: "description", label: "Description", type: "textarea", value: habit.description, maxLength: 500 }, { name: "weekdays", label: "Planned weekdays (0 Sunday to 6 Saturday)", value: habit.weekdays.join(",") }, { name: "restDays", label: "Planned rest weekdays (0 to 6)", value: habit.restDays.join(",") }]} onSave={values => { const parseDays = (value: string) => value.split(",").map(day => day.trim()).filter(Boolean).map(Number); const weekdays = parseDays(values.weekdays); const restDays = parseDays(values.restDays); if (weekdays.length === 0 || [...weekdays, ...restDays].some(day => !Number.isInteger(day) || day < 0 || day > 6) || weekdays.some(day => restDays.includes(day))) { setError("Choose at least one valid weekday; planned and rest days cannot overlap."); return; } return action(`/api/habits/${habit._id}`, "PATCH", { title: values.title, description: values.description, weekdays, restDays }); }} /><button className="text-button" disabled={busy} onClick={() => void action(`/api/habits/${habit._id}`, "PATCH", { archived: true })}>Archive</button></div>{habit.logs.length > 0 && <div className="habit-month-history"><span className="record-meta">THIS MONTH</span><div className="habit-log-chips">{[...habit.logs].sort((a,b) => a.localDate.localeCompare(b.localDate)).map(entry => <span key={entry.localDate} className={`habit-log-chip habit-log-${entry.status}`} title={`${entry.localDate}: ${entry.status}`}>{entry.localDate.slice(-2)} {entry.status === "done" ? "âœ“" : "REST"}</span>)}</div></div>}</article>; })}</div> : <p className="empty-workspace">No habits yet. Create a schedule that fits your real week.</p>}
      </section>
    </div>}
  </div>;
}

