import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { NextResponse } from "next/server";
import { isAuthConfigured } from "@/lib/auth";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { exportLifeEntries } from "@/lib/life-module-dev-store";

export const dynamic = "force-dynamic";

async function handleGET() {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Local diagnostics are unavailable outside local development." }, { status: 404 });
  const sessionId = await getLifeModuleDevSession();
  return NextResponse.json({
    application: { status: "available", mode: "development" },
    configuration: { googleSignIn: isAuthConfigured() ? "configured" : "needs setup", mongoUri: process.env.MONGODB_URI ? "configured" : "needs setup" },
    storage: { status: "available", type: "local SQLite", scope: "browser session", records: exportLifeEntries(sessionId).length, survivesRestart: true },
    pwa: { manifest: "/manifest.webmanifest", serviceWorker: "not installed; no private API caching" },
    verification: { status: "not available at runtime", note: "Run lint, typecheck, tests, and build from the project terminal." }
  }, { headers: { "Cache-Control": "no-store" } });
}



export const GET = withDevStorageErrors(handleGET);


