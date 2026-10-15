import { NextResponse } from "next/server";
import { getRequestUser, errorResponse } from "@/lib/http";
import { QuestCompletion } from "@/models";
import { isValidIsoDate } from "@/lib/domain";

export async function GET(request: Request) {
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  const url = new URL(request.url); const from = url.searchParams.get("from"); const to = url.searchParams.get("to"); const category = url.searchParams.get("category");
  if ((from && !isValidIsoDate(from)) || (to && !isValidIsoDate(to)) || (from && to && from > to)) return NextResponse.json({ error: "Invalid history date range." }, { status: 400 });
  try {
    const completions = await QuestCompletion.find({ userId: auth.user._id }).sort({ completedAt: -1 }).limit(200).populate({ path: "questId", select: "title category" }).lean();
    const filtered = completions.filter(item => {
      const quest = item.questId as unknown as { category?: string } | null;
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: auth.user.settings.timezone }).format(item.completedAt);
      return (!from || date >= from) && (!to || date <= to) && (!category || quest?.category?.toLowerCase() === category.toLowerCase());
    });
    return NextResponse.json({ completions: filtered });
  } catch (error) { return errorResponse(error); }
}

