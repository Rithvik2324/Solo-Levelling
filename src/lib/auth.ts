import "server-only";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getServerSession } from "next-auth/next";

export function isAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.NEXTAUTH_SECRET && process.env.ALLOWED_GOOGLE_EMAIL);
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  providers: [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID ?? "", clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "" })],
  callbacks: {
    async signIn({ user, profile }) {
      const emailVerified = (profile as { email_verified?: boolean } | undefined)?.email_verified === true;
      return Boolean(emailVerified && user.email && process.env.ALLOWED_GOOGLE_EMAIL && user.email.toLowerCase() === process.env.ALLOWED_GOOGLE_EMAIL.toLowerCase());
    },
    async session({ session, token }) {
      if (session.user && token.sub) (session.user as typeof session.user & { id: string }).id = token.sub;
      return session;
    }
  }
};

export async function getAuthenticatedIdentity() {
  if (!isAuthConfigured()) return { userId: null, error: "Google sign-in is not configured. Set OAuth credentials, NEXTAUTH_SECRET, and ALLOWED_GOOGLE_EMAIL." };
  const session = await getServerSession(authOptions);
  const user = session?.user as ({ id?: string; email?: string | null; name?: string | null }) | undefined;
  if (!user?.id) return { userId: null, error: "Sign in to access your personal system." };
  return { userId: user.id, email: user.email ?? "", displayName: user.name ?? "Player", error: null };
}
