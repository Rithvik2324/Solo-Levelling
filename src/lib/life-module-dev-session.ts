import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

export async function getLifeModuleDevSession() {
  const jar = await cookies();
  let sessionId = jar.get("awakening-dev-session")?.value;
  if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    sessionId = randomUUID();
    jar.set("awakening-dev-session", sessionId, { httpOnly: true, sameSite: "lax", secure: false, path: "/" });
  }
  return sessionId;
}
