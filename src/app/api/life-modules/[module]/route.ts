import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { NextResponse } from "next/server";
import { archiveLifeEntry, canTransitionApplicationStatus, canTransitionContentStatus, canTransitionLeadStatus, completeLifeEntryWithLocalReward, createLifeEntry, isLifeModuleId, listLifeEntries, updateLifeEntry, validateLifeEntry } from "@/lib/life-module-dev-store";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { workshopSeatsRemaining } from "@/lib/life-module-query";
import { localActivityKindFor } from "@/lib/local-progression";
import { isAuthConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

function ensureDevelopment() {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "The development life-module adapter is unavailable outside local development." }, { status: 404 });
  return null;
}

async function handleGET(_request: Request, { params }: { params: Promise<{ module: string }> }) {
  const unavailable = ensureDevelopment(); if (unavailable) return unavailable;
  const sessionId = await getLifeModuleDevSession();
  const { module } = await params;
  if (!isLifeModuleId(module)) return NextResponse.json({ error: "Unknown life module." }, { status: 404 });
  return NextResponse.json({ entries: listLifeEntries(sessionId, module), source: "development-sqlite", notice: "Records are saved in this development session's local SQLite storage. Eligible completed training and music practice earn local XP." });
}

async function handlePOST(request: Request, { params }: { params: Promise<{ module: string }> }) {
  const unavailable = ensureDevelopment(); if (unavailable) return unavailable;
  const sessionId = await getLifeModuleDevSession();
  const { module } = await params;
  if (!isLifeModuleId(module)) return NextResponse.json({ error: "Unknown life module." }, { status: 404 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = validateLifeEntry(body, module); if (parsed.error || !parsed.value) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (module === "content" && parsed.value.fields.pipelineStatus !== undefined && parsed.value.fields.pipelineStatus !== "idea") return NextResponse.json({ error: "New content records start in the idea stage. Move them through the pipeline after creation." }, { status: 400 });
  if (module === "bloom-blend" && parsed.value.kind === "Workshop" && listLifeEntries(sessionId, module).some(entry => entry.kind === "Workshop" && entry.title.toLowerCase() === parsed.value!.title.toLowerCase())) return NextResponse.json({ error: "A workshop with this title already exists; edit that record instead." }, { status: 409 });
  if (module === "bloom-blend" && parsed.value.kind === "Registration") {
    const workshop = listLifeEntries(sessionId, module).find(entry => entry.kind === "Workshop" && entry.id === parsed.value!.fields.workshopId);
    if (!workshop) return NextResponse.json({ error: "Choose an existing workshop." }, { status: 400 });
    const seats = Number(parsed.value.fields.seats);
    if (seats > workshopSeatsRemaining(listLifeEntries(sessionId, module), workshop)) return NextResponse.json({ error: "This registration exceeds the remaining workshop capacity." }, { status: 400 });
    const gross = Number(workshop.fields.ticketPrice) * Number(parsed.value.fields.seats);
    const paid = Number(parsed.value.fields.amountPaid ?? 0);
    if (paid > gross || (parsed.value.fields.paymentStatus === "unpaid" && paid > 0) || (parsed.value.fields.paymentStatus === "paid" && paid !== gross) || (parsed.value.fields.paymentStatus === "partially paid" && (paid <= 0 || paid >= gross))) return NextResponse.json({ error: "Amount paid must agree with the selected payment status and ticket total." }, { status: 400 });
  }
  if (module === "finance" && parsed.value.kind === "Savings contribution") {
    const key = parsed.value.fields.contributionKey;
    if (typeof key !== "string" || !key) return NextResponse.json({ error: "A contribution idempotency key is required." }, { status: 400 });
    const entries = listLifeEntries(sessionId, module);
    const duplicate = entries.find(entry => entry.kind === "Savings contribution" && entry.fields.contributionKey === key);
    if (duplicate) return NextResponse.json({ entry: duplicate, alreadyRecorded: true });
    const goal = entries.find(entry => entry.kind === "Savings goal" && entry.id === parsed.value!.fields.goalId);
    if (!goal) return NextResponse.json({ error: "Savings goal not found." }, { status: 404 });
    const saved = entries.filter(entry => entry.kind === "Savings contribution" && entry.fields.goalId === goal.id).reduce((sum, entry) => sum + Number(entry.fields.amount || 0), 0);
    if (Number(parsed.value.fields.amount) > Number(goal.fields.amount) - saved + 0.00001) return NextResponse.json({ error: "That contribution exceeds the remaining goal amount." }, { status: 400 });
  }
  if (module === "zyrenox" && parsed.value.kind === "Invoice") {
    const entries = listLifeEntries(sessionId, module);
    if (!entries.some(entry => entry.kind === "Client project" && entry.id === parsed.value!.fields.projectId)) return NextResponse.json({ error: "Choose an existing project for this invoice." }, { status: 400 });
    if (entries.some(entry => entry.kind === "Invoice" && entry.fields.invoiceNumber === parsed.value!.fields.invoiceNumber)) return NextResponse.json({ error: "That invoice number is already in use." }, { status: 409 });
  }
  if (module === "bloom-blend" && ["Workshop expense", "Workshop other income", "Workshop checklist"].includes(parsed.value.kind)) {
    if (!listLifeEntries(sessionId, module).some(entry => entry.kind === "Workshop" && entry.id === parsed.value!.fields.workshopId)) return NextResponse.json({ error: "Choose an existing workshop." }, { status: 400 });
  }
  const entry = createLifeEntry(sessionId, module, parsed.value);
  if (module === "zyrenox" && entry.kind === "Invoice") createLifeEntry(sessionId, module, { title: "Invoice created: " + entry.title, kind: "Business activity", description: "Invoice entered in development tracking.", fields: { invoiceId: entry.id } });
  return NextResponse.json({ entry, source: "development-sqlite" }, { status: 201 });
}

async function handlePATCH(request: Request, { params }: { params: Promise<{ module: string }> }) {
  const unavailable = ensureDevelopment(); if (unavailable) return unavailable;
  const sessionId = await getLifeModuleDevSession();
  const { module } = await params;
  if (!isLifeModuleId(module)) return NextResponse.json({ error: "Unknown life module." }, { status: 404 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Provide a valid update." }, { status: 400 });
  const data = body as Record<string, unknown>;
  if (typeof data.id !== "string") return NextResponse.json({ error: "Record id is required." }, { status: 400 });
  if (data.status === "archived") {
    const entry = archiveLifeEntry(sessionId, module, data.id); return entry ? NextResponse.json({ entry }) : NextResponse.json({ error: "Record not found." }, { status: 404 });
  }
  if (data.status !== undefined && data.status !== "planned" && data.status !== "done") return NextResponse.json({ error: "Invalid record status." }, { status: 400 });
  const current = listLifeEntries(sessionId, module).find(item => item.id === data.id);
  if (module === "bloom-blend" && current?.kind === "Workshop" && (data as Record<string, unknown>).fields && typeof (data as Record<string, unknown>).fields === "object") {
    const fields = (data as Record<string, unknown>).fields as Record<string, unknown>;
    const registered = listLifeEntries(sessionId, module).filter(entry => entry.kind === "Registration" && entry.fields.workshopId === current.id && entry.fields.registrationStatus !== "cancelled").reduce((sum, entry) => sum + Number(entry.fields.seats || 0), 0);
    if (typeof fields.capacity === "number" && fields.capacity < registered) return NextResponse.json({ error: "Capacity cannot be lower than active registered seats." }, { status: 400 });
  }
  if (module === "bloom-blend" && current?.kind === "Registration" && data.fields && typeof data.fields === "object" && "seats" in data.fields) {
    const fields = data.fields as Record<string, unknown>;
    const workshop = listLifeEntries(sessionId, module).find(entry => entry.kind === "Workshop" && entry.id === fields.workshopId);
    if (!workshop || (fields.registrationStatus !== "cancelled" && Number(fields.seats) > workshopSeatsRemaining(listLifeEntries(sessionId, module), workshop, current.id))) return NextResponse.json({ error: "This update exceeds the remaining workshop capacity." }, { status: 400 });
    const gross = Number(workshop.fields.ticketPrice) * Number(fields.seats);
    const paid = Number(fields.amountPaid ?? 0);
    if (paid > gross || (fields.paymentStatus === "unpaid" && paid > 0) || (fields.paymentStatus === "paid" && paid !== gross) || (fields.paymentStatus === "partially paid" && (paid <= 0 || paid >= gross))) return NextResponse.json({ error: "Amount paid must agree with the selected payment status and ticket total." }, { status: 400 });
  }
  if (module === "career" && current?.kind === "Job application" && data.fields && typeof data.fields === "object" && "pipelineStatus" in data.fields) {
    const next = String((data.fields as Record<string, unknown>).pipelineStatus ?? "saved");
    if (!canTransitionApplicationStatus(String(current.fields.pipelineStatus ?? "saved"), next)) return NextResponse.json({ error: "That application stage transition is not allowed." }, { status: 400 });
  }
  if (module === "content" && current && data.fields && typeof data.fields === "object" && "pipelineStatus" in data.fields) {
    const next = String((data.fields as Record<string, unknown>).pipelineStatus ?? "idea");
    if (!canTransitionContentStatus(String(current.fields.pipelineStatus ?? "idea"), next)) return NextResponse.json({ error: "That content production transition is not allowed." }, { status: 400 });
    const fields = data.fields as Record<string, unknown>;
    if (next === "published" && (typeof fields.publishedUrl !== "string" || !fields.publishedUrl.trim() || typeof fields.publicationDate !== "string" || !fields.publicationDate)) return NextResponse.json({ error: "Add the published URL and publication date before marking content published." }, { status: 400 });
  }
  if (module === "zyrenox" && current?.kind === "Lead" && data.fields && typeof data.fields === "object" && "leadStatus" in data.fields) {
    const next = String((data.fields as Record<string, unknown>).leadStatus ?? "new");
    if (!canTransitionLeadStatus(String(current.fields.leadStatus ?? "new"), next)) return NextResponse.json({ error: "That lead stage transition is not allowed." }, { status: 400 });
  }
  if (module === "zyrenox" && current?.kind === "Invoice" && data.fields && typeof data.fields === "object") {
    const fields = data.fields as Record<string, unknown>;
    const payments = listLifeEntries(sessionId, module).filter(entry => entry.kind === "Payment" && entry.fields.invoiceId === current.id).reduce((sum, entry) => sum + Number(entry.fields.amount || 0), 0);
    if (typeof fields.total === "number" && fields.total < payments) return NextResponse.json({ error: "Invoice total cannot be reduced below recorded payments." }, { status: 400 });
    if (typeof fields.invoiceNumber === "string" && listLifeEntries(sessionId, module).some(entry => entry.kind === "Invoice" && entry.id !== current.id && entry.fields.invoiceNumber === fields.invoiceNumber)) return NextResponse.json({ error: "That invoice number is already in use." }, { status: 409 });
  }
  if (module === "finance" && current?.kind === "Savings contribution" && data.fields && typeof data.fields === "object") {
    const fields = data.fields as Record<string, unknown>;
    const goal = listLifeEntries(sessionId, module).find(entry => entry.kind === "Savings goal" && entry.id === fields.goalId);
    const saved = listLifeEntries(sessionId, module).filter(entry => entry.kind === "Savings contribution" && entry.fields.goalId === fields.goalId && entry.id !== current.id).reduce((sum, entry) => sum + Number(entry.fields.amount || 0), 0);
    if (!goal || Number(fields.amount) > Number(goal.fields.amount) - saved + 0.00001) return NextResponse.json({ error: "That edit exceeds the remaining savings goal amount." }, { status: 400 });
  }
  const parsed = validateLifeEntry(data, module); if (parsed.error || !parsed.value) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const eligibleKind = localActivityKindFor(module, parsed.value.kind);
  const shouldAwardLocal = process.env.NODE_ENV === "development" && !isAuthConfigured() && eligibleKind && current?.status !== "done" && data.status === "done";
  const result = shouldAwardLocal
    ? completeLifeEntryWithLocalReward(sessionId, module, data.id, { ...parsed.value, ...(data.date === "" ? { date: "" } : {}) }, eligibleKind)
    : (() => { const entry = updateLifeEntry(sessionId, module, data.id, { ...parsed.value, ...(data.date === "" ? { date: "" } : {}), status: data.status as "planned" | "done" | undefined }); return entry ? { entry, reward: null } : null; })();
  const entry = result?.entry;
  const reward = result?.reward ?? null;
  if (module === "zyrenox" && current && entry && current.kind === "Lead" && current.fields.leadStatus !== entry.fields.leadStatus) createLifeEntry(sessionId, module, { title: "Lead stage: " + entry.title, kind: "Business activity", description: String(current.fields.leadStatus ?? "new") + " → " + String(entry.fields.leadStatus), fields: { leadId: entry.id, from: String(current.fields.leadStatus ?? "new"), to: String(entry.fields.leadStatus) } });
  if (module === "zyrenox" && current && entry && current.kind === "Deliverable" && current.status !== entry.status) createLifeEntry(sessionId, module, { title: "Deliverable " + (entry.status === "done" ? "completed: " : "reopened: ") + entry.title, kind: "Business activity", description: "Project task status updated.", fields: { deliverableId: entry.id, status: entry.status } });
  if (module === "zyrenox" && current && entry && current.kind === "Client project" && current.fields.projectStatus !== entry.fields.projectStatus) createLifeEntry(sessionId, module, { title: "Project status: " + entry.title, kind: "Business activity", description: String(current.fields.projectStatus ?? "planned") + " → " + String(entry.fields.projectStatus), fields: { projectId: entry.id, status: String(entry.fields.projectStatus) } });
  return entry ? NextResponse.json({ entry, reward }) : NextResponse.json({ error: "Record not found." }, { status: 404 });
}



export const GET = withDevStorageErrors(handleGET);
export const POST = withDevStorageErrors(handlePOST);
export const PATCH = withDevStorageErrors(handlePATCH);


