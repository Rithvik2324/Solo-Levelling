import type { LifeModuleEntryRecord } from "@/lib/domain";
import { isValidIsoDate } from "@/lib/domain";

export function lifeEntryDeadline(entry: Pick<LifeModuleEntryRecord, "module" | "kind" | "date" | "fields">) {
  const preferred = entry.module === "zyrenox" && entry.kind === "Lead" ? ["followUpDate"] : entry.module === "career" ? ["followUpDate", "revisionDate", "dueDate"] : entry.module === "content" ? ["publicationDate", "dueDate"] : ["dueDate", "followUpDate", "publicationDate", "revisionDate"];
  for (const key of preferred) if (typeof entry.fields[key] === "string" && isValidIsoDate(String(entry.fields[key]))) return String(entry.fields[key]);
  return typeof entry.date === "string" && isValidIsoDate(entry.date) ? entry.date : undefined;
}

export interface EntryFilters { search?: string; subject?: string; status?: string; deadlineBefore?: string }

function recordDate(entry: LifeModuleEntryRecord) {
  return entry.date ?? String(entry.fields.dueDate ?? entry.fields.followUpDate ?? entry.fields.publicationDate ?? "");
}

export function practiceMinutesForSession(targetSeconds: number, remainingSeconds: number) {
  return Math.max(0, Math.floor((Math.max(0, targetSeconds) - Math.max(0, remainingSeconds)) / 60));
}

export function repertoireProgress(entries: LifeModuleEntryRecord[]) {
  const repertoire = entries.filter(entry => entry.kind === "Song" || entry.kind === "Repertoire piece");
  return { total: repertoire.length, mastered: repertoire.filter(entry => entry.fields.masteryStatus === "mastered").length, learning: repertoire.filter(entry => entry.fields.masteryStatus === "learning" || entry.fields.masteryStatus === "in progress").length };
}

export function practiceSummary(entries: LifeModuleEntryRecord[], weekStart: string, planSessions = 0) {
  const sessions = entries.filter(entry => entry.kind === "Practice session" && entry.status === "done" && entry.date && entry.date >= weekStart);
  return { sessions: sessions.length, minutes: sessions.reduce((total, entry) => total + Number(entry.fields.durationMinutes || 0), 0), targetSessions: planSessions };
}

export function contentSummary(entries: LifeModuleEntryRecord[], weekStart: string) {
  const week = entries.filter(entry => entry.createdAt.slice(0, 10) >= weekStart);
  return { produced: week.filter(entry => entry.kind !== "Idea").length, published: entries.filter(entry => entry.fields.pipelineStatus === "published" && String(entry.fields.publicationDate ?? entry.date ?? "") >= weekStart).length, ideas: entries.filter(entry => entry.kind === "Idea").length };
}

export function workshopFinance(entries: LifeModuleEntryRecord[], workshop: LifeModuleEntryRecord) {
  const registrations = entries.filter(entry => entry.kind === "Registration" && entry.fields.workshopId === workshop.id && entry.fields.registrationStatus !== "cancelled" && entry.fields.paymentStatus !== "refunded");
  const ticketRevenue = registrations.reduce((sum, entry) => sum + Number(workshop.fields.ticketPrice || 0) * Number(entry.fields.seats || 0), 0);
  const collected = registrations.reduce((sum, entry) => sum + Number(entry.fields.amountPaid || 0), 0);
  const materials = registrations.reduce((sum, entry) => sum + Number(workshop.fields.materialCostPerAttendee || 0) * Number(entry.fields.seats || 0), 0);
  const expenses = entries.filter(entry => entry.kind === "Workshop expense" && entry.fields.workshopId === workshop.id).reduce((sum, entry) => sum + Number(entry.fields.amount || 0), 0);
  const otherIncome = entries.filter(entry => entry.kind === "Workshop other income" && entry.fields.workshopId === workshop.id).reduce((sum, entry) => sum + Number(entry.fields.amount || 0), 0);
  const seats = registrations.reduce((sum, entry) => sum + Number(entry.fields.seats || 0), 0);
  return { seats, ticketRevenue, collected, unpaid: Math.max(0, ticketRevenue - collected), estimatedMaterials: materials, expenses, otherIncome, estimatedProfit: ticketRevenue + otherIncome - materials - expenses };
}

export function workshopSeatsRemaining(entries: LifeModuleEntryRecord[], workshop: LifeModuleEntryRecord, excludeRegistrationId?: string) {
  const occupied = entries.filter(entry => entry.kind === "Registration" && entry.id !== excludeRegistrationId && entry.fields.workshopId === workshop.id && entry.fields.registrationStatus !== "cancelled" && entry.fields.paymentStatus !== "refunded").reduce((sum, entry) => sum + Number(entry.fields.seats || 0), 0);
  return Math.max(0, Number(workshop.fields.capacity || 0) - occupied);
}

export function findLeadProject(entries: LifeModuleEntryRecord[], leadId: string) {
  return entries.find(entry => entry.kind === "Client project" && entry.fields.sourceLeadId === leadId);
}

export function findRecurringOccurrence(entries: LifeModuleEntryRecord[], templateId: string, occurrenceDate: string) {
  return entries.find(entry => entry.kind === "Transaction" && entry.fields.templateId === templateId && entry.fields.occurrenceDate === occurrenceDate);
}

export function budgetCategoryStatus(entries: LifeModuleEntryRecord[], month: string, category: string, limit: number) {
  const spent = entries.filter(entry => entry.kind === "Transaction" && entry.date?.startsWith(month) && entry.fields.flowType === "expense" && entry.fields.category === category).reduce((sum, entry) => sum + Number(entry.fields.amount || 0), 0);
  return { spent, remaining: limit - spent, overspent: Math.max(0, spent - limit) };
}

export function bloomBlendSummary(entries: LifeModuleEntryRecord[], today: string) {
  const workshops = entries.filter(entry => entry.kind === "Workshop");
  const finance = workshops.reduce((sum, workshop) => {
    const workshopTotals = workshopFinance(entries, workshop);
    return { revenue: sum.revenue + workshopTotals.ticketRevenue + workshopTotals.otherIncome, expenses: sum.expenses + workshopTotals.estimatedMaterials + workshopTotals.expenses, collected: sum.collected + workshopTotals.collected, registrations: sum.registrations + workshopTotals.seats };
  }, { revenue: 0, expenses: 0, collected: 0, registrations: 0 });
  return { upcoming: workshops.filter(entry => entry.date && entry.date >= today && !["completed", "cancelled"].includes(String(entry.fields.workshopStatus ?? "planning"))).length, planning: workshops.filter(entry => ["idea", "planning"].includes(String(entry.fields.workshopStatus ?? "planning"))).length, ...finance };
}

export function invoiceOutstanding(invoice: LifeModuleEntryRecord, payments: LifeModuleEntryRecord[]) {
  const received = payments.filter(payment => payment.kind === "Payment" && payment.fields.invoiceId === invoice.id).reduce((sum, payment) => sum + Number(payment.fields.amount || 0), 0);
  return { received, outstanding: Math.max(0, Number(invoice.fields.total || 0) - received) };
}

export function calculateInvoiceLineItems(input: string) {
  const lines = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  let total = 0;
  for (const line of lines) {
    const match = /^(.+?)\s*\|\s*(\d+(?:\.\d{1,2})?)$/.exec(line);
    if (!match) return null;
    total += Number(match[2]);
  }
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

export function zyrenoxSummary(entries: LifeModuleEntryRecord[], today: string) {
  const leads = entries.filter(entry => entry.kind === "Lead");
  const invoices = entries.filter(entry => entry.kind === "Invoice");
  const payments = entries.filter(entry => entry.kind === "Payment");
  return {
    leads: leads.length,
    leadsByStage: leads.reduce<Record<string, number>>((result, lead) => { const stage = String(lead.fields.leadStatus ?? "new"); result[stage] = (result[stage] ?? 0) + 1; return result; }, {}),
    activeProjects: entries.filter(entry => entry.kind === "Client project" && ["planned", "active", "on hold"].includes(String(entry.fields.projectStatus ?? "planned"))).length,
    upcomingDeadlines: entries.filter(entry => entry.kind === "Deliverable" && entry.date && entry.date >= today && entry.status !== "done").length,
    overdueDeliverables: entries.filter(entry => entry.kind === "Deliverable" && entry.date && entry.date < today && entry.status !== "done").length,
    pendingPayments: invoices.reduce((sum, invoice) => sum + invoiceOutstanding(invoice, payments).outstanding, 0),
    recordedRevenue: payments.reduce((sum, payment) => sum + Number(payment.fields.amount || 0), 0)
  };
}

export function personalFinanceSummary(entries: LifeModuleEntryRecord[], month: string) {
  const transactions = entries.filter(entry => entry.kind === "Transaction" && entry.date?.startsWith(month));
  const income = transactions.filter(entry => entry.fields.flowType === "income").reduce((sum, entry) => sum + Number(entry.fields.amount || 0), 0);
  const expenses = transactions.filter(entry => entry.fields.flowType === "expense").reduce((sum, entry) => sum + Number(entry.fields.amount || 0), 0);
  const budgets = entries.filter(entry => entry.kind === "Monthly budget" && entry.fields.month === month);
  const budgetTotal = budgets.reduce((sum, budget) => sum + Number(budget.fields.amount || 0), 0);
  const categorySpending = transactions.filter(entry => entry.fields.flowType === "expense").reduce<Record<string, number>>((result, entry) => { const category = String(entry.fields.category ?? "Uncategorized"); result[category] = (result[category] ?? 0) + Number(entry.fields.amount || 0); return result; }, {});
  const budgetRemaining = budgets.reduce((sum, budget) => sum + Number(budget.fields.amount || 0) - (categorySpending[String(budget.fields.category)] ?? 0), 0);
  const savingsGoals = entries.filter(entry => entry.kind === "Savings goal").map(goal => {
    const saved = entries.filter(entry => entry.kind === "Savings contribution" && entry.fields.goalId === goal.id).reduce((sum, entry) => sum + Number(entry.fields.amount || 0), 0);
    const target = Number(goal.fields.amount || 0);
    return { id: goal.id, title: goal.title, target, saved, remaining: Math.max(0, target - saved), progress: target > 0 ? Math.min(100, Math.round(saved / target * 100)) : 0 };
  });
  return { income, expenses, net: income - expenses, budgetTotal, budgetRemaining, categorySpending, savingsGoals };
}

export function filterLifeEntries(entries: LifeModuleEntryRecord[], filters: EntryFilters) {
  const search = filters.search?.trim().toLocaleLowerCase();
  return entries.filter(entry => {
    if (search && ![entry.title, entry.description, entry.kind, ...Object.values(entry.fields).map(String)].join(" ").toLocaleLowerCase().includes(search)) return false;
    if (filters.subject && String(entry.fields.subject ?? entry.fields.company ?? entry.fields.platform ?? (entry.kind === "Subject" ? entry.title : "")) !== filters.subject) return false;
    const status = String(entry.fields.pipelineStatus ?? entry.status);
    if (filters.status && filters.status !== "all" && status !== filters.status) return false;
    if (filters.deadlineBefore && (!recordDate(entry) || recordDate(entry) > filters.deadlineBefore)) return false;
    return true;
  });
}

export function academicStudyPlan(entries: LifeModuleEntryRecord[], availableMinutes: number, today: string) {
  const candidates = entries.filter(entry => entry.status !== "done" && entry.status !== "archived" && ["Syllabus unit", "Topic", "Revision task"].includes(entry.kind))
    .map(entry => {
      const exam = entries.filter(item => item.kind === "Exam" && item.fields.subject === entry.fields.subject && item.date && item.date >= today).sort((a, b) => a.date!.localeCompare(b.date!))[0];
      const due = exam?.date ?? entry.date ?? "9999-12-31";
      return { entry, due, minutes: Math.max(5, Number(entry.fields.studyMinutes) || 30), examTitle: exam?.title };
    }).sort((a, b) => a.due.localeCompare(b.due));
  const plan: typeof candidates = [];
  let remaining = Math.max(0, availableMinutes);
  for (const item of candidates) { if (item.minutes <= remaining) { plan.push(item); remaining -= item.minutes; } }
  return plan;
}

export function careerProgress(entries: LifeModuleEntryRecord[], today: string) {
  const applications = entries.filter(item => item.kind === "Job application");
  return {
    solved: entries.filter(item => item.kind === "DSA problem" && item.status === "done").length,
    revisionDue: entries.filter(item => item.kind === "DSA problem" && typeof item.fields.revisionDate === "string" && item.fields.revisionDate <= today).length,
    inProgress: applications.filter(item => ["saved", "applied", "assessment", "interview"].includes(String(item.fields.pipelineStatus ?? "saved"))).length,
    interviews: entries.filter(item => item.kind === "Interview round" && !!item.date && item.date >= today).length
  };
}
