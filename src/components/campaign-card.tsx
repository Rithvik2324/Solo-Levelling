"use client";

import { useEffect, useState } from "react";
import { daysUntilLocalDate, formatCampaignCountdown } from "@/lib/campaign";

export function CampaignCard() {
  const [date, setDate] = useState("");
  const [days, setDays] = useState<number | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [localMode, setLocalMode] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then(async response => { const value = await response.json(); if (response.ok) { setDate(value.settings?.campaignDate ?? ""); setLocalMode(value.source === "development-sqlite"); } else setSaveMessage(value.error || "Campaign settings are unavailable."); }).catch(() => setSaveMessage("Could not load campaign settings."));
  }, []);

  useEffect(() => {
    const update = () => setDays(daysUntilLocalDate(date));
    update();
    const timer = window.setInterval(update, 60000);
    return () => window.clearInterval(timer);
  }, [date]);

  function updateDate(value: string) {
    setDate(value);
    setSaveMessage("");
    fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignDate: value || null }) }).then(async response => { const result = await response.json(); if (!response.ok) setSaveMessage(result.error || "Campaign date could not be saved."); else setSaveMessage(localMode ? "Campaign date saved to local development storage." : "Campaign date saved to your account."); }).catch(() => setSaveMessage("Campaign date could not be saved."));
  }

  return <section className="campaign-card panel" aria-labelledby="campaign-title">
    <div className="campaign-orbit" aria-hidden="true"><span /><span /><span /></div>
    <div className="campaign-copy"><div className="eyebrow"><span className="status-pip" /> PERSONAL CAMPAIGN</div><h2 id="campaign-title">The next chapter<br /><span>starts with you.</span></h2><p>Choose a date that gives your goals a horizon.</p>
      <label className="campaign-date-label" htmlFor="campaign-date">CAMPAIGN DATE</label>
      <input id="campaign-date" className="date-input" type="date" value={date} onChange={event => updateDate(event.target.value)} />{saveMessage && <span className="campaign-save-message" role="status">{saveMessage}</span>}
    </div>
    <div className="countdown-block"><span className="countdown-number">{days === null ? "—" : Math.abs(days).toString().padStart(3, "0")}</span><span className="countdown-label">{formatCampaignCountdown(days)}</span><span className="countdown-date">{date || "No date selected"}</span></div>
  </section>;
}

