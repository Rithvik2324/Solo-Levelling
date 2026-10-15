"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Recommendation = { id: string; title: string; reason: string; href: string; priority: string };

export function RecommendationPanel() {
  const [items, setItems] = useState<Recommendation[]>([]);
  const [message, setMessage] = useState("Loading current suggestions…");
  const [busyId, setBusyId] = useState("");
  const [today, setToday] = useState("");

  async function refresh() {
    try {
      const response = await fetch("/api/adaptive");
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Suggestions are unavailable.");
      setItems(value.recommendations);
      setMessage(value.recommendations.length ? "" : "No recommendations right now. Add dated tasks or module records to see suggestions.");
    } catch (error) {
      setItems([]);
      setMessage(error instanceof Error ? error.message : "Suggestions are unavailable.");
    }
  }

  useEffect(() => {
    setToday(new Date().toLocaleDateString("en-CA"));
    void refresh();
  }, []);

  async function dismiss(item: Recommendation) {
    setBusyId(item.id);
    try {
      const response = await fetch("/api/adaptive", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, action: "dismiss-recommendation", date: today }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Could not dismiss this suggestion.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not dismiss this suggestion.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="panel recommendation-panel" aria-labelledby="recommendation-title">
      <div className="recommendation-head">
        <div>
          <div className="eyebrow">ADAPTIVE · LOCAL DATA</div>
          <h2 id="recommendation-title">Suggested next steps</h2>
        </div>
        <Link className="text-link" href="/achievements">Progress insights <span aria-hidden="true">→</span></Link>
      </div>
      {items.length ? (
        <div className="deadline-list recommendation-list">
          {items.map(item => (
            <div className="deadline-row" key={item.id}>
              <span className="recommendation-copy">
                <strong><Link href={item.href}>{item.title}</Link></strong>
                <small>{item.reason}</small>
              </span>
              <div className="record-actions">
                <span className="status-badge">{item.priority}</span>
                <button className="text-button" disabled={busyId === item.id} onClick={() => void dismiss(item)}>
                  {busyId === item.id ? "Saving…" : "Dismiss today"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="empty-note recommendation-empty" role="status">{message}</p>}
      <p className="field-help recommendation-note">Suggestions use current local session records. They do not create tasks or award XP.</p>
    </section>
  );
}

