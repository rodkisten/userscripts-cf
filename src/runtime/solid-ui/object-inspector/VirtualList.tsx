import type { JSX } from "@solidjs/web";
import {
  createSignal,
  For,
  onCleanup,
  createEffect,
} from "solid-js";
import { clamp, safeCall } from "./core";
import type {
  EntrySource,
  InspectorEntry,
  InternalRenderContext,
} from "./types";

interface VirtualListProps {
  source: EntrySource;
  context: InternalRenderContext;
  footer?: JSX.Element;
  renderRow: (entry: InspectorEntry | undefined, index: number) => JSX.Element;
}

export function VirtualList(props: VirtualListProps) {
  let bodyRef!: HTMLDivElement;

  const count = () => props.source.count;
  const estimatedHeight = () => props.context.options.virtualRowHeight;
  const overscan = () => props.context.options.virtualOverscan;

  let heights = new Float64Array(count());
  let offsets = new Float64Array(count() + 1);
  let offsetsDirty = true;

  const resetMetrics = () => {
    const n = count();
    heights = new Float64Array(n);
    heights.fill(estimatedHeight());
    offsets = new Float64Array(n + 1);
    offsetsDirty = true;
  };
  resetMetrics();

  const rebuildOffsets = () => {
    if (!offsetsDirty) return;
    const n = count();
    offsets[0] = 0;
    for (let i = 0; i < n; i++) {
      offsets[i + 1] = offsets[i] + heights[i];
    }
    offsetsDirty = false;
  };

  const getTotalHeight = () => {
    rebuildOffsets();
    return offsets[count()];
  };

  const getOffsetFor = (index: number) => {
    rebuildOffsets();
    return offsets[clamp(index, 0, count())];
  };

  const findIndexAtOffset = (offset: number): number => {
    rebuildOffsets();
    const n = count();
    if (n <= 1) return 0;

    const target = clamp(offset, 0, Math.max(0, offsets[n] - 1));
    let low = 0;
    let high = n;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (offsets[mid + 1] <= target) low = mid + 1;
      else high = mid;
    }
    return clamp(low, 0, n - 1);
  };

  const [range, setRange] = createSignal<{ start: number; end: number }>({
    start: 0,
    end: Math.min(count(), 30),
  });
  const [spacers, setSpacers] = createSignal<{ top: number; bottom: number }>({
    top: 0,
    bottom: Math.max(0, getTotalHeight() - getOffsetFor(Math.min(count(), 30))),
  });

  const observedRows = new Map<Element, number>();
  let rowObserver: ResizeObserver | null = null;
  let bodyObserver: ResizeObserver | null = null;
  let rafId: number | null = null;
  let lastBodyWidth = -1;
  let lastBodyHeight = -1;

  const updateViewport = (force = false) => {
    rafId = null;
    if (!bodyRef || count() <= 0) return;

    const scrollTop = bodyRef.scrollTop;
    const viewportHeight = Math.max(
      estimatedHeight(),
      bodyRef.clientHeight || props.context.options.virtualMaxHeight,
    );
    const firstVisible = findIndexAtOffset(scrollTop);
    const lastVisible = findIndexAtOffset(scrollTop + viewportHeight);
    const start = Math.max(0, firstVisible - overscan());
    const end = Math.min(count(), lastVisible + overscan() + 1);

    const prev = range();
    if (force || start !== prev.start || end !== prev.end) {
      setRange({ start, end });
    }

    setSpacers({
      top: getOffsetFor(start),
      bottom: Math.max(0, getTotalHeight() - getOffsetFor(end)),
    });
  };

  const scheduleUpdate = (force = false) => {
    if (rafId !== null) {
      if (!force) return;
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => updateViewport(force));
  };

  const getMeasuredHeight = (
    row: Element,
    entry?: ResizeObserverEntry,
  ): number => {
    const borderBoxSize = entry?.borderBoxSize as unknown;
    const blockSize = Array.isArray(borderBoxSize)
      ? (borderBoxSize[0] as ResizeObserverSize | undefined)?.blockSize
      : borderBoxSize && typeof borderBoxSize === "object"
        ? (borderBoxSize as ResizeObserverSize).blockSize
        : undefined;
    const measured = Number.isFinite(blockSize)
      ? Number(blockSize)
      : safeCall(() => row.getBoundingClientRect().height, estimatedHeight());

    return Math.max(estimatedHeight(), Math.ceil(measured));
  };

  createEffect(() => bodyRef, () => {
    if (typeof ResizeObserver === "function") {
      rowObserver = new ResizeObserver((entries) => {
        if (!bodyRef) return;
        const anchorIndex = findIndexAtOffset(bodyRef.scrollTop);
        const anchorDelta = bodyRef.scrollTop - getOffsetFor(anchorIndex);
        let changed = false;

        for (const entry of entries) {
          const idx = observedRows.get(entry.target);
          if (idx === undefined) continue;
          const h = getMeasuredHeight(entry.target, entry);
          if (Math.abs(heights[idx] - h) > 1) {
            heights[idx] = h;
            changed = true;
          }
        }

        if (changed) {
          offsetsDirty = true;
          const nextScrollTop = getOffsetFor(anchorIndex) + anchorDelta;
          if (Math.abs(bodyRef.scrollTop - nextScrollTop) > 1) {
            bodyRef.scrollTop = nextScrollTop;
          }
          scheduleUpdate(true);
        }
      });

      bodyObserver = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        const width = Math.round(rect?.width ?? bodyRef.clientWidth);
        const height = Math.round(rect?.height ?? bodyRef.clientHeight);
        if (width === lastBodyWidth && height === lastBodyHeight) return;
        lastBodyWidth = width;
        lastBodyHeight = height;
        scheduleUpdate(true);
      });

      bodyObserver.observe(bodyRef);
    }

    updateViewport(true);
    scheduleUpdate(true);
  });

  onCleanup(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rowObserver?.disconnect();
    bodyObserver?.disconnect();
    observedRows.clear();
  });

  const visibleIndices = () => {
    const { start, end } = range();
    const list: number[] = [];
    for (let i = start; i < end; i++) list.push(i);
    return list;
  };

  const attachRowObserver = (el: HTMLDivElement, index: number) => {
    observedRows.set(el, index);
    rowObserver?.observe(el);
    onCleanup(() => {
      rowObserver?.unobserve(el);
      observedRows.delete(el);
    });
  };

  return (
    <div
      ref={bodyRef}
      class="rod-inspector__body"
      data-virtualized="true"
      style={{
        "--rod-inspector-virtual-max-height": `${props.context.options.virtualMaxHeight}px`,
      }}
      onScroll={() => scheduleUpdate(false)}
    >
      <div
        class="rod-inspector__virtual-spacer"
        style={{ height: `${spacers().top}px` }}
      />
      <div class="rod-inspector__virtual-window">
        <For each={visibleIndices()}>
          {(index) => (
            <div
              ref={(el) => attachRowObserver(el, index)}
              class="rod-inspector__virtual-row"
              data-virtual-index={index}
            >
              {props.renderRow(props.source.get(index), index)}
            </div>
          )}
        </For>
      </div>
      <div
        class="rod-inspector__virtual-spacer"
        style={{ height: `${spacers().bottom}px` }}
      />
      {props.footer}
    </div>
  );
}
