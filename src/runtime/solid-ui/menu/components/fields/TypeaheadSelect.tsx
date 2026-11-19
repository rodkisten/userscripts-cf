import { Combobox } from "../../../form-controls/Combobox";
import type { MultiSelectField, SelectField } from "../../types";

/** Compatibility wrapper: legacy menu fields use the shared React combobox. */
export interface TypeaheadSelectProps {
  id: string;
  field: SelectField | MultiSelectField;
  value: unknown;
  multiple: boolean;
  disabled: boolean;
  onCommit: (value: unknown) => void;
}

export function TypeaheadSelect(props: TypeaheadSelectProps) {
  return (
    <Combobox
      id={props.id}
      name={props.field.name}
      options={props.field.options}
      value={props.value as string | readonly string[] | null}
      multiple={props.multiple}
      disabled={props.disabled}
      readOnly={props.field.readonly}
      placeholder={props.field.placeholder || props.field.searchPlaceholder}
      emptyMessage={props.field.emptyMessage}
      onChange={props.onCommit}
    />
  );
}
