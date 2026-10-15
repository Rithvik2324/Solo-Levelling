import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { isAuthConfigured } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "AWAKENING — Personal Progression System",
  description: "A personal life progression system. Your progress begins with one action.",
  applicationName: "AWAKENING",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Awakening", statusBarStyle: "black-translucent" }
};

export const viewport: Viewport = { themeColor: "#080c14", colorScheme: "dark" };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const authConfigured = isAuthConfigured();
  const localDevelopment = process.env.NODE_ENV === "development" && !authConfigured;
  return <html lang="en"><body><Providers><AppShell authConfigured={authConfigured} localDevelopment={localDevelopment}>{children}</AppShell></Providers></body></html>;
}
