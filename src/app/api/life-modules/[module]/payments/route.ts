import { withDevStorageErrors } from "@/lib/dev-storage-http";
import { NextResponse } from "next/server";
import { batchLifeEntries, isLifeModuleId, listLifeEntries, makeLifeEntry } from "@/lib/life-module-dev-store";
import { isValidIsoDate } from "@/lib/domain";
import { getLifeModuleDevSession } from "@/lib/life-module-dev-session";
import { invoiceOutstanding } from "@/lib/life-module-query";

export const dynamic = "force-dynamic";

async function handlePOST(request: Request, { params }: { params: Promise<{ module: string }> }) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Development payment tracking is unavailable outside local development." }, { status: 404 });
  const { module } = await params;
  if (module !== "zyrenox" || !isLifeModuleId(module)) return NextResponse.json({ error: "Unknown payment workflow." }, { status: 404 });
  let input: unknown; try { input = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Provide payment details." }, { status: 400 });
  const data = input as Record<string, unknown>;
  if (typeof data.invoiceId !== "string" || typeof data.paymentKey !== "string" || !data.paymentKey || typeof data.amount !== "number" || !Number.isFinite(data.amount) || data.amount <= 0 || data.amount > 100000000 || typeof data.paymentDate !== "string" || !isValidIsoDate(data.paymentDate)) return NextResponse.json({ error: "Provide an invoice, unique payment key, valid date, and positive INR amount." }, { status: 400 });
  const sessionId = await getLifeModuleDevSession();
  const entries = listLifeEntries(sessionId, module);
  const duplicate = entries.find(entry => entry.kind === "Payment" && entry.fields.paymentKey === data.paymentKey);
  if (duplicate) return NextResponse.json({ payment: duplicate, alreadyRecorded: true });
  const invoice = entries.find(entry => entry.kind === "Invoice" && entry.id === data.invoiceId);
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  const balance = invoiceOutstanding(invoice, entries);
  if (data.amount > balance.outstanding + 0.00001) return NextResponse.json({ error: "Payment exceeds the invoice's outstanding balance." }, { status: 400 });
  const paymentAmount = data.amount as number;
  const payment = batchLifeEntries(sessionId, module, records => {
    const latestDuplicate = records.find(entry => entry.kind === "Payment" && entry.fields.paymentKey === data.paymentKey);
    if (latestDuplicate) return latestDuplicate;
    const latestInvoice = records.find(entry => entry.kind === "Invoice" && entry.id === data.invoiceId);
    if (!latestInvoice) throw new Error("Invoice not found while recording payment.");
    if (paymentAmount > invoiceOutstanding(latestInvoice, records).outstanding + 0.00001) throw new Error("Payment exceeds the invoice's current outstanding balance.");
    const created = makeLifeEntry(module, { title: "Payment · " + latestInvoice.title, kind: "Payment", date: data.paymentDate as string, description: typeof data.notes === "string" ? data.notes.slice(0, 1000) : "", fields: { invoiceId: latestInvoice.id, amount: paymentAmount, paymentDate: data.paymentDate as string, paymentKey: data.paymentKey as string, method: typeof data.method === "string" ? data.method.slice(0, 100) : "" } });
    records.unshift(created, makeLifeEntry(module, { title: "Payment recorded · " + latestInvoice.title, kind: "Business activity", date: data.paymentDate as string, description: "A payment was manually recorded in the development tracker.", fields: { invoiceId: latestInvoice.id, paymentId: created.id } }));
    return created;
  });
  return NextResponse.json({ payment, source: "development-sqlite" }, { status: 201 });
}



export const POST = withDevStorageErrors(handlePOST);


