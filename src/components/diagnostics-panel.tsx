"use client";

import { useEffect, useState } from "react";

type Diagnostics = { application: { status: string; mode: string }; configuration: { googleSignIn: string; mongoUri: string }; storage: { status: string; type: string; scope: string; records: number; survivesRestart: boolean }; pwa: { manifest: string; serviceWorker: string }; verification: { status: string; note: string } };

export function DiagnosticsPanel() {
  const [state, setState] = useState<{ data?: Diagnostics; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => { let live = true; fetch("/api/diagnostics", { cache: "no-store" }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Diagnostics unavailable."); return data as Diagnostics; }).then(data => { if (live) setState({ data, loading: false }); }).catch(error => { if (live) setState({ error: error instanceof Error ? error.message : "Could not reach diagnostics API.", loading: false }); }); return () => { live = false; }; }, []);
  if (state.loading) return <section className="settings-panel"><h2>System health</h2><p role="status">Checking local configuration and APIs…</p></section>;
  if (!state.data) return <section className="settings-panel"><h2>System health</h2><p role="alert">{state.error} Start the development server and reload this page.</p></section>;
  const { application, configuration, storage, pwa, verification } = state.data;
  const rows: [string, string][] = [["Application", `${application.status} · ${application.mode}`], ["Google sign-in", configuration.googleSignIn], ["MongoDB", configuration.mongoUri], ["Development storage", `${storage.status} · ${storage.type} · ${storage.scope}`], ["Current session records", String(storage.records)], ["Survives server restart", storage.survivesRestart ? "Yes" : "No"], ["PWA manifest", pwa.manifest], ["Service worker", pwa.serviceWorker], ["Test/build status", verification.status]];
  return <section className="settings-panel diagnostics-panel"><h2>System health</h2><p>Local diagnostics show readiness only. Secret values and private records are never returned.</p><dl>{rows.map(([name, value]) => <div className="diagnostic-row" key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl><p>{verification.note}</p><p><a href="/manifest.webmanifest">Open web app manifest</a> · <a href="/icon-192.png">Open app icon</a></p><p>Install from your browser menu: Chrome or Edge on desktop uses “Install AWAKENING”; Android Chrome offers “Install app” or “Add to Home screen”. iPhone/iPad Safari uses Share → Add to Home Screen. HTTPS is required outside localhost.</p></section>;
}

