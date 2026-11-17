import { createSignal, For, Show } from "solid-js";
import type { SvgIconName, ToastActionDescriptor, ToastType } from "./types";
import {
  dismissToast,
  pauseToastTimer,
  resumeToastTimer,
  useToasterState,
  type InternalToastEntry,
} from "./toasterStore";
import { SvgIcon } from "./SvgIcon";
import { ObjectInspectorView } from "./ObjectInspectorView";
import styles from "./Toaster.module.css";

const DEFAULT_ICON_BY_TYPE: Record<ToastType, SvgIconName> = {
  default: "circle",
  success: "check",
  error: "circle-x",
  warning: "triangle-alert",
  info: "info",
  debug: "terminal",
};

export function ToastItem(props: {
  entry: InternalToastEntry;
  stackIndex: number;
  isCollapsedStack: boolean;
  api: any;
}) {
  const { setExpandedToastId, expandedToastId, setManagerMinimized } = useToasterState();
  const [contentExpanded, setContentExpanded] = createSignal(
    Boolean(props.entry.record.options.expanded?.defaultOpen),
  );
  const [busyAction, setBusyAction] = createSignal<string | null>(null);

  const rec = () => props.entry.record;
  const opts = () => rec().options;
  const errorDetails = () => {
    const error = opts().error;
    if (error instanceof Error) return error.stack ?? error.message;
    const details = opts().details;
    return typeof details === "string" ? details : JSON.stringify(details ?? error, null, 2);
  };

  const iconName = (): SvgIconName => {
    const ic = opts().icon;
    if (typeof ic === "string") return ic as SvgIconName;
    if (opts().loading && opts().loadingState === "loading") return "loader-circle";
    return DEFAULT_ICON_BY_TYPE[opts().type] ?? "circle";
  };

  const progressPercent = () => {
    const p = opts().progress;
    return p == null ? null : Math.round(Math.max(0, Math.min(1, p)) * 100);
  };

  const handleActionClick = async (action: ToastActionDescriptor, event: MouseEvent) => {
    event.stopPropagation();
    if (action.disabled || busyAction()) return;
    const actionId = action.id ?? action.label;
    setBusyAction(actionId);
    try {
      if (action.handle) {
        await action.handle({
          action,
          controller: props.entry.controller,
          event,
          toast: props.api,
          close: (_val, reason = "action") => dismissToast(rec().id, reason),
          update: (next) => props.entry.controller.update(next),
          setValidation: () => undefined,
          values: {},
          checked: {},
        });
      }
      if (action.close !== false) {
        dismissToast(rec().id, "action");
      }
    } finally {
      setBusyAction(null);
    }
  };

  const stackStyle = () => {
    if (!props.isCollapsedStack || props.stackIndex === 0) return {};
    const scale = Math.max(0.86, 1 - props.stackIndex * 0.04);
    const offset = props.stackIndex * 6;
    const opacity = Math.max(0.4, 1 - props.stackIndex * 0.22);
    return {
      "--rod-stack-scale": String(scale),
      "--rod-stack-offset": `${offset}px`,
      "--rod-stack-opacity": String(opacity),
    };
  };

  return (
    <div
      class={styles.toast}
      role={opts().role}
      style={stackStyle()}
      data-type={opts().type}
      data-visible={String(rec().visible)}
      data-completing={String(rec().completing)}
      data-success-exit={String(rec().successExit)}
      data-stack-collapsed={String(props.isCollapsedStack && props.stackIndex > 0)}
      data-stack-hidden={String(props.isCollapsedStack && props.stackIndex >= 3)}
      onPointerEnter={() => opts().pauseOnInteraction && pauseToastTimer(rec().id, "pointer")}
      onPointerLeave={() => opts().pauseOnInteraction && resumeToastTimer(rec().id, "pointer")}
    >
      <Show when={opts().icon !== false}>
        <div
          class={styles.icon}
          data-spinning={String(
            opts().loading && opts().loadingState === "loading" && opts().animation === "spinner",
          )}
          data-pulsing={String(
            opts().loading && opts().loadingState === "loading" && opts().animation === "pulse",
          )}
        >
          <SvgIcon name={iconName()} size={18} />
        </div>
      </Show>

      <div class={styles.content}>
        <Show
          when={rec().customContent}
          fallback={
            <>
              <Show when={opts().title}>
                <div class={styles.title}>{opts().title}</div>
              </Show>
              <Show when={opts().description}>
                <div class={styles.description}>{opts().description}</div>
              </Show>
              <Show when={rec().args.length > 0}>
                <div class={styles.argsList}>
                  <For each={rec().args}>
                    {(arg) =>
                      typeof arg === "object" && arg !== null ? (
                        <ObjectInspectorView value={arg} />
                      ) : (
                        <span>{String(arg)}</span>
                      )
                    }
                  </For>
                </div>
              </Show>
            </>
          }
        >
          {rec().customContent!()}
        </Show>

        <Show when={opts().loading && opts().animation === "progress"}>
          <div class={styles.progressWrap}>
            <div class={styles.progressMeta}>
              <span>{opts().progressLabel ?? ""}</span>
              <Show when={progressPercent() !== null}>
                <span>{progressPercent()}%</span>
              </Show>
            </div>
            <div class={styles.progressTrack}>
              <div
                class={
                  progressPercent() === null
                    ? `${styles.progressBar} ${styles.progressBarIndeterminate}`
                    : styles.progressBar
                }
                style={{ width: progressPercent() === null ? undefined : `${progressPercent()}%` }}
              />
            </div>
          </div>
        </Show>

        <Show when={opts().details || opts().error}>
          <details class={styles.detailsBox}>
            <summary class={styles.detailsSummary}>{opts().detailsLabel ?? "Details"}</summary>
            <pre class={styles.detailsPre}>{errorDetails()}</pre>
          </details>
        </Show>

        <Show when={(opts().actions?.length ?? 0) > 0 || opts().undo}>
          <div class={styles.actionBar}>
            <Show when={opts().undo}>
              <button
                type="button"
                class={styles.actionButton}
                data-variant="primary"
                onClick={(e) =>
                  handleActionClick(
                    {
                      id: "undo",
                      label: opts().actionLabel ?? "Undo",
                      icon: "undo",
                      handle: () => opts().undo?.(),
                    },
                    e,
                  )
                }
              >
                <SvgIcon name="undo" size={14} />
                <span>{opts().actionLabel ?? "Undo"}</span>
              </button>
            </Show>
            <For each={opts().actions ?? []}>
              {(act) => (
                <button
                  type="button"
                  class={styles.actionButton}
                  data-variant={act.variant ?? "secondary"}
                  disabled={act.disabled || busyAction() === (act.id ?? act.label)}
                  onClick={(e) => handleActionClick(act, e)}
                >
                  <Show when={typeof act.icon === "string"}>
                    <SvgIcon name={act.icon as SvgIconName} size={14} />
                  </Show>
                  <span>{act.label}</span>
                </button>
              )}
            </For>
          </div>
        </Show>

        <Show when={opts().expanded && contentExpanded()}>
          <div class={styles.expandedPanel}>
            <Show when={opts().expanded?.title}>
              <div class={styles.expandedHeading}>{opts().expanded!.title}</div>
            </Show>
            <div class={styles.expandedScroll}>
              {typeof opts().expanded?.content === "object" ? (
                <ObjectInspectorView value={opts().expanded?.content} />
              ) : (
                String(opts().expanded?.content ?? "")
              )}
            </div>
          </div>
        </Show>
      </div>

      <div class={styles.actions}>
        <Show when={rec().duplicateCount > 1}>
          <span class={styles.countBadge}>×{rec().duplicateCount}</span>
        </Show>
        <Show when={opts().lane !== "interaction"}>
          <button
            type="button"
            class={styles.iconButton}
            title="Minimize"
            onClick={(e) => {
              e.stopPropagation();
              setManagerMinimized(true);
            }}
          >
            <SvgIcon name="chevron-down" size={15} />
          </button>
        </Show>
        <Show when={opts().expanded}>
          <button
            type="button"
            class={styles.iconButton}
            title={contentExpanded() ? "Collapse" : "Expand"}
            onClick={(e) => {
              e.stopPropagation();
              const next = !contentExpanded();
              setContentExpanded(next);
              setExpandedToastId(next ? rec().id : expandedToastId() === rec().id ? null : expandedToastId());
            }}
          >
            <SvgIcon name="chevrons-up" size={15} />
          </button>
        </Show>
        <Show when={opts().closeButton}>
          <button
            type="button"
            class={styles.iconButton}
            title="Close"
            onClick={(e) => {
              e.stopPropagation();
              dismissToast(rec().id, "close");
            }}
          >
            <SvgIcon name="x" size={15} />
          </button>
        </Show>
      </div>
    </div>
  );
}
