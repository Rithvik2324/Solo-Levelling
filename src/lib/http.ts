import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { getAuthenticatedIdentity } from "@/lib/auth";
import { User } from "@/models";

export async function getRequestUser() {
  const identity = await getAuthenticatedIdentity();
  if (!identity.userId) return { response: NextResponse.json({ error: identity.error }, { status: identity.error?.startsWith("Google sign-in") ? 503 : 401 }), user: null };
  try {
    await connectToDatabase();
    const user = await User.findOneAndUpdate(
      { provider: "google", providerSubject: identity.userId },
      { $set: { email: identity.email.toLowerCase(), displayName: identity.displayName }, $setOnInsert: { provider: "google", providerSubject: identity.userId } },
      { upsert: true, new: true, runValidators: true }
    );
    return { response: null, user };
  } catch (error) {
    if (!process.env.MONGODB_URI) return { response: NextResponse.json({ error: "MongoDB is not configured. Add MONGODB_URI to the private server environment." }, { status: 503 }), user: null };
    const errorName = error && typeof error === "object" && "name" in error && typeof error.name === "string" ? error.name : "unknown";
    console.error("AWAKENING database request failed:", errorName);
    return { response: NextResponse.json({ error: "The account database is temporarily unavailable. Check server configuration and try again." }, { status: 503 }), user: null };
  }
}

export async function readJson(request: Request) {
  try { return { value: await request.json() as Record<string, unknown>, response: null }; }
  catch { return { value: null, response: NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }) }; }
}

export function errorResponse(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === 11000) return NextResponse.json({ error: "That request was already recorded." }, { status: 409 });
  if (error && typeof error === "object" && "name" in error && (error.name === "ValidationError" || error.name === "CastError")) return NextResponse.json({ error: "One or more fields are invalid." }, { status: 400 });
  const message = error instanceof Error ? error.message : "Request failed.";
  if (message === "Not found") return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (message.startsWith("Validation")) return NextResponse.json({ error: message }, { status: 400 });
  console.error("AWAKENING API error:", error);
  return NextResponse.json({ error: "The request could not be completed. Please try again." }, { status: 500 });
}
