import { NextResponse } from "next/server";
import { getRequestUser, readJson, errorResponse } from "@/lib/http";
import { completeQuest } from "@/lib/quest-engine";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  const { id } = await params;
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const key = parsed.value?.idempotencyKey;
  if (typeof key !== "string") return NextResponse.json({ error: "An idempotency key is required." }, { status: 400 });
  try {
    const occurrenceKey = parsed.value?.occurrenceKey;
    if (occurrenceKey !== undefined && typeof occurrenceKey !== "string") return NextResponse.json({ error: "Invalid quest occurrence." }, { status: 400 });
    const result = await completeQuest({ userId: auth.user._id, questId: id, idempotencyKey: key, occurrenceKey, timezone: auth.user.settings.timezone });
    return NextResponse.json({ completion: result.completion, totalXp: result.totalXp, level: result.level, leveledUp: result.leveledUp });
  } catch (error) { return errorResponse(error); }
}

