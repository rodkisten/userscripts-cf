/** Exhaustive registry of the 29 framework-neutral field variants.
 * The six RodMenu-only media/diagnostic variants remain application extensions.
 */
export const SHARED_FIELD_TYPES = [
  "text",
  "email",
  "password",
  "search",
  "url",
  "tel",
  "number",
  "textarea",
  "select",
  "multiselect",
  "radio",
  "checkbox-group",
  "checkbox",
  "switch",
  "range",
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
  "color",
  "file",
  "hidden",
  "segmented",
  "rating",
  "button",
  "html",
  "divider",
  "custom",
] as const;
export type SharedFieldType = (typeof SHARED_FIELD_TYPES)[number];
export function isSharedFieldType(type: string): type is SharedFieldType {
  return (SHARED_FIELD_TYPES as readonly string[]).includes(type);
}
