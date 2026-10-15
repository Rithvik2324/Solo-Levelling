"use client";

import { FormEvent, useEffect, useState } from "react";
import { InlineEditForm } from "@/components/inline-edit-form";

type Milestone = { id?: string; _id?: string; title: string; targetDate?: string; completedAt?: string };
const idOf = (item: Milestone) => item.id ?? item._id ?? "";

export function CampaignMilestones() {
  const [items, setItems] = useState<Milestone[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [localMode, setLocalMode] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/campaign/milestones");
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Could not load campaign milestones.");
      setItems(value.milestones);
      setLocalMode(value.source === "development-sqlite");
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load campaign milestones.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function request(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Could not update milestone.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update milestone.");
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/campaign/milestones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.get("title"), targetDate: form.get("targetDate") || undefined }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Could not add milestone.");
      formElement.reset();
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add milestone.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: Milestone) {
    if (!window.confirm(`Permanently delete “${item.title}”? This cannot be undone.`)) return;
    await request(`/api/campaign/milestones/${idOf(item)}`, "DELETE");
  }

  return (
    <section className="panel section-card milestone-card">
      <div className="section-top"><div><div className="eyebrow">CAMPAIGN <span className="eyebrow-separator">/</span> MILESTONES</div><h2>Progress you can see</h2></div><span className="week-total">{items.filter(item => item.completedAt).length}/{items.length}</span></div>
      {localMode && <p className="field-help">Saved in local development storage for this browser session.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {loading ? <p className="empty-workspace" role="status">Loading milestones…</p> : items.length > 0 ? <div className="milestone-list">{items.map(item => <div className="milestone-row" key={idOf(item)}>
        <input id={`milestone-${idOf(item)}`} type="checkbox" checked={Boolean(item.completedAt)} disabled={busy} onChange={() => void request(`/api/campaign/milestones/${idOf(item)}`, "PATCH", { completed: !item.completedAt })} />
        <label htmlFor={`milestone-${idOf(item)}`} className={item.completedAt ? "milestone-done" : ""}>{item.title}</label>
        <small>{item.targetDate ?? "No target date"}</small>
        <div className="milestone-actions"><InlineEditForm trigger="Edit" disabled={busy} fields={[{ name: "title", label: "Milestone title", value: item.title, required: true, maxLength: 160 }, { name: "targetDate", label: "Target date", type: "date", value: item.targetDate ?? "" }]} onSave={values => request(`/api/campaign/milestones/${idOf(item)}`, "PATCH", { title: values.title, targetDate: values.targetDate || null })} /><button className="text-button" type="button" disabled={busy} onClick={() => void remove(item)}>Delete</button></div>
      </div>)}</div> : !error && <p className="empty-workspace">No campaign milestones yet. Add one when you have a real goal to track.</p>}
      <form className="milestone-form" onSubmit={add}><input className="text-input" name="title" maxLength={160} placeholder="Add a real milestone" aria-label="Milestone title" required /><input className="text-input milestone-date" name="targetDate" type="date" aria-label="Milestone target date" /><button className="button button-secondary" disabled={busy}>{busy ? "Saving…" : "Add"}</button></form>
    </section>
  );
}

