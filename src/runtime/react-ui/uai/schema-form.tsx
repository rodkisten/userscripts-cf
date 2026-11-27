import { useId } from "react";
import * as Switch from "@radix-ui/react-switch";
import * as Checkbox from "@radix-ui/react-checkbox";
import { Input } from "./input";

export type SchemaField = {
  id: string;
  label: string;
  description?: string;
  type:
    | "string"
    | "number"
    | "boolean"
    | "choice"
    | "environment"
    | "switch"
    | "checkbox"
    | "range"
    | "textarea"
    | "email"
    | "password"
    | "search"
    | "url"
    | "tel";
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  defaultValue?: string;
  options?: readonly (string | { label: string; value: string })[];
};
export function SchemaForm({
  fields,
  values,
  onChange,
  disabled = false,
  errors = {},
}: {
  fields: readonly SchemaField[];
  values: Readonly<Record<string, string>>;
  onChange: (id: string, value: string) => void;
  disabled?: boolean;
  errors?: Readonly<Record<string, string>>;
}) {
  const prefix = useId();
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-3">
      {fields.map((field, index) => {
        const id = prefix + "-" + index;
        const value = values[field.id] ?? field.defaultValue ?? "";
        const options = field.type === "boolean" ? ["true", "false"] : field.options;
        const error = errors[field.id];
        const describedBy =
          [field.description ? id + "-description" : "", error ? id + "-error" : ""]
            .filter(Boolean)
            .join(" ") || undefined;
        const control = { id, disabled, "aria-invalid": !!error, "aria-describedby": describedBy };
        return (
          <div key={field.id} className="grid min-w-0 gap-1.5">
            <label htmlFor={id} className="text-sm font-medium">
              {field.label}
              {field.required ? " *" : ""}
            </label>
            {field.description && (
              <p id={id + "-description"} className="text-xs text-muted-foreground">
                {field.description}
              </p>
            )}
            {field.type === "switch" ? (
              <Switch.Root
                {...control}
                checked={value === "true"}
                onCheckedChange={(v) => onChange(field.id, String(v))}
                className="h-6 w-11 rounded-full bg-input data-[state=checked]:bg-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-background transition-transform data-[state=checked]:translate-x-[22px]" />
              </Switch.Root>
            ) : field.type === "checkbox" ? (
              <Checkbox.Root
                {...control}
                required={field.required}
                checked={value === "true"}
                onCheckedChange={(v) => onChange(field.id, String(v === true))}
                className="grid size-5 place-items-center rounded border border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <Checkbox.Indicator>✓</Checkbox.Indicator>
              </Checkbox.Root>
            ) : field.type === "textarea" ? (
              <textarea
                {...control}
                required={field.required}
                value={value}
                placeholder={field.placeholder}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => onChange(field.id, e.target.value)}
                className="min-h-20 min-w-0 rounded-md border border-input bg-background p-2 text-base"
              />
            ) : field.type === "range" ? (
              <div className="flex items-center gap-2">
                <input
                  {...control}
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={value || String(field.min ?? 0)}
                  onChange={(e) => onChange(field.id, e.target.value)}
                  className="min-w-0 flex-1 accent-primary"
                />
                <output htmlFor={id} className="text-sm tabular-nums">
                  {value || String(field.min ?? 0)}
                </output>
              </div>
            ) : options ? (
              <select
                id={id}
                value={value}
                required={field.required}
                aria-invalid={!!error}
                aria-describedby={
                  [field.description ? id + "-description" : "", error ? id + "-error" : ""]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                onChange={(e) => onChange(field.id, e.target.value)}
                className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base"
              >
                <option value="">{field.placeholder ?? "Select"}</option>
                {options.map((option, i) => (
                  <option key={i} value={typeof option === "string" ? option : option.value}>
                    {typeof option === "string" ? option : option.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={id}
                type={
                  ["number", "email", "password", "search", "url", "tel"].includes(field.type)
                    ? field.type
                    : "text"
                }
                placeholder={field.placeholder}
                min={field.min}
                max={field.max}
                autoCorrect="off"
                spellCheck={false}
                step={field.type === "number" ? (field.step ?? "any") : undefined}
                required={field.required}
                value={value}
                aria-invalid={!!error}
                aria-describedby={
                  [field.description ? id + "-description" : "", error ? id + "-error" : ""]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                onChange={(e) => onChange(field.id, e.target.value)}
                autoCapitalize="none"
                className="text-base"
              />
            )}
            {error && (
              <p id={id + "-error"} role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
