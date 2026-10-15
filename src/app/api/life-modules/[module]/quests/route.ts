import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/http";
import { getAuthenticatedIdentity } from "@/lib/auth";
import { Quest } from "@/models";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { createLifeQuestDraft, isLifeModuleId, listLifeEntries, listLifeQuestDrafts } from "@/lib/life-module-dev-store";
import { isValidIsoDate } from "@/lib/domain";
import { lifeEntryDeadline } from "@/lib/life-module-query";
import { calculateQuestXp } from "@/lib/quest-engine";

export const dynamic = "force-dynamic";

async function handleGET(_request: Request, { params }: { params: Promise<{ module: string }> }) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Development quest drafts are unavailable outside local development." }, { status: 404 });
  const { module } = await params;
  if (!isLifeModuleId(module)) return NextResponse.json({ error: "Unknown life module." }, { status: 404 });
  const identity = await getAuthenticatedIdentity();
  if (identity.userId) {
    const auth = await getRequestUser();
    if (auth.response) return auth.response;
    const quests = await Quest.find({ userId: auth.user._id, category: module }).sort({ dueDate: 1 }).limit(50).lean();
    return NextResponse.json({ quests, source: "system-engine" });
  }
  const sessionId = await getLifeModuleDevSession();
  return NextResponse.json({ drafts: listLifeQuestDrafts(sessionId, module), source: "development-sqlite", notice: "These drafts are not System Engine quests and award no XP." });
}

async function handlePOST(request: Request, { params }: { params: Promise<{ module: string }> }) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Development quest drafts are unavailable outside local development." }, { status: 404 });
  const { module } = await params;
  if (!isLifeModuleId(module)) return NextResponse.json({ error: "Unknown life module." }, { status: 404 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Provide a valid quest request." }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (input.xpReward !== undefined) return NextResponse.json({ error: "XP reward is calculated by the server; do not submit an XP value." }, { status: 400 });
  if (typeof input.entryId !== "string" || typeof input.title !== "string" || !input.title.trim() || input.title.length > 120 || typeof input.dueDate !== "string" || !isValidIsoDate(input.dueDate) || typeof input.description !== "string" || input.description.length > 2000) return NextResponse.json({ error: "Provide a dated record with a valid title and description." }, { status: 400 });

  const identity = await getAuthenticatedIdentity();
  if (identity.userId) {
    const auth = await getRequestUser();
    if (auth.response) return auth.response;
    const entry = listLifeEntries(await getLifeModuleDevSession(), module);
    const record = entry.find(item => item.id === input.entryId);
    const dueDate = record ? lifeEntryDeadline(record) : undefined;
    if (!record || !dueDate) return NextResponse.json({ error: "Dated record not found." }, { status: 404 });
    const existing = await Quest.findOne({ userId: auth.user._id, sourceEntryId: input.entryId });
    if (existing) return NextResponse.json({ quest: existing, source: "system-engine", alreadyLinked: true });
    try {
      const difficulty = "normal";
      const estimatedMinutes = 30;
      const quest = await Quest.create({ userId: auth.user._id, sourceEntryId: input.entryId, title: input.title.trim(), category: module, description: input.description.trim(), xpReward: calculateQuestXp(difficulty, estimatedMinutes), recurrence: "once", dueDate, difficulty, estimatedMinutes });
      return NextResponse.json({ quest, source: "system-engine" }, { status: 201 });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 11000) {
        const linkedQuest = await Quest.findOne({ userId: auth.user._id, sourceEntryId: input.entryId });
        if (linkedQuest) return NextResponse.json({ quest: linkedQuest, source: "system-engine", alreadyLinked: true });
      }
      return NextResponse.json({ error: "Could not create the System Engine quest." }, { status: 500 });
    }
  }
  const sessionId = await getLifeModuleDevSession();
  const result = createLifeQuestDraft(sessionId, module, input.entryId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ draft: result.draft, source: "development-sqlite", notice: "Development quest draft only: not connected to the System Engine and awards no XP." }, { status: 201 });
}



export const GET = withDevStorageErrors(handleGET);
export const POST = withDevStorageErrors(handlePOST);


