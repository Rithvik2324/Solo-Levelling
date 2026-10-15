import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { NextResponse } from "next/server";
import { createLifeEntry, isLifeModuleId, listLifeEntries } from "@/lib/life-module-dev-store";
import { isValidIsoDate } from "@/lib/domain";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { findRecurringOccurrence } from "@/lib/life-module-query";

export const dynamic = "force-dynamic";

async function handlePOST(request: Request, { params }: { params: Promise<{ module: string }> }) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Development recurring tools are unavailable outside local development." }, { status: 404 });
  const { module } = await params;
  if (module !== "finance" || !isLifeModuleId(module)) return NextResponse.json({ error: "Unknown recurring workflow." }, { status: 404 });
  let input: unknown; try { input = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!input || typeof input !== "object" || typeof (input as Record<string, unknown>).templateId !== "string" || typeof (input as Record<string, unknown>).occurrenceDate !== "string" || !isValidIsoDate((input as Record<string, string>).occurrenceDate)) return NextResponse.json({ error: "Choose a recurring template and valid occurrence date." }, { status: 400 });
  const sessionId = await getLifeModuleDevSession();
  const entries = listLifeEntries(sessionId, module);
  const data = input as Record<string, string>;
  const template = entries.find(entry => entry.kind === "Recurring template" && entry.id === data.templateId);
  if (!template) return NextResponse.json({ error: "Recurring template not found." }, { status: 404 });
  const duplicate = findRecurringOccurrence(entries, template.id, data.occurrenceDate);
  if (duplicate) return NextResponse.json({ transaction: duplicate, alreadyGenerated: true });
  const transaction = createLifeEntry(sessionId, module, { title: template.title, kind: "Transaction", date: data.occurrenceDate, description: "Generated explicitly from a recurring template.", fields: { flowType: template.fields.flowType as string, amount: Number(template.fields.amount), category: String(template.fields.category), account: String(template.fields.account ?? ""), templateId: template.id, occurrenceDate: data.occurrenceDate } });
  return NextResponse.json({ transaction, source: "development-sqlite" }, { status: 201 });
}



export const POST = withDevStorageErrors(handlePOST);


