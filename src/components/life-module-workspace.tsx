"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { InlineEditForm } from "@/components/inline-edit-form";
import { applicationStatuses, contentStatuses, financeTypes, leadStatuses, projectStatuses, promotionStatuses, recurringCadences, registrationPaymentStatuses, workshopStatuses, type LifeModuleEntryRecord, type LifeModuleId, type LifeModuleQuestDraftRecord } from "@/lib/domain";
import { academicStudyPlan, careerProgress, filterLifeEntries, lifeEntryDeadline } from "@/lib/life-module-query";
import { bloomBlendSummary, contentSummary, invoiceOutstanding, personalFinanceSummary, practiceMinutesForSession, practiceSummary, repertoireProgress, workshopFinance, zyrenoxSummary } from "@/lib/life-module-query";
import { buildTransactionCsv } from "@/lib/finance-csv";

type FieldConfig = { key: string; label: string; type?: "number" | "text" | "date" | "select" | "textarea" | "checkbox"; min?: number; max?: number; step?: number; help?: string; options?: readonly string[]; kinds?: string[]; optionsSource?: "workshops" | "leads" | "projects" | "invoices" | "goals" };
type ModuleConfig = { title: string; subtitle: string; kinds: string[]; fields: FieldConfig[]; summary: string[]; privacy?: string };

const configs: Record<LifeModuleId, ModuleConfig> = {
  fitness: {
    title: "Fitness & Martial Arts", subtitle: "Plan training, record sessions, and make recovery part of the practice.",
    kinds: ["Workout plan", "Training session", "Exercise library", "Personal record", "Body measurement", "Conditioning", "Mobility", "Martial arts technique", "Rest & recovery"],
    fields: [{ key: "discipline", label: "Discipline / focus" }, { key: "exercise", label: "Exercise or technique" }, { key: "sets", label: "Sets", type: "number", min: 0 }, { key: "repetitions", label: "Repetitions", type: "number", min: 0 }, { key: "weightKg", label: "Weight (kg)", type: "number", min: 0, step: 0.25 }, { key: "durationMinutes", label: "Duration (minutes)", type: "number", min: 0 }, { key: "measurementCm", label: "Measurement (cm)", type: "number", min: 0, step: 0.1 }, { key: "recoveryScore", label: "Self-rated recovery (1â€“5)", type: "number", min: 1, max: 5 }],
    summary: ["Training session", "Martial arts technique", "Personal record"]
  },
  nutrition: {
    title: "Nutrition & Recovery", subtitle: "Keep a practical log of meals, hydration, sleep, and how your energy feels.",
    kinds: ["Meal log", "Meal plan", "Grocery item", "Hydration", "Sleep", "Energy check-in", "Recovery summary"],
    fields: [{ key: "caloriesEstimate", label: "Estimated calories", type: "number", min: 0, help: "Editable estimate; not a measured value." }, { key: "proteinEstimateG", label: "Estimated protein (g)", type: "number", min: 0, step: 0.1, help: "Editable estimate; not a measured value." }, { key: "waterMl", label: "Water (ml)", type: "number", min: 0 }, { key: "sleepHours", label: "Sleep (hours)", type: "number", min: 0, max: 24, step: 0.25 }, { key: "energyScore", label: "Energy check-in (1â€“5)", type: "number", min: 1, max: 5 }, { key: "quantity", label: "Grocery quantity" }],
    summary: ["Meal log", "Hydration", "Sleep"]
  },
  mind: {
    title: "Mind & Journal", subtitle: "A private space for reflection, focus, gratitude, and noticing distractions.",
    kinds: ["Journal entry", "Mood check-in", "Energy check-in", "Focus session", "Gratitude note", "Distraction log", "Weekly review"],
    fields: [{ key: "moodScore", label: "Mood check-in (1â€“5)", type: "number", min: 1, max: 5, help: "Self-reported reflection, not a diagnosis." }, { key: "energyScore", label: "Energy check-in (1â€“5)", type: "number", min: 1, max: 5, help: "Self-reported reflection, not a diagnosis." }, { key: "focusMinutes", label: "Focus minutes", type: "number", min: 0 }, { key: "distractionCount", label: "Distractions noticed", type: "number", min: 0 }, { key: "gratitude", label: "Gratitude note" }, { key: "prompt", label: "Reflection prompt" }],
    summary: ["Journal entry", "Focus session", "Gratitude note"],
    privacy: "Development-only local SQLite store, scoped to this browser session. Keep private backups protected. Self-reported check-ins are not medical assessments."
  },
  academics: {
    title: "Academics & Exams", subtitle: "Organize subjects, syllabus progress, assignments, revision, and exam preparation.",
    kinds: ["Subject", "Syllabus unit", "Topic", "Study session", "Exam", "Assignment", "Revision task", "Mock test"],
    fields: [{ key: "subject", label: "Subject" }, { key: "unit", label: "Syllabus unit" }, { key: "topic", label: "Topic" }, { key: "priority", label: "Priority", type: "select", options: ["low", "normal", "high", "urgent"] }, { key: "studyMinutes", label: "Study minutes", type: "number", min: 0, help: "Record planned or completed study time. This log currently does not award XP." }, { key: "syllabusCoveragePct", label: "Syllabus coverage (%)", type: "number", min: 0, max: 100 }, { key: "score", label: "Mock score", type: "number", min: 0 }, { key: "maxScore", label: "Maximum score", type: "number", min: 1 }], summary: []
  },
  career: {
    title: "Placements & Career", subtitle: "Track problem solving, skill development, applications, interviews, and projects.",
    kinds: ["DSA problem", "Learning roadmap milestone", "Company research", "Job application", "Interview round", "Interview question", "Resume version", "Project milestone", "Aptitude practice", "Communication goal"],
    fields: [{ key: "topic", label: "Topic / skill" }, { key: "difficulty", label: "Difficulty", type: "select", options: ["easy", "medium", "hard"] }, { key: "attempts", label: "Attempts", type: "number", min: 0 }, { key: "revisionDate", label: "Revision date", type: "date" }, { key: "programmingLanguage", label: "Language / learning path", type: "select", options: ["Java", "Python", "AI/ML", "CS fundamentals", "Aptitude", "Communication"] }, { key: "company", label: "Company" }, { key: "pipelineStatus", label: "Application stage", type: "select", options: applicationStatuses }, { key: "applicationLink", label: "Application / company link" }, { key: "contact", label: "Contact" }, { key: "followUpDate", label: "Follow-up date", type: "date" }, { key: "interviewRound", label: "Interview round" }, { key: "mockScore", label: "Mock interview score", type: "number", min: 0, max: 100 }, { key: "resumeVersion", label: "Resume version" }, { key: "milestone", label: "Project milestone" }], summary: []
  },
  guitar: {
    title: "Guitar Mastery", subtitle: "Build a steady practice, grow your repertoire, and record progress honestly.",
    kinds: ["Practice session", "Chord", "Scale", "Technique", "Exercise", "Song", "Learning goal", "Practice plan", "Milestone"],
    fields: [{ key: "durationMinutes", label: "Session duration (minutes)", type: "number", min: 0 }, { key: "difficulty", label: "Difficulty", type: "select", options: ["beginner", "easy", "intermediate", "challenging", "advanced"] }, { key: "progressScore", label: "Self-assessed progress (1â€“5)", type: "number", min: 1, max: 5 }, { key: "masteryStatus", label: "Learning progress", type: "select", options: ["not started", "learning", "in progress", "mastered"] }, { key: "weeklyTargetSessions", label: "Target sessions per week", type: "number", min: 1, max: 21 }, { key: "targetMinutesPerWeek", label: "Target minutes per week", type: "number", min: 1 }, { key: "repertoire", label: "Repertoire / learning goal" }], summary: []
  },
  flute: {
    title: "Flute Mastery", subtitle: "Practice breath, fingering, tone, scales, and repertoire in its own learning history.",
    kinds: ["Practice session", "Breath-control exercise", "Fingering", "Tone exercise", "Scale", "Technique", "Song", "Learning goal", "Practice plan", "Milestone"],
    fields: [{ key: "durationMinutes", label: "Session duration (minutes)", type: "number", min: 0 }, { key: "difficulty", label: "Difficulty", type: "select", options: ["beginner", "easy", "intermediate", "challenging", "advanced"] }, { key: "progressScore", label: "Self-assessed progress (1â€“5)", type: "number", min: 1, max: 5 }, { key: "masteryStatus", label: "Learning progress", type: "select", options: ["not started", "learning", "in progress", "mastered"] }, { key: "weeklyTargetSessions", label: "Target sessions per week", type: "number", min: 1, max: 21 }, { key: "targetMinutesPerWeek", label: "Target minutes per week", type: "number", min: 1 }, { key: "breathSeconds", label: "Breath hold / phrase duration (seconds)", type: "number", min: 0 }, { key: "repertoire", label: "Repertoire / learning goal" }], summary: []
  },
  content: {
    title: "Content Creation", subtitle: "Capture ideas, move productions through a deliberate pipeline, and record published results.",
    kinds: ["Idea", "Video", "Short-form video", "Carousel", "Article", "Podcast", "Livestream", "Other content"],
    fields: [{ key: "tags", label: "Idea tags (comma separated)" }, { key: "platform", label: "Platform", type: "select", options: ["YouTube", "Instagram", "TikTok", "LinkedIn", "Website", "Podcast", "Other"] }, { key: "format", label: "Format" }, { key: "targetAudience", label: "Target audience" }, { key: "objective", label: "Objective" }, { key: "pipelineStatus", label: "Production stage", type: "select", options: contentStatuses }, { key: "script", label: "Script", type: "textarea" }, { key: "caption", label: "Caption", type: "textarea" }, { key: "publicationDate", label: "Publication date", type: "date" }, { key: "publishedUrl", label: "Published URL" }, { key: "views", label: "Views (manual)", type: "number", min: 0 }, { key: "likes", label: "Likes (manual)", type: "number", min: 0 }, { key: "comments", label: "Comments (manual)", type: "number", min: 0 }, { key: "filmingDone", label: "Filming checklist complete", type: "checkbox" }, { key: "editingDone", label: "Editing checklist complete", type: "checkbox" }, { key: "captionReady", label: "Caption checklist complete", type: "checkbox" }, { key: "thumbnailReady", label: "Thumbnail checklist complete", type: "checkbox" }], summary: []
  },
  "bloom-blend": {
    title: "Bloom & Blend", subtitle: "Plan workshops, manage attendee registrations, prepare materials, and track estimates against manually recorded money.",
    kinds: ["Workshop", "Registration", "Workshop expense", "Workshop other income", "Workshop checklist", "Promotion"],
    fields: [
      { key: "category", label: "Category", kinds: ["Workshop"] }, { key: "venue", label: "Venue", kinds: ["Workshop"] }, { key: "startTime", label: "Start time", kinds: ["Workshop"] }, { key: "durationMinutes", label: "Duration (minutes)", type: "number", min: 1, kinds: ["Workshop"] }, { key: "capacity", label: "Capacity (seats)", type: "number", min: 1, kinds: ["Workshop"] }, { key: "ticketPrice", label: "Ticket price (INR)", type: "number", min: 0, kinds: ["Workshop"] }, { key: "materialCostPerAttendee", label: "Estimated material cost per attendee (INR)", type: "number", min: 0, kinds: ["Workshop"] }, { key: "host", label: "Instructor / host", kinds: ["Workshop"] }, { key: "workshopStatus", label: "Workshop status", type: "select", options: workshopStatuses, kinds: ["Workshop"] },
      { key: "workshopId", label: "Workshop", type: "select", optionsSource: "workshops", kinds: ["Registration", "Workshop expense", "Workshop other income", "Workshop checklist"] }, { key: "attendeeName", label: "Attendee name", kinds: ["Registration"] }, { key: "contact", label: "Contact (manual)", kinds: ["Registration"] }, { key: "seats", label: "Seats", type: "number", min: 1, max: 100, kinds: ["Registration"] }, { key: "paymentStatus", label: "Payment status", type: "select", options: registrationPaymentStatuses, kinds: ["Registration"] }, { key: "amountPaid", label: "Amount paid (INR)", type: "number", min: 0, kinds: ["Registration"] }, { key: "registrationStatus", label: "Registration state", type: "select", options: ["active", "cancelled"], kinds: ["Registration"] },
      { key: "amount", label: "Amount (INR)", type: "number", min: 0, kinds: ["Workshop expense", "Workshop other income"] }, { key: "expenseCategory", label: "Expense category / income source", kinds: ["Workshop expense", "Workshop other income"] }, { key: "checklistCategory", label: "Checklist category", type: "select", options: ["materials", "venue setup", "promotion", "attendee confirmation", "post-event feedback"], kinds: ["Workshop checklist"] },
      { key: "platform", label: "Platform", type: "select", options: ["Instagram", "YouTube", "WhatsApp", "Other"], kinds: ["Promotion"] }, { key: "promotionStatus", label: "Promotion status", type: "select", options: promotionStatuses, kinds: ["Promotion"] }, { key: "caption", label: "Caption / promotion idea", type: "textarea", kinds: ["Promotion"] }
    ], summary: []
  },
  zyrenox: {
    title: "Zyrenox", subtitle: "Track leads, project delivery, invoices, payment history, and business activity. All amounts are manually entered.",
    kinds: ["Lead", "Client project", "Deliverable", "Invoice"],
    fields: [
      { key: "contactPerson", label: "Contact person", kinds: ["Lead", "Client project"] }, { key: "company", label: "Company / client", kinds: ["Lead", "Client project"] }, { key: "serviceInterest", label: "Service interest", kinds: ["Lead"] }, { key: "contactChannel", label: "Contact channel", kinds: ["Lead"] }, { key: "estimatedDealValue", label: "Estimated deal value (INR)", type: "number", min: 0, kinds: ["Lead"] }, { key: "leadStatus", label: "Lead stage", type: "select", options: leadStatuses, kinds: ["Lead"] }, { key: "followUpDate", label: "Next follow-up date", type: "date", kinds: ["Lead"] }, { key: "source", label: "Lead source", kinds: ["Lead"] },
      { key: "projectId", label: "Project", type: "select", optionsSource: "projects", kinds: ["Deliverable", "Invoice"] }, { key: "serviceType", label: "Service type", kinds: ["Client project"] }, { key: "scope", label: "Scope", type: "textarea", kinds: ["Client project"] }, { key: "quotedPrice", label: "Quoted price (INR)", type: "number", min: 0, kinds: ["Client project"] }, { key: "agreedPrice", label: "Agreed price (INR)", type: "number", min: 0, kinds: ["Client project"] }, { key: "projectStatus", label: "Project status", type: "select", options: projectStatuses, kinds: ["Client project"] }, { key: "startDate", label: "Start date", type: "date", kinds: ["Client project"] }, { key: "dueDate", label: "Due date", type: "date", kinds: ["Client project", "Invoice"] },
      { key: "priority", label: "Priority", type: "select", options: ["low", "normal", "high", "urgent"], kinds: ["Deliverable"] }, { key: "invoiceNumber", label: "Invoice number", kinds: ["Invoice"] }, { key: "issueDate", label: "Issue date", type: "date", kinds: ["Invoice"] }, { key: "lineItems", label: "Line items (description | amount per line)", type: "textarea", help: "Enter one item per line, for example: Design work | 2500. Invoice total is checked against this list.", kinds: ["Invoice"] }, { key: "total", label: "Invoice total (INR)", type: "number", min: 0.01, kinds: ["Invoice"] }
    ], summary: []
  },
  finance: {
    title: "Personal Finance", subtitle: "A local tracker for recorded income, expenses, budgets, and savings. Data stays in the session-scoped SQLite store and is not synced.",
    kinds: ["Transaction", "Monthly budget", "Savings goal", "Recurring template"],
    fields: [
      { key: "flowType", label: "Type", type: "select", options: financeTypes, kinds: ["Transaction", "Recurring template"] }, { key: "amount", label: "Amount (INR)", type: "number", min: 0.01, kinds: ["Transaction", "Monthly budget", "Savings goal", "Savings contribution", "Recurring template"] }, { key: "category", label: "Category", kinds: ["Transaction", "Monthly budget", "Recurring template"] }, { key: "account", label: "Account / payment method", kinds: ["Transaction", "Recurring template"] }, { key: "month", label: "Budget month (YYYY-MM)", kinds: ["Monthly budget"] }, { key: "goalId", label: "Savings goal", type: "select", optionsSource: "goals", kinds: ["Savings contribution"] }, { key: "cadence", label: "Cadence", type: "select", options: recurringCadences, kinds: ["Recurring template"] }, { key: "recurringStartDate", label: "Template start date", type: "date", kinds: ["Recurring template"] }
    ], summary: [], privacy: "Development-only personal finance tracker. Do not enter banking credentials or sensitive account details. Records persist in local SQLite and are isolated by browser session."
  }
};

const prompts = ["What felt meaningful today?", "What would make tomorrow easier?", "What did you learn about yourself this week?", "What are three things you appreciate right now?", "Where did your attention go, and what matters next?"];

function optionsFor(field: FieldConfig, entries: LifeModuleEntryRecord[]) {
  if (field.options) return field.options.map(option => ({ value: option, label: option }));
  const kinds = field.optionsSource === "workshops" ? ["Workshop"] : field.optionsSource === "leads" ? ["Lead"] : field.optionsSource === "projects" ? ["Client project"] : field.optionsSource === "invoices" ? ["Invoice"] : field.optionsSource === "goals" ? ["Savings goal"] : [];
  return entries.filter(entry => kinds.includes(entry.kind)).map(entry => ({ value: entry.id, label: entry.title }));
}

async function readResponse(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not complete that action.");
  return body as { entries?: LifeModuleEntryRecord[]; entry?: LifeModuleEntryRecord; drafts?: LifeModuleQuestDraftRecord[]; draft?: LifeModuleQuestDraftRecord; source?: string; notice?: string; alreadyConverted?: boolean; alreadyGenerated?: boolean; alreadyRecorded?: boolean; reward?: { event: { amount: number }; alreadyAwarded: boolean; unlocked: { title: string }[] } };
}

export function LifeModuleWorkspace({ module }: { module: LifeModuleId }) {
  const config = configs[module];
  const [entries, setEntries] = useState<LifeModuleEntryRecord[]>([]);
  const [questDrafts, setQuestDrafts] = useState<LifeModuleQuestDraftRecord[]>([]);
  const [linkedEntryIds, setLinkedEntryIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editId, setEditId] = useState("");
  const [kind, setKind] = useState(config.kinds[0]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<Record<string, string | number | boolean>>({});
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deadlineFilter, setDeadlineFilter] = useState("");
  const [availableMinutes, setAvailableMinutes] = useState(120);
  const [timerTitle, setTimerTitle] = useState("");
  const [practiceDifficulty, setPracticeDifficulty] = useState("intermediate");
  const [practiceProgress, setPracticeProgress] = useState(3);
  const [practiceNotes, setPracticeNotes] = useState("");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => { const current = new Date(); return current.getFullYear() + "-" + String(current.getMonth() + 1).padStart(2, "0"); });
  const [financeFlowFilter, setFinanceFlowFilter] = useState("all");
  const [financeCategoryFilter, setFinanceCategoryFilter] = useState("");
  const [financeDateFrom, setFinanceDateFrom] = useState("");
  const [financeDateTo, setFinanceDateTo] = useState("");

  async function refresh() {
    setError("");
    try {
      const value = await readResponse(await fetch(`/api/life-modules/${module}`, { cache: "no-store" })); setEntries(value.entries ?? []);
      const questResult = await readResponse(await fetch(`/api/life-modules/${module}/quests`, { cache: "no-store" }));
      setQuestDrafts(questResult.drafts ?? []);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load this module."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [module]);
  useEffect(() => { if (!timerRunning) return; const timer = window.setInterval(() => setSecondsLeft(current => { if (current <= 1) { window.clearInterval(timer); setTimerRunning(false); return 0; } return current - 1; }), 1000); return () => window.clearInterval(timer); }, [timerRunning]);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const weekStart = (() => { const day = new Date(now); day.setDate(day.getDate() - ((day.getDay() + 6) % 7)); return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`; })();
  const visibleEntries = useMemo(() => filterLifeEntries(entries, { search, subject: module === "finance" ? financeCategoryFilter : subjectFilter, status: module === "finance" ? "" : statusFilter, deadlineBefore: module === "finance" ? "" : deadlineFilter }).filter(item => filter === "all" || item.kind === filter).filter(item => module !== "finance" || ((financeFlowFilter === "all" || item.fields.flowType === financeFlowFilter) && (!financeDateFrom || !item.date || item.date >= financeDateFrom) && (!financeDateTo || !item.date || item.date <= financeDateTo))).sort((a, b) => (a.date ?? "9999-12-31").localeCompare(b.date ?? "9999-12-31")), [entries, filter, search, subjectFilter, statusFilter, deadlineFilter, module, financeFlowFilter, financeCategoryFilter, financeDateFrom, financeDateTo]);
  const todayEntries = entries.filter(item => item.date === today);
  const sumField = (items: LifeModuleEntryRecord[], key: string) => items.reduce((sum, item) => sum + Number(item.fields[key] || 0), 0);
  const financeSummary = personalFinanceSummary(entries, selectedMonth);
  const currency = (amount: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
  function fieldDefault(field: FieldConfig) {
    if (field.key === "pipelineStatus" && module === "content") return "idea";
    if (field.key === "leadStatus" && module === "zyrenox") return "new";
    if (field.key === "workshopStatus" && module === "bloom-blend") return "planning";
    if (field.key === "paymentStatus" && module === "bloom-blend") return "unpaid";
    if (field.key === "registrationStatus" && module === "bloom-blend") return "active";
    if (field.key === "projectStatus" && module === "zyrenox") return "planned";
    return "";
  }
  const summaryCards = module === "fitness" ? [
    ["COMPLETED SESSIONS", entries.filter(item => item.status === "done" && item.kind === "Training session").length],
    ["TECHNIQUES PRACTICED", entries.filter(item => item.status === "done" && item.kind === "Martial arts technique").length],
    ["REST / RECOVERY LOGS", entries.filter(item => item.kind === "Rest & recovery").length]
  ] : module === "nutrition" ? [
    ["EST. MEAL CALORIES Â· TODAY", `${sumField(todayEntries.filter(item => item.kind === "Meal log"), "caloriesEstimate")} kcal`],
    ["EST. MEAL PROTEIN Â· TODAY", `${sumField(todayEntries.filter(item => item.kind === "Meal log"), "proteinEstimateG")} g`],
    ["WATER LOGGED Â· TODAY", `${sumField(todayEntries.filter(item => item.kind === "Hydration"), "waterMl")} ml`]
  ] : module === "mind" ? [
    ["JOURNAL / REFLECTIONS", entries.filter(item => ["Journal entry", "Weekly review", "Gratitude note"].includes(item.kind)).length],
    ["FOCUS MINUTES", sumField(entries.filter(item => item.status === "done" && item.kind === "Focus session"), "focusMinutes")],
    ["CHECK-INS RECORDED", entries.filter(item => ["Mood check-in", "Energy check-in"].includes(item.kind)).length]
  ] : module === "academics" ? [
    ["UPCOMING EXAMS", entries.filter(item => item.kind === "Exam" && !!item.date && item.date >= today).length],
    ["INCOMPLETE SYLLABUS", entries.filter(item => ["Syllabus unit", "Topic"].includes(item.kind) && item.status !== "done").length],
    ["OVERDUE ASSIGNMENTS", entries.filter(item => item.kind === "Assignment" && !!item.date && item.date < today && item.status !== "done").length],
    ["STUDY MINUTES THIS WEEK", sumField(entries.filter(item => item.date && item.date >= weekStart), "studyMinutes")]
  ] : module === "career" ? (() => { const progress = careerProgress(entries, today); return [["DSA PROBLEMS SOLVED", progress.solved], ["REVISION DUE", progress.revisionDue], ["APPLICATIONS IN PROGRESS", progress.inProgress], ["UPCOMING INTERVIEWS", progress.interviews]]; })()
    : module === "guitar" || module === "flute" ? (() => { const plan = entries.find(item => item.kind === "Practice plan"); const summary = practiceSummary(entries, weekStart, Number(plan?.fields.weeklyTargetSessions || 0)); const repertoire = repertoireProgress(entries); return [["PRACTICE SESSIONS Â· WEEK", `${summary.sessions}${summary.targetSessions ? ` / ${summary.targetSessions}` : ""}`], ["PRACTICE MINUTES Â· WEEK", summary.minutes], ["REPERTOIRE MASTERED", `${repertoire.mastered} / ${repertoire.total}`], ["MILESTONES COMPLETED", entries.filter(item => item.kind === "Milestone" && item.status === "done").length]]; })()
    : module === "content" ? (() => { const summary = contentSummary(entries, weekStart); return [["PRODUCED THIS WEEK", summary.produced], ["PUBLISHED THIS WEEK", summary.published], ["IDEAS IN VAULT", summary.ideas], ["UPCOMING DEADLINES", entries.filter(item => item.date && item.date >= today && item.fields.pipelineStatus !== "published").length]]; })()
    : module === "bloom-blend" ? (() => { const summary = bloomBlendSummary(entries, today); return [["UPCOMING WORKSHOPS", summary.upcoming], ["PLANNING", summary.planning], ["REGISTERED SEATS Â· MANUAL", summary.registrations], ["EST. GROSS REVENUE", currency(summary.revenue)]]; })()
    : module === "zyrenox" ? (() => { const summary = zyrenoxSummary(entries, today); return [["LEADS", summary.leads], ["ACTIVE PROJECTS", summary.activeProjects], ["UPCOMING / OVERDUE TASKS", summary.upcomingDeadlines + " / " + summary.overdueDeliverables], ["PENDING INVOICES", currency(summary.pendingPayments)], ["RECORDED REVENUE", currency(summary.recordedRevenue)]]; })()
    : [["RECORDED INCOME", currency(financeSummary.income)], ["RECORDED EXPENSES", currency(financeSummary.expenses)], ["NET CASH FLOW", currency(financeSummary.net)], ["BUDGET REMAINING", currency(financeSummary.budgetRemaining)]];

  function resetForm() { setEditId(""); setKind(config.kinds[0]); setTitle(""); setDate(""); setDescription(""); setFields({}); }

  async function saveEntry(event?: FormEvent) {
    event?.preventDefault();
    if (!title.trim()) { setError("Add a title before saving."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const payload = { ...(editId ? { id: editId } : {}), title, kind, date, description, fields };
      const result = await readResponse(await fetch(`/api/life-modules/${module}`, { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      await refresh(); setNotice(editId ? "Record updated." : "Record saved to the development adapter."); resetForm();
      return result.entry;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this record."); }
    finally { setSaving(false); }
  }

  async function updateEntry(entry: LifeModuleEntryRecord, patch: Record<string, unknown>) {
    if (patch.status === "archived") {
      const prompt = module === "finance" && entry.kind === "Transaction" ? "Delete this transaction from the active finance view? The development record will be archived." : `Archive â€œ${entry.title}â€? The record will leave the active list.`;
      if (!window.confirm(prompt)) return;
    }
    setSaving(true); setError(""); setNotice("");
    try { const result = await readResponse(await fetch(`/api/life-modules/${module}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: entry.id, title: entry.title, kind: entry.kind, date: entry.date ?? "", description: entry.description, fields: entry.fields, ...patch }) })); await refresh(); setNotice(result.reward ? `Completed: +${result.reward.event.amount} local XP${result.reward.unlocked.length ? ` Â· unlocked ${result.reward.unlocked.map((item: { title: string }) => item.title).join(", ")}` : ""}.` : patch.status === "done" ? "Record completed." : patch.status === "archived" ? "Record archived." : "Record updated."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update this record."); }
    finally { setSaving(false); }
  }

  async function makeQuest(entry: LifeModuleEntryRecord) {
    const dueDate = lifeEntryDeadline(entry);
    if (!dueDate) { setError("Add a date or deadline before converting this record to a quest."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/life-modules/${module}/quests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId: entry.id, title: entry.title, description: entry.description, dueDate }) });
      const value = await readResponse(response);
      if (value.draft) setQuestDrafts(current => [value.draft!, ...current.filter(draft => draft.id !== value.draft!.id)]);
      setLinkedEntryIds(current => current.includes(entry.id) ? current : [...current, entry.id]);
      setNotice(value.source === "system-engine" ? "Quest created in your authenticated System Engine." : "Development-only quest draft created. It is not in the System Engine and awards no XP.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create the quest."); }
    finally { setSaving(false); }
  }

  async function convertLead(lead: LifeModuleEntryRecord) {
    setSaving(true); setError(""); setNotice("");
    try { const result = await readResponse(await fetch(`/api/life-modules/zyrenox/convert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: lead.id }) })); await refresh(); setNotice(result.alreadyConverted ? "This lead already has a converted project." : "Won lead converted into a project."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not convert this lead."); }
    finally { setSaving(false); }
  }

  async function recordPayment(invoice: LifeModuleEntryRecord, values: Record<string, string>) {
    const amount = Number(values.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setError("Enter a positive payment amount."); return; }
    const paymentDate = values.paymentDate;
    if (!paymentDate) { setError("Choose the date the payment was received."); return; }
    const method = values.method;
    setSaving(true); setError(""); setNotice("");
    try { await readResponse(await fetch("/api/life-modules/zyrenox/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId: invoice.id, amount, paymentDate, method: method ?? "", paymentKey: crypto.randomUUID() }) })); await refresh(); setNotice("Payment recorded manually. No payment gateway was contacted."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not record the payment."); }
    finally { setSaving(false); }
  }

  async function generateRecurring(template: LifeModuleEntryRecord, values: Record<string, string>) {
    const occurrenceDate = values.occurrenceDate;
    setSaving(true); setError(""); setNotice("");
    try { const result = await readResponse(await fetch("/api/life-modules/finance/recurring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: template.id, occurrenceDate }) })); await refresh(); setNotice(result.alreadyGenerated ? "This template occurrence already has a transaction." : "One transaction was generated for the selected date."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not generate this transaction."); }
    finally { setSaving(false); }
  }

  async function addSavingsContribution(goal: LifeModuleEntryRecord, values: Record<string, string>) {
    const amount = Number(values.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setSaving(true); setError(""); setNotice("");
    try { const result = await readResponse(await fetch("/api/life-modules/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: goal.title + " contribution", kind: "Savings contribution", date: today, fields: { goalId: goal.id, amount, contributionKey: crypto.randomUUID() } }) })); await refresh(); setNotice(result.alreadyRecorded ? "Contribution was already recorded." : "Savings contribution recorded."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not record this contribution."); }
    finally { setSaving(false); }
  }

  function exportTransactions() {
    const csv = buildTransactionCsv(entries);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "awakening-finance-transactions.csv"; link.click(); URL.revokeObjectURL(url);
  }

  async function copyCaption(entry: LifeModuleEntryRecord) {
    try { await navigator.clipboard.writeText(String(entry.fields.caption ?? "")); setNotice("Caption copied."); }
    catch { setError("Clipboard access is unavailable in this browser."); }
  }

  function beginEdit(entry: LifeModuleEntryRecord) { setEditId(entry.id); setKind(entry.kind); setTitle(entry.title); setDate(entry.date ?? ""); setDescription(entry.description); setFields(entry.fields); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function finishPracticeSession() {
    if (module !== "guitar" && module !== "flute") return;
    const minutes = practiceMinutesForSession(focusMinutes * 60, secondsLeft);
    if (minutes < 1) { setError("Practice for at least one full minute before finishing the session."); return; }
    setSaving(true); setError(""); setNotice(""); setTimerRunning(false);
    try {
      const created = await readResponse(await fetch(`/api/life-modules/${module}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: timerTitle.trim() || `${module === "guitar" ? "Guitar" : "Flute"} practice Â· ${minutes} min`, kind: "Practice session", date: today, description: practiceNotes || "Recorded from the practice timer.", fields: { durationMinutes: minutes, instrument: module, difficulty: practiceDifficulty, progressScore: practiceProgress } }) }));
      if (created.entry) await readResponse(await fetch(`/api/life-modules/${module}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: created.entry.id, title: created.entry.title, kind: created.entry.kind, date: created.entry.date, description: created.entry.description, fields: created.entry.fields, status: "done" }) }));
      await refresh(); setNotice(`Practice session saved (${minutes} min). No XP was awarded.`); setSecondsLeft(focusMinutes * 60); setTimerTitle(""); setPracticeNotes("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the practice session."); }
    finally { setSaving(false); }
  }

  function startTimer() {
    if (secondsLeft <= 0) setSecondsLeft(focusMinutes * 60);
    setTimerRunning(true);
  }

  return <div className="workspace-page life-module-page">
    <div className="eyebrow"><span className="status-pip" /> LIFE MODULE <span className="eyebrow-separator">/</span> DEVELOPMENT ADAPTER</div>
    <h1>{config.title}</h1><p className="page-subtitle">{config.subtitle}</p>
    <div className="development-notice" role="note"><strong>LOCAL DEVELOPMENT MODE</strong><span>Records are saved in local SQLite for this browser session. They never modify your System Engine XP or authenticated account. Export private records from Diagnostics before moving this data to another machine.</span></div>
    {config.privacy && <div className="connection-banner"><span className="status-pip" /><span>{config.privacy}</span></div>}
    {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="success-banner" role="status">{notice}</div>}
    {module === "mind" && <section className="panel focus-timer"><div><div className="eyebrow">FOCUS TIMER</div><h2>Plan Â· focus Â· reflect</h2><p className="field-help">The shared focus timer keeps its state when you navigate to another module.</p></div><Link className="button button-primary" href="/focus">Open focus workspace</Link></section>}
    {(module === "guitar" || module === "flute") && <section className="panel focus-timer practice-timer"><div><div className="eyebrow">{module === "guitar" ? "GUITAR" : "FLUTE"} PRACTICE TIMER</div><h2 aria-live="polite">{String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:{String(secondsLeft % 60).padStart(2, "0")}</h2><p className="field-help">A session is saved only when you choose Finish practice.</p></div><div className="focus-controls"><label className="field-label">Session title<input className="text-input" maxLength={140} value={timerTitle} onChange={event => setTimerTitle(event.target.value)} placeholder="Optional practice focus" /></label><label className="field-label">Target minutes<input className="text-input" type="number" min="1" max="180" value={focusMinutes} disabled={timerRunning} onChange={event => { const value = Math.min(180, Math.max(1, Number(event.target.value))); setFocusMinutes(value); setSecondsLeft(value * 60); }} /></label><button className="button button-primary" type="button" onClick={timerRunning ? () => setTimerRunning(false) : startTimer}>{timerRunning ? "Pause" : secondsLeft < focusMinutes * 60 ? "Resume" : "Start"}</button><button className="button button-secondary" type="button" disabled={saving || practiceMinutesForSession(focusMinutes * 60, secondsLeft) < 1} onClick={() => void finishPracticeSession()}>Finish practice</button><button className="text-button" type="button" onClick={() => { setTimerRunning(false); setSecondsLeft(focusMinutes * 60); }}>Reset</button></div></section>}
    {(module === "guitar" || module === "flute") && <section className="panel practice-reflection"><label className="field-label">Session difficulty<select className="text-input" value={practiceDifficulty} onChange={event => setPracticeDifficulty(event.target.value)}>{["beginner", "easy", "intermediate", "challenging", "advanced"].map(option => <option key={option}>{option}</option>)}</select></label><label className="field-label">Self-assessed progress (1â€“5)<input className="text-input" type="number" min="1" max="5" value={practiceProgress} onChange={event => setPracticeProgress(Math.min(5, Math.max(1, Number(event.target.value))))} /></label><label className="field-label">Session notes<textarea className="text-input text-area" maxLength={1000} value={practiceNotes} onChange={event => setPracticeNotes(event.target.value)} placeholder="What did you practice? What should you revisit?" /></label></section>}
    <div className="life-summary-grid">{summaryCards.map(([label, value]) => <article className="panel life-summary-card" key={label}><span className="stat-label">{label}</span><strong>{value}</strong></article>)}</div>
    {module === "bloom-blend" && <section className="panel business-dashboard"><div className="workspace-list-head"><div><div className="eyebrow">WORKSHOP ESTIMATES</div><h2>Event finances and registrations</h2></div><span className="development-tag">MANUAL / ESTIMATE</span></div><p className="field-help">Ticket income counts once from registrations. Collected amounts are manually recorded; material costs and profit are estimates.</p>{entries.filter(item => item.kind === "Workshop").map(workshop => { const totals = workshopFinance(entries, workshop); return <article className="business-workshop-row" key={workshop.id}><h3>{workshop.title}</h3><div className="life-entry-fields"><span>Seats registered: {totals.seats} / {workshop.fields.capacity}</span><span>Gross ticket value: {currency(totals.ticketRevenue)}</span><span>Money collected: {currency(totals.collected)}</span><span>Unpaid ticket balance: {currency(totals.unpaid)}</span><span>Estimated materials: {currency(totals.estimatedMaterials)}</span><span>Other recorded expenses: {currency(totals.expenses)}</span><span>Estimated profit: {currency(totals.estimatedProfit)}</span></div></article>})}{entries.filter(item => item.kind === "Workshop").length === 0 && <p className="empty-workspace">No workshops yet. Create one to see registration and estimate summaries.</p>}</section>}
    {module === "zyrenox" && <section className="panel business-dashboard"><div className="eyebrow">LEAD FOLLOW-UPS</div><h2>Pipeline and next actions</h2><div className="business-row-list">{entries.filter(item => item.kind === "Lead").sort((a, b) => String(a.fields.followUpDate ?? "9999").localeCompare(String(b.fields.followUpDate ?? "9999"))).map(lead => <div className="recent-row" key={lead.id}><span>{lead.title} Â· {String(lead.fields.company ?? "")} Â· follow-up {String(lead.fields.followUpDate ?? "not scheduled")}</span><span className="business-row-actions"><select className="filter-select" aria-label="Lead stage" value={String(lead.fields.leadStatus ?? "new")} disabled={saving} onChange={event => void updateEntry(lead, { fields: { ...lead.fields, leadStatus: event.target.value } })}>{leadStatuses.map(stage => <option key={stage}>{stage}</option>)}</select>{lead.fields.leadStatus === "won" && !lead.fields.convertedProjectId && <button className="text-button" disabled={saving} onClick={() => void convertLead(lead)}>Convert to project</button>}</span></div>)}{entries.filter(item => item.kind === "Lead").length === 0 && <p className="empty-workspace">No leads yet.</p>}</div><div className="eyebrow business-subhead">INVOICES AND MANUALLY RECORDED PAYMENTS</div>{entries.filter(item => item.kind === "Invoice").map(invoice => { const balance = invoiceOutstanding(invoice, entries); return <div className="recent-row" key={invoice.id}><span>{invoice.title} Â· total {currency(Number(invoice.fields.total))} Â· received {currency(balance.received)} Â· due {currency(balance.outstanding)}</span><InlineEditForm trigger="Record payment" disabled={saving || balance.outstanding <= 0} fields={[{name:"amount",label:`Amount received (INR) · balance ${currency(balance.outstanding)}`,type:"number",min:0.01,step:0.01,required:true},{name:"paymentDate",label:"Date received",type:"date",value:today,required:true},{name:"method",label:"Payment method",required:false,maxLength:100}]} onSave={values=>recordPayment(invoice,values)} /></div>})}{entries.filter(item => item.kind === "Invoice").length === 0 && <p className="empty-workspace">No invoices yet. Payment tracking will appear here after you create an invoice.</p>}<div className="eyebrow business-subhead">RECENT ACTIVITY</div>{entries.filter(item => item.kind === "Business activity").slice(0, 6).map(item => <div className="recent-row" key={item.id}><span>{item.title}</span><span>{item.createdAt.slice(0, 10)}</span></div>)}</section>}
    {module === "finance" && <section className="panel business-dashboard"><div className="finance-toolbar"><div><div className="eyebrow">PERSONAL FINANCE Â· INR</div><h2>Recorded cash flow</h2></div><label className="field-label">Month<input className="text-input" type="month" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} /></label><button className="button button-secondary" type="button" onClick={exportTransactions}>Export transactions CSV</button></div><p className="field-help">Totals include only transactions recorded for this month. No opening balance or external account data is assumed.</p><div className="finance-breakdown"><span>Remaining budget: <b>{currency(financeSummary.budgetRemaining)}</b></span>{Object.entries(financeSummary.categorySpending).map(([category, amount]) => <span key={category}>{category}: {currency(amount)}</span>)}</div><div className="eyebrow business-subhead">MONTHLY BUDGETS</div>{entries.filter(item => item.kind === "Monthly budget" && item.fields.month === selectedMonth).map(budget => { const spent = financeSummary.categorySpending[String(budget.fields.category)] ?? 0; const remaining = Number(budget.fields.amount) - spent; return <div className="recent-row" key={budget.id}><span>{String(budget.fields.category)} Â· limit {currency(Number(budget.fields.amount))} Â· spent {currency(spent)} Â· {remaining < 0 ? "over by " + currency(-remaining) : "remaining " + currency(remaining)}</span><span>{selectedMonth}</span></div>})}{entries.filter(item => item.kind === "Monthly budget" && item.fields.month === selectedMonth).length === 0 && <p className="empty-workspace">No budget categories for this month.</p>}<div className="eyebrow business-subhead">SAVINGS GOALS</div>{financeSummary.savingsGoals.map(goal => <div className="recent-row" key={goal.id}><span>{goal.title} Â· {currency(goal.saved)} / {currency(goal.target)} Â· {goal.progress}%</span><InlineEditForm trigger="Add contribution" disabled={saving || goal.remaining <= 0} fields={[{name:"amount",label:`Contribution (INR) · remaining ${currency(goal.remaining)}`,type:"number",min:0.01,max:goal.remaining,step:0.01,required:true}]} onSave={values=>addSavingsContribution(entries.find(item => item.id === goal.id)!,values)} /></div>)}{financeSummary.savingsGoals.length === 0 && <p className="empty-workspace">No savings goals created.</p>}<div className="eyebrow business-subhead">RECURRING TEMPLATES</div>{entries.filter(item => item.kind === "Recurring template").map(template => <div className="recent-row" key={template.id}><span>{template.title} Â· {String(template.fields.cadence)} Â· {currency(Number(template.fields.amount))} per occurrence</span><InlineEditForm trigger="Generate one occurrence" disabled={saving} fields={[{name:"occurrenceDate",label:"Transaction date",type:"date",value:today,required:true}]} onSave={values=>generateRecurring(template,values)} /></div>)}</section>}
    {module === "bloom-blend" && <section className="panel business-dashboard"><div className="eyebrow">REGISTRATION HISTORY</div><h2>Manual attendee records</h2>{entries.filter(item => item.kind === "Registration").map(registration => <div className="recent-row" key={registration.id}><span>{String(registration.fields.attendeeName ?? registration.title)} Â· {Number(registration.fields.seats)} seats Â· {String(registration.fields.paymentStatus ?? "unpaid")} Â· {currency(Number(registration.fields.amountPaid || 0))} collected</span>{registration.fields.registrationStatus !== "cancelled" ? <button className="text-button" disabled={saving} onClick={() => { if (window.confirm("Cancel this registration? Its history will remain and its seats will be released.")) void updateEntry(registration, { fields: { ...registration.fields, registrationStatus: "cancelled" } }); }}>Cancel registration</button> : <span>CANCELLED</span>}</div>)}{entries.filter(item => item.kind === "Registration").length === 0 && <p className="empty-workspace">No attendees recorded. Registration is manual and no messages or charges are sent.</p>}<div className="eyebrow business-subhead">PROMOTION CAPTIONS</div>{entries.filter(item => item.kind === "Promotion").map(promotion => <div className="recent-row" key={promotion.id}><span>{promotion.title} Â· {String(promotion.fields.platform ?? "No platform")} Â· {String(promotion.fields.promotionStatus ?? "idea")}</span><button className="text-button" disabled={!promotion.fields.caption} onClick={() => void copyCaption(promotion)}>Copy caption</button></div>)}</section>}
    {module === "zyrenox" && <section className="panel business-dashboard"><div className="eyebrow">PROJECT DELIVERY</div><h2>Projects and deliverables</h2>{entries.filter(item => item.kind === "Client project").map(project => <article className="business-workshop-row" key={project.id}><h3>{project.title} Â· {String(project.fields.projectStatus ?? "planned")}</h3><p>{String(project.fields.scope ?? "No scope details yet.")}</p><div className="recent-row"><span>Agreed value: {currency(Number(project.fields.agreedPrice || 0))} Â· due {String(project.fields.dueDate ?? "not scheduled")}</span></div>{entries.filter(item => item.kind === "Deliverable" && item.fields.projectId === project.id).map(task => <div className="recent-row" key={task.id}><span>{task.title} Â· {task.date ?? String(task.fields.dueDate ?? "no deadline")} Â· {task.status === "done" ? "complete" : "open"}</span>{task.status !== "done" && <button className="text-button" disabled={saving} onClick={() => void updateEntry(task, { status: "done" })}>Complete task</button>}</div>)}</article>)}{entries.filter(item => item.kind === "Client project").length === 0 && <p className="empty-workspace">No projects yet. Convert a won lead or create a project record.</p>}</section>}
    {module === "finance" && <div className="finance-filters"><label className="field-label">Transaction type<select className="text-input" value={financeFlowFilter} onChange={event => setFinanceFlowFilter(event.target.value)}><option value="all">All</option>{financeTypes.map(type => <option key={type}>{type}</option>)}</select></label><label className="field-label">Category<input className="text-input" value={financeCategoryFilter} onChange={event => setFinanceCategoryFilter(event.target.value)} /></label><label className="field-label">From<input className="text-input" type="date" value={financeDateFrom} onChange={event => setFinanceDateFrom(event.target.value)} /></label><label className="field-label">Through<input className="text-input" type="date" value={financeDateTo} onChange={event => setFinanceDateTo(event.target.value)} /></label></div>}
    {module === "finance" && <section className="panel business-dashboard"><div className="eyebrow">TRANSACTION RECORDS</div><h2>Income and expenses</h2>{visibleEntries.filter(item => item.kind === "Transaction").map(transaction => <div className="recent-row" key={transaction.id}><span>{transaction.date} Â· {String(transaction.fields.flowType)} Â· {String(transaction.fields.category)} Â· {currency(Number(transaction.fields.amount))} Â· {transaction.title}</span><span className="business-row-actions"><button className="text-button" disabled={saving} onClick={() => beginEdit(transaction)}>Edit</button><button className="text-button danger-text" disabled={saving} onClick={() => void updateEntry(transaction, { status: "archived" })}>Delete</button></span></div>)}{visibleEntries.filter(item => item.kind === "Transaction").length === 0 && <p className="empty-workspace">No transactions match the current filters.</p>}</section>}
    <div className="workspace-grid life-workspace-grid">
      <section className="panel workspace-panel"><h2>{editId ? "Edit record" : `Add ${config.title.toLowerCase()} record`}</h2><form className="workspace-form" onSubmit={saveEntry}>
        <label className="field-label">Record type<select className="text-input" value={kind} onChange={event => setKind(event.target.value)}>{config.kinds.map(option => <option key={option}>{option}</option>)}</select></label>
        <label className="field-label">Title<input className="text-input" required maxLength={140} value={title} onChange={event => setTitle(event.target.value)} placeholder={module === "academics" ? "e.g. Data structures final" : module === "career" ? "e.g. Two sum â€” LeetCode" : module === "fitness" ? "e.g. Upper-body strength" : module === "nutrition" ? "e.g. Post-training lunch" : "e.g. Evening reflection"} /></label>
        <label className="field-label">Date<input className="text-input" type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
        <div className="life-fields">{config.fields.filter(field => !field.kinds || field.kinds.includes(kind)).map(field => <label className={field.type === "checkbox" ? "field-label checklist-field" : "field-label"} key={field.key}>{field.type === "checkbox" ? <><input type="checkbox" checked={Boolean(fields[field.key])} onChange={event => setFields(current => ({ ...current, [field.key]: event.target.checked }))} />{field.label}</> : <>{field.label}{field.type === "select" ? <select className="text-input" value={String(fields[field.key] ?? fieldDefault(field))} onChange={event => setFields(current => ({ ...current, [field.key]: event.target.value }))}><option value="">Selectâ€¦</option>{optionsFor(field, entries).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "textarea" ? <textarea className="text-input text-area" maxLength={1000} value={String(fields[field.key] ?? "")} onChange={event => setFields(current => ({ ...current, [field.key]: event.target.value }))} /> : <input className="text-input" type={field.type ?? "text"} min={field.min} max={field.max} step={field.step} value={String(fields[field.key] ?? "")} onChange={event => setFields(current => ({ ...current, [field.key]: field.type === "number" && event.target.value ? Number(event.target.value) : event.target.value }))} />}</>}{field.help && <small className="field-help">{field.help}</small>}</label>)}</div>
        <label className="field-label">Notes<textarea className="text-input text-area" maxLength={3000} value={description} onChange={event => setDescription(event.target.value)} placeholder={module === "mind" ? "Write only what you want to keep in this local session." : "Optional details"} /></label>
        {module === "mind" && <button className="text-button prompt-button" type="button" onClick={() => setFields(current => ({ ...current, prompt: prompts[Math.floor(Math.random() * prompts.length)] }))}>Choose a reflection prompt</button>}
        <div className="form-actions"><button className="button button-primary" disabled={saving}>{saving ? "Savingâ€¦" : editId ? "Save changes" : "Save record"}</button>{editId && <button className="button button-secondary" type="button" onClick={resetForm}>Cancel</button>}</div>
      </form></section>
      {module === "academics" && <section className="panel workspace-panel exam-prep-panel"><div className="eyebrow">EXAM PREPARATION</div><h2>Suggested study order</h2><label className="field-label">Available study time today (minutes)<input className="text-input" type="number" min="0" max="1440" value={availableMinutes} onChange={event => setAvailableMinutes(Math.min(1440, Math.max(0, Number(event.target.value))))} /></label><p className="field-help">Suggestions use the nearest exam date for each subject. Adjust dates and estimates as needed; this plan cannot guarantee exam results.</p>{academicStudyPlan(entries, availableMinutes, today).map(item => <div className="recent-row" key={item.entry.id}><span>{item.entry.title} Â· {String(item.entry.fields.subject ?? "Subject")}{item.examTitle ? ` Â· exam ${item.due}` : ""}</span><span>{item.minutes} min</span></div>)}{academicStudyPlan(entries, availableMinutes, today).length === 0 && <p className="empty-workspace">Add incomplete syllabus topics or revision tasks with study-time estimates to build a suggested order.</p>}</section>}
      <section className="panel workspace-panel life-records-panel"><div className="workspace-list-head"><div><div className="eyebrow">DEVELOPMENT RECORDS</div><h2>Activity history</h2></div><select className="filter-select" aria-label="Filter records by type" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All types</option>{config.kinds.map(option => <option key={option}>{option}</option>)}</select></div>
        <div className="life-filters"><label className="field-label">Search<input className="text-input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={module === "content" ? "Search ideas, tags, scriptsâ€¦" : "Title, topic, companyâ€¦"} /></label>{(module === "academics" || module === "career" || module === "content") && <label className="field-label">{module === "academics" ? "Subject" : module === "career" ? "Company" : "Platform"}<input className="text-input" value={subjectFilter} onChange={event => setSubjectFilter(event.target.value)} placeholder={module === "academics" ? "Filter by subject" : module === "career" ? "Filter by company" : "Filter by platform"} /></label>}<label className="field-label">{module === "content" ? "Production stage" : "Status"}<select className="text-input" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{module === "career" ? applicationStatuses.map(status => <option key={status}>{status}</option>) : module === "content" ? contentStatuses.map(status => <option key={status}>{status}</option>) : <><option value="planned">Planned</option><option value="done">Completed</option></>}</select></label><label className="field-label">{module === "content" ? "Deadline on or before" : "Date on or before"}<input className="text-input" type="date" value={deadlineFilter} onChange={event => setDeadlineFilter(event.target.value)} /></label></div>
        {loading ? <p className="empty-workspace" role="status">Loading development recordsâ€¦</p> : visibleEntries.length === 0 ? <p className="empty-workspace">{entries.length ? "No records match these filters." : "No records yet. Your first entry will appear here when you save it."}</p> : <div className="record-list">{visibleEntries.map(entry => <article className="record-card" id={`record-${entry.id}`} key={entry.id}><div className="record-head"><div><span className="status-badge">{entry.kind.toUpperCase()}</span><h3>{entry.title}</h3><span className="record-meta">{entry.date || "No date"} Â· {entry.status === "done" ? "Completed" : "Planned"}{entry.fields.pipelineStatus ? ` Â· ${entry.fields.pipelineStatus}` : ""}</span></div><span className="development-tag">MOCK</span></div>{entry.description && <p>{entry.description}</p>}{Object.keys(entry.fields).length > 0 && <div className="life-entry-fields">{Object.entries(entry.fields).map(([key, value]) => <span key={key}><b>{key.replace(/[A-Z]/g, letter => ` ${letter}`).replaceAll("_", " ")}:</b> {String(value)}{module === "nutrition" && key.startsWith("calories") ? " kcal estimate" : module === "nutrition" && key.startsWith("protein") ? " g estimate" : key === "weightKg" ? " kg" : key === "measurementCm" ? " cm" : key === "durationMinutes" || key === "focusMinutes" || key === "studyMinutes" ? " min" : key === "sleepHours" ? " h" : ""}</span>)}</div>}{module === "career" && entry.kind === "Job application" && <label className="field-label application-stage">Application stage<select className="text-input" aria-label={`Stage for ${entry.title}`} value={String(entry.fields.pipelineStatus ?? "saved")} onChange={event => void updateEntry(entry, { fields: { ...entry.fields, pipelineStatus: event.target.value } })}>{applicationStatuses.map(status => <option key={status}>{status}</option>)}</select></label>}<div className="record-actions"><button className="button button-secondary" disabled={saving} onClick={() => beginEdit(entry)}>Edit</button>{entry.status !== "done" && <button className="button button-primary" disabled={saving} onClick={() => void updateEntry(entry, { status: "done" })}>Mark complete</button>}{lifeEntryDeadline(entry) && <button className="button button-secondary" disabled={saving || linkedEntryIds.includes(entry.id)} onClick={() => void makeQuest(entry)}>{linkedEntryIds.includes(entry.id) ? "Quest linked" : "Make quest"}</button>}<button className="text-button" disabled={saving} onClick={() => void updateEntry(entry, { status: "archived" })}>Archive</button></div></article>)}</div>}
        {(module === "guitar" || module === "flute") && entries.some(entry => entry.kind === "Song" || entry.kind === "Technique") && <section className="panel workspace-panel progress-control-panel"><div className="eyebrow">LEARNING PROGRESS</div><h2>Repertoire and techniques</h2>{entries.filter(entry => entry.kind === "Song" || entry.kind === "Technique").map(entry => <label className="recent-row mastery-row" key={entry.id}><span>{entry.kind}: {entry.title}</span><select className="filter-select" aria-label="Learning progress" value={String(entry.fields.masteryStatus ?? "not started")} disabled={saving} onChange={event => void updateEntry(entry, { fields: { ...entry.fields, masteryStatus: event.target.value } })}>{["not started", "learning", "in progress", "mastered"].map(status => <option key={status}>{status}</option>)}</select></label>)}</section>}
        {module === "content" && entries.length > 0 && <section className="panel workspace-panel progress-control-panel"><div className="eyebrow">PRODUCTION PIPELINE</div><h2>Content stages</h2>{entries.map(entry => <label className="recent-row mastery-row" key={entry.id}><span>{entry.title}</span><select className="filter-select" aria-label="Production stage" value={String(entry.fields.pipelineStatus ?? "idea")} disabled={saving} onChange={event => void updateEntry(entry, { fields: { ...entry.fields, pipelineStatus: event.target.value } })}>{contentStatuses.map(status => <option key={status}>{status}</option>)}</select></label>)}</section>}
        {questDrafts.length > 0 && <section className="life-quest-drafts"><div className="eyebrow">DEVELOPMENT QUEST DRAFTS <span className="eyebrow-separator">/</span> NO XP</div>{questDrafts.map(draft => <div className="recent-row" key={draft.id}><span>{draft.title} Â· {draft.dueDate}</span><span>{draft.category.toUpperCase()}</span></div>)}<p className="field-help">Drafts are not System Engine quests. Sign-in and database setup are required to create live quests.</p></section>}
      </section>
    </div>
  </div>;
}

