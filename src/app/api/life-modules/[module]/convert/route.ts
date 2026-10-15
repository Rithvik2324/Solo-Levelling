import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { NextResponse } from "next/server";
import { batchLifeEntries, isLifeModuleId, listLifeEntries, makeLifeEntry } from "@/lib/life-module-dev-store";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { findLeadProject } from "@/lib/life-module-query";

export const dynamic = "force-dynamic";

async function handlePOST(request: Request, { params }: { params: Promise<{ module: string }> }) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Development business operations are unavailable outside local development." }, { status: 404 });
  const { module } = await params;
  if (module !== "zyrenox" || !isLifeModuleId(module)) return NextResponse.json({ error: "Unknown conversion workflow." }, { status: 404 });
  let input: unknown; try { input = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!input || typeof input !== "object" || typeof (input as Record<string, unknown>).leadId !== "string") return NextResponse.json({ error: "A lead id is required." }, { status: 400 });
  const sessionId = await getLifeModuleDevSession();
  const entries = listLifeEntries(sessionId, module);
  const lead = entries.find(entry => entry.id === (input as Record<string, string>).leadId && entry.kind === "Lead");
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  if (lead.fields.leadStatus !== "won") return NextResponse.json({ error: "Only a won lead can be converted to a client project." }, { status: 409 });
  const existing = findLeadProject(entries, lead.id);
  if (existing || lead.fields.convertedProjectId) return NextResponse.json({ project: existing, alreadyConverted: true }, { status: 200 });
  const project = batchLifeEntries(sessionId, module, records => {
    const currentLead = records.find(entry => entry.id === lead.id && entry.kind === "Lead" && entry.status !== "archived");
    if (!currentLead || currentLead.fields.leadStatus !== "won" || currentLead.fields.convertedProjectId) throw new Error("This lead changed while it was being converted. Reload and retry.");
    const created = makeLifeEntry(module, {
      title: String(currentLead.fields.company) + " project", kind: "Client project", description: currentLead.description,
      fields: { sourceLeadId: currentLead.id, company: currentLead.fields.company as string, contactPerson: currentLead.fields.contactPerson as string,
        serviceType: String(currentLead.fields.serviceInterest ?? ""), quotedPrice: Number(currentLead.fields.estimatedDealValue ?? 0),
        agreedPrice: Number(currentLead.fields.estimatedDealValue ?? 0), projectStatus: "planned" }
    });
    currentLead.fields = { ...currentLead.fields, convertedProjectId: created.id };
    records.unshift(created, makeLifeEntry(module, { title: "Won lead converted: " + currentLead.title, kind: "Business activity", description: "Converted into a client project.", fields: { leadId: currentLead.id, projectId: created.id } }));
    return created;
  });
  return NextResponse.json({ project, source: "development-sqlite" }, { status: 201 });
}



export const POST = withDevStorageErrors(handlePOST);


