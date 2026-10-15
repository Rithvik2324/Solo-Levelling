import type { NavItem } from "@/lib/navigation";

type IconName = NavItem["icon"];

const paths: Record<IconName, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
  quest: <><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></>,
  habit: <><path d="M20 7 10 17l-5-5" /><path d="M21 12a9 9 0 1 1-5.3-8.2" /></>,
  stats: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 6-7" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  tasks: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2" /></>,
  planning: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2M12 2v2M22 12h-2" /></>,
  focus: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  fitness: <><path d="M6 9v6M3 10v4M18 9v6M21 10v4M6 12h12" /></>,
  nutrition: <><path d="M12 21s-8-4.5-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 6.5-8 11-8 11Z" /><path d="M12 9c0-3 2-5 5-5" /></>,
  mind: <><path d="M12 4a4 4 0 0 0-7 2.7A4 4 0 0 0 4 14a4 4 0 0 0 7 3v-3" /><path d="M12 4a4 4 0 0 1 7 2.7A4 4 0 0 1 20 14a4 4 0 0 1-7 3v-3M12 4v16" /></>,
  academics: <><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H12v18H5.5A2.5 2.5 0 0 0 3 23V5.5ZM21 5.5A2.5 2.5 0 0 0 18.5 3H12v18h6.5A2.5 2.5 0 0 1 21 23V5.5Z" /></>,
  career: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
  guitar: <><path d="M14 5 5 14a3 3 0 1 0 5 5l9-9" /><path d="m16 3 5 5M12 7l5 5M8 11l5 5" /><circle cx="7.5" cy="16.5" r="1" /></>,
  flute: <><path d="M3 17 19 7l2 2L5 19l-2-2Z" /><path d="m8 14 1 2M12 11l1 2M16 9l1 2" /><circle cx="6" cy="16" r=".6" /></>,
  content: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9 5 3-5 3V9ZM7 5l2-2h6l2 2" /></>,
  bloom: <><path d="M12 12c-5-8-10-4-7-1 3 3 7 1 7 1ZM12 12c8-5 4-10 1-7-3 3-1 7-1 7ZM12 12c5 8 10 4 7 1-3-3-7-1-7-1ZM12 12c-8 5-4 10-1 7 3-3 1-7 1-7Z" /><circle cx="12" cy="12" r="1.5" /></>,
  business: <><path d="M4 20V7l8-4 8 4v13M2 20h20M9 20v-5h6v5M8 9h.01M12 9h.01M16 9h.01" /></>,
  finance: <><rect x="3" y="6" width="18" height="15" rx="2" /><path d="M3 10h18M7 6V4h10v2" /><circle cx="16" cy="15" r="1" /></>,
  achievement: <><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4ZM7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4" /></>,
  settings: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4" /></>,
  diagnostics: <><path d="M3 12h4l2-7 4 14 2-7h6" /></>
};

export function NavigationIcon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

