"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type AdaptivePayload = {
  source: string; notice: string;
  achievements: { id: string; name: string; description: string; category: string; progress: number; goal: number; unit: string; unlocked: boolean; unlockedAt?: string; available: boolean }[];
  recommendations: { id: string; title: string; reason: string; href: string; priority: string }[];
  notifications: { id: string; title: string; reason: string; href: string; dueDate: string; readAt?: string; dismissedAt?: string }[];
  review: { weekStart: string; weekEnd: string; personalTasksCompleted: number; focusSessions: number; focusMinutes: number; plansSaved: number; reviewsSaved: number; modules: { module: string; count: number; covered: boolean }[]; coverage: Record<string, string> };
};
const todayKey = () => new Date().toLocaleDateString("en-CA");
const mondayKey = (date: string) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() - ((value.getDay() + 6) % 7)); return value.toLocaleDateString("en-CA"); };
const moveWeek = (date: string, by: number) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + by * 7); return value.toLocaleDateString("en-CA"); };

export function AdaptiveWorkspace() {
  const [week, setWeek] = useState(() => mondayKey(todayKey()));
  const [payload, setPayload] = useState<AdaptivePayload | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try { const response = await fetch(`/api/adaptive?week=${week}`); const value = await response.json(); if (!response.ok) throw new Error(value.error || "Could not load progress insights."); setPayload(value); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load progress insights."); }
  }, [week]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function update(id: string, action: string) {
    setBusy(true); setError(""); setNotice("");
    try { const response = await fetch("/api/adaptive", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) }); const value = await response.json(); if (!response.ok) throw new Error(value.error || "Could not update this item."); await refresh(); setNotice(action === "read" ? "Notification marked read." : "Notification dismissed."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update this item."); }
    finally { setBusy(false); }
  }
  async function dismissRecommendation(id: string) {
    setBusy(true); setError(""); setNotice("");
    try { const response = await fetch("/api/adaptive", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, date: todayKey(), action: "dismiss-recommendation" }) }); const value = await response.json(); if (!response.ok) throw new Error(value.error || "Could not dismiss this suggestion."); await refresh(); setNotice("Recommendation dismissed for today."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not dismiss this suggestion."); }
    finally { setBusy(false); }
  }
  return <div className="workspace-page adaptive-page">
    <div className="eyebrow"><span className="status-pip"/> PROGRESSION <span className="eyebrow-separator">/</span> LOCAL INSIGHTS</div>
    <h1>Achievements & Insights</h1><p className="page-subtitle">Milestones are calculated from records you actually saved. This development view awards no XP.</p>
    <div className="development-notice"><strong>SESSION DATA ONLY</strong><span>{payload?.notice ?? "Loading local progress data…"} Quest, habit, and XP achievements require the authenticated System Engine.</span></div>
    {error && <div className="error-banner" role="alert">{error}</div>}{notice && <p className="success-banner" role="status">{notice}</p>}
    {payload && <>
      <section className="panel workspace-panel"><div className="workspace-list-head"><div><div className="eyebrow">MILESTONE GALLERY</div><h2>Progress earned in this session</h2></div><span className="status-badge">{payload.achievements.filter(item=>item.unlocked).length} UNLOCKED</span></div><div className="achievement-grid">{payload.achievements.map(item=><article className={`achievement-card ${item.unlocked?"achievement-unlocked":""}`} key={item.id}><div className="record-head"><span className="status-badge">{item.category}</span><span className="development-tag">{item.unlocked?"UNLOCKED":item.available?"LOCKED":"ENGINE LINK NEEDED"}</span></div><h3>{item.name}</h3><p>{item.description}</p>{item.available?<><div className="progress-track"><span style={{width:`${Math.round(item.progress/item.goal*100)}%`}}/></div><small>{item.progress} / {item.goal} {item.unit}</small>{item.unlockedAt&&<small>Recorded {new Date(item.unlockedAt).toLocaleDateString()}</small>}</>:<small>Quest completions and habit logs are available only through the authenticated System Engine.</small>}</article>)}</div><p className="field-help">Achievement unlocks are derived from completed records and are idempotent. No reward XP is configured.</p></section>
      <section className="panel workspace-panel"><div className="workspace-list-head"><div><div className="eyebrow">WEEKLY REVIEW</div><h2>{payload.review.weekStart} to {payload.review.weekEnd}</h2></div><div className="form-actions"><button className="button button-secondary" onClick={()=>setWeek(moveWeek(week,-1))}>Previous week</button><input className="text-input" aria-label="Select review week (Monday)" type="date" value={week} onChange={event=>setWeek(mondayKey(event.target.value||todayKey()))}/><button className="button button-secondary" onClick={()=>setWeek(moveWeek(week,1))}>Next week</button></div></div><p className="field-help">Select a Monday. Missing module records are shown as not covered, not as zero effort.</p><div className="weekly-review-stats"><span>Personal tasks completed<b>{payload.review.personalTasksCompleted}</b></span><span>Focus sessions<b>{payload.review.focusSessions}</b></span><span>Focus time<b>{payload.review.focusMinutes} min</b></span><span>Daily plans saved<b>{payload.review.plansSaved}</b></span><span>Evening reviews saved<b>{payload.review.reviewsSaved}</b></span></div><div className="achievement-grid">{payload.review.modules.map(item=><article className="achievement-card" key={item.module}><h3>{item.module}</h3><p>{item.covered?`${item.count} recorded this week`:"No records in this module yet"}</p></article>)}</div><p className="field-help">Quest totals, XP, and habit completion are not shown here because this development-only review is not connected to the authenticated ledger or habit store.</p></section>
      <section className="panel workspace-panel"><div className="eyebrow">LOCAL RECOMMENDATIONS</div><h2>Suggested next steps</h2>{payload.recommendations.length?<div className="deadline-list">{payload.recommendations.map(item=><div className="deadline-row" key={item.id}><span><strong><Link href={item.href}>{item.title}</Link></strong><small>{item.reason}</small></span><button className="text-button" disabled={busy} onClick={()=>void dismissRecommendation(item.id)}>Dismiss today</button></div>)}</div>:<p className="empty-workspace">No recommendations right now. Add dated records or tasks to enable local suggestions.</p>}</section>
      <section className="panel workspace-panel"><div className="eyebrow">IN-APP REMINDERS</div><h2>Notification center</h2>{payload.notifications.length?<div className="deadline-list">{payload.notifications.map(item=><div className="deadline-row" key={item.id}><span><strong><Link href={item.href}>{item.title}</Link> {!item.readAt&&<span className="status-badge">NEW</span>}</strong><small>{item.reason}</small></span><div className="record-actions">{!item.readAt&&<button className="text-button" disabled={busy} onClick={()=>void update(item.id,"read")}>Mark read</button>}<button className="text-button" disabled={busy} onClick={()=>void update(item.id,"dismiss")}>Dismiss</button></div></div>)}</div>:<p className="empty-workspace">No upcoming or overdue reminders from current records.</p>}<p className="field-help">Reminders are computed when this page loads. No push, email, or background notifications are sent.</p></section>
    </>}
  </div>;
}

