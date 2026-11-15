import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
  useContext,
} from "solid-js";
import { Portal, type JSX } from "@solidjs/web";
import {
  createEntrySource,
  getDomNodePreviewText,
  getElementPreviewParts,
  getObjectId,
  getObjectPreview,
  getPrimitiveClassName,
  getRectRelativeToWindow,
  isDomElement,
  isDomNode,
  isObjectLike,
  normalizeOptions,
  safeCall,
  safeKeyText,
  safePrimitiveText,
} from "./core";
import type {
  AccessorEntry,
  InspectorEntry,
  InternalRenderContext,
  ObjectInspectorProps,
  RodInspectorHighlightOptions,
  RodInspectorPropertyKey,
} from "./types";
import { VirtualList } from "./VirtualList";


interface HighlightTarget {
  element: Element;
  options: RodInspectorHighlightOptions;
}

interface InspectorActionsContextValue {
  highlightElement: (
    element: Element,
    options?: RodInspectorHighlightOptions,
  ) => void;
  clearHighlight: () => void;
  inspectElement: (element: Element) => void;
}

const InspectorActionsContext = createContext<InspectorActionsContextValue>(undefined as unknown as InspectorActionsContextValue);

function DomHighlightOverlay(props: {
  target: HighlightTarget | null;
  onExpire: () => void;
}) {
  const [rect, setRect] = createSignal<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  createEffect(() => props.target, (current) => {
    if (!current) {
      setRect(null);
      return;
    }

    let active = true;
    let rafId: number | null = null;
    let timerId: number | null = null;

    const update = () => {
      if (!active) return;
      if (!current.element.isConnected) {
        props.onExpire();
        return;
      }
      const nextRect = getRectRelativeToWindow(current.element, window);
      if (!nextRect) {
        props.onExpire();
        return;
      }
      setRect(nextRect);
      rafId = requestAnimationFrame(update);
    };

    update();

    const duration = current.options.duration ?? 850;
    if (duration > 0) {
      timerId = window.setTimeout(() => {
        if (active) props.onExpire();
      }, duration);
    }

    return () => {
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (timerId !== null) clearTimeout(timerId);
    };
  });

  return (
    <Show when={props.target && rect()}>
      {(box) => (
        <Portal>
          <div
            id="__rod-object-inspector-highlight__"
            aria-hidden="true"
            style={{
              all: "initial",
              display: "block",
              position: "fixed",
              left: `${box().left}px`,
              top: `${box().top}px`,
              width: `${Math.max(0, box().width)}px`,
              height: `${Math.max(0, box().height)}px`,
              "box-sizing": "border-box",
              "z-index": "2147483647",
              "pointer-events": "none",
              border: `1px solid ${props.target?.options.borderColor || "rgba(125, 211, 252, 1)"}`,
              background:
                props.target?.options.backgroundColor ||
                "rgba(56, 189, 248, 0.2)",
              "box-shadow":
                "0 0 0 1px rgba(0,0,0,.22), 0 8px 28px rgba(2,132,199,.16)",
              transition:
                "left 45ms linear, top 45ms linear, width 45ms linear, height 45ms linear",
            }}
          />
        </Portal>
      )}
    </Show>
  );
}

function PrimitiveNode(props: { value: unknown; quoteStrings: boolean }) {
  return (
    <span class={getPrimitiveClassName(props.value)}>
      {safePrimitiveText(props.value, props.quoteStrings)}
    </span>
  );
}

function DomSummaryNode(props: {
  node: Node;
  context: InternalRenderContext;
}) {
  const actions = useContext(InspectorActionsContext);

  if (!isDomElement(props.node)) {
    return (
      <span class="rod-token--meta">
        {getDomNodePreviewText(props.node, props.context.options)}
      </span>
    );
  }

  const element = props.node;
  const parts = () => getElementPreviewParts(element);

  return (
    <>
      <span>
        <span class="rod-dom-tag">&lt;{parts().tagName}</span>
        <Show when={parts().id}>
          <span class="rod-dom-id">#{parts().id}</span>
        </Show>
        <For each={parts().classes}>
          {(cls) => <span class="rod-dom-class">.{cls}</span>}
        </For>
        <span class="rod-dom-tag">&gt;</span>
        <span class="rod-token--meta"> #{getObjectId(element)}</span>
      </span>
      <button
        type="button"
        class="rod-inspector__inspect"
        aria-label="Inspect element on page"
        title="Inspect element on page"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          actions?.inspectElement(element);
        }}
        onPointerEnter={() =>
          actions?.highlightElement(element, { duration: 0 })
        }
        onPointerLeave={() => actions?.clearHighlight()}
        onBlur={() => actions?.clearHighlight()}
      >
        ◎
      </button>
    </>
  );
}

function PropertyKeyNode(props: { keyName: RodInspectorPropertyKey }) {
  return (
    <span
      class="rod-inspector__key"
      data-symbol={typeof props.keyName === "symbol" ? "true" : undefined}
    >
      {safeKeyText(props.keyName)}
    </span>
  );
}

function AccessorValueNode(props: {
  entry: AccessorEntry;
  context: InternalRenderContext;
}) {
  const [state, setState] = createSignal<
    | { status: "idle" }
    | { status: "resolved"; value: unknown }
    | { status: "error"; error: unknown }
  >({ status: "idle" });

  const invokeGetter = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!props.entry.getter || state().status !== "idle") return;

    try {
      const value = Reflect.apply(props.entry.getter, props.entry.owner, []);
      setState({ status: "resolved", value });
    } catch (error) {
      setState({ status: "error", error });
    }
  };

  const childContext = (): InternalRenderContext => ({
    ...props.context,
    depth: props.context.depth + 1,
    quoteStrings: true,
  });

  return (
    <span>
      <Show when={state().status === "idle"}>
        <button
          type="button"
          class="rod-inspector__getter"
          title={
            props.entry.getter ? "Invoke getter" : "Setter-only property"
          }
          aria-label={
            props.entry.getter ? "Invoke getter" : "Setter-only property"
          }
          disabled={!props.entry.getter}
          onClick={invokeGetter}
        >
          (…)
        </button>
        <Show when={props.entry.getter}>
          <span class="rod-inspector__badge">get</span>
        </Show>
        <Show when={props.entry.setter}>
          <span class="rod-inspector__badge">set</span>
        </Show>
      </Show>

      <Show when={state().status === "resolved"}>
        <ValueNode
          value={(state() as { status: "resolved"; value: unknown }).value}
          context={childContext()}
        />
      </Show>

      <Show when={state().status === "error"}>
        <span class="rod-token--warning">[Getter threw] </span>
        <ValueNode
          value={(state() as { status: "error"; error: unknown }).error}
          context={childContext()}
        />
      </Show>
    </span>
  );
}

function PropertyRow(props: {
  entry: InspectorEntry | undefined;
  context: InternalRenderContext;
}) {
  const childContext = (): InternalRenderContext => ({
    ...props.context,
    depth: props.context.depth + 1,
    quoteStrings: true,
  });

  return (
    <div class="rod-inspector__row">
      <Show
        when={props.entry}
        fallback={
          <span class="rod-token--warning">[Property unavailable]</span>
        }
      >
        {(entry) => {
          const item = entry();

          if (item.kind === "map-entry") {
            return (
              <>
                <PropertyKeyNode keyName={item.key} />
                <span class="rod-token--meta">: [</span>
                <ValueNode value={item.mapKey} context={childContext()} />
                <span class="rod-token--meta">] =&gt; </span>
                <ValueNode value={item.value} context={childContext()} />
              </>
            );
          }

          if (item.kind === "set-entry") {
            return (
              <>
                <PropertyKeyNode keyName={item.key} />
                <span class="rod-token--meta">: </span>
                <ValueNode value={item.value} context={childContext()} />
              </>
            );
          }

          return (
            <>
              <PropertyKeyNode keyName={item.key} />
              <span class="rod-token--meta">: </span>
              {item.kind === "accessor" ? (
                <AccessorValueNode entry={item} context={props.context} />
              ) : item.kind === "empty" ? (
                <span class="rod-inspector__meta">empty</span>
              ) : (
                <ValueNode value={item.value} context={childContext()} />
              )}
              <Show
                when={item.enumerable === false && item.kind !== "prototype"}
              >
                <span class="rod-inspector__badge">non-enum</span>
              </Show>
            </>
          );
        }}
      </Show>
    </div>
  );
}

function ObjectNode(props: {
  value: object;
  context: InternalRenderContext;
  rootClass?: string;
}) {
  const initiallyOpen = props.context.depth < props.context.options.expandDepth;
  const [isOpen, setIsOpen] = createSignal(initiallyOpen);
  const [hasBeenOpened, setHasBeenOpened] = createSignal(initiallyOpen);

  const shouldRenderBody = () =>
    props.context.options.unmountOnCollapse ? isOpen() : hasBeenOpened();

  const source = createMemo(() => {
    if (!shouldRenderBody()) return null;
    return createEntrySource(props.value, props.context.options);
  });

  const footerElement = (): JSX.Element => {
    const src = source();
    if (!src || !src.hasMore) return null;
    const remaining =
      src.total === null ? null : Math.max(0, src.total - src.count);
    const text =
      remaining === null
        ? "… more properties"
        : `… ${remaining} more ${remaining === 1 ? "property" : "properties"}`;
    return (
      <span class="rod-inspector__meta rod-inspector__footer">{text}</span>
    );
  };

  return (
    <details
      class={`rod-inspector ${props.rootClass ?? ""}`.trim()}
      data-theme={props.context.options.theme}
      open={initiallyOpen}
      onToggle={(e) => {
        const nextOpen = e.currentTarget.open;
        setIsOpen(nextOpen);
        if (nextOpen) setHasBeenOpened(true);
      }}
    >
      <summary>
        <Show
          when={isDomNode(props.value)}
          fallback={
            <span>{getObjectPreview(props.value, props.context.options)}</span>
          }
        >
          <DomSummaryNode
            node={props.value as Node}
            context={props.context}
          />
        </Show>
      </summary>

      <Show when={shouldRenderBody() && source()}>
        {(src) => {
          const entrySource = src();
          const useVirtual =
            props.context.options.virtualize &&
            entrySource.count >= props.context.options.virtualizeAfter;

          if (!entrySource.count) {
            return (
              <div class="rod-inspector__body">
                <span class="rod-inspector__meta">
                  {props.context.options.inspectItems === 0
                    ? "Inspection limit is 0"
                    : "No inspectable properties"}
                </span>
                {footerElement()}
              </div>
            );
          }

          if (useVirtual) {
            return (
              <VirtualList
                source={entrySource}
                context={props.context}
                footer={footerElement()}
                renderRow={(entry) => (
                  <PropertyRow entry={entry} context={props.context} />
                )}
              />
            );
          }

          const indices = Array.from({ length: entrySource.count }, (_, i) => i);
          return (
            <div class="rod-inspector__body">
              <For each={indices}>
                {(idx) => (
                  <PropertyRow
                    entry={entrySource.get(idx)}
                    context={props.context}
                  />
                )}
              </For>
              {footerElement()}
            </div>
          );
        }}
      </Show>
    </details>
  );
}

function ValueNode(props: {
  value: unknown;
  context: InternalRenderContext;
  rootClass?: string;
}) {
  if (!isObjectLike(props.value)) {
    return (
      <PrimitiveNode
        value={props.value}
        quoteStrings={props.context.quoteStrings}
      />
    );
  }

  if (props.context.ancestors.has(props.value)) {
    return (
      <span class="rod-token--circular">
        ↩ {getObjectPreview(props.value, props.context.options)}
      </span>
    );
  }

  if (props.context.depth >= props.context.options.inspectDepth) {
    return (
      <span class="rod-token--meta">
        {getObjectPreview(props.value, props.context.options)}
      </span>
    );
  }

  const nextAncestors = new Set(props.context.ancestors);
  nextAncestors.add(props.value);

  return (
    <ObjectNode
      value={props.value}
      context={{
        ...props.context,
        ancestors: nextAncestors,
      }}
      rootClass={props.rootClass}
    />
  );
}

export function ObjectInspector(props: ObjectInspectorProps) {
  const normalizedOptions = createMemo(() => normalizeOptions(props.options));
  const [highlightTarget, setHighlightTarget] =
    createSignal<HighlightTarget | null>(null);

  const actions: InspectorActionsContextValue = {
    highlightElement(element, options = {}) {
      if (!isDomElement(element) || !element.isConnected) {
        setHighlightTarget(null);
        return;
      }
      setHighlightTarget({
        element,
        options: {
          duration: normalizedOptions().highlightDuration,
          ...options,
        },
      });
    },
    clearHighlight() {
      setHighlightTarget(null);
    },
    inspectElement(element) {
      if (!element.isConnected) return;
      safeCall(() => {
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });
        return true;
      }, false);
      actions.highlightElement(element, {
        duration: normalizedOptions().highlightDuration,
      });
    },
  };

  const rootContext = (): InternalRenderContext => ({
    depth: 0,
    ancestors: new Set<object>(),
    quoteStrings: props.quoteStrings !== false,
    options: normalizedOptions(),
  });

  return (
    <InspectorActionsContext value={actions}>
      <ValueNode
        value={props.value}
        context={rootContext()}
        rootClass={props.class}
      />
      <DomHighlightOverlay
        target={highlightTarget()}
        onExpire={() => setHighlightTarget(null)}
      />
    </InspectorActionsContext>
  );
}
