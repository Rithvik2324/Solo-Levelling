"use client";

import { FormEvent, useRef } from "react";

export type InlineEditField = { name: string; label: string; value?: string | number; type?: "text" | "date" | "number" | "textarea"; required?: boolean; min?: number; max?: number; step?: number; maxLength?: number };

export function InlineEditForm({ trigger, fields, onSave, disabled = false }: { trigger: string; fields: InlineEditField[]; onSave: (values: Record<string, string>) => void | Promise<void>; disabled?: boolean }) {
  const details = useRef<HTMLDetailsElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(Array.from(new FormData(event.currentTarget).entries(), ([key, value]) => [key, String(value)]));
    await onSave(values);
  }
  return <details className="inline-edit"><summary className="text-button" aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}>{trigger}</summary><form className="inline-edit-form" onSubmit={event => void submit(event)}>
    {fields.map(field => <label className="field-label" key={field.name}>{field.label}{field.type === "textarea" ? <textarea className="text-input text-area" name={field.name} defaultValue={field.value} required={field.required} maxLength={field.maxLength} /> : <input className="text-input" name={field.name} type={field.type ?? "text"} defaultValue={field.value} required={field.required} min={field.min} max={field.max} step={field.step} maxLength={field.maxLength} />}</label>)}
    <div className="form-actions"><button className="button button-primary" type="submit" disabled={disabled}>Save</button><button className="button button-secondary" type="button" onClick={() => { if (details.current) details.current.open = false; }}>Cancel</button></div>
  </form></details>;
}
