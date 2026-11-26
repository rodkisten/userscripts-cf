import type { RodMenuProps } from "./types";
import { SchemaForm, type SchemaField } from "./uai/schema-form";

/** Adapt legacy menu values without moving persistence into the registry. */
export function DynamicForm({ schema, values, onChange }: {
  schema: RodMenuProps["schema"];
  values: Record<string, any>;
  onChange: (id: string, value: any) => void;
}) {
  const source = schema.fields ?? [];
  const fields: SchemaField[] = source.map((field, index) => ({
    id: field.id ?? field.name ?? `field-${index}`,
    label: field.label,
    type: field.type === "text" ? "string" : field.type === "select" ? "choice" : field.type === "toggle" ? "switch" : field.type === "slider" ? "range" : field.type,
    placeholder: field.placeholder,
    min: field.min,
    max: field.max,
    step: field.step,
    options: field.options?.map(option => ({label: option.label, value: String(option.value)})),
  }));
  const serialized = Object.fromEntries(fields.map(field => [field.id, field.type === "checkbox" || field.type === "switch" ? String(Boolean(values[field.id])) : String(values[field.id] ?? "")]));
  return <SchemaForm fields={fields} values={serialized} onChange={(id, value) => {
    const field = fields.find(item => item.id === id);
    if (!field) return;
    onChange(id, field.type === "checkbox" || field.type === "switch" ? value === "true" : (field.type === "number" || field.type === "range") && value !== "" ? Number(value) : value);
  }} />;
}
