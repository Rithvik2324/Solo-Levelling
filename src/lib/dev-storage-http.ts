import { NextResponse } from "next/server";

export function withDevStorageErrors<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try { return await handler(...args); }
    catch (error) {
      const message = error instanceof Error ? error.message : "Local development storage failed.";
      if (message.startsWith("Local development data") || message.startsWith("Local development backup restore") || message.startsWith("Local development storage")) return NextResponse.json({ error: message }, { status: 503 });
      throw error;
    }
  };
}
