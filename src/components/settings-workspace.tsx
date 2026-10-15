"use client";
import { FormEvent, useEffect, useState } from "react";

export function SettingsWorkspace() {
  const [campaignDate, setCampaignDate] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [localMode, setLocalMode] = useState(false);
  useEffect(() => { fetch("/api/settings").then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error); setCampaignDate(value.settings.campaignDate ?? ""); if (value.source === "development-sqlite") setLocalMode(true); else setTimezone(value.settings.timezone); }).catch(reason => setError(reason.message || "Settings are unavailable.")); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    try { const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(localMode ? { campaignDate: campaignDate || null } : { campaignDate: campaignDate || null, timezone }) }); const value = await response.json(); if (!response.ok) throw new Error(value.error); setNotice(localMode ? "Campaign date saved to local development storage." : "Settings saved to your account."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save settings."); }
    finally { setBusy(false); }
  }
  return <div className="workspace-page"><div className="eyebrow"><span className="status-pip" /> {localMode ? "LOCAL DEVELOPMENT" : "ACCOUNT"} <span className="eyebrow-separator">/</span> PREFERENCES</div><h1>Settings</h1><p className="page-subtitle">{localMode ? "Manage the campaign date for this local development session." : "Timezone controls daily boundaries and your campaign date is optional until you choose one."}</p>{error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="success-banner" role="status">{notice}</div>}<form className="panel settings-panel" onSubmit={save}>{localMode ? <><label className="field-label">Timezone<input className="text-input" value="Uses this device's local timezone" disabled /></label><p className="field-help">Account timezone preferences are unavailable in local development.</p></> : <><label className="field-label">Timezone<input className="text-input" value={timezone} onChange={event => setTimezone(event.target.value)} placeholder="Asia/Kolkata" required /></label><p className="field-help">Use an IANA timezone, for example Asia/Kolkata or America/Los_Angeles.</p></>}<label className="field-label">Personal campaign date (optional)<input className="text-input" type="date" value={campaignDate} onChange={event => setCampaignDate(event.target.value)} /></label><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button></form><section id="account-configuration" className="panel settings-panel"><h2>{localMode ? "Account services deferred" : "Account configuration"}</h2>{localMode ? <><p>Local workspaces, planning, campaign dates, milestones, habits, and eligible local progression work without an account. Supported records are saved in session-scoped SQLite.</p><p>Authenticated quest completion, account XP history, editable account attributes, and account timezone preferences require the deferred account services. Local progression is separate and is shown on the dashboard.</p></> : <><p>Google sign-in is unavailable until the server environment has Google OAuth credentials, a strong random NEXTAUTH_SECRET, and the allowed Google account email. Create a web OAuth client in Google Cloud Console and use <code>http://localhost:3000/api/auth/callback/google</code> as its local redirect URI.</p><p>Set those values and MONGODB_URI in a local <code>.env.local</code> file using the variable names in <code>.env.example</code>, then restart the development server. Keep credentials private. AWAKENING has no demo account; account-backed quest, habit, progression, and profile features require these services.</p></>}</section></div>;
}


