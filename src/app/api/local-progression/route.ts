import { NextResponse } from "next/server";
import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { isAuthConfigured } from "@/lib/auth";
import { getLocalProgression } from "@/lib/local-progression";

async function handleGET() {
  if (process.env.NODE_ENV !== "development" || isAuthConfigured()) return NextResponse.json({ error: "Local progression is available only in unauthenticated development mode." }, { status: 404 });
  const sessionId = await getLifeModuleDevSession();
  return NextResponse.json(getLocalProgression(sessionId));
}

export const GET = withDevStorageErrors(handleGET);
