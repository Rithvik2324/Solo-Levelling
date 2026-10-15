import { notFound } from "next/navigation";
import { DiagnosticsPanel } from "@/components/diagnostics-panel";
import { DataSafetyPanel } from "@/components/data-safety-panel";

export const metadata = { title: "Diagnostics & Data Safety | AWAKENING" };

export default function DiagnosticsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <div className="workspace-page diagnostics-page"><span className="eyebrow">LOCAL TOOLS <span className="eyebrow-separator">/</span> DATA SAFETY</span><h1>Diagnostics & Data Safety</h1><p className="page-subtitle">Troubleshoot this local development instance and manage the records it can safely export.</p><DiagnosticsPanel /><DataSafetyPanel /></div>;
}
