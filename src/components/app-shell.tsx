"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { navigation } from "@/lib/navigation";
import { NetworkStatus } from "@/components/network-status";
import { NavigationIcon } from "@/components/navigation-icon";

const groups = [
  { id: "system", label: "SYSTEM" },
  { id: "life", label: "LIFE & WELLBEING" },
  { id: "growth", label: "GROWTH & WORK" }
] as const;

export function AppShell({ children, authConfigured, localDevelopment }: { children: React.ReactNode; authConfigured: boolean; localDevelopment: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();
  const playerName = session?.user?.name || (localDevelopment ? "Local session" : "Unregistered");
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  useEffect(() => {
    document.querySelector<HTMLElement>(".nav-link-active")?.scrollIntoView({ block: "nearest" });
  }, [pathname]);

  return (
    <div className="app-frame">
      <button className="mobile-menu button button-quiet" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="primary-navigation" aria-label={open ? "Close navigation" : "Open navigation"}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d={open ? "M5 5l14 14M19 5 5 19" : "M4 6h16M4 12h16M4 18h16"} /></svg><span className="sr-only">{open ? "Close navigation" : "Open navigation"}</span>
      </button>
      {open && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <aside id="primary-navigation" className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <Link href="/" className="brand" onClick={() => setOpen(false)} aria-label="Awakening dashboard">
          <span className="brand-mark">A</span><span><strong>AWAKENING</strong><small>PERSONAL SYSTEM</small></span>
        </Link>
        <div className="player-mini">
          <div className="avatar-small">{session?.user?.name ? session.user.name.slice(0, 1).toUpperCase() : localDevelopment ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 14.5 9.5 21.2 12l-6.7 2.5L12 21.2l-2.5-6.7L2.8 12l6.7-2.5L12 2.8Z" /></svg> : "?"}</div><div className="player-mini-copy"><span>{localDevelopment && !session ? "SESSION PLAYER" : "PLAYER"}</span><strong>{playerName}</strong></div><span className={`online-dot ${!session ? "offline-dot" : ""}`} title={session ? "Signed in" : localDevelopment ? "Local development session; no account connected" : "Not signed in"} />
        </div>
        <nav className="nav-list" aria-label="Main navigation">
          {groups.map(group => (
            <div className="nav-group" key={group.id}>
              <p className="nav-heading">{group.label}</p>
              {navigation.filter(item => item.group === group.id).map(item => {
                const active = pathname === item.href;
                return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`nav-link ${active ? "nav-link-active" : ""}`} aria-current={active ? "page" : undefined}>
                  <span className="nav-icon"><NavigationIcon name={item.icon} /></span><span className="nav-label">{item.label}</span>{item.status === "planned" && <span className="nav-soon">SOON</span>}
                </Link>;
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer"><span className={`status-pip ${!session ? "offline-dot" : ""}`} /> {localDevelopment && !session ? <span className="sidebar-mode">LOCAL DEVELOPMENT</span> : session ? <button className="sidebar-auth" onClick={() => signOut()}>SIGN OUT</button> : authConfigured ? <button className="sidebar-auth" onClick={() => signIn("google")}>SIGN IN</button> : <Link className="sidebar-auth" href="/settings#account-configuration" title="Open setup instructions">AUTH SETUP NEEDED</Link>} <span className="version">v0.2</span></div>
      </aside>
      <div className="main-column">
        <header className="topbar"><div className="breadcrumb"><span className="breadcrumb-dash" />SYSTEM <span>/</span> <strong>{pathname === "/" ? "OVERVIEW" : navigation.find(x => x.href === pathname)?.label.toUpperCase()}</strong></div><div className="topbar-right"><details className="global-quick-add"><summary>+ Quick add</summary><div className="quick-add-menu"><Link href="/tasks">New task</Link>{localDevelopment ? <Link href="/academics">Study planning</Link> : <Link href="/quests">New XP quest</Link>}<Link href="/schedule">Calendar event</Link><Link href="/focus">Focus block</Link><Link href="/habits">Log a habit</Link><Link href="/daily-planning">Daily intention or note</Link></div></details><span className="local-tag"><span className="status-pip" /> {localDevelopment ? "LOCAL DEVELOPMENT" : "PRIVATE MODE"}</span><span className="top-avatar" aria-label={session?.user?.name ?? (localDevelopment ? "Local development session" : "Not signed in")}>{session?.user?.name ? session.user.name.slice(0, 1).toUpperCase() : localDevelopment ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 14.5 9.5 21.2 12l-6.7 2.5-2.5 6.7-2.5-6.7L2.8 12l6.7-2.5L12 2.8Z" /></svg> : "?"}</span></div></header>
        <main className="main-content"><NetworkStatus />{children}</main>
        <footer className="app-footer"><span>AWAKENING SYSTEM</span><span>YOUR PROGRESS BEGINS WITH ONE ACTION.</span></footer>
      </div>
    </div>
  );
}

