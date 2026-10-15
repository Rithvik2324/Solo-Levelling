import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getRequestUser, readJson, errorResponse } from "@/lib/http";
import { isValidIsoDate } from "@/lib/domain";
import { isAuthConfigured } from "@/lib/auth";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { deleteDevelopmentMilestone, updateDevelopmentMilestone } from "@/lib/life-system-dev-store";
import { CampaignMilestone } from "@/models";

function useDevelopmentCampaign() { return process.env.NODE_ENV === "development" && !isAuthConfigured(); }

async function handlePATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const input = parsed.value!;
  if (input.completed !== undefined && typeof input.completed !== "boolean") return NextResponse.json({ error: "completed must be boolean." }, { status: 400 });
  const patch: { title?: string; targetDate?: string; completedAt?: string } = {};
  if (input.title !== undefined) {
    if (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 160) return NextResponse.json({ error: "Milestone title must contain 1 to 160 characters." }, { status: 400 });
    patch.title = input.title.trim();
  }
  if (input.targetDate !== undefined) {
    if (input.targetDate !== null && (typeof input.targetDate !== "string" || !isValidIsoDate(input.targetDate))) return NextResponse.json({ error: "Target date must be a valid calendar date or empty." }, { status: 400 });
    if (typeof input.targetDate === "string") patch.targetDate = input.targetDate;
  }
  if (input.completed === true) patch.completedAt = new Date().toISOString();
  if (input.completed === false) patch.completedAt = "";
  if (useDevelopmentCampaign()) {
    const update = { ...patch, ...(input.targetDate === null ? { targetDate: undefined } : {}) };
    const milestone = updateDevelopmentMilestone(await getLifeModuleDevSession(), id, update);
    if (!milestone) return NextResponse.json({ error: "Milestone not found." }, { status: 404 });
    if (input.completed === false) delete milestone.completedAt;
    if (input.targetDate === null) delete milestone.targetDate;
    return NextResponse.json({ milestone, source: "development-sqlite" });
  }
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid milestone id." }, { status: 400 });
  try {
    const set: Record<string, unknown> = {}; const unset: Record<string, 1> = {};
    if (patch.title !== undefined) set.title = patch.title;
    if (typeof input.targetDate === "string") set.targetDate = input.targetDate;
    if (input.targetDate === null) unset.targetDate = 1;
    if (input.completed === true) set.completedAt = new Date();
    if (input.completed === false) unset.completedAt = 1;
    const milestone = await CampaignMilestone.findOneAndUpdate({ _id: id, userId: auth.user._id }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { new: true, runValidators: true });
    return milestone ? NextResponse.json({ milestone }) : NextResponse.json({ error: "Milestone not found." }, { status: 404 });
  } catch (error) { return errorResponse(error); }
}

async function handleDELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (useDevelopmentCampaign()) {
    const milestone = deleteDevelopmentMilestone(await getLifeModuleDevSession(), id);
    return milestone ? NextResponse.json({ deleted: true, id }) : NextResponse.json({ error: "Milestone not found." }, { status: 404 });
  }
  const auth = await getRequestUser(); if (auth.response) return auth.response;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid milestone id." }, { status: 400 });
  try {
    const result = await CampaignMilestone.deleteOne({ _id: id, userId: auth.user._id });
    return result.deletedCount ? NextResponse.json({ deleted: true, id }) : NextResponse.json({ error: "Milestone not found." }, { status: 404 });
  } catch (error) { return errorResponse(error); }
}



export const PATCH = withDevStorageErrors(handlePATCH);
export const DELETE = withDevStorageErrors(handleDELETE);


