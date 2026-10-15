import { notFound } from "next/navigation";
import { PlaceholderPage } from "@/components/placeholder-page";
import { SystemWorkspace } from "@/components/system-workspace";
import { SettingsWorkspace } from "@/components/settings-workspace";
import { LifeModuleWorkspace } from "@/components/life-module-workspace";
import { navigation } from "@/lib/navigation";
import { LifeSystemWorkspace } from "@/components/life-system-workspace";
import { AdaptiveWorkspace } from "@/components/adaptive-workspace";
import { isAuthConfigured } from "@/lib/auth";

export function generateStaticParams() { return navigation.filter(item => item.href !== "/").map(item => ({ module: item.href.slice(1) })); }

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const item = navigation.find(entry => entry.href === `/${module}`);
  if (!item) notFound();
  if (module === "schedule") return <LifeSystemWorkspace view="schedule" />;
  if (module === "tasks") return <LifeSystemWorkspace view="tasks" />;
  if (module === "daily-planning") return <LifeSystemWorkspace view="planning" />;
  if (module === "focus") return <LifeSystemWorkspace view="focus" />;
  if (module === "achievements") return <AdaptiveWorkspace />;
  if (module === "quests" || module === "habits" || module === "player-stats") return <SystemWorkspace section={module} localDevelopment={process.env.NODE_ENV === "development" && !isAuthConfigured()} />;
  if (module === "fitness" || module === "nutrition" || module === "mind" || module === "academics" || module === "career" || module === "guitar" || module === "flute" || module === "content" || module === "bloom-blend" || module === "zyrenox" || module === "finance") return <LifeModuleWorkspace key={module} module={module} />;
  if (module === "settings") return <SettingsWorkspace />;
  return <PlaceholderPage title={item.label} />;
}
