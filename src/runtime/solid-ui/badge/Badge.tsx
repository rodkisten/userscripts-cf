import type { JSX } from "solid-js";
import { omitProps } from "../shared/omitProps";
import styles, { css } from "./Badge.module.css";

export { css as badgeCss };
export type BadgeVariant =
  "default" | "secondary" | "outline" | "destructive" | "success" | "warning" | "dot";
export interface BadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  count?: number;
  max?: number;
}
export function Badge(props: BadgeProps) {
  const nativeProps = omitProps(props, ["variant", "count", "max", "children", "class"]);
  const label = () =>
    props.count == null
      ? props.children
      : props.count > (props.max ?? 99)
        ? `${props.max ?? 99}+`
        : props.count;
  return (
    <span
      {...nativeProps}
      class={`${styles.badge} ${styles[props.variant ?? "default"]} ${props.class ?? ""}`}
      aria-label={props["aria-label"] ?? (props.variant === "dot" ? "Indicador" : String(label()))}
    >
      {props.variant !== "dot" && label()}
    </span>
  );
}
