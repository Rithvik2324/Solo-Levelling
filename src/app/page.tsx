import { Dashboard } from "@/components/dashboard";
import { isAuthConfigured } from "@/lib/auth";

export default function Home() { return <Dashboard localDevelopment={process.env.NODE_ENV === "development" && !isAuthConfigured()} />; }
