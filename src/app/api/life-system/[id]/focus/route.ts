import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { NextResponse } from "next/server";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { transitionFocusRecord } from "@/lib/life-system-dev-store";

async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Focus blocks are available only in local development." }, { status: 404 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const action = body && typeof body === "object" && "action" in body ? body.action : null;
  if (typeof action !== "string" || !["start", "pause", "resume", "finish", "cancel"].includes(action)) return NextResponse.json({ error: "Choose a valid focus action." }, { status: 400 });
  const result = transitionFocusRecord(await getLifeModuleDevSession(), (await params).id, action);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}



export const POST = withDevStorageErrors(handlePOST);


