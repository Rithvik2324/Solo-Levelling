import assert from "node:assert/strict";
import test from "node:test";
import type { LifeModuleEntryRecord } from "@/lib/domain";
import { bloomBlendSummary, budgetCategoryStatus, findLeadProject, findRecurringOccurrence, invoiceOutstanding, personalFinanceSummary, workshopFinance, workshopSeatsRemaining, zyrenoxSummary } from "@/lib/life-module-query";
import { buildTransactionCsv } from "@/lib/finance-csv";
import { validateLifeEntry, isLifeModuleId, createLifeEntry, listLifeEntries } from "@/lib/life-module-dev-store";

function record(id: string, module: LifeModuleEntryRecord["module"], kind: string, title: string, fields: LifeModuleEntryRecord["fields"], extra: Partial<LifeModuleEntryRecord> = {}): LifeModuleEntryRecord {
  return { id, module, kind, title, description: "", status: "planned", fields, createdAt: "2026-10-12T10:00:00.000Z", updatedAt: "2026-10-12T10:00:00.000Z", ...extra };
}

test("workshop validation and registration capacity preserve attendance and finance estimates", () => {
  const workshopInput = validateLifeEntry({ title: "Pressed flower cards", kind: "Workshop", date: "2026-11-10", fields: { category: "Craft", venue: "Studio", startTime: "10:00", durationMinutes: 90, capacity: 6, ticketPrice: 500, materialCostPerAttendee: 80 } }, "bloom-blend");
  assert.equal(workshopInput.error, null);
  assert.ok(validateLifeEntry({ title: "No venue", kind: "Workshop", date: "2026-11-10", fields: { category: "Craft", startTime: "10:00", durationMinutes: 90, capacity: 6, ticketPrice: 500, materialCostPerAttendee: 80 } }, "bloom-blend").error);
  const workshop = record("w1", "bloom-blend", "Workshop", "Cards", { capacity: 6, ticketPrice: 500, materialCostPerAttendee: 80 });
  const registrations = [record("r1", "bloom-blend", "Registration", "A", { workshopId: "w1", seats: 4, amountPaid: 1000 }), record("r2", "bloom-blend", "Registration", "B", { workshopId: "w1", seats: 2, amountPaid: 1000, registrationStatus: "cancelled" })];
  assert.equal(workshopSeatsRemaining([workshop, ...registrations], workshop), 2);
  const totals = workshopFinance([workshop, ...registrations], workshop);
  assert.deepEqual({ seats: totals.seats, ticketRevenue: totals.ticketRevenue, collected: totals.collected, unpaid: totals.unpaid, materials: totals.estimatedMaterials }, { seats: 4, ticketRevenue: 2000, collected: 1000, unpaid: 1000, materials: 320 });
  assert.equal(bloomBlendSummary([workshop, ...registrations], "2026-10-12").registrations, 4);
});

test("Zyrenox invoice balances use payment records once, and converted projects link to a source lead", () => {
  const invoice = record("i1", "zyrenox", "Invoice", "Invoice 1", { total: 1200 });
  const payments = [record("p1", "zyrenox", "Payment", "Part one", { invoiceId: "i1", amount: 300 }), record("p2", "zyrenox", "Payment", "Part two", { invoiceId: "i1", amount: 200 })];
  assert.deepEqual(invoiceOutstanding(invoice, payments), { received: 500, outstanding: 700 });
  const project = record("pr1", "zyrenox", "Client project", "Acme", { sourceLeadId: "l1", projectStatus: "active" });
  assert.equal(findLeadProject([project], "l1")?.id, "pr1");
  const lead = record("l1", "zyrenox", "Lead", "Acme", { leadStatus: "won" });
  assert.equal(zyrenoxSummary([lead, project, invoice, ...payments], "2026-10-12").recordedRevenue, 500);
  assert.equal(zyrenoxSummary([lead, project, invoice, ...payments], "2026-10-12").pendingPayments, 700);
});

test("personal finance month totals, budget overspending, and savings progress use only recorded entries", () => {
  const rows = [
    record("t1", "finance", "Transaction", "Salary", { flowType: "income", amount: 25000, category: "Work" }, { date: "2026-10-01" }),
    record("t2", "finance", "Transaction", "Food", { flowType: "expense", amount: 1200, category: "Food" }, { date: "2026-10-03" }),
    record("t3", "finance", "Transaction", "Other month", { flowType: "expense", amount: 700, category: "Food" }, { date: "2026-09-30" }),
    record("b1", "finance", "Monthly budget", "Food", { month: "2026-10", category: "Food", amount: 1000 }),
    record("g1", "finance", "Savings goal", "Laptop", { amount: 5000 }),
    record("c1", "finance", "Savings contribution", "First deposit", { goalId: "g1", amount: 1250 })
  ];
  const summary = personalFinanceSummary(rows, "2026-10");
  assert.equal(summary.income, 25000);
  assert.equal(summary.expenses, 1200);
  assert.equal(summary.net, 23800);
  assert.equal(summary.budgetRemaining, -200);
  assert.deepEqual(summary.savingsGoals[0], { id: "g1", title: "Laptop", target: 5000, saved: 1250, remaining: 3750, progress: 25 });
  assert.deepEqual(budgetCategoryStatus(rows, "2026-10", "Food", 1000), { spent: 1200, remaining: -200, overspent: 200 });
});

test("recurring transaction occurrence keys deduplicate, and CSV export neutralizes formula cells", () => {
  const entries = [record("t1", "finance", "Transaction", '=HYPERLINK("x")', { flowType: "expense", amount: 50, category: "Home", templateId: "rt1", occurrenceDate: "2026-10-12" }, { date: "2026-10-12" })];
  assert.equal(findRecurringOccurrence(entries, "rt1", "2026-10-12")?.id, "t1");
  assert.equal(findRecurringOccurrence(entries, "rt1", "2026-10-13"), undefined);
  const csv = buildTransactionCsv(entries);
  assert.match(csv, /'=HYPERLINK/);
  assert.equal(isLifeModuleId("finance"), true);
  assert.equal(isLifeModuleId("bloom-blend"), true);
  assert.equal(isLifeModuleId("zyrenox"), true);
});

test("business module entries remain separated by browser session", () => {
  const session = "business-isolation-" + Date.now();
  const input = validateLifeEntry({ title: "Electricity bill", kind: "Transaction", date: "2026-10-12", fields: { flowType: "expense", amount: 1000, category: "Utilities" } }, "finance");
  assert.equal(input.error, null);
  assert.ok(input.value);
  createLifeEntry(session, "finance", input.value);
  assert.equal(listLifeEntries(session, "finance").length, 1);
  assert.equal(listLifeEntries(session, "bloom-blend").length, 0);
  assert.equal(listLifeEntries(session + "-another", "finance").length, 0);
});
