export type NavItem = {
  label: string;
  href: string;
  icon: "dashboard" | "quest" | "habit" | "stats" | "calendar" | "tasks" | "planning" | "focus" | "fitness" | "nutrition" | "mind" | "academics" | "career" | "guitar" | "flute" | "content" | "bloom" | "business" | "finance" | "achievement" | "settings" | "diagnostics";
  group: "system" | "life" | "growth";
  status: "active" | "planned";
};

export const navigation: NavItem[] = [
  { label: "System Dashboard", href: "/", icon: "dashboard", group: "system", status: "active" },
  { label: "Quests", href: "/quests", icon: "quest", group: "system", status: "active" },
  { label: "Habits", href: "/habits", icon: "habit", group: "system", status: "active" },
  { label: "Player Stats", href: "/player-stats", icon: "stats", group: "system", status: "active" },
  { label: "Schedule", href: "/schedule", icon: "calendar", group: "system", status: "active" },
  { label: "Task Board", href: "/tasks", icon: "tasks", group: "system", status: "active" },
  { label: "Daily Planning", href: "/daily-planning", icon: "planning", group: "system", status: "active" },
  { label: "Focus", href: "/focus", icon: "focus", group: "system", status: "active" },
  { label: "Fitness & Martial Arts", href: "/fitness", icon: "fitness", group: "life", status: "active" },
  { label: "Nutrition & Recovery", href: "/nutrition", icon: "nutrition", group: "life", status: "active" },
  { label: "Mind & Journal", href: "/mind", icon: "mind", group: "life", status: "active" },
  { label: "Academics & Exams", href: "/academics", icon: "academics", group: "growth", status: "active" },
  { label: "Placements & Career", href: "/career", icon: "career", group: "growth", status: "active" },
  { label: "Guitar", href: "/guitar", icon: "guitar", group: "growth", status: "active" },
  { label: "Flute", href: "/flute", icon: "flute", group: "growth", status: "active" },
  { label: "Content Creation", href: "/content", icon: "content", group: "growth", status: "active" },
  { label: "Bloom & Blend", href: "/bloom-blend", icon: "bloom", group: "growth", status: "active" },
  { label: "Zyrenox", href: "/zyrenox", icon: "business", group: "growth", status: "active" },
  { label: "Finance", href: "/finance", icon: "finance", group: "growth", status: "active" },
  { label: "Achievements & Insights", href: "/achievements", icon: "achievement", group: "system", status: "active" },
  { label: "Settings", href: "/settings", icon: "settings", group: "system", status: "active" },
  { label: "Diagnostics & Data Safety", href: "/diagnostics", icon: "diagnostics", group: "system", status: "active" }
];

export const pageDescriptions: Record<string, string> = {
  Quests: "Turn meaningful actions into clear, trackable quests.",
  Habits: "Build routines with a steady, honest record of consistency.",
  "Player Stats": "A personal view of attributes, level, and earned experience.",
  Schedule: "Bring commitments and focus time into one timeline.",
  "Fitness & Martial Arts": "Plan workouts and martial arts practice, then track training and recovery.",
  "Nutrition & Recovery": "Log editable meal estimates, hydration, sleep, groceries, and energy check-ins.",
  "Mind & Journal": "A private space for reflection, gratitude, focus, and noticing distractions.",
  "Academics & Exams": "Subjects, syllabus progress, assignments, and exam dates.",
  "Placements & Career": "DSA, programming, AI/ML, applications, and interview prep.",
  Guitar: "Practice sessions, repertoire, technique, and practice plans.",
  Flute: "Breath control, tone, fingering, repertoire, and practice sessions.",
  "Content Creation": "Ideas, production plans, and publishing progress.",
  "Bloom & Blend": "Workshop planning and business operations.",
  Zyrenox: "Projects, operations, and business milestones.",
  Finance: "Track personal transactions, budgets, and savings goals.",
  "Achievements & Insights": "See milestones and weekly insights derived from real recorded activity.",
  Settings: "Personalize your profile and campaign preferences."
};
