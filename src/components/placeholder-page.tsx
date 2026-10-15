import Link from "next/link";
import { pageDescriptions } from "@/lib/navigation";

export function PlaceholderPage({ title }: { title: string }) {
  return <div className="placeholder-page">
    <div className="eyebrow"><span className="status-pip" /> MODULE <span className="eyebrow-separator">/</span> FOUNDATION PHASE</div>
    <h1>{title}</h1><p className="page-subtitle">{pageDescriptions[title]}</p>
    <section className="panel placeholder-panel"><div className="placeholder-icon" aria-hidden="true">◌</div><span className="status-badge">PLANNED FOR A LATER PHASE</span><h2>This space is prepared.</h2><p>This module is part of the AWAKENING roadmap. Its tracking and data features are not active yet, so no activity or progress is being shown here.</p><Link href="/" className="button button-secondary">Return to dashboard <span aria-hidden="true">→</span></Link></section>
  </div>;
}

