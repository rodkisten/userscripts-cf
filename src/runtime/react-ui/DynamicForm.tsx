import * as Switch from "@radix-ui/react-switch";
import * as Checkbox from "@radix-ui/react-checkbox";
import type { RodMenuProps } from "./types";
import styles from "./Menu.module.css";

/** Controlled schema renderer; persistence and portal ownership belong to the consumer. */
export function DynamicForm({ schema, values, onChange: handleChange }: {
  schema: RodMenuProps["schema"];
  values: Record<string, any>;
  onChange: (fieldId: string, value: any) => void;
}) {
  return <>
            {schema.fields?.map((field, index) => {
              const fieldId = `${schema.id}-${field.id ?? field.name ?? `field-${index}`}`;
              const valueKey = field.id ?? field.name ?? `field-${index}`;
              const isCheckbox =
                field.type === "checkbox" || field.type === "toggle" || field.type === "switch";
              return (
                <div
                  key={fieldId}
                  className={`${styles.fieldGroup} ${isCheckbox ? styles.checkboxGroup : ""}`}
                >
                  <label htmlFor={fieldId}>{field.label}</label>
                  {field.type === "select" ? (
                    <select
                      id={fieldId}
                      value={values[valueKey] ?? ""}
                      onChange={(e) => handleChange(valueKey, e.target.value)}
                    >
                      <option value="" disabled>
                        {field.placeholder || "Select option..."}
                      </option>
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "slider" || field.type === "range" ? (
                    <input
                      autoCapitalize="none" autoCorrect="off" spellCheck={false}
                      id={fieldId}
                      type="range"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={values[valueKey] ?? field.min ?? 0}
                      onChange={(e) => handleChange(valueKey, Number(e.target.value))}
                    />
                  ) : field.type === "textarea" ? (
                    <textarea
                      autoCapitalize="none" autoCorrect="off" spellCheck={false}
                      id={fieldId}
                      placeholder={field.placeholder}
                      value={String(values[valueKey] ?? "")}
                      onChange={(e) => handleChange(valueKey, e.target.value)}
                    />
                  ) : isCheckbox ? (
                    field.type === "checkbox" ? (
                    <Checkbox.Root id={fieldId} className={styles.checkbox} checked={!!values[valueKey]} onCheckedChange={(checked) => handleChange(valueKey, checked === true)}>
                      <Checkbox.Indicator>✓</Checkbox.Indicator>
                    </Checkbox.Root>
                  ) : (
                    <Switch.Root id={fieldId} className={styles.switch} checked={!!values[valueKey]} onCheckedChange={(checked) => handleChange(valueKey, checked)}>
                      <Switch.Thumb className={styles.switchThumb} />
                    </Switch.Root>
                  )
                  ) : (
                    <input
                      autoCapitalize="none" autoCorrect="off" spellCheck={false}
                      id={fieldId}
                      type={
                        ["number", "email", "password", "search", "url", "tel"].includes(field.type)
                          ? field.type
                          : "text"
                      }
                      placeholder={field.placeholder}
                      value={values[valueKey] ?? ""}
                      onChange={(e) =>
                        handleChange(
                          valueKey,
                          field.type === "number" && e.target.value !== ""
                            ? Number(e.target.value)
                            : e.target.value,
                        )
                      }
                    />
                  )}
                </div>
              );
            })}
  </>;
}
