import type { LifeModuleEntryRecord } from "@/lib/domain";

function quoteCsv(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[\s]*[=+@\-]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function buildTransactionCsv(entries: LifeModuleEntryRecord[]) {
  const transactions = entries.filter(entry => entry.kind === "Transaction");
  const rows: unknown[][] = [["date", "type", "amount_inr", "category", "account", "title", "notes"], ...transactions.map(entry => [entry.date, entry.fields.flowType, entry.fields.amount, entry.fields.category, entry.fields.account, entry.title, entry.description])];
  return rows.map(row => row.map(quoteCsv).join(",")).join("\r\n");
}
