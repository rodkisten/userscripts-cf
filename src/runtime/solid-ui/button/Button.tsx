import { createSignal, splitProps, type JSX } from "solid-js";
import { menu as defaultMenu, type DropdownItem } from "../menu-api";
import styles, { css } from "./Button.module.css";

export { css as buttonCss };
export type ButtonVariant =
  "default" | "secondary" | "outline" | "ghost" | "destructive" | "success" | "warning" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon";
export interface ButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: JSX.Element;
  iconEnd?: JSX.Element;
  badge?: string | number;
  loading?: boolean;
  autoLoading?: boolean;
  loadingText?: string;
  onClick?: (event: MouseEvent) => unknown;
  ref?: HTMLButtonElement | ((element: HTMLButtonElement) => void);
}
export function Button(props: ButtonProps) {
  const [, nativeProps] = splitProps(props, [
    "variant",
    "size",
    "icon",
    "iconEnd",
    "badge",
    "loading",
    "autoLoading",
    "loadingText",
    "onClick",
    "children",
    "ref",
    "class",
    "disabled",
    "type",
  ]);
  const [pending, setPending] = createSignal(false);
  const busy = () => !!props.loading || pending();
  const handleClick = (event: MouseEvent) => {
    if (busy() || props.disabled) return;
    const result = props.onClick?.(event);
    if (props.autoLoading && result && typeof (result as PromiseLike<unknown>).then === "function") {
      setPending(true);
      void Promise.resolve(result).then(
        () => setPending(false),
        (error) => {
          setPending(false);
          console.error("[Button] Async action failed", error);
        },
      );
    }
  };
  return (
    <button
      {...nativeProps}
      ref={props.ref}
      type={props.type ?? "button"}
      class={`${styles.button} ${styles[props.variant ?? "default"]} ${styles[props.size ?? "md"]} ${props.class ?? ""}`}
      disabled={props.disabled || busy()}
      aria-busy={busy()}
      onClick={handleClick}
    >
      <span class={styles.content}>
        {busy() ? <span class={styles.spinner} aria-hidden="true" /> : props.icon}
        {props.size !== "icon" && (
          <span>{busy() && props.loadingText ? props.loadingText : props.children}</span>
        )}
        {!busy() && props.iconEnd}
        {props.badge != null && <span class={styles.badge}>{props.badge}</span>}
      </span>
    </button>
  );
}
export interface ButtonGroupProps extends JSX.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  attached?: boolean;
}
export function ButtonGroup(props: ButtonGroupProps) {
  const [, nativeProps] = splitProps(props, ["orientation", "attached", "children", "class"]);
  return (
    <div
      {...nativeProps}
      role="group"
      class={`${styles.group} ${props.attached === false ? styles.detached : ""} ${props.orientation === "vertical" ? styles.vertical : ""} ${props.class ?? ""}`}
    >
      {props.children}
    </div>
  );
}
export type DropdownButtonProps = ButtonProps & {
  items: DropdownItem[];
  menu?: typeof defaultMenu;
  align?: "start" | "end";
};
export function DropdownButton(props: DropdownButtonProps) {
  const [, buttonProps] = splitProps(props, ["items", "menu", "align", "onClick", "ref"]);
  let trigger!: HTMLButtonElement;
  const setTrigger = (element: HTMLButtonElement) => {
    trigger = element;
    if (typeof props.ref === "function") props.ref(element);
  };
  return (
    <Button
      {...buttonProps}
      ref={setTrigger}
      aria-haspopup="menu"
      iconEnd={props.iconEnd ?? "▾"}
      onClick={() =>
        (props.menu ?? defaultMenu).dropdown({ trigger, items: props.items, align: props.align })
      }
    />
  );
}
export function SplitButton(props: DropdownButtonProps) {
  return (
    <ButtonGroup attached>
      <Button
        variant={props.variant}
        size={props.size}
        icon={props.icon}
        badge={props.badge}
        disabled={props.disabled}
        loading={props.loading}
        autoLoading={props.autoLoading}
        loadingText={props.loadingText}
        onClick={props.onClick}
      >
        {props.children}
      </Button>
      <DropdownButton
        menu={props.menu}
        items={props.items}
        align={props.align}
        size={props.size}
        variant={props.variant}
        disabled={props.disabled || props.loading}
        iconEnd="▾"
        aria-label="Mais opções"
        aria-haspopup="menu"
      />
    </ButtonGroup>
  );
}

/** Compact action with a required accessible name. */
export type IconButtonProps = Omit<ButtonProps, "children" | "size"> & {
  "aria-label": string;
};
export function IconButton(props: IconButtonProps) {
  return <Button {...props} size="icon" />;
}
