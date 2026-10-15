import NextAuth from "next-auth";
import { authOptions, isAuthConfigured } from "@/lib/auth";

const handler = NextAuth(authOptions);
async function handle(request: Request, context: unknown) {
  if (!isAuthConfigured()) return Response.json({ error: "Configure Google OAuth and NEXTAUTH_SECRET to enable sign-in." }, { status: 503 });
  return handler(request as never, context as never);
}
export { handle as GET, handle as POST };

