import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { NextResponse } from "next/server";
import { getRequestUser, readJson, errorResponse } from "@/lib/http";
import { Campaign, CampaignMilestone } from "@/models";
import { isValidIsoDate } from "@/lib/domain";
import { isAuthConfigured } from "@/lib/auth";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { createDevelopmentMilestone, listDevelopmentMilestones } from "@/lib/life-system-dev-store";

function useDevelopmentCampaign() { return process.env.NODE_ENV === "development" && !isAuthConfigured(); }

async function handleGET() {
  if (useDevelopmentCampaign()) return NextResponse.json({ campaign: null, milestones: listDevelopmentMilestones(await getLifeModuleDevSession()), source: "development-sqlite", notice: "Milestones are persistent on this development server." });
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  try { const campaign = await Campaign.findOne({ userId: auth.user._id, name: "Personal Campaign" }); if (!campaign) return NextResponse.json({ campaign: null, milestones: [] }); return NextResponse.json({ campaign, milestones: await CampaignMilestone.find({ userId: auth.user._id, campaignId: campaign._id }).sort({ targetDate: 1 }) }); }
  catch (error) { return errorResponse(error); }
}

async function handlePOST(request: Request) {
  if (useDevelopmentCampaign()) {
    const parsed = await readJson(request); if (parsed.response) return parsed.response;
    const input = parsed.value!; const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title || title.length > 160 || (input.targetDate !== undefined && (typeof input.targetDate !== "string" || !isValidIsoDate(input.targetDate)))) return NextResponse.json({ error: "Provide a milestone title and valid optional target date." }, { status: 400 });
    const milestone = createDevelopmentMilestone(await getLifeModuleDevSession(), { title, ...(typeof input.targetDate === "string" ? { targetDate: input.targetDate } : {}) });
    return NextResponse.json({ milestone, source: "development-sqlite" }, { status: 201 });
  }
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const input = parsed.value!; const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 160 || (input.targetDate !== undefined && (typeof input.targetDate !== "string" || !isValidIsoDate(input.targetDate)))) return NextResponse.json({ error: "Provide a milestone title and valid optional target date." }, { status: 400 });
  try { const campaign = await Campaign.findOneAndUpdate({ userId: auth.user._id, name: "Personal Campaign" }, { $setOnInsert: { userId: auth.user._id, name: "Personal Campaign", ...(auth.user.settings.campaignDate ? { targetDate: auth.user.settings.campaignDate } : {}) } }, { upsert: true, new: true }); const milestone = await CampaignMilestone.create({ userId: auth.user._id, campaignId: campaign._id, title, targetDate: input.targetDate }); return NextResponse.json({ milestone }, { status: 201 }); }
  catch (error) { return errorResponse(error); }
}



export const GET = withDevStorageErrors(handleGET);
export const POST = withDevStorageErrors(handlePOST);


