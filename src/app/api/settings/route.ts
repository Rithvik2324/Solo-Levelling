import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { NextResponse } from "next/server";
import { getRequestUser, readJson, errorResponse } from "@/lib/http";
import { isValidIsoDate } from "@/lib/domain";
import { Campaign, User } from "@/models";
import { isAuthConfigured } from "@/lib/auth";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { getDevelopmentCampaignDate, setDevelopmentCampaignDate } from "@/lib/life-system-dev-store";

function useDevelopmentSettings() { return process.env.NODE_ENV === "development" && !isAuthConfigured(); }

async function handleGET() {
  if (useDevelopmentSettings()) return NextResponse.json({ settings: { campaignDate: getDevelopmentCampaignDate(await getLifeModuleDevSession()) ?? null }, source: "development-sqlite", notice: "Campaign settings are persistent on this development server. Timezone preferences require account services." });
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  return NextResponse.json({ settings: auth.user.settings });
}

async function handlePATCH(request: Request) {
  if (useDevelopmentSettings()) {
    const parsed = await readJson(request); if (parsed.response) return parsed.response;
    const input = parsed.value!;
    if (Object.keys(input).some(key => key !== "campaignDate")) return NextResponse.json({ error: "Only the campaign date is available in local settings; timezone and account preferences require account services." }, { status: 400 });
    if (input.campaignDate !== undefined && input.campaignDate !== null && (typeof input.campaignDate !== "string" || !isValidIsoDate(input.campaignDate))) return NextResponse.json({ error: "Campaign date must be a valid calendar date or null." }, { status: 400 });
    const campaignDate = setDevelopmentCampaignDate(await getLifeModuleDevSession(), typeof input.campaignDate === "string" ? input.campaignDate : undefined);
    return NextResponse.json({ settings: { campaignDate: campaignDate ?? null }, source: "development-sqlite", notice: "Campaign setting is persistent on this development server." });
  }
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const input = parsed.value!; const update: Record<string, unknown> = {}; const unset: Record<string, ""> = {};
  if (input.timezone !== undefined) {
    if (typeof input.timezone !== "string") return NextResponse.json({ error: "Invalid timezone." }, { status: 400 });
    try { new Intl.DateTimeFormat("en", { timeZone: input.timezone }); } catch { return NextResponse.json({ error: "Use a valid IANA timezone, such as Asia/Kolkata." }, { status: 400 }); }
    update["settings.timezone"] = input.timezone;
  }
  if (input.campaignDate !== undefined) {
    if (input.campaignDate === null) unset["settings.campaignDate"] = "";
    else if (typeof input.campaignDate !== "string" || !isValidIsoDate(input.campaignDate)) return NextResponse.json({ error: "Campaign date must be a valid calendar date or null." }, { status: 400 });
    else update["settings.campaignDate"] = input.campaignDate;
  }
  if (input.reducedMotion !== undefined) {
    if (typeof input.reducedMotion !== "boolean") return NextResponse.json({ error: "Reduced-motion setting must be a boolean." }, { status: 400 });
    update["settings.reducedMotion"] = input.reducedMotion;
  }
  try {
    const user = await User.findByIdAndUpdate(auth.user._id, { ...(Object.keys(update).length ? { $set: update } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { new: true, runValidators: true });
    if (typeof update["settings.campaignDate"] === "string") await Campaign.findOneAndUpdate({ userId: auth.user._id, name: "Personal Campaign" }, { $set: { targetDate: update["settings.campaignDate"] }, $setOnInsert: { userId: auth.user._id, name: "Personal Campaign" } }, { upsert: true });
    if (unset["settings.campaignDate"] !== undefined) await Campaign.updateOne({ userId: auth.user._id, name: "Personal Campaign" }, { $unset: { targetDate: 1 } });
    return NextResponse.json({ settings: user?.settings });
  }
  catch (error) { return errorResponse(error); }
}



export const GET = withDevStorageErrors(handleGET);
export const PATCH = withDevStorageErrors(handlePATCH);


