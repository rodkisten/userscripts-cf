import type { ReactNode } from "react";
import { componentClasses, searchCSS } from "./styles.js";
import { classNames } from "../ui/class-names.ts";
import { mountView } from "./runtime.tsx";
import workbenchOverrides2 from "../../../styles/workbench-overrides-2.css?inline";
import workbenchOverrides1 from "../../../styles/workbench-overrides-1.css?inline";
import { applyComponentStyle } from "../../../core/css.js";
import { RODX_SELECTORS, NATIVE_X_SELECTORS, DOM_SELECTORS } from "../../../selectors.js";
import {
  BLOCK_MEDIA,
  BLOCK_TYPES,
  GROUPS,
  IDENT,
  MAX_BLOCK_DEPTH,
  MAX_BLOCK_NODES,
  MAX_VISIBLE,
  SORTS,
  VERSION,
} from "../config/search.js";
import { Studio } from "../core/studio.js";
import { nativeSearch } from "../feeds/local-limits.js";
import { parseLocalDirectives } from "../feeds/local-rules.js";
import { identityLabel } from "../identity/account.js";
import { studioListIndex } from "../lists/access.tsx";
import { captureCurrent } from "../search/actions.js";
import { compactBlockTree, migrateLegacyTags, tray } from "../search/block-editing.js";
import {
  blockStats,
  copyFields,
  depthOfNode,
  emptyBlockTree,
  findBlockNode,
  newBlock,
  newBlockGroup,
  normalizeBlockTree,
} from "../search/blocks.js";
import { diagnosticSpans, highlightQuery, highlightWithIssues } from "../search/highlight.tsx";
import { QueryEngine, compileQuery } from "../search/query-compiler.js";
import { parseQueryBlocks } from "../search/query-parser.js";
import { analyzeDraft } from "../search/validation.js";
import { state } from "../state/deck.js";
import { gmAvailable } from "../storage/gm.js";
import { Relay } from "../telegram/relay.tsx";
import { XRepost } from "../tweets/publisher.tsx";
import { closePanel } from "./preferences.tsx";
import { onClick, onFieldChange, onFileChange, onGroupToggle } from "./events.tsx";

const cx = (value: string) => classNames(componentClasses, value);
const rootShadow = (): ShadowRoot | null => state.rootShadow as ShadowRoot | null;

// ============================================================================
// 1. EXTRAÇÃO: theme-and-styles.ts (Tema dinâmico do X e cache de Shadow DOM)
// ============================================================================

const shadowStyleCache = new WeakMap<ShadowRoot, Map<string, HTMLStyleElement>>();

export function applyXTheme(host: HTMLElement | null | undefined): void {
  if (!host) {
    return;
  }

  const element =
    document.querySelector<HTMLElement>(NATIVE_X_SELECTORS.primaryColumn) ||
    document.querySelector<HTMLElement>(DOM_SELECTORS.mainElement) ||
    document.body;

  const color = getComputedStyle(element).color || getComputedStyle(document.body).color;
  const rgb =
    color
      .match(/\d+(?:\.\d+)?/g)
      ?.slice(0, 3)
      .map(Number) ?? [];

  const isDarkTheme =
    rgb.length === 3
      ? rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 130
      : matchMedia("(prefers-color-scheme: dark)").matches;

  const palette = isDarkTheme
    ? ["#000000", "#16181c", "#202327", "#e7e9ea", "#71767b", "#2f3336"]
    : ["#ffffff", "#f7f9f9", "#eff3f4", "#0f1419", "#536471", "#eff3f4"];

  const tokens = ["bg", "hover", "raised", "text", "muted", "border"] as const;
  tokens.forEach((key, index) => {
    host.style.setProperty(`--rx-${key}`, palette[index], "important");
  });

  host.style.setProperty("--rx-surface", palette[0], "important");
  host.style.setProperty("--rx-accent", "#1d9bf0", "important");
  host.style.setProperty("--rx-accent-weak", "rgba(29,155,240,.11)", "important");
}

function ensureShadowStyles(root: ShadowRoot, styles: ReadonlyArray<readonly [string, string]>): void {
  let registered = shadowStyleCache.get(root);
  if (!registered) {
    registered = new Map();
    shadowStyleCache.set(root, registered);
  }

  for (const [key, css] of styles) {
    if (!css) {
      continue;
    }
    const existing = registered.get(key);
    if (existing?.isConnected && existing.textContent === css) {
      continue;
    }

    existing?.remove();
    const sheet = root.ownerDocument.createElement("style");
    sheet.dataset.rodxStylesheet = key;
    sheet.textContent = css;
    root.prepend(sheet);
    registered.set(key, sheet);
  }
}

export function ensureWorkbenchStyles(root: ShadowRoot, variant: "workspace" | "dock"): void {
  ensureShadowStyles(root, [
    ["search.module", searchCSS],
    [
      variant === "workspace" ? "workspace-overrides" : "dock-overrides",
      variant === "workspace" ? workbenchOverrides2 : workbenchOverrides1,
    ],
  ]);
}

// ============================================================================
// 2. EXTRAÇÃO: query-diagnostics.tsx (Preview, validação e parser nativo)
// ============================================================================

export function currentSearch() {
  return nativeSearch();
}

export function liveNativeQuery(): string {
  const input = document.querySelector<HTMLInputElement>(NATIVE_X_SELECTORS.nativeSearchInput);
  return input?.value?.trim() || nativeSearch()?.query || "";
}

export function inspectNativeQuery(query: unknown) {
  const text = String(query ?? "").trim();
  if (!text) {
    return { level: "idle", message: "Digite uma pesquisa", details: [] };
  }

  try {
    const blocks = parseQueryBlocks(text);
    const issues = analyzeDraft({ fields: copyFields(), blocks });
    const errors = issues.filter((item) => item.level === "error");
    const warnings = issues.filter((item) => item.level !== "error");

    if (errors.length) {
      return { level: "error", message: `${errors.length} erro(s)`, details: issues };
    }
    if (warnings.length) {
      return { level: "warning", message: `${warnings.length} aviso(s)`, details: issues };
    }
    return { level: "ok", message: "✓ Sintaxe OK", details: [] };
  } catch (error: any) {
    return {
      level: "error",
      message: "✕ Erro de parsing",
      details: [{ level: "error", message: error?.message || "Erro desconhecido" }],
    };
  }
}

export function displayPreview(): void {
  const root = rootShadow();
  if (!root || !state.draft) {
    return;
  }

  const el = root.querySelector<HTMLElement>(RODX_SELECTORS.queryPreview);
  if (!el) {
    return;
  }

  const issues = analyzeDraft(state.draft);
  const PLACEHOLDER = "Adicione hashtags, palavras, mídia ou filtros…";
  let query = "";

  try {
    query = compileQuery(state.draft.fields, state.draft.blocks) || PLACEHOLDER;
  } catch (error: any) {
    query = error?.message || "Erro ao compilar query";
  }

  const errors = issues.filter((i) => i.level === "error");
  el.classList.toggle("invalid", errors.length > 0);
  mountView(el, () => highlightQuery(query));

  const badIds = new Set(errors.flatMap((i) => i.ids));
  for (const node of root.querySelectorAll<HTMLElement>(RODX_SELECTORS.queryBlockOrChipNodes)) {
    const nodeId = node.dataset.blockNode || node.dataset.chipNode;
    const className = node.matches(RODX_SELECTORS.chipNodes) ? "bad" : "block-node-bad";
    node.classList.toggle(className, Boolean(nodeId && badIds.has(nodeId)));
  }

  const summary = root.querySelector<HTMLElement>(RODX_SELECTORS.analyzerSummary);
  if (summary) {
    summary.textContent = `${errors.length} erro(s) · ${issues.length - errors.length} aviso(s)`;
  }

  const pane = root.querySelector<HTMLElement>(RODX_SELECTORS.queryDiagnostics);
  if (pane) {
    mountView(pane, () =>
      issues.length ? (
        issues.map((issue, idx) => (
          <div key={`${issue.level}-${idx}`} className={cx("issue")} data-level={issue.level}>
            {issue.level === "error" ? "✕" : "⚠"} {issue.message}
            {issue.ids[0] && (
              <>
                {" "}
                <button className={cx("btn smol")} data-act="focus-block" data-id={issue.ids[0]}>
                  Ver bloco
                </button>
              </>
            )}
          </div>
        ))
      ) : (
        <div className={cx("issue")} data-level="ok">
          ✓ Query compilada sem conflitos detectados. A disponibilidade dos operadores depende do X.
        </div>
      ),
    );
  }

  const raw = root.querySelector<HTMLTextAreaElement>(RODX_SELECTORS.rawQueryField);
  if (raw && !state.rawDirty) {
    state.rawQueryDraft = query === PLACEHOLDER ? "" : query;
    raw.value = state.rawQueryDraft;
  }

  const colored = root.querySelector<HTMLElement>(RODX_SELECTORS.rawHighlight);
  if (colored) {
    mountView(colored, () => highlightQuery(raw?.value || ""));
  }
}

export function validateRawWorkbench(text: string) {
  const root = rootShadow();
  const target = root?.querySelector<HTMLElement>(RODX_SELECTORS.rawStatus);
  const colored = root?.querySelector<HTMLElement>(RODX_SELECTORS.rawHighlight);
  const list = root?.querySelector<HTMLElement>(RODX_SELECTORS.rawIssues);
  const issues = diagnosticSpans(text);

  if (colored) {
    mountView(colored, () => highlightWithIssues(text, issues));
  }

  let semantic: Array<{ level: string; message: string }> = [];
  try {
    const native = parseLocalDirectives(text).native;
    const blocks = native.trim() ? parseQueryBlocks(native) : emptyBlockTree();
    semantic = analyzeDraft({ fields: copyFields(), blocks });
  } catch (e: any) {
    if (!issues.some((i) => i.severity === "error")) {
      issues.push({
        start: 0,
        end: Math.min(text.length, 1),
        severity: "error",
        message: e?.message || "Erro de sintaxe",
        suggestion: "Confira os operadores booleanos e parênteses.",
      });
    }
  }

  for (const item of semantic) {
    issues.push({
      start: 0,
      end: 0,
      severity: item.level,
      message: item.message,
      suggestion: "Ajuste os blocos duplicados ou conflitantes.",
    });
  }

  if (target) {
    const errors = issues.filter((i) => i.severity === "error").length;
    target.textContent = errors
      ? `${errors} erro(s) · toque no diagnóstico para localizar`
      : issues.length
        ? `${issues.length} aviso(s)`
        : "✓ Sintaxe validada · filtros locais separados da busca X";

    target.style.setProperty(
      "color",
      errors ? "#f4212e" : issues.length ? "#e6a64b" : "#00ba7c",
      "important",
    );
  }

  if (list) {
    mountView(list, () =>
      issues.map((i, idx) => (
        <button
          key={`${i.start}-${i.end}-${idx}`}
          type="button"
          className={cx("rodx-issue-line")}
          data-raw-position={i.start}
          data-raw-end={i.end}
          data-level={i.severity}
        >
          {i.severity === "error" ? "✕" : "⚠"} {i.message}
          <small>{i.suggestion || ""}</small>
        </button>
      )),
    );
  }

  return issues;
}

// ============================================================================
// 3. EXTRAÇÃO: block-actions.ts (Manipulação e restauração atômica de blocos)
// ============================================================================

export function blankDraft() {
  return {
    name: "",
    icon: "⌕",
    pinned: true,
    sort: "live",
    resultLimit: 0,
    fields: copyFields(),
    blocks: emptyBlockTree(),
    presetName: "",
  };
}

export function addChips(value: string, focus = true): void {
  const pasted = QueryEngine.tags(value, true);
  const parts =
    pasted.length > 1
      ? pasted
      : String(value || "")
          .split(/[,;\n]+/)
          .map((x) => x.trim())
          .filter(Boolean);

  if (!parts.length) {
    return;
  }

  const t = tray();
  if (pasted.length > 1) {
    t.op = "OR";
  }

  if (blockStats(state.draft.blocks) + parts.length > MAX_BLOCK_NODES) {
    throw new Error("Limite de blocos atingido.");
  }

  for (let part of parts) {
    let type: "hashtag" | "phrase" = "hashtag";
    if (/^".*"$/.test(part)) {
      type = "phrase";
      part = part.slice(1, -1);
    } else if (/\s/.test(part)) {
      type = "phrase";
    }
    t.children.push(newBlock(type, part.replace(/^#/, "")));
  }

  const removed = compactBlockTree(state.draft.blocks);
  state.autoFixSummary = removed ? `${removed} duplicata(s) eliminada(s) automaticamente.` : "";

  renderTags();
  renderBlockEditor();

  if (focus) {
    rootShadow()?.querySelector<HTMLInputElement>(RODX_SELECTORS.chipInput)?.focus();
  }
}

export function modifyBlocks(action: string, id = ""): void {
  if (!state.draft) {
    return;
  }

  // Snapshot para restauração atômica caso o limite de nós seja ultrapassado
  const snapshot = structuredClone(state.draft.blocks);
  const root = state.draft.blocks;
  const match = findBlockNode(root, id);

  if (action === "block-clear") {
    root.children = [];
  } else if (action.startsWith("template-")) {
    const templates: Record<string, () => any> = {
      "template-tag-or-word": () => newBlockGroup("OR", [newBlock("hashtag"), newBlock("keyword")]),
      "template-tag-and-group": () =>
        newBlockGroup("AND", [
          newBlock("hashtag"),
          newBlockGroup("OR", [newBlock("hashtag"), newBlock("keyword")]),
        ]),
      "template-media-or": () =>
        newBlockGroup("OR", [newBlock("media", "images"), newBlock("media", "videos")]),
    };
    const group = templates[action]?.();
    if (group) {
      root.children.push(group);
    }
  } else if (action.startsWith("block-add-")) {
    if (!match || match.node.kind !== "group") {
      return;
    }

    const type = action.slice("block-add-".length);
    const depth = depthOfNode(root, id);

    if (type === "group") {
      if (depth >= MAX_BLOCK_DEPTH - 2) {
        throw new Error("Limite de profundidade de grupos atingido.");
      }
      match.node.children.push(newBlockGroup("OR", [newBlock()]));
    } else {
      const valid: Record<string, string> = { tag: "hashtag", keyword: "keyword", media: "media" };
      if (valid[type]) {
        match.node.children.push(newBlock(valid[type]));
      }
    }
  } else if (match?.parent) {
    const siblings = match.parent.children;
    const index = siblings.findIndex((item: any) => item.id === id);

    if (index !== -1) {
      if (action === "block-remove") {
        siblings.splice(index, 1);
      } else if (action === "block-up" && index > 0) {
        [siblings[index - 1], siblings[index]] = [siblings[index], siblings[index - 1]];
      } else if (action === "block-down" && index < siblings.length - 1) {
        [siblings[index + 1], siblings[index]] = [siblings[index], siblings[index + 1]];
      }
    }
  }

  if (blockStats(root) > MAX_BLOCK_NODES) {
    state.draft.blocks = normalizeBlockTree(snapshot);
    throw new Error(`Máximo de ${MAX_BLOCK_NODES} blocos por busca.`);
  }

  renderBlockEditor();
}

export function editNativeSearch(): void {
  captureCurrent();
  state.message = "Busca convertida em blocos editáveis. Operadores desconhecidos ficam como blocos livres.";
  renderRoot();
}

// ============================================================================
// 4. EXTRAÇÃO: components/fields-and-tags.tsx
// ============================================================================

export function renderField([key, title, type, data]: [string, string, string, any]): ReactNode {
  const value = state.draft.fields[key] ?? "";
  const attr = { "data-field": key };

  let ctrl: ReactNode;
  if (type === "select") {
    ctrl = (
      <select className={cx("ctrl")} {...attr} value={value}>
        {data.map(([id, label]: [string, string]) => (
          <option key={id} value={id} selected={id === value}>
            {label}
          </option>
        ))}
      </select>
    );
  } else if (type === "textarea") {
    ctrl = <textarea className={cx("ctrl")} {...attr} placeholder={data} rows={3} value={value} />;
  } else {
    ctrl = (
      <input
        className={cx("ctrl")}
        {...attr}
        type={type}
        value={value}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "1" : undefined}
        placeholder={data}
      />
    );
  }

  return (
    <div key={key} className={cx(`field ${type === "textarea" ? "wide" : ""}`)}>
      <label>{title}</label>
      {ctrl}
    </div>
  );
}

export function TagTray() {
  migrateLegacyTags(state.draft);
  const target = tray();
  const issues = analyzeDraft(state.draft);
  const bad = new Set(issues.filter((i) => i.level === "error").flatMap((i) => i.ids));
  const icons: Record<string, string> = { hashtag: "＃", keyword: "⌕", phrase: "“”" };

  return (
    <section className={cx("chip-tray")} aria-label="Editor de hashtags e termos">
      <div className={cx("row rx-search-workbench-row")}>
        <h2 className={cx("hero-title")}>＃ Hashtags e palavras</h2>
        <button className={cx("op-pill")} data-act="toggle-tray" title="Alternar entre E e OU">
          {target.op === "OR" ? "OU (OR)" : "E (AND)"} ⇄
        </button>
      </div>

      <p className={cx("hero-sub")}>
        Digite normalmente e separe por <strong>vírgula</strong> ou Enter. Toque num chip para alternar entre
        hashtag → palavra → frase exata. ✎ edita.
      </p>

      <div className={cx("chip-entry")} data-chip-entry="">
        {target.children.map((block: any) => (
          <span
            key={block.id}
            className={cx(`term-chip ${bad.has(block.id) ? "bad" : ""}`)}
            data-kind={block.type}
            data-chip-node={block.id}
          >
            <button className={cx("chip-main")} title="Trocar tipo" data-act="chip-cycle" data-id={block.id}>
              {icons[block.type] || "⌕"}{" "}
              {block.type === "hashtag"
                ? `#${block.value.replace(/^#/, "")}`
                : block.type === "phrase"
                  ? `“${block.value}”`
                  : block.value}
            </button>
            <button className={cx("chip-edit")} title="Editar valor" data-act="chip-edit" data-id={block.id}>
              ✎
            </button>
            <button className={cx("chip-x")} title="Remover" data-act="chip-remove" data-id={block.id}>
              ×
            </button>
          </span>
        ))}
        <input
          data-chip-input=""
          aria-label="Adicionar hashtags separadas por vírgulas"
          placeholder="#hashtag, outra, palavra…"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className={cx("row rx-search-workbench-row-margin-top")}>
        <span className={cx("inline-label")}>
          {target.children.length} termo(s) · toque no operador para mudar a combinação
        </span>
      </div>
    </section>
  );
}

export function renderTags(): void {
  const container = rootShadow()?.querySelector<HTMLElement>(RODX_SELECTORS.tagTray);
  if (container && state.draft) {
    mountView(container, () => <TagTray />);
  }
}

// ============================================================================
// 5. EXTRAÇÃO: components/presets-and-selections.tsx
// ============================================================================

export function SelectionList() {
  return (
    <section className={cx("rodx-selection-list rx-search-workbench-rodx-selection-list")}>
      <div className={cx("row rx-search-workbench-row-align-items")}>
        <strong>Seleções guardadas</strong>
        <span className={cx("muted rx-search-workbench-muted")}>({state.selectionList.length})</span>
      </div>

      <p className={cx("muted")}>
        Selecione uma palavra no post ou {"{uma frase inteira}"}, e guarde aqui para reutilizar.
      </p>

      <div className={cx("row rx-search-workbench-row-flex-wrap-gap")}>
        {state.selectionList.length ? (
          state.selectionList.map((term: string, index: number) => (
            <span key={`${term}-${index}`} className={cx("chip rx-search-workbench-chip")}>
              <span>{term}</span>
              <button
                className={cx("btn mini")}
                title="Adicionar à pesquisa"
                data-act="selection-use"
                data-index={index}
              >
                +
              </button>
              <button
                className={cx("btn mini")}
                title="Excluir da pesquisa"
                data-act="selection-exclude"
                data-index={index}
              >
                −
              </button>
              <button
                className={cx("btn mini")}
                title="Remover da lista"
                data-act="selection-delete"
                data-index={index}
              >
                ×
              </button>
            </span>
          ))
        ) : (
          <span className={cx("muted")}>Nenhuma seleção ainda.</span>
        )}
      </div>
    </section>
  );
}

export function Presets() {
  return (
    <>
      <SelectionList />
      <section className={cx("preset-shelf")} aria-label="Biblioteca de presets">
        <h3>Presets e baselines ({state.presets.length})</h3>
        <p className={cx("muted")}>
          Salve uma query como receita reutilizável. Combine várias com E/OU e acrescente novas hashtags sem
          alterar a receita original.
        </p>

        {state.presets.length ? (
          state.presets.map((preset: any) => (
            <div key={preset.id} className={cx("preset-card")}>
              <div className={cx("preset-name")}>
                <strong>✦ {preset.name}</strong>
                <span className={cx("spacer")} />
                <span className={cx("inline-label")}>
                  {new Date(preset.updatedAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
              <div className={cx("query-sm")}>{preset.query}</div>
              <div className={cx("preset-list")}>
                <button className={cx("btn primary")} data-act="preset-insert" data-id={preset.id}>
                  ＋ Adicionar à busca
                </button>
                <button className={cx("btn")} data-act="preset-edit" data-id={preset.id}>
                  Editar base
                </button>
                <button className={cx("btn danger")} data-act="preset-delete" data-id={preset.id}>
                  Excluir
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className={cx("muted")}>
            Nenhum preset salvo. Monte uma query no Editor e toque em Salvar preset.
          </p>
        )}

        <div className={cx("row")}>
          <button className={cx("btn primary")} data-act="view-editor">
            🧩 Abrir editor
          </button>
        </div>
      </section>
    </>
  );
}

export function PresetShelf() {
  return (
    <section className={cx("preset-shelf")}>
      <h3>✦ Inserir presets</h3>
      <div className={cx("preset-list")}>
        {state.presets.length ? (
          state.presets.map((p: any) => (
            <button key={p.id} className={cx("btn smol")} data-act="preset-insert" data-id={p.id}>
              ＋ {p.name}
            </button>
          ))
        ) : (
          <span className={cx("muted")}>Salve uma base abaixo para reutilizá-la depois.</span>
        )}
      </div>

      <div className={cx("row rx-search-workbench-row-margin-top-margin-top-11px")}>
        <input
          className={cx("ctrl rx-search-workbench-ctrl")}
          maxLength={100}
          data-preset-name=""
          value={state.draft.presetName || ""}
          placeholder="Nome da base · Ex.: Mídia + hashtags"
        />
        <button className={cx("btn primary")} data-act="preset-save">
          {state.presetEditingId ? "Atualizar preset" : "Salvar preset"}
        </button>
        {state.presetEditingId && (
          <button className={cx("btn")} data-act="preset-save-new">
            Salvar como novo
          </button>
        )}
      </div>

      <p className={cx("inline-label")}>
        Cada base salva a expressão completa atual. Inserir uma base cria novos blocos independentes para você
        personalizar.
      </p>
    </section>
  );
}

// ============================================================================
// 6. EXTRAÇÃO: components/block-builder.tsx
// ============================================================================

export function blockValueHTML(block: any): ReactNode {
  if (block.type === "media") {
    return (
      <select className={cx("ctrl")} data-block-value={block.id} value={block.value}>
        <option value="">Selecione mídia…</option>
        {BLOCK_MEDIA.map(([key, label]) => (
          <option key={key} value={key} selected={key === block.value}>
            {label}
          </option>
        ))}
      </select>
    );
  }

  const examples: Record<string, string> = {
    hashtag: "#fotografia",
    keyword: "retrato",
    phrase: "minha frase",
    author: "@NASA",
    raw: "min_faves:100",
  };

  return (
    <input
      className={cx("ctrl")}
      data-block-value={block.id}
      aria-label="Valor do bloco"
      value={block.value}
      placeholder={examples[block.type] || ""}
    />
  );
}

export function blockHTML(block: any, depth = 0, isRoot = false): ReactNode {
  if (block.kind === "term") {
    return (
      <div key={block.id} className={cx("block-term")} data-block-node={block.id}>
        <select
          className={cx("ctrl")}
          data-block-type={block.id}
          aria-label="Tipo do bloco"
          value={block.type}
        >
          {BLOCK_TYPES.map(([key, label]) => (
            <option key={key} value={key} selected={block.type === key}>
              {label}
            </option>
          ))}
        </select>

        {blockValueHTML(block)}

        <label className={cx("block-neg")} title="Excluir resultados que correspondem a este bloco">
          <input type="checkbox" data-block-not={block.id} checked={Boolean(block.not)} /> NÃO
        </label>

        <button
          className={cx("btn mini ghost")}
          data-act="block-up"
          data-id={block.id}
          title="Mover para cima"
        >
          ↑
        </button>
        <button
          className={cx("btn mini ghost")}
          data-act="block-down"
          data-id={block.id}
          title="Mover para baixo"
        >
          ↓
        </button>
        <button
          className={cx("btn mini danger")}
          data-act="block-remove"
          data-id={block.id}
          title="Remover bloco"
        >
          ×
        </button>
      </div>
    );
  }

  const visibleChildren = block.children.filter((c: any) => !c.tagTray);
  const maxDepthReached = depth >= MAX_BLOCK_DEPTH - 2;

  return (
    <section
      key={block.id}
      className={cx(`block-group ${isRoot ? "root" : ""} level-${depth}`)}
      data-block-node={block.id}
      aria-label="Grupo lógico"
    >
      <div className={cx("block-head")}>
        <span className={cx("block-head-title")}>{isRoot ? "GRUPO PRINCIPAL" : "Subgrupo"}</span>
        <span className={cx("hint-small")}>Combinar com</span>
        <button
          className={cx("op-pill")}
          data-act="block-toggle-op"
          data-id={block.id}
          aria-label="Alternar operador lógico do grupo"
        >
          {block.op === "AND" ? "E (AND)" : "OU (OR)"} ⇄
        </button>

        {!isRoot && (
          <>
            <button
              className={cx("op-pill")}
              data-act="block-toggle-not"
              data-id={block.id}
              title="Excluir este grupo"
            >
              {block.not ? "NÃO ativo" : "NÃO"}
            </button>
            <span className={cx("spacer")} />
            <button className={cx("btn mini ghost")} data-act="block-up" data-id={block.id}>
              ↑
            </button>
            <button className={cx("btn mini ghost")} data-act="block-down" data-id={block.id}>
              ↓
            </button>
            <button className={cx("btn mini danger")} data-act="block-remove" data-id={block.id}>
              ×
            </button>
          </>
        )}
      </div>

      <div className={cx("block-content")}>
        {visibleChildren.length ? (
          visibleChildren.map((child: any, i: number) => (
            <div key={child.id}>
              {i > 0 && (
                <div className={cx("block-join")}>
                  <button className={cx("op-pill")} data-act="block-toggle-op" data-id={block.id}>
                    {block.op === "OR" ? "OU ⇄" : "E ⇄"}
                  </button>
                </div>
              )}
              {blockHTML(child, depth + 1)}
            </div>
          ))
        ) : (
          <div className={cx("block-empty")}>
            Adicione abaixo palavras, mídia e grupos, ou use o campo de hashtags acima.
          </div>
        )}
      </div>

      <div className={cx("builder-buttons rx-search-workbench-builder-buttons")}>
        <button className={cx("btn mini quick-add")} data-act="block-add-tag" data-id={block.id}>
          ＋ Hashtag
        </button>
        <button className={cx("btn mini")} data-act="block-add-keyword" data-id={block.id}>
          ＋ Palavra
        </button>
        <button className={cx("btn mini")} data-act="block-add-media" data-id={block.id}>
          ＋ Mídia
        </button>
        <button
          className={cx("btn mini")}
          data-act="block-add-group"
          data-id={block.id}
          disabled={maxDepthReached}
          title={maxDepthReached ? "Limite de subgrupos" : undefined}
        >
          ＋ ( Grupo )
        </button>
      </div>
    </section>
  );
}

export function BlockBuilder() {
  return (
    <section className={cx("builder")} aria-label="Construtor de busca por blocos">
      <div className={cx("builder-header")}>
        <div>
          <h3 className={cx("hero-title")}>🧩 Montar query com blocos</h3>
          <p className={cx("hero-sub rx-search-workbench-hero-sub")}>
            Combine hashtags, palavras e mídia usando E, OU, NÃO e parênteses.
          </p>
        </div>
      </div>

      <div className={cx("builder-buttons rx-search-workbench-builder-buttons-margin-bottom")}>
        <button className={cx("btn mini quick-add")} data-act="template-tag-or-word">
          ＃ Hashtag OU palavra
        </button>
        <button className={cx("btn mini")} data-act="template-tag-and-group">
          ＃ E (＃ OU palavra)
        </button>
        <button className={cx("btn mini")} data-act="template-media-or">
          📷 Fotos OU vídeos
        </button>
        <button className={cx("btn mini danger")} data-act="block-clear">
          Limpar blocos
        </button>
      </div>

      <div data-blocks-container="">{blockHTML(state.draft.blocks, 0, true)}</div>

      <p className={cx("block-help")}>
        <strong>E</strong> exige as duas condições. <strong>OU</strong> aceita qualquer uma.{" "}
        <strong>NÃO</strong> exclui um termo. Grupos produzem <code>(... OR ...)</code>. Os filtros destacados
        acima e os filtros avançados entram como <strong>E</strong> com a expressão dos blocos.
      </p>
    </section>
  );
}

export function renderBlockEditor(): void {
  const container = rootShadow()?.querySelector<HTMLElement>(RODX_SELECTORS.blocksContainer);
  if (container && state.draft) {
    mountView(container, () => blockHTML(state.draft.blocks, 0, true));
  }
  displayPreview();
}

// ============================================================================
// 7. EXTRAÇÃO: components/views.tsx (Abas principais do Workspace)
// ============================================================================

export function SearchEditor() {
  const draft = state.draft;
  migrateLegacyTags(draft);

  return (
    <>
      <div className={cx("editor-top stack")}>
        <div className={cx("grid")}>
          <div className={cx("field wide")}>
            <label>Nome da timeline</label>
            <input
              className={cx("ctrl")}
              data-meta="name"
              maxLength={100}
              placeholder="Ex.: Tech Brasil, Notícias, Futebol"
              value={draft.name}
            />
          </div>
          <div className={cx("field")}>
            <label>Ícone / emoji</label>
            <input
              className={cx("ctrl")}
              data-meta="icon"
              maxLength={4}
              value={draft.icon}
              placeholder="🔎"
            />
          </div>
          <div className={cx("field")}>
            <label>Visualização padrão</label>
            <select className={cx("ctrl")} data-meta="sort" value={draft.sort}>
              {SORTS.map(([key, label]) => (
                <option key={key} value={key} selected={key === draft.sort}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={cx("field")}>
          <label>Máximo de posts visíveis (0 = ilimitado)</label>
          <input
            className={cx("ctrl")}
            type="number"
            min="0"
            max={MAX_VISIBLE}
            step="1"
            data-meta="resultLimit"
            value={draft.resultLimit}
          />
        </div>

        <label className={cx("tog")}>
          <input type="checkbox" data-meta="pinned" checked={Boolean(draft.pinned)} /> Mostrar como aba na
          Home
        </label>
      </div>

      <div data-tag-tray="">
        <TagTray />
      </div>

      <section className={cx("priority")} aria-label="Filtros de mídia">
        <h2 className={cx("hero-title")}>▣ Tipo de mídia</h2>
        <p className={cx("hero-sub")}>
          Filtro global aplicado à query inteira. Para mídias alternativas, use um grupo OU no builder.
        </p>
        <div className={cx("priority-grid")}>
          {renderField(["media", "Tipo de mídia", "select", [["any", "Qualquer postagem"], ...BLOCK_MEDIA]])}
        </div>
      </section>

      <div className={cx("query-lab")} data-lab="">
        <div className={cx("query-lab-top")}>
          <strong>⌕ Query em tempo real</strong>
          <div className={cx("row")}>
            <span className={cx("lab-status")} data-analyzer-summary="">
              Validando…
            </span>
            <button className={cx("btn smol")} data-act="copy-query" title="Copiar query">
              ⧉ Copiar
            </button>
          </div>
        </div>
        <code className={cx("query")} data-query-preview="" />
        <div className={cx("issues")} data-query-diagnostics="" />
      </div>

      <details className={cx("section")} data-raw-workbench="" open>
        <summary>⌘ Laboratório de parser · editar query manual</summary>
        <div className={cx("section-body workbench")}>
          <p className={cx("muted")}>
            Cole ou escreva uma query com <strong>AND, OR, NOT e parênteses</strong>. O diagnóstico sublinha o
            trecho incorreto e sugere a correção. <strong>links:domínio/**</strong>,{" "}
            <strong>linksre:/expressão/i</strong> e <strong>textre:/expressão/i</strong> são filtros locais
            que só atuam sobre posts carregados pelo X. Aplicar converte em blocos.
          </p>
          <textarea
            className={cx("ctrl raw-code")}
            data-raw-query=""
            spellCheck={false}
            placeholder="filter:media (#troconudes OR #troconuds)"
            value={state.rawDirty ? state.rawQueryDraft : ""}
          />
          <div className={cx("raw-preview")} data-raw-highlight="" />
          <div className={cx("rodx-issues")} data-raw-issues="" />
          <div className={cx("inline-label")} data-raw-status="">
            Pronto para analisar.
          </div>
          <div className={cx("row")}>
            <button className={cx("btn primary")} data-act="raw-apply">
              ↳ Aplicar como blocos
            </button>
            <button className={cx("btn")} data-act="raw-sync">
              Usar query gerada
            </button>
          </div>
        </div>
      </details>

      <PresetShelf />
      <BlockBuilder />

      {GROUPS.map((group) => (
        <details
          key={group.id}
          className={cx("section")}
          data-group={group.id}
          open={state.openedGroups.has(group.id)}
        >
          <summary>
            {group.icon} &nbsp;{group.title}
          </summary>
          <div className={cx("section-body")}>
            <div className={cx("grid")}>{group.fields.map(renderField)}</div>
          </div>
        </details>
      ))}

      <p className={cx("muted hint")}>
        O campo livre aceita qualquer operador do buscador web do X. Alguns filtros experimentais podem
        depender de alterações da plataforma. A data final é tratada como inclusiva.
      </p>

      <button className={cx("btn rx-search-workbench-btn")} data-act="block-fix">
        ✦ Corrigir duplicatas e filtros redundantes com segurança
      </button>
    </>
  );
}

export function SavedSearches() {
  if (!state.searches.length) {
    return (
      <div className={cx("empty")}>
        Ainda não há pesquisas salvas.
        <br />
        <span className={cx("muted")}>
          Crie uma busca avançada ou importe uma pesquisa que já esteja aberta.
        </span>
        <br />
        <button className={cx("btn primary rx-search-workbench-btn-margin-top")} data-act="new">
          Criar primeira pesquisa
        </button>
      </div>
    );
  }

  return (
    <>
      <SelectionList />
      <div className={cx("row rx-search-workbench-row-margin-bottom")}>
        <button className={cx("btn primary")} data-act="new">
          + Nova pesquisa
        </button>
        <button className={cx("btn")} data-act="capture" disabled={!currentSearch()}>
          Salvar busca atual
        </button>
      </div>

      {state.searches.map((s: any, i: number) => (
        <article key={s.id} className={cx("saved-item")}>
          <div className={cx("saved-top")}>
            <div className={cx("saved-title")}>
              {s.icon} {s.name}
            </div>
            {s.pinned && <span className={cx("chip")}>Na Home</span>}
            <span className={cx("chip")}>{SORTS.find(([key]) => key === s.sort)?.[1] || "Recentes"}</span>
          </div>

          <div className={cx("query-sm")}>{s.query}</div>
          <div className={cx("muted")}>
            {s.resultLimit ? `Até ${s.resultLimit} posts visíveis` : "Exibição ilimitada"} ·{" "}
            {s.sort === "live" ? "Recentes" : "Busca nativa"}
          </div>

          <div className={cx("saved-actions")}>
            <button className={cx("btn smol primary")} data-act="open-search" data-id={s.id}>
              Ver
            </button>
            {s.sort !== "live" && (
              <button className={cx("btn smol")} data-act="open-recent" data-id={s.id}>
                Recentes
              </button>
            )}
            <button className={cx("btn smol")} data-act="edit" data-id={s.id}>
              Editar
            </button>
            <button className={cx("btn smol")} data-act="pin" data-id={s.id}>
              {s.pinned ? "Desafixar" : "Fixar"}
            </button>
            <button className={cx("btn smol")} data-act="duplicate" data-id={s.id}>
              Duplicar
            </button>
            <button className={cx("btn smol")} data-act="up" data-id={s.id} disabled={i === 0}>
              ↑
            </button>
            <button
              className={cx("btn smol")}
              data-act="down"
              data-id={s.id}
              disabled={i === state.searches.length - 1}
            >
              ↓
            </button>
            <button className={cx("btn smol danger")} data-act="delete" data-id={s.id}>
              Excluir
            </button>
          </div>
        </article>
      ))}
    </>
  );
}

export function DataSettings() {
  return (
    <div className={cx("stack")}>
      <div className={cx("banner")}>
        Os dados abaixo pertencem exclusivamente à conta <strong>{identityLabel()}</strong>. Não há
        sincronização com os servidores do X.
      </div>

      <section className={cx("section")}>
        <div className={cx("section-body")}>
          <strong>☁ Sincronização pessoal no D1</strong>
          <p className={cx("muted")}>
            Pesquisas, presets, configurações visuais, histórico e vistos ficam separados por pessoa e por
            conta do X. A chave pessoal é diferente do token compartilhado de envio ao Telegram. O modo local
            continua funcionando sem ela.
          </p>
          <button className={cx("btn primary")} data-act="cloud-configure">
            Configurar chave pessoal
          </button>
          <p className={cx("muted")}>
            Peça uma chave <code>rodx_...</code> criada pelo provisionamento do relay. Nunca coloque o token
            do Telegram aqui.
          </p>
        </div>
      </section>

      <div className={cx("line")} />

      <strong>Backup das suas pesquisas</strong>
      <p className={cx("muted")}>
        Exporte um JSON de todas as pesquisas desta conta e importe no outro navegador ou dispositivo. A
        importação nunca modifica pesquisas de outra conta.
      </p>
      <button className={cx("btn")} data-act="export" disabled={!state.account}>
        ↓ Exportar JSON
      </button>

      <div className={cx("line")} />

      <div className={cx("field")}>
        <label>Importar arquivo .json</label>
        <input className={cx("ctrl")} type="file" data-file="import" accept="application/json,.json" />
      </div>

      <div className={cx("field")}>
        <label>Estratégia de importação</label>
        <select className={cx("ctrl")} data-import-strategy="">
          <option value="merge">Mesclar (mantém as pesquisas atuais)</option>
          <option value="replace">Substituir tudo nesta conta</option>
        </select>
      </div>

      <p className={cx("muted")}>
        Se IDs coincidirem, a pesquisa importada substituirá a existente na opção Mesclar. Faça um backup
        antes de substituir tudo.
      </p>

      <div className={cx("line")} />

      <strong>Armazenamento</strong>
      <p className={cx("muted")}>
        Motor em uso:{" "}
        <strong>
          {gmAvailable
            ? "GM storage (compartilhado entre x.com e twitter.com)"
            : "localStorage (separado por domínio)"}
        </strong>
        . Identidade: <strong>{state.accountSource || "não detectada"}</strong>. Identificação de conta é
        feita pelo perfil do usuário logado visível na interface. Se o identificador de sessão não estiver
        acessível, o script usa o perfil conectado.
      </p>

      <div className={cx("field")}>
        <label>Conta manual (fallback para iPhone / layout sem perfil)</label>
        <div className={cx("row")}>
          <input
            className={cx("ctrl rx-search-workbench-ctrl-flex")}
            data-manual-account=""
            placeholder="@meuusuario"
            maxLength={16}
          />
          <button className={cx("btn")} data-act="set-manual-account">
            Usar conta
          </button>
        </div>
        <p className={cx("muted")}>
          Use apenas se a detecção automática falhar. Ao trocar de conta, selecione a conta correta. Nenhum
          token de sessão é salvo.
        </p>
      </div>

      <p className={cx("muted")}>RodX Search Deck v{VERSION} · Atalho: Alt + Shift + S</p>
    </div>
  );
}

export function VisualSettings() {
  const v = state.visual;
  const studioModules = {
    lists: "Listas, membros e fila",
    profile: "Listas no perfil",
    layout: "Perfil compacto e barra do tweet",
    media: "Player e reprodução",
    links: "Links e Telegram",
    translation: "Tradução",
    hygiene: "Limpeza da interface",
    customTimeline: "Timeline própria das listas (opcional)",
  };

  return (
    <section className={cx("rodx-visual")} aria-label="Personalização da interface">
      <h2 className={cx("hero-title")}>RodX Studio · módulos e desempenho</h2>
      <p className={cx("muted")}>
        {Studio.state.network.ready
          ? "Ponte única de rede ativa"
          : Studio.state.network.error || "Aguardando ponte de rede"}
      </p>

      <div className={cx("grp")}>
        {Object.entries(studioModules).map(([key, label]) => (
          <label key={key} className={cx("tog")}>
            <input type="checkbox" data-studio-module={key} checked={Boolean(Studio.config.modules[key])} />
            {label}
          </label>
        ))}
      </div>

      <div className={cx("field")}>
        <label>Orçamento entre módulos (ms)</label>
        <input type="number" min="3" max="12" data-studio-budget="" value={Studio.config.budgetMs} />
      </div>

      <div className={cx("field")}>
        <label>Agrupar atualizações do DOM (ms)</label>
        <input type="number" min="60" max="500" data-studio-delay="" value={Studio.config.scanDelayMs} />
      </div>

      <div className={cx("field")}>
        <label>Meia-vida da frequência/recência de listas (dias)</label>
        <input
          type="number"
          min="1"
          max="180"
          data-studio-half-life=""
          value={Studio.config.frecencyHalfLifeDays || 14}
        />
      </div>

      <button data-act="runtime-apply">Aplicar módulos e recarregar</button>
      <button data-act="runtime-diagnostics">Copiar diagnóstico de desempenho</button>

      <h2 className={cx("hero-title")}>Aparência da timeline</h2>
      <p className={cx("muted")}>
        Tamanho de fonte, densidade e hashtags acompanham Home, buscas, perfis, bookmarks e threads. O input
        nativo do X permanece sem alterações de layout.
      </p>

      <div className={cx("field")}>
        <label>
          Espaçamento <strong data-visual-value="density">{v.density.toFixed(1)}×</strong>
        </label>
        <input type="range" min="0.55" max="1.4" step="0.05" value={v.density} data-visual="density" />
      </div>

      <div className={cx("field")}>
        <label>
          Fonte dos resultados <strong data-visual-value="font">{v.font}px</strong>
        </label>
        <input type="range" min="11" max="19" step="1" value={v.font} data-visual="font" />
      </div>

      <label className={cx("tog")}>
        <input type="checkbox" data-visual="snap" checked={Boolean(v.snap)} /> Encaixe suave ao rolar (global)
      </label>
      <label className={cx("tog")}>
        <input type="checkbox" data-visual="compact" checked={Boolean(v.compact)} /> Usar densidade compacta
        (tweets começam expandidos)
      </label>
      <label className={cx("tog")}>
        <input type="checkbox" data-visual="colorfulTags" checked={Boolean(v.colorfulTags)} /> Hashtags com
        fundo colorido
      </label>
      <label className={cx("tog")}>
        <input type="checkbox" data-visual="blockTweetOpen" checked={Boolean(v.blockTweetOpen)} /> Bloquear
        abertura do tweet ao tocar no conteúdo (desmarcar restaura o clique nativo)
      </label>
      <label className={cx("tog")}>
        <input type="checkbox" data-visual="translatePosts" checked={Boolean(v.translatePosts)} /> Traduzir
        automaticamente quando o X oferecer tradução
      </label>
      <label className={cx("tog")}>
        <input type="checkbox" data-visual="translateForeignTags" checked={Boolean(v.translateForeignTags)} />{" "}
        Traduzir hashtags em outros idiomas (PT/ES/EN não recebem tradução)
      </label>

      <p className={cx("muted")}>
        A tradução das hashtags usa o serviço público do Google Translate, quando disponível. As hashtags
        originais no post não são alteradas. No Safari, pode haver bloqueio de rede.
      </p>

      <div className={cx("field")}>
        <label>Player de vídeo</label>
        <select className={cx("ctrl")} data-visual="playerMode" value={v.playerMode}>
          {[
            ["videojs", "Video.js 10.3.0 (padrão)"],
            ["twitter", "Player normal do X"],
            ["rodx", "Controles RodX"],
          ].map(([key, label]) => (
            <option key={key} value={key} selected={v.playerMode === key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <label className={cx("tog")}>
        <input type="checkbox" data-visual="videoMute" checked={Boolean(v.videoMute)} /> Vídeos sempre mudos,
        exceto ao tocar no volume
      </label>

      <p className={cx("muted")}>
        Resolução automática controlada pelo player do X (seletor desativado nesta versão).
      </p>

      <div className={cx("field")}>
        <label>
          Iniciar vídeo com{" "}
          <strong data-visual-value="autoPlayEnterPercent">{v.autoPlayEnterPercent}%</strong> da mídia visível
        </label>
        <input
          type="range"
          min="10"
          max="100"
          step="5"
          data-visual="autoPlayEnterPercent"
          value={v.autoPlayEnterPercent}
        />
      </div>

      <div className={cx("field")}>
        <label>
          Pausar depois que{" "}
          <strong data-visual-value="autoPauseExitPercent">{v.autoPauseExitPercent}%</strong> sair da tela
        </label>
        <input
          type="range"
          min="10"
          max="100"
          step="5"
          data-visual="autoPauseExitPercent"
          value={v.autoPauseExitPercent}
        />
      </div>

      <label className={cx("tog")}>
        <input type="checkbox" data-visual="swipeToCloseVideo" checked={Boolean(v.swipeToCloseVideo)} />{" "}
        Deslizar para baixo para sair do vídeo imersivo
      </label>

      <p className={cx("muted")}>
        O início e a pausa usam limiares separados para não ficar oscilando ao rolar. A reprodução automática
        ainda depende das permissões do Safari e do player do X.
      </p>

      <label className={cx("tog")}>
        <input type="checkbox" data-visual="hideSeen" checked={Boolean(v.hideSeen)} /> Ocultar tweets já
        vistos nesta conta
      </label>

      <div className={cx("field")}>
        <label>
          Quanto do tweet deve estar na tela para marcar visto{" "}
          <strong data-visual-value="viewedThreshold">{Math.round(v.viewedThreshold * 100)}%</strong>
        </label>
        <input
          type="range"
          min="0.35"
          max="0.9"
          step="0.05"
          value={v.viewedThreshold}
          data-visual="viewedThreshold"
        />
      </div>

      <div className={cx("field")}>
        <label>
          Tempo mínimo antes de registrar a leitura{" "}
          <strong data-visual-value="seenDelayMs">{(v.seenDelayMs / 1000).toFixed(1)}s</strong>
        </label>
        <input
          type="range"
          min="1000"
          max="8000"
          step="500"
          value={v.seenDelayMs}
          data-visual="seenDelayMs"
        />
      </div>

      <p className={cx("muted")}>
        O tweet só é marcado como visto depois de cumprir esse tempo visível e sair{" "}
        <strong>completamente</strong> da tela. Sair antes do tempo, trocar de aba ou ocultar o navegador não
        conta.
      </p>
    </section>
  );
}

// ============================================================================
// 8. EXTRAÇÃO: components/workspace.tsx (Modal principal do Deck)
// ============================================================================

export function Workspace() {
  const disabled = !state.account;
  if (state.view === "editor" && !state.draft) {
    state.draft = blankDraft();
  }

  const tabs: Array<{ act: string; label: string; view?: string }> = [
    { act: "view-saved", label: `Salvas (${state.searches.length})`, view: "saved" },
    { act: "view-editor", label: "Editor", view: "editor" },
    { act: "view-presets", label: `Presets (${state.presets.length})`, view: "presets" },
    { act: "view-relay", label: "Telegram", view: "relay" },
    { act: "view-xrepost", label: "Vídeos X", view: "xrepost" },
    { act: "view-network", label: "REDE" },
    { act: "lists-studio", label: "Listas e membros" },
    { act: "view-visual", label: "Preferências", view: "visual" },
    { act: "view-data", label: "Backup", view: "data" },
  ];

  const renderBody = () => {
    switch (state.view) {
      case "saved":
        return <SavedSearches />;
      case "editor":
        return <SearchEditor />;
      case "presets":
        return <Presets />;
      case "relay":
        return Relay.settingsHTML();
      case "xrepost":
        return XRepost.htmlView();
      case "visual":
        return <VisualSettings />;
      default:
        return <DataSettings />;
    }
  };

  const renderFooterActions = () => {
    if (state.view === "editor") {
      return (
        <>
          <button className={cx("btn primary")} data-act="save" disabled={disabled || state.busy}>
            {state.editingId ? "Salvar alterações" : "Salvar pesquisa"}
          </button>
          <button className={cx("btn")} data-act="preview-search">
            Testar
          </button>
          <button className={cx("btn")} data-act="capture" disabled={!currentSearch()}>
            Usar busca atual
          </button>
        </>
      );
    }
    if (state.view === "relay") {
      return (
        <>
          <button className={cx("btn primary")} data-act="relay-save">
            Salvar
          </button>
          <button className={cx("btn")} data-act="relay-health">
            Testar conexão
          </button>
        </>
      );
    }
    if (state.view === "xrepost") {
      return (
        <button className={cx("btn primary")} data-act="xrepost-refresh">
          Atualizar fila D1
        </button>
      );
    }
    return (
      <button className={cx("btn")} data-act="capture" disabled={!currentSearch()}>
        Capturar busca atual
      </button>
    );
  };

  return (
    <>
      <div className={cx("scrim")} data-act="close" />
      <section
        className={cx("panel")}
        style={{
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100dvh - 16px)",
          overflow: "hidden",
        }}
        role="dialog"
        aria-modal="true"
        data-view={state.view}
        aria-label="RodX Search Deck"
      >
        <div className={cx("panel-head")}>
          <div className={cx("head-row")}>
            <div>
              <div className={cx("brand")}>⌕ RodX Search Deck</div>
              <div className={cx("sub")}>Timelines e pesquisas avançadas para o X</div>
            </div>
            <div className={cx("row")}>
              <span className={cx("account")}>{identityLabel()}</span>
              <button className={cx("btn smol")} data-act="close" aria-label="Voltar ao X">
                ✕ Fechar
              </button>
            </div>
          </div>

          <div className={cx("tabs")} style={{ overflowX: "auto", flexWrap: "nowrap", touchAction: "pan-x" }}>
            {tabs.map((tab) => (
              <button
                key={tab.act}
                className={cx(`tab ${tab.view && state.view === tab.view ? "active" : ""}`)}
                data-act={tab.act}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className={cx("body")}
          data-scroll-area=""
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            touchAction: "pan-y",
          }}
        >
          {state.message && <div className={cx("message")}>{state.message}</div>}
          {state.storageWarning && <div className={cx("storage-warning")}>⚠ {state.storageWarning}</div>}
          {disabled && (
            <div className={cx("banner")}>
              Conta não detectada. Abra a aba Backup para definir manualmente o @usuário, caso o X esconda os
              dados da sessão.
            </div>
          )}
          {renderBody()}
        </div>

        {state.view === "editor" && state.saveError && (
          <div className={cx("save-feedback")} role="alert">
            ✕ Não foi possível salvar: {state.saveError}
          </div>
        )}

        <footer className={cx("foot")}>
          {renderFooterActions()}
          <span className={cx("spacer")} />
          <button className={cx("btn ghost")} data-act="close">
            Fechar
          </button>
        </footer>
      </section>
    </>
  );
}

// ============================================================================
// 9. EXTRAÇÃO: dock-and-lifecycle.tsx (Mount, Shadow DOM e Dock de navegação)
// ============================================================================

const boundDockShadows = new WeakSet<ShadowRoot>();

export function renderRoot(): void {
  const root = rootShadow();
  if (!root) {
    return;
  }

  applyXTheme(state.rootHost);

  const oldBody = root.querySelector<HTMLElement>(RODX_SELECTORS.workspaceScrollArea);
  const oldView = root.querySelector<HTMLElement>(RODX_SELECTORS.replPanel)?.dataset.view;
  const restoreScroll = Boolean(state.open && oldBody && oldView === state.view);
  const scrollTop = restoreScroll && oldBody ? oldBody.scrollTop : 0;

  mountView(root, () => (state.open ? <Workspace /> : ""));
  ensureWorkbenchStyles(root, "workspace");

  if (state.open) {
    applyComponentStyle(state.rootHost, "rx-search-workbench-rootHost", false);
    Studio.menu.panel("workspace", "RodX Studio", state.rootHost, closePanel);
  } else {
    Studio.menu.close("workspace");
  }

  if (restoreScroll) {
    const body = root.querySelector<HTMLElement>(RODX_SELECTORS.workspaceScrollArea);
    if (body) {
      body.scrollTop = scrollTop;
    }
  }

  if (state.open && state.view === "editor") {
    displayPreview();
    validateRawWorkbench(root.querySelector<HTMLTextAreaElement>(RODX_SELECTORS.rawQueryField)?.value || "");
  }
}

export function renderDock(): void {
  const dock = state.dockShadow as ShadowRoot | null;
  if (!dock) {
    return;
  }

  // Delegação única para listas do Studio (evita reatribuir onclick a cada render)
  if (!boundDockShadows.has(dock)) {
    boundDockShadows.add(dock);
    dock.addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLElement>(RODX_SELECTORS.studioListButtons);
      if (btn?.dataset.studioList) {
        Studio.navigate(`${studioListIndex(Studio)}/${btn.dataset.studioList}`);
      }
    });
  }

  applyXTheme(state.dockHost);
  const active = currentSearch();
  const pinned = state.searches.filter((search: any) => search.pinned);
  const onSearch = /^\/(?:search(?:\/|$)|hashtag\/)/.test(location.pathname);
  const horizontalScroll = dock.querySelector<HTMLElement>(RODX_SELECTORS.searchDock)?.scrollLeft || 0;

  mountView(dock, () => (
    <nav
      className={cx("dock")}
      data-route={onSearch ? "search" : "home"}
      aria-label="Timelines personalizadas"
    >
      <span className={cx("dock-caption")}>{onSearch ? "Pesquisas" : "Minha Home"}</span>
      <button data-act="home" className={cx(location.pathname === "/home" ? "active" : "")}>
        ⌂ Início
      </button>

      {pinned.map((search: any) => (
        <span key={search.id} className={cx("rodx-dock-item")} data-drag-id={search.id}>
          <button
            className={cx("rodx-drag-handle")}
            draggable={false}
            data-drag-handle={search.id}
            title="Segure e arraste para reorganizar"
            aria-label={`Reorganizar ${search.name}`}
          >
            ⠿
          </button>
          <button
            data-act="open-search"
            data-id={search.id}
            className={cx(active?.query === search.query && active.sort === search.sort ? "active" : "")}
            title={search.query}
          >
            {search.icon} {search.name}
          </button>
        </span>
      ))}

      {(Studio.services.lists?.quickLists() || []).map((list: any) => (
        <button key={list.id} data-studio-list={list.id} title={Studio.services.lists.displayName(list)}>
          ☷ {Studio.services.lists.displayName(list)}
        </button>
      ))}

      <button data-act="lists-studio">☷ Listas</button>
      <button data-act="new" className={cx("plus")} title="Criar timeline">
        + Criar
      </button>
      <button data-act="open" title="Organizar pesquisas">
        ⚙
      </button>
    </nav>
  ));

  ensureWorkbenchStyles(dock, "dock");

  const nav = dock.querySelector<HTMLElement>(RODX_SELECTORS.searchDock);
  if (nav) {
    nav.scrollLeft = horizontalScroll;
  }
}

export function initializeRoot(): void {
  // Evita duplicar o host caso initializeRoot seja chamado na restauração
  document.getElementById(`${IDENT}-root`)?.remove();

  const host = document.createElement("div");
  host.id = `${IDENT}-root`;
  applyComponentStyle(host, "rx-root-host", false);

  const shadow = host.attachShadow({ mode: "open" });

  shadow.addEventListener("click", onClick);
  shadow.addEventListener("input", onFieldChange);
  shadow.addEventListener("change", onFieldChange);
  shadow.addEventListener("change", onFileChange);
  shadow.addEventListener("toggle", onGroupToggle, true);

  shadow.addEventListener("keydown", (event) => {
    const input = (event.target as HTMLElement).closest?.(
      RODX_SELECTORS.chipInput,
    ) as HTMLInputElement | null;
    if (!input) {
      return;
    }

    const key = (event as KeyboardEvent).key;
    if ((key === "Enter" || key === "Tab") && input.value.trim()) {
      event.preventDefault();
      try {
        addChips(input.value);
      } catch (error: any) {
        state.message = error?.message || "Erro ao adicionar termo.";
        renderRoot();
      }
    } else if (key === "Backspace" && !input.value) {
      const t = tray();
      if (t?.children.length) {
        t.children.pop();
        renderTags();
        renderBlockEditor();
      }
    }
  });

  shadow.addEventListener("focusout", (event) => {
    const input = (event.target as HTMLElement).closest?.(
      RODX_SELECTORS.chipInput,
    ) as HTMLInputElement | null;
    if (input?.value.trim()) {
      try {
        addChips(input.value, false);
      } catch (error: any) {
        state.message = error?.message || "Erro ao adicionar termo.";
        renderRoot();
      }
    }
  });

  // Escape hatch para iOS: arrastar o cabeçalho para baixo volta para a timeline do X
  let yStart: number | null = null;
  shadow.addEventListener(
    "touchstart",
    (event) => {
      yStart = (event.target as HTMLElement).closest?.(RODX_SELECTORS.workspaceHeadRow)
        ? ((event as TouchEvent).touches[0]?.clientY ?? null)
        : null;
    },
    { passive: true },
  );

  shadow.addEventListener(
    "touchend",
    (event) => {
      if (yStart == null || !state.open) {
        return;
      }
      const delta = ((event as TouchEvent).changedTouches[0]?.clientY ?? yStart) - yStart;
      yStart = null;
      if (delta > 110) {
        state.open = false;
        renderRoot();
      }
    },
    { passive: true },
  );

  document.body.append(host);
  state.rootHost = host;
  state.rootShadow = shadow;
  renderRoot();
}
