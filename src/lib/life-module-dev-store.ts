import "server-only";
import { randomUUID } from "node:crypto";
import { applicationStatuses, contentStatuses, financeTypes, isValidIsoDate, leadStatuses, projectStatuses, promotionStatuses, recurringCadences, registrationPaymentStatuses, workshopStatuses, type LifeEntryStatus, type LifeFieldValue, type LifeModuleEntryRecord, type LifeModuleId, type LifeModuleQuestDraftRecord } from "@/lib/domain";
import { calculateInvoiceLineItems, lifeEntryDeadline } from "@/lib/life-module-query";
import { readDevState, writeDevState, replaceDevStates, type Stored } from "@/lib/dev-persistence";
import { applyLocalActivityAward, getLocalProgression, readLocalProgressionState, type LocalActivityKind } from "@/lib/local-progression";

type ModuleStore = Record<LifeModuleId, LifeModuleEntryRecord[]>;
type SessionStores = Record<string, ModuleStore>;
const globalStore = globalThis as typeof globalThis & { awakeningLifeModuleDevStore?: SessionStores };
const store = globalStore.awakeningLifeModuleDevStore ?? {};
globalStore.awakeningLifeModuleDevStore = store;
type QuestDraftStores = Record<string, LifeModuleQuestDraftRecord[]>;
const globalDraftStore = globalThis as typeof globalThis & { awakeningLifeModuleQuestDrafts?: QuestDraftStores };
const questDrafts = globalDraftStore.awakeningLifeModuleQuestDrafts ?? {};
globalDraftStore.awakeningLifeModuleQuestDrafts = questDrafts;

function getSessionStore(sessionId: string): ModuleStore {
  const initial: ModuleStore = store[sessionId] ?? { fitness: [], nutrition: [], mind: [], academics: [], career: [], guitar: [], flute: [], content: [], "bloom-blend": [], zyrenox: [], finance: [] };
  const loaded = readDevState("life_entries", sessionId, initial);
  store[sessionId] = loaded.value;
  moduleRevisions.set(sessionId, loaded.exists ? loaded : writeDevState("life_entries", sessionId, loaded, loaded.value));
  store[sessionId] ??= { fitness: [], nutrition: [], mind: [], academics: [], career: [], guitar: [], flute: [], content: [], "bloom-blend": [], zyrenox: [], finance: [] };
  store[sessionId].academics ??= [];
  store[sessionId].career ??= [];
  store[sessionId].guitar ??= [];
  store[sessionId].flute ??= [];
  store[sessionId].content ??= [];
  store[sessionId]["bloom-blend"] ??= [];
  store[sessionId].zyrenox ??= [];
  store[sessionId].finance ??= [];
  return store[sessionId];
}
const moduleRevisions = new Map<string, Stored<ModuleStore>>();
function saveSessionStore(sessionId: string) {
  const state = moduleRevisions.get(sessionId);
  if (!state) throw new Error("Local module storage is not initialized.");
  moduleRevisions.set(sessionId, writeDevState("life_entries", sessionId, state, store[sessionId]));
}
function getDrafts(sessionId: string) {
  const initial = questDrafts[sessionId] ?? [];
  const loaded = readDevState("life_quest_drafts", sessionId, initial);
  questDrafts[sessionId] = loaded.value;
  draftRevisions.set(sessionId, loaded.exists ? loaded : writeDevState("life_quest_drafts", sessionId, loaded, loaded.value));
  return questDrafts[sessionId];
}
const draftRevisions = new Map<string, Stored<LifeModuleQuestDraftRecord[]>>();
function saveDrafts(sessionId: string) {
  const state = draftRevisions.get(sessionId);
  if (!state) throw new Error("Local quest draft storage is not initialized.");
  draftRevisions.set(sessionId, writeDevState("life_quest_drafts", sessionId, state, questDrafts[sessionId]));
}

export function isLifeModuleId(value: string): value is LifeModuleId {
  return value === "fitness" || value === "nutrition" || value === "mind" || value === "academics" || value === "career" || value === "guitar" || value === "flute" || value === "content" || value === "bloom-blend" || value === "zyrenox" || value === "finance";
}

const applicationTransitions: Record<(typeof applicationStatuses)[number], readonly string[]> = {
  saved: ["applied", "withdrawn"], applied: ["assessment", "interview", "offer", "rejected", "withdrawn"],
  assessment: ["interview", "offer", "rejected", "withdrawn"], interview: ["offer", "rejected", "withdrawn"],
  offer: [], rejected: [], withdrawn: []
};
export function canTransitionApplicationStatus(current: string, next: string) {
  return current === next || applicationTransitions[current as keyof typeof applicationTransitions]?.includes(next) === true;
}

const contentTransitions: Record<(typeof contentStatuses)[number], readonly string[]> = {
  idea: ["planned", "archived"], planned: ["scripting", "filming", "archived"], scripting: ["filming", "archived"],
  filming: ["editing", "archived"], editing: ["ready to publish", "archived"], "ready to publish": ["published", "archived"], published: ["archived"], archived: []
};
export function canTransitionContentStatus(current: string, next: string) {
  return current === next || contentTransitions[current as keyof typeof contentTransitions]?.includes(next) === true;
}

const leadTransitions: Record<(typeof leadStatuses)[number], readonly string[]> = {
  new: ["contacted", "lost"], contacted: ["qualified", "lost"], qualified: ["proposal", "lost"],
  proposal: ["negotiation", "won", "lost"], negotiation: ["won", "lost"], won: [], lost: []
};
export function canTransitionLeadStatus(current: string, next: string) {
  return current === next || leadTransitions[current as keyof typeof leadTransitions]?.includes(next) === true;
}

export function listLifeEntries(sessionId: string, module: LifeModuleId) {
  return getSessionStore(sessionId)[module].filter(item => item.status !== "archived").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function exportLifeEntries(sessionId: string): LifeModuleEntryRecord[] {
  return Object.values(getSessionStore(sessionId)).flatMap(entries => entries.map(entry => ({ ...entry, fields: { ...entry.fields } })));
}

export function replaceLifeEntries(sessionId: string, entries: LifeModuleEntryRecord[]) {
  getSessionStore(sessionId);
  const replacement: ModuleStore = { fitness: [], nutrition: [], mind: [], academics: [], career: [], guitar: [], flute: [], content: [], "bloom-blend": [], zyrenox: [], finance: [] };
  for (const entry of entries) replacement[entry.module].push({ ...entry, fields: { ...entry.fields } });
  store[sessionId] = replacement;
  saveSessionStore(sessionId);
}

export function batchLifeEntries<T>(sessionId: string, module: LifeModuleId, operation: (entries: LifeModuleEntryRecord[]) => T): T {
  const entries = getSessionStore(sessionId)[module];
  const previous = structuredClone(entries);
  try {
    const result = operation(entries);
    saveSessionStore(sessionId);
    return result;
  } catch (error) {
    store[sessionId][module] = previous;
    throw error;
  }
}

export function makeLifeEntry(module: LifeModuleId, input: { title: string; kind: string; description: string; date?: string; fields: Record<string, LifeFieldValue> }): LifeModuleEntryRecord {
  const now = new Date().toISOString();
  return { id: randomUUID(), module, ...input, status: "planned", createdAt: now, updatedAt: now };
}

export function createLifeEntry(sessionId: string, module: LifeModuleId, input: { title: string; kind: string; description: string; date?: string; fields: Record<string, LifeFieldValue> }) {
  const entry = makeLifeEntry(module, input);
  return batchLifeEntries(sessionId, module, entries => { entries.unshift(entry); return entry; });
}

export function updateLifeEntry(sessionId: string, module: LifeModuleId, id: string, input: { title?: string; kind?: string; description?: string; date?: string; fields?: Record<string, LifeFieldValue>; status?: LifeEntryStatus }) {
  const item = getSessionStore(sessionId)[module].find(entry => entry.id === id && entry.status !== "archived");
  if (!item) return null;
  if (input.title !== undefined) item.title = input.title;
  if (input.kind !== undefined) item.kind = input.kind;
  if (input.description !== undefined) item.description = input.description;
  if (input.date !== undefined) item.date = input.date || undefined;
  if (input.fields !== undefined) item.fields = input.fields;
  if (input.status !== undefined) item.status = input.status;
  item.updatedAt = new Date().toISOString();
  saveSessionStore(sessionId);
  return item;
}

export function completeLifeEntryWithLocalReward(sessionId: string, module: LifeModuleId, id: string, input: { title: string; kind: string; description: string; date?: string; fields: Record<string, LifeFieldValue> }, rewardKind: LocalActivityKind) {
  const source = getSessionStore(sessionId);
  const sourceRevision = moduleRevisions.get(sessionId);
  if (!sourceRevision) throw new Error("Local module storage is not initialized.");
  const nextSource = structuredClone(source);
  const entry = nextSource[module].find(item => item.id === id && item.status !== "archived");
  if (!entry) return null;
  Object.assign(entry, input, { status: "done", updatedAt: new Date().toISOString() });
  const progression = readLocalProgressionState(sessionId);
  const reward = applyLocalActivityAward(progression.state, `${module}:${entry.id}`, rewardKind, entry.title);
  try { replaceDevStates(sessionId, { life_entries: nextSource, local_progression: reward.state }, { life_entries: sourceRevision.revision, local_progression: progression.stored.revision }); }
  catch (error) { throw new Error(`Local development data could not be committed: ${error instanceof Error ? error.message : "storage conflict"}`); }
  store[sessionId] = nextSource;
  moduleRevisions.set(sessionId, { value: nextSource, revision: sourceRevision.revision + 1, exists: true });
  return { entry, reward: { ...reward, progression: getLocalProgression(sessionId) } };
}

export function archiveLifeEntry(sessionId: string, module: LifeModuleId, id: string) {
  return updateLifeEntry(sessionId, module, id, { status: "archived" });
}

export function createLifeQuestDraft(sessionId: string, module: LifeModuleId, entryId: string) {
  const entry = getSessionStore(sessionId)[module].find(item => item.id === entryId && item.status !== "archived");
  const dueDate = entry ? lifeEntryDeadline(entry) : undefined;
  if (!entry || !dueDate) return { error: "Add a date or deadline to this record before creating a quest." } as const;
  const drafts = getDrafts(sessionId);
  const existing = drafts.find(item => item.entryId === entryId);
  if (existing) { existing.title = entry.title; existing.dueDate = dueDate; existing.description = entry.description; saveDrafts(sessionId); return { draft: existing } as const; }
  const draft: LifeModuleQuestDraftRecord = { id: randomUUID(), entryId, module, title: entry.title, category: module, dueDate, description: entry.description, createdAt: new Date().toISOString() };
  drafts.unshift(draft);
  saveDrafts(sessionId);
  return { draft } as const;
}

export function listLifeQuestDrafts(sessionId: string, module?: LifeModuleId) {
  return getDrafts(sessionId).filter(draft => !module || draft.module === module);
}
export function exportLifeQuestDrafts(sessionId: string) { return structuredClone(getDrafts(sessionId)); }
export function replaceLifeQuestDrafts(sessionId: string, drafts: LifeModuleQuestDraftRecord[]) { getDrafts(sessionId); questDrafts[sessionId] = structuredClone(drafts); saveDrafts(sessionId); }

export function validateLifeEntry(input: unknown, module?: LifeModuleId): { value: { title: string; kind: string; description: string; date?: string; fields: Record<string, LifeFieldValue> } | null; error: string | null } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { value: null, error: "Provide a valid record." };
  const data = input as Record<string, unknown>;
  if (typeof data.title !== "string" || !data.title.trim() || data.title.trim().length > 140) return { value: null, error: "Title must contain 1 to 140 characters." };
  if (typeof data.kind !== "string" || !data.kind.trim() || data.kind.length > 60) return { value: null, error: "Choose a valid activity type." };
  if (data.description !== undefined && (typeof data.description !== "string" || data.description.length > 3000)) return { value: null, error: "Notes must be 3000 characters or fewer." };
  if (data.date !== undefined && data.date !== "" && (typeof data.date !== "string" || !isValidIsoDate(data.date))) return { value: null, error: "Enter a valid calendar date." };
  if (data.fields !== undefined && (!data.fields || typeof data.fields !== "object" || Array.isArray(data.fields))) return { value: null, error: "Additional details must be a simple field map." };
  const fields: Record<string, LifeFieldValue> = {};
  for (const [key, value] of Object.entries((data.fields ?? {}) as Record<string, unknown>)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) || !(typeof value === "string" || typeof value === "number" && Number.isFinite(value) || typeof value === "boolean") || typeof value === "string" && value.length > 1000) return { value: null, error: "One or more detail fields are invalid." };
    if (value !== "") fields[key] = value;
  }
  for (const key of Object.keys(fields).filter(key => key.endsWith("Date"))) if (fields[key] && (typeof fields[key] !== "string" || !isValidIsoDate(fields[key]))) return { value: null, error: `Enter a valid date for ${key}.` };
  if (module === "academics" && ["Syllabus unit", "Topic", "Exam", "Assignment", "Revision task", "Mock test"].includes(data.kind as string) && (typeof fields.subject !== "string" || !fields.subject.trim())) return { value: null, error: "Add a subject for this academic record." };
  if (module === "career" && data.kind === "Job application" && fields.pipelineStatus !== undefined && !applicationStatuses.includes(fields.pipelineStatus as (typeof applicationStatuses)[number])) return { value: null, error: "Choose a valid application stage." };
  if (module === "content" && fields.pipelineStatus !== undefined && !contentStatuses.includes(fields.pipelineStatus as (typeof contentStatuses)[number])) return { value: null, error: "Choose a valid content production stage." };
  if (module === "content" && fields.publicationDate && (typeof fields.publicationDate !== "string" || !isValidIsoDate(fields.publicationDate))) return { value: null, error: "Enter a valid publication date." };
  if ((module === "guitar" || module === "flute") && fields.difficulty !== undefined && !["beginner", "easy", "intermediate", "challenging", "advanced"].includes(String(fields.difficulty))) return { value: null, error: "Choose a valid practice difficulty." };
  if ((module === "guitar" || module === "flute") && fields.masteryStatus !== undefined && !["not started", "learning", "in progress", "mastered"].includes(String(fields.masteryStatus))) return { value: null, error: "Choose a valid learning progress state." };
  if (fields.progressScore !== undefined && (typeof fields.progressScore !== "number" || fields.progressScore < 1 || fields.progressScore > 5)) return { value: null, error: "Self-assessed progress must be from 1 to 5." };
  if (fields.durationMinutes !== undefined && (typeof fields.durationMinutes !== "number" || fields.durationMinutes < 0 || fields.durationMinutes > 1440)) return { value: null, error: "Duration must be between 0 and 1440 minutes." };
  if (module === "content" && ["views", "likes", "comments"].some(key => fields[key] !== undefined && (typeof fields[key] !== "number" || fields[key] < 0))) return { value: null, error: "Performance metrics must be non-negative numbers." };
  if (module === "bloom-blend") {
    if (data.kind === "Workshop") {
      if (!data.date || typeof fields.venue !== "string" || !fields.venue.trim() || typeof fields.category !== "string" || !fields.category.trim() || typeof fields.startTime !== "string" || !fields.startTime) return { value: null, error: "A workshop needs a category, date, venue, and start time." };
      if (!workshopStatuses.includes(String(fields.workshopStatus ?? "planning") as (typeof workshopStatuses)[number])) return { value: null, error: "Choose a valid workshop status." };
      if (typeof fields.capacity !== "number" || !Number.isInteger(fields.capacity) || fields.capacity < 1 || fields.capacity > 10000) return { value: null, error: "Capacity must be a whole number from 1 to 10000." };
      if (typeof fields.durationMinutes !== "number" || fields.durationMinutes < 1 || fields.durationMinutes > 1440) return { value: null, error: "Workshop duration must be from 1 to 1440 minutes." };
      for (const key of ["ticketPrice", "materialCostPerAttendee"]) if (typeof fields[key] !== "number" || fields[key] < 0 || fields[key] > 100000000) return { value: null, error: "Workshop prices and costs must be valid non-negative INR amounts." };
    }
    if (data.kind === "Registration" && (typeof fields.workshopId !== "string" || !fields.workshopId || typeof fields.attendeeName !== "string" || !fields.attendeeName.trim() || typeof fields.seats !== "number" || !Number.isInteger(fields.seats) || fields.seats < 1 || fields.seats > 100)) return { value: null, error: "Registration needs a workshop, attendee, and 1 to 100 seats." };
    if (data.kind === "Registration" && !registrationPaymentStatuses.includes(String(fields.paymentStatus ?? "unpaid") as (typeof registrationPaymentStatuses)[number])) return { value: null, error: "Choose a valid registration payment status." };
    if (data.kind === "Registration" && fields.registrationStatus !== undefined && !["active", "cancelled"].includes(String(fields.registrationStatus))) return { value: null, error: "Choose active or cancelled for the registration." };
    if (data.kind === "Registration" && fields.amountPaid !== undefined && (typeof fields.amountPaid !== "number" || fields.amountPaid < 0 || fields.amountPaid > 100000000)) return { value: null, error: "Recorded registration payments must be non-negative INR amounts." };
    if (["Workshop expense", "Workshop other income"].includes(data.kind as string) && (typeof fields.workshopId !== "string" || !fields.workshopId || typeof fields.amount !== "number" || fields.amount <= 0 || fields.amount > 100000000)) return { value: null, error: "Select a workshop and enter a valid amount." };
    if (data.kind === "Promotion" && fields.promotionStatus !== undefined && !promotionStatuses.includes(String(fields.promotionStatus) as (typeof promotionStatuses)[number])) return { value: null, error: "Choose a valid promotion status." };
  }
  if (module === "zyrenox") {
    if (data.kind === "Lead" && (typeof fields.company !== "string" || !fields.company.trim() || typeof fields.contactPerson !== "string" || !fields.contactPerson.trim())) return { value: null, error: "A lead needs a company and contact person." };
    if (data.kind === "Lead" && fields.leadStatus !== undefined && !leadStatuses.includes(String(fields.leadStatus) as (typeof leadStatuses)[number])) return { value: null, error: "Choose a valid lead stage." };
    if (data.kind === "Client project" && (typeof fields.company !== "string" || !fields.company.trim())) return { value: null, error: "A project needs a client or company." };
    if (data.kind === "Client project" && fields.projectStatus !== undefined && !projectStatuses.includes(String(fields.projectStatus) as (typeof projectStatuses)[number])) return { value: null, error: "Choose a valid project status." };
    if (data.kind === "Invoice" && (typeof fields.invoiceNumber !== "string" || !fields.invoiceNumber.trim() || typeof fields.total !== "number" || fields.total <= 0 || fields.total > 100000000 || typeof fields.projectId !== "string" || !fields.projectId)) return { value: null, error: "An invoice needs a project, invoice number, and valid total." };
    if (data.kind === "Invoice" && (typeof fields.issueDate !== "string" || typeof fields.dueDate !== "string" || typeof fields.lineItems !== "string" || !fields.lineItems.trim())) return { value: null, error: "An invoice needs issue and due dates plus line items." };
    if (data.kind === "Invoice" && calculateInvoiceLineItems(String(fields.lineItems)) !== Number(fields.total)) return { value: null, error: "Invoice total must match line items written as Description | Amount (INR), one item per line." };
    if (data.kind === "Payment" && (typeof fields.invoiceId !== "string" || !fields.invoiceId || typeof fields.amount !== "number" || fields.amount <= 0 || fields.amount > 100000000)) return { value: null, error: "A payment needs an invoice and a valid amount." };
  }
  if (module === "finance") {
    if (data.kind === "Transaction" && (!financeTypes.includes(String(fields.flowType) as (typeof financeTypes)[number]) || typeof fields.amount !== "number" || fields.amount <= 0 || fields.amount > 100000000 || typeof fields.category !== "string" || !fields.category.trim() || !data.date)) return { value: null, error: "A transaction needs income or expense type, category, date, and a positive INR amount." };
    if (["Monthly budget", "Savings goal", "Recurring template", "Savings contribution"].includes(data.kind as string) && (typeof fields.amount !== "number" || fields.amount <= 0 || fields.amount > 100000000)) return { value: null, error: "Enter a valid positive INR amount." };
    if (data.kind === "Monthly budget" && (typeof fields.category !== "string" || !fields.category.trim() || typeof fields.month !== "string" || !/^\d{4}-\d{2}$/.test(fields.month))) return { value: null, error: "A budget needs a category and month in YYYY-MM format." };
    if (data.kind === "Savings goal" && (typeof data.date !== "string" || !data.date)) return { value: null, error: "A savings goal needs a target date." };
    if (data.kind === "Recurring template" && (!financeTypes.includes(String(fields.flowType) as (typeof financeTypes)[number]) || !recurringCadences.includes(String(fields.cadence) as (typeof recurringCadences)[number]) || typeof fields.category !== "string" || !fields.category.trim())) return { value: null, error: "A recurring template needs a valid flow type, cadence, and category." };
    if (data.kind === "Savings contribution" && (typeof fields.goalId !== "string" || !fields.goalId)) return { value: null, error: "Choose a savings goal for this contribution." };
  }
  return { value: { title: data.title.trim(), kind: data.kind.trim(), description: typeof data.description === "string" ? data.description.trim() : "", ...(typeof data.date === "string" && data.date ? { date: data.date } : {}), fields }, error: null };
}
