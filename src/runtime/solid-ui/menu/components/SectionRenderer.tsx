import { createSignal, For, Show } from "solid-js";
import type { RodMenuContext, RodMenuField, RodMenuSection, SolidFieldRenderer } from "../types";
import { FieldRenderer } from "./FieldRenderer";
import styles from "../styles/Fields.module.css";

export interface SectionRendererProps {
  surfaceId: string;
  section: RodMenuSection;
  context: RodMenuContext<any>;
  customFieldTypes?: Readonly<Record<string, SolidFieldRenderer>>;
  onCommit: (field: RodMenuField, raw: unknown) => void;
  onError: (err: unknown) => void;
}

export function SectionRenderer(props: SectionRendererProps) {
  const [collapsed, setCollapsed] = createSignal(!!props.section.collapsed);

  const isBare = () =>
    !props.section.title &&
    !props.section.description &&
    props.section.fields.length > 0 &&
    props.section.fields.every((f) => f.chrome === "bare");

  const isVisible = () => {
    if (!props.section.visibleWhen) return true;
    try {
      return !!props.section.visibleWhen(props.context.values, props.context);
    } catch (err) {
      props.onError(err);
      return true;
    }
  };

  return (
    <Show when={isVisible()}>
      <section class={styles.section} data-section={props.section.id} data-bare={String(isBare())}>
        <Show when={props.section.title || props.section.description}>
          <div class={styles.sectionHead}>
            <Show
              when={props.section.collapsible}
              fallback={
                <div>
                  <Show when={props.section.title}>
                    <h3 class={styles.sectionTitle}>{props.section.title}</h3>
                  </Show>
                  <Show when={props.section.description}>
                    <p class={styles.sectionDescription}>{props.section.description}</p>
                  </Show>
                </div>
              }
            >
              <button type="button" class={styles.sectionToggle} onClick={() => setCollapsed((c) => !c)}>
                <div>
                  <Show when={props.section.title}>
                    <h3 class={styles.sectionTitle}>{props.section.title}</h3>
                  </Show>
                  <Show when={props.section.description}>
                    <p class={styles.sectionDescription}>{props.section.description}</p>
                  </Show>
                </div>
                <span>{collapsed() ? "+" : "−"}</span>
              </button>
            </Show>
          </div>
        </Show>

        <Show when={!collapsed()}>
          <div class={styles.fields}>
            <For each={props.section.fields}>
              {(field) => (
                <FieldRenderer
                  surfaceId={props.surfaceId}
                  field={field}
                  context={props.context}
                  customFieldTypes={props.customFieldTypes}
                  onCommit={props.onCommit}
                  onError={props.onError}
                />
              )}
            </For>
          </div>
        </Show>
      </section>
    </Show>
  );
}
