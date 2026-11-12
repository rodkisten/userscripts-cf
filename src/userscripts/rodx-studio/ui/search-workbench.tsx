import { componentClasses } from "../styles/deck.js";
import { classNames } from "../ui/class-names.ts";
const cx = (value: string) => classNames(componentClasses, value);
import { mountView } from "./solid-mount.tsx";
import workbenchOverrides2 from "../../../styles/workbench-overrides-2.css?inline";
import workbenchOverrides1 from "../../../styles/workbench-overrides-1.css?inline";
import { applyComponentStyle } from "../../../core/css.js";
import { RODX_SELECTORS, NATIVE_X_SELECTORS, DOM_SELECTORS } from "../../../selectors.js";
import {
  BLOCK_MEDIA,
  BLOCK_TYPES,
  GROUPS,
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
import { studioListIndex } from "../lists/routes.js";
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
import { html } from "../shared/text.js";
import { state } from "../state/deck.js";
import { gmAvailable } from "../storage/gm.js";
import { CSS, CUSTOM_CSS } from "../styles/deck.js";
import { Relay } from "../telegram/relay.tsx";
import { XRepost } from "../tweets/publisher.tsx";
import { closePanel } from "./preferences.js";

export function currentSearch() {
  return nativeSearch();
}

export function displayPreview() {
  if (!state.rootShadow || !state.draft) return;
  const el = state.rootShadow.querySelector(RODX_SELECTORS.queryPreview);
  if (!el) return;
  const issues = analyzeDraft(state.draft);
  let query = "";
  try {
    query = compileQuery(state.draft.fields, state.draft.blocks);
    if (!query) query = "Adicione hashtags, palavras, mídia ou filtros…";
  } catch (error) {
    query = error.message;
  }
  el.classList.toggle(
    "invalid",
    issues.some((i) => i.level === "error"),
  );
  mountView(el, () => highlightQuery(query));
  const ids = new Set(issues.filter((i) => i.level === "error").flatMap((i) => i.ids));
  for (const node of state.rootShadow.querySelectorAll(RODX_SELECTORS.queryBlockOrChipNodes)) {
    node.classList.toggle(
      node.matches(RODX_SELECTORS.chipNodes) ? "bad" : "block-node-bad",
      ids.has(node.dataset.blockNode || node.dataset.chipNode),
    );
  }
  const summary = state.rootShadow.querySelector(RODX_SELECTORS.analyzerSummary);
  const errors = issues.filter((i) => i.level === "error");
  if (summary) summary.textContent = `${errors.length} erro(s) · ${issues.length - errors.length} aviso(s)`;
  const pane = state.rootShadow.querySelector(RODX_SELECTORS.queryDiagnostics);
  if (pane)
    mountView(pane, () =>
      issues.length ? (
        issues.map((issue) => (
          <>
            <div class={cx("issue")} data-level={issue.level}>
              {issue.level === "error" ? "✕" : "⚠"} {issue.message}
              {issue.ids[0] ? (
                <>
                  {" "}
                  <button class={cx("btn smol")} data-act={"focus-block"} data-id={issue.ids[0]}>
                    {"Ver bloco"}
                  </button>
                </>
              ) : (
                ""
              )}
            </div>
          </>
        ))
      ) : (
        <>
          <div class={cx("issue")} data-level={"ok"}>
            {"✓ Query compilada sem conflitos detectados. A disponibilidade dos operadores depende do X."}
          </div>
        </>
      ),
    );
  const raw = state.rootShadow.querySelector(RODX_SELECTORS.rawQueryField);
  if (raw && !state.rawDirty) {
    state.rawQueryDraft = query.startsWith("Adicione hashtags,") ? "" : query;
    raw.value = state.rawQueryDraft;
  }
  const colored = state.rootShadow.querySelector(RODX_SELECTORS.rawHighlight);
  if (colored) mountView(colored, () => highlightQuery(raw?.value || ""));
}

export function validateRawWorkbench(text) {
  const target = state.rootShadow?.querySelector(RODX_SELECTORS.rawStatus);
  const colored = state.rootShadow?.querySelector(RODX_SELECTORS.rawHighlight);
  const list = state.rootShadow?.querySelector(RODX_SELECTORS.rawIssues);
  const issues = diagnosticSpans(text);
  if (colored) mountView(colored, () => highlightWithIssues(text, issues));
  let semantic = [];
  try {
    const native = parseLocalDirectives(text).native;
    const blocks = native.trim() ? parseQueryBlocks(native) : emptyBlockTree();
    semantic = analyzeDraft({
      fields: copyFields(),
      blocks,
    });
  } catch (e) {
    if (!issues.some((i) => i.severity === "error"))
      issues.push({
        start: 0,
        end: Math.min(text.length, 1),
        severity: "error",
        message: e.message,
        suggestion: "Confira os operadores booleanos e parênteses.",
      });
  }
  for (const item of semantic)
    issues.push({
      start: 0,
      end: 0,
      severity: item.level,
      message: item.message,
      suggestion: "Ajuste os blocos duplicados ou conflitantes.",
    });
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
  if (list)
    mountView(list, () =>
      issues.map((i) => (
        <>
          <button
            type={"button"}
            class={cx("rodx-issue-line")}
            data-raw-position={i.start}
            data-raw-end={i.end}
            data-level={i.severity}
          >
            {"\n      "}
            {i.severity === "error" ? "✕" : "⚠"} {i.message}
            <small>{i.suggestion || ""}</small>
          </button>
        </>
      )),
    );
  return issues;
}

export function renderField([key, title, type, data]) {
  const value = state.draft.fields[key] ?? "";
  const attr = { "data-field": key };
  let ctrl: import("solid-js").Element = "";
  if (type === "select") {
    ctrl = (
      <>
        <select class={cx("ctrl")} {...attr}>
          {data.map(([id, label]) => (
            <>
              <option value={id} selected={(id === value ? "selected" : "") === "selected"}>
                {label}
              </option>
            </>
          ))}
        </select>
      </>
    );
  } else if (type === "textarea") {
    ctrl = (
      <>
        <textarea
          class={cx("ctrl")}
          {...attr}
          placeholder={data}
          rows={"3"}
          value={"\n          " + value + "\n        "}
        />
      </>
    );
  } else {
    ctrl = (
      <>
        <input
          class={cx("ctrl")}
          {...attr}
          type={type}
          value={value}
          min={type === "number" ? "0" : undefined}
          step={type === "number" ? "1" : undefined}
          placeholder={data}
        />
      </>
    );
  }
  return (
    <>
      <div class={cx(["field ", type === "textarea" ? "wide" : ""].join(""))}>
        {"\n      "}
        <label for={""}>{title}</label>
        {ctrl}
      </div>
    </>
  );
}

export function TagTray() {
  migrateLegacyTags(state.draft);
  const target = tray();
  const issues = analyzeDraft(state.draft);
  const bad = new Set(issues.filter((i) => i.level === "error").flatMap((i) => i.ids));
  const label = {
    hashtag: "＃",
    keyword: "⌕",
    phrase: "“”",
  };
  return (
    <>
      <section class={cx("chip-tray")} aria-label={"Editor de hashtags e termos"}>
        {"\n      "}
        <div class={cx("row rx-search-workbench-row")}>
          {"\n        "}
          <h2 class={cx("hero-title")}>{"＃ Hashtags e palavras"}</h2>
          {"\n        "}
          <button class={cx("op-pill")} data-act={"toggle-tray"} title={"Alternar entre E e OU"}>
            {target.op === "OR" ? "OU (OR)" : "E (AND)"}
            {" ⇄"}
          </button>
          {"\n      "}
        </div>
        {"\n      "}
        <p class={cx("hero-sub")}>
          {"Digite normalmente e separe por "}
          <strong>{"vírgula"}</strong>
          {" ou Enter. Toque num chip para alternar entre hashtag → palavra → frase exata. ✎ edita."}
        </p>
        {"\n      "}
        <div class={cx("chip-entry")} data-chip-entry={""}>
          {"\n        "}
          {target.children.map((block, index) => (
            <>
              <span
                class={cx(["term-chip ", bad.has(block.id) ? "bad" : ""].join(""))}
                data-kind={block.type}
                data-chip-node={block.id}
              >
                {"\n          "}
                <button
                  class={cx("chip-main")}
                  title={"Trocar tipo"}
                  data-act={"chip-cycle"}
                  data-id={block.id}
                >
                  {label[block.type] || "⌕"}{" "}
                  {block.type === "hashtag"
                    ? "#" + block.value.replace(/^#/, "")
                    : block.type === "phrase"
                      ? "“" + block.value + "”"
                      : block.value}
                </button>
                {"\n          "}
                <button
                  class={cx("chip-edit")}
                  title={"Editar valor"}
                  data-act={"chip-edit"}
                  data-id={block.id}
                >
                  {"✎"}
                </button>
                {"\n          "}
                <button class={cx("chip-x")} title={"Remover"} data-act={"chip-remove"} data-id={block.id}>
                  {"×"}
                </button>
              </span>
            </>
          ))}
          {"\n        "}
          <input
            data-chip-input={""}
            aria-label={"Adicionar hashtags separadas por vírgulas"}
            placeholder={"#hashtag, outra, palavra…"}
            autocomplete={"off"}
            spellcheck={"false"}
          />
          {"\n      "}
        </div>
        {"\n      "}
        <div class={cx("row rx-search-workbench-row-margin-top")}>
          <span class={cx("inline-label")}>
            {target.children.length}
            {" termo(s) · toque no operador para mudar a combinação"}
          </span>
        </div>
        {"\n    "}
      </section>
    </>
  );
}

export function renderTags() {
  const container = state.rootShadow?.querySelector(RODX_SELECTORS.tagTray);
  if (container && state.draft) mountView(container, () => <TagTray />);
}

export function addChips(value, focus = true) {
  const pasted = QueryEngine.tags(value, true);
  const parts =
    pasted.length > 1
      ? pasted
      : String(value || "")
          .split(/[,;\n]+/)
          .map((x) => x.trim())
          .filter(Boolean);
  if (!parts.length) return;
  const t = tray();
  if (pasted.length > 1) t.op = "OR";
  if (blockStats(state.draft.blocks) + parts.length > MAX_BLOCK_NODES) {
    throw new Error("Limite de blocos atingido.");
  }
  for (let part of parts) {
    let type = "hashtag";
    if (/^".*"$/.test(part)) {
      type = "phrase";
      part = part.slice(1, -1);
    } else if (/\s/.test(part)) type = "phrase";
    t.children.push(newBlock(type, part.replace(/^#/, "")));
  }
  const removed = compactBlockTree(state.draft.blocks);
  state.autoFixSummary = removed ? `${removed} duplicata(s) eliminada(s) automaticamente.` : "";
  renderTags();
  renderBlockEditor();
  if (focus) state.rootShadow?.querySelector(RODX_SELECTORS.chipInput)?.focus();
}

export function SelectionList() {
  return (
    <>
      <section class={cx("rodx-selection-list rx-search-workbench-rodx-selection-list")}>
        {"\n      "}
        <div class={cx("row rx-search-workbench-row-align-items")}>
          <strong>{"Seleções guardadas"}</strong>
          {"\n        "}
          <span class={cx("muted rx-search-workbench-muted")}>
            {"("}
            {state.selectionList.length}
            {")"}
          </span>
        </div>
        {"\n      "}
        <p class={cx("muted")}>
          {"Selecione uma palavra no post ou {uma frase inteira}, e guarde aqui para reutilizar."}
        </p>
        {"\n      "}
        <div class={cx("row rx-search-workbench-row-flex-wrap-gap")}>
          {state.selectionList.map((term, index) => (
            <>
              {"\n        "}
              <span class={cx("chip rx-search-workbench-chip")}>
                {"\n          "}
                <span>{term}</span>
                {"\n          "}
                <button
                  class={cx("btn mini")}
                  title={"Adicionar à pesquisa"}
                  data-act={"selection-use"}
                  data-index={index}
                >
                  {"+"}
                </button>
                {"\n          "}
                <button
                  class={cx("btn mini")}
                  title={"Excluir da pesquisa"}
                  data-act={"selection-exclude"}
                  data-index={index}
                >
                  {"−"}
                </button>
                {"\n          "}
                <button
                  class={cx("btn mini")}
                  title={"Remover da lista"}
                  data-act={"selection-delete"}
                  data-index={index}
                >
                  {"×"}
                </button>
                {"\n        "}
              </span>
            </>
          )) || (
            <>
              <span class={cx("muted")}>{"Nenhuma seleção ainda."}</span>
            </>
          )}
        </div>
        {"\n    "}
      </section>
    </>
  );
}

export function Presets() {
  return (
    <>
      {<SelectionList />}
      <section class={cx("preset-shelf")} aria-label={"Biblioteca de presets"}>
        {"\n      "}
        <h3>
          {"Presets e baselines ("}
          {state.presets.length}
          {")"}
        </h3>
        {"\n      "}
        <p class={cx("muted")}>
          {
            "Salve uma query como receita reutilizável. Combine várias com E/OU e acrescente novas hashtags sem alterar a receita original."
          }
        </p>
        {"\n      "}
        {state.presets.length ? (
          state.presets.map((preset) => (
            <>
              <div class={cx("preset-card")}>
                {"\n        "}
                <div class={cx("preset-name")}>
                  <strong>
                    {"✦ "}
                    {preset.name}
                  </strong>
                  <span class={cx("spacer")}></span>
                  {"\n          "}
                  <span class={cx("inline-label")}>
                    {new Date(preset.updatedAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                {"\n        "}
                <div class={cx("query-sm")}>{preset.query}</div>
                {"\n        "}
                <div class={cx("preset-list")}>
                  {"\n          "}
                  <button class={cx("btn primary")} data-act={"preset-insert"} data-id={preset.id}>
                    {"＋ Adicionar à busca"}
                  </button>
                  {"\n          "}
                  <button class={cx("btn")} data-act={"preset-edit"} data-id={preset.id}>
                    {"Editar base"}
                  </button>
                  {"\n          "}
                  <button class={cx("btn danger")} data-act={"preset-delete"} data-id={preset.id}>
                    {"Excluir"}
                  </button>
                  {"\n        "}
                </div>
                {"\n      "}
              </div>
            </>
          ))
        ) : (
          <>
            <p class={cx("muted")}>
              {"Nenhum preset salvo. Monte uma query no Editor e toque em Salvar preset."}
            </p>
          </>
        )}
        {"\n      "}
        <div class={cx("row")}>
          <button class={cx("btn primary")} data-act={"view-editor"}>
            {"🧩 Abrir editor"}
          </button>
        </div>
        {"\n    "}
      </section>
    </>
  );
}

export function PresetShelf() {
  return (
    <>
      <section class={cx("preset-shelf")}>
        {"\n      "}
        <h3>{"✦ Inserir presets"}</h3>
        {"\n      "}
        <div class={cx("preset-list")}>
          {state.presets.map((p) => (
            <>
              <button class={cx("btn smol")} data-act={"preset-insert"} data-id={p.id}>
                {"＋ "}
                {p.name}
              </button>
            </>
          )) || (
            <>
              <span class={cx("muted")}>{"Salve uma base abaixo para reutilizá-la depois."}</span>
            </>
          )}
        </div>
        {"\n      "}
        <div class={cx("row rx-search-workbench-row-margin-top-margin-top-11px")}>
          {"\n        "}
          <input
            class={cx("ctrl rx-search-workbench-ctrl")}
            maxlength={"100"}
            data-preset-name={""}
            value={state.draft.presetName || ""}
            placeholder={"Nome da base · Ex.: Mídia + hashtags"}
          />
          {"\n        "}
          <button class={cx("btn primary")} data-act={"preset-save"}>
            {state.presetEditingId ? "Atualizar preset" : "Salvar preset"}
          </button>
          {"\n        "}
          {state.presetEditingId ? (
            <>
              <button class={cx("btn")} data-act={"preset-save-new"}>
                {"Salvar como novo"}
              </button>
            </>
          ) : (
            ""
          )}
          {"\n      "}
        </div>
        {"\n      "}
        <p class={cx("inline-label")}>
          {
            "Cada base salva a expressão completa atual. Inserir uma base cria novos blocos independentes para você personalizar."
          }
        </p>
        {"\n    "}
      </section>
    </>
  );
}

export function blockValueHTML(block) {
  if (block.type === "media") {
    return (
      <>
        <select class={cx("ctrl")} data-block-value={block.id}>
          {"\n        "}
          <option value={""}>{"Selecione mídia…"}</option>
          {"\n        "}
          {BLOCK_MEDIA.map(([key, label]) => (
            <>
              <option value={key} selected={(key === block.value ? "selected" : "") === "selected"}>
                {label}
              </option>
            </>
          ))}
          {"\n      "}
        </select>
      </>
    );
  }
  const examples = {
    hashtag: "#fotografia",
    keyword: "retrato",
    phrase: "minha frase",
    author: "@NASA",
    raw: "min_faves:100",
  };
  return (
    <>
      <input
        class={cx("ctrl")}
        data-block-value={block.id}
        aria-label={"Valor do bloco"}
        value={block.value}
        placeholder={examples[block.type] || ""}
      />
    </>
  );
}

export function blockHTML(block, depth = 0, isRoot = false) {
  if (block.kind === "term") {
    return (
      <>
        <div class={cx("block-term")} data-block-node={block.id}>
          {"\n        "}
          <select class={cx("ctrl")} data-block-type={block.id} aria-label={"Tipo do bloco"}>
            {"\n          "}
            {BLOCK_TYPES.map(([key, label]) => (
              <>
                <option value={key} selected={(block.type === key ? "selected" : "") === "selected"}>
                  {label}
                </option>
              </>
            ))}
            {"\n        "}
          </select>
          {"\n        "}
          {blockValueHTML(block)}
          {"\n        "}
          <label class={cx("block-neg")} title={"Excluir resultados que correspondem a este bloco"}>
            {"\n          "}
            <input
              type={"checkbox"}
              data-block-not={block.id}
              checked={(block.not ? "checked" : "") === "checked"}
            />
            {" NÃO"}
          </label>
          {"\n        "}
          <button
            class={cx("btn mini ghost")}
            data-act={"block-up"}
            data-id={block.id}
            title={"Mover para cima"}
          >
            {"↑"}
          </button>
          {"\n        "}
          <button
            class={cx("btn mini ghost")}
            data-act={"block-down"}
            data-id={block.id}
            title={"Mover para baixo"}
          >
            {"↓"}
          </button>
          {"\n        "}
          <button
            class={cx("btn mini danger")}
            data-act={"block-remove"}
            data-id={block.id}
            title={"Remover bloco"}
          >
            {"×"}
          </button>
          {"\n      "}
        </div>
      </>
    );
  }
  return (
    <>
      <section
        class={cx(["block-group ", isRoot ? "root" : "", " level-", depth].join(""))}
        data-block-node={block.id}
        aria-label={"Grupo lógico"}
      >
        {"\n      "}
        <div class={cx("block-head")}>
          {"\n        "}
          <span class={cx("block-head-title")}>{isRoot ? "GRUPO PRINCIPAL" : "Subgrupo"}</span>
          {"\n        "}
          <span class={cx("hint-small")}>{"Combinar com"}</span>
          {"\n        "}
          <button
            class={cx("op-pill")}
            data-act={"block-toggle-op"}
            data-id={block.id}
            aria-label={"Alternar operador lógico do grupo"}
          >
            {block.op === "AND" ? "E (AND)" : "OU (OR)"}
            {" ⇄"}
          </button>
          {"\n        "}
          {!isRoot ? (
            <>
              <button
                class={cx("op-pill")}
                data-act={"block-toggle-not"}
                data-id={block.id}
                title={"Excluir este grupo"}
              >
                {block.not ? "NÃO ativo" : "NÃO"}
              </button>
            </>
          ) : (
            ""
          )}
          {"\n        "}
          {isRoot ? (
            ""
          ) : (
            <>
              <span class={cx("spacer")}></span>
              {"\n          "}
              <button class={cx("btn mini ghost")} data-act={"block-up"} data-id={block.id}>
                {"↑"}
              </button>
              {"\n          "}
              <button class={cx("btn mini ghost")} data-act={"block-down"} data-id={block.id}>
                {"↓"}
              </button>
              {"\n          "}
              <button class={cx("btn mini danger")} data-act={"block-remove"} data-id={block.id}>
                {"×"}
              </button>
            </>
          )}
          {"\n      "}
        </div>
        {"\n      "}
        <div class={cx("block-content")}>
          {block.children.filter((c) => !c.tagTray).length ? (
            block.children
              .filter((c) => !c.tagTray)
              .map((child, i) => (
                <>
                  {""}
                  {i ? (
                    <>
                      <div class={cx("block-join")}>
                        <button class={cx("op-pill")} data-act={"block-toggle-op"} data-id={block.id}>
                          {block.op === "OR" ? "OU ⇄" : "E ⇄"}
                        </button>
                      </div>
                    </>
                  ) : (
                    ""
                  )}
                  {"\n        "}
                  {blockHTML(child, depth + 1)}
                  {""}
                </>
              ))
          ) : (
            <>
              <div class={cx("block-empty")}>
                {"Adicione abaixo palavras, mídia e grupos, ou use o campo de hashtags acima."}
              </div>
            </>
          )}
        </div>
        {"\n      "}
        <div class={cx("builder-buttons rx-search-workbench-builder-buttons")}>
          {"\n        "}
          <button class={cx("btn mini quick-add")} data-act={"block-add-tag"} data-id={block.id}>
            {"＋ Hashtag"}
          </button>
          {"\n        "}
          <button class={cx("btn mini")} data-act={"block-add-keyword"} data-id={block.id}>
            {"＋ Palavra"}
          </button>
          {"\n        "}
          <button class={cx("btn mini")} data-act={"block-add-media"} data-id={block.id}>
            {"＋ Mídia"}
          </button>
          {"\n        "}
          <button
            class={cx("btn mini")}
            data-act={"block-add-group"}
            data-id={block.id}
            disabled={depth >= MAX_BLOCK_DEPTH - 2}
            title={depth >= MAX_BLOCK_DEPTH - 2 ? "Limite de subgrupos" : undefined}
          >
            {"＋ ( Grupo )"}
          </button>
          {"\n      "}
        </div>
        {"\n    "}
      </section>
    </>
  );
}

export function BlockBuilder() {
  return (
    <>
      <section class={cx("builder")} aria-label={"Construtor de busca por blocos"}>
        {"\n      "}
        <div class={cx("builder-header")}>
          {"\n        "}
          <div>
            <h3 class={cx("hero-title")}>{"🧩 Montar query com blocos"}</h3>
            {"\n          "}
            <p class={cx("hero-sub rx-search-workbench-hero-sub")}>
              {"Combine hashtags, palavras e mídia usando E, OU, NÃO e parênteses."}
            </p>
          </div>
          {"\n      "}
        </div>
        {"\n      "}
        <div class={cx("builder-buttons rx-search-workbench-builder-buttons-margin-bottom")}>
          {"\n        "}
          <button class={cx("btn mini quick-add")} data-act={"template-tag-or-word"}>
            {"＃ Hashtag OU palavra"}
          </button>
          {"\n        "}
          <button class={cx("btn mini")} data-act={"template-tag-and-group"}>
            {"＃ E (＃ OU palavra)"}
          </button>
          {"\n        "}
          <button class={cx("btn mini")} data-act={"template-media-or"}>
            {"📷 Fotos OU vídeos"}
          </button>
          {"\n        "}
          <button class={cx("btn mini danger")} data-act={"block-clear"}>
            {"Limpar blocos"}
          </button>
          {"\n      "}
        </div>
        {"\n      "}
        <div data-blocks-container={""}>{blockHTML(state.draft.blocks, 0, true)}</div>
        {"\n      "}
        <p class={cx("block-help")}>
          <strong>{"E"}</strong>
          {" exige as duas condições. "}
          <strong>{"OU"}</strong>
          {" aceita qualquer uma.\n        "}
          <strong>{"NÃO"}</strong>
          {" exclui um termo. Grupos produzem "}
          <code>{"(... OR ...)"}</code>
          {".\n        Os filtros destacados acima e os filtros avançados entram como "}
          <strong>{"E"}</strong>
          {" com a expressão dos blocos."}
        </p>
        {"\n    "}
      </section>
    </>
  );
}

export function renderBlockEditor() {
  const root = state.rootShadow;
  const container = root?.querySelector(RODX_SELECTORS.blocksContainer);
  if (container && state.draft) mountView(container, () => blockHTML(state.draft.blocks, 0, true));
  displayPreview();
}

export function modifyBlocks(action, id = "") {
  if (!state.draft) return;
  const root = state.draft.blocks;
  const match = findBlockNode(root, id);
  if (action === "block-clear") {
    root.children = [];
  } else if (action.startsWith("template-")) {
    // Preservar os blocos existentes: os atalhos acrescentam um subgrupo novo.
    let group;
    if (action === "template-tag-or-word") {
      group = newBlockGroup("OR", [newBlock("hashtag"), newBlock("keyword")]);
    } else if (action === "template-tag-and-group") {
      group = newBlockGroup("AND", [
        newBlock("hashtag"),
        newBlockGroup("OR", [newBlock("hashtag"), newBlock("keyword")]),
      ]);
    } else if (action === "template-media-or") {
      group = newBlockGroup("OR", [newBlock("media", "images"), newBlock("media", "videos")]);
    }
    if (group) root.children.push(group);
  } else if (action.startsWith("block-add-")) {
    if (!match || match.node.kind !== "group") return;
    const type = action.slice("block-add-".length);
    const depth = depthOfNode(root, id);
    if (type === "group") {
      if (depth >= MAX_BLOCK_DEPTH - 2) throw new Error("Limite de profundidade de grupos atingido.");
      match.node.children.push(newBlockGroup("OR", [newBlock()]));
    } else {
      const valid = {
        tag: "hashtag",
        keyword: "keyword",
        media: "media",
      };
      if (valid[type]) match.node.children.push(newBlock(valid[type]));
    }
  } else if (match && match.parent) {
    const siblings = match.parent.children;
    const index = siblings.findIndex((item) => item.id === id);
    if (action === "block-remove") siblings.splice(index, 1);
    if (action === "block-up" && index > 0) {
      [siblings[index - 1], siblings[index]] = [siblings[index], siblings[index - 1]];
    }
    if (action === "block-down" && index < siblings.length - 1) {
      [siblings[index + 1], siblings[index]] = [siblings[index], siblings[index + 1]];
    }
  }
  if (blockStats(root) > MAX_BLOCK_NODES) {
    // Restauração atômica se a ação exceder o limite.
    state.draft.blocks = normalizeBlockTree(state.draft._previousBlocks);
    delete state.draft._previousBlocks;
    throw new Error(`Máximo de ${MAX_BLOCK_NODES} blocos por busca.`);
  }
  renderBlockEditor();
}

export function SearchEditor() {
  const draft = state.draft;
  migrateLegacyTags(draft);
  return (
    <>
      <div class={cx("editor-top stack")}>
        {"\n      "}
        <div class={cx("grid")}>
          {"\n        "}
          <div class={cx("field wide")}>
            <label>{"Nome da timeline"}</label>
            {"\n          "}
            <input
              class={cx("ctrl")}
              data-meta={"name"}
              maxlength={"100"}
              placeholder={"Ex.: Tech Brasil, Notícias, Futebol"}
              value={draft.name}
            />
          </div>
          {"\n        "}
          <div class={cx("field")}>
            <label>{"Ícone / emoji"}</label>
            {"\n          "}
            <input
              class={cx("ctrl")}
              data-meta={"icon"}
              maxlength={"4"}
              value={draft.icon}
              placeholder={"🔎"}
            />
          </div>
          {"\n        "}
          <div class={cx("field")}>
            <label>{"Visualização padrão"}</label>
            {"\n          "}
            <select class={cx("ctrl")} data-meta={"sort"}>
              {SORTS.map(([key, label]) => (
                <>
                  <option value={key} selected={(key === draft.sort ? "selected" : "") === "selected"}>
                    {label}
                  </option>
                </>
              ))}
            </select>
          </div>
          {"\n      "}
        </div>
        {"\n      "}
        <div class={cx("field")}>
          <label>{"Máximo de posts visíveis (0 = ilimitado)"}</label>
          {"\n        "}
          <input
            class={cx("ctrl")}
            type={"number"}
            min={"0"}
            max={MAX_VISIBLE}
            step={"1"}
            data-meta={"resultLimit"}
            value={draft.resultLimit}
          />
          {"\n      "}
        </div>
        {"\n      "}
        <label class={cx("tog")}>
          <input
            type={"checkbox"}
            data-meta={"pinned"}
            checked={(draft.pinned ? "checked" : "") === "checked"}
          />
          {" Mostrar como aba na Home"}
        </label>
        {"\n    "}
      </div>
      {"\n    "}
      <div data-tag-tray={""}>{<TagTray />}</div>
      {"\n    "}
      <section class={cx("priority")} aria-label={"Filtros de mídia"}>
        {"\n      "}
        <h2 class={cx("hero-title")}>{"▣ Tipo de mídia"}</h2>
        {"\n      "}
        <p class={cx("hero-sub")}>
          {"Filtro global aplicado à query inteira. Para mídias alternativas, use um grupo OU no builder."}
        </p>
        {"\n      "}
        <div class={cx("priority-grid")}>
          {"\n        "}
          {renderField(["media", "Tipo de mídia", "select", [["any", "Qualquer postagem"], ...BLOCK_MEDIA]])}
          {"\n      "}
        </div>
        {"\n    "}
      </section>
      {"\n    "}
      <div class={cx("query-lab")} data-lab={""}>
        {"\n      "}
        <div class={cx("query-lab-top")}>
          <strong>{"⌕ Query em tempo real"}</strong>
          {"\n        "}
          <div class={cx("row")}>
            <span class={cx("lab-status")} data-analyzer-summary={""}>
              {"Validando…"}
            </span>
            {"\n        "}
            <button class={cx("btn smol")} data-act={"copy-query"} title={"Copiar query"}>
              {"⧉ Copiar"}
            </button>
          </div>
        </div>
        {"\n      "}
        <code class={cx("query")} data-query-preview={""}></code>
        {"\n      "}
        <div class={cx("issues")} data-query-diagnostics={""}></div>
        {"\n    "}
      </div>
      {"\n    "}
      <details class={cx("section")} data-raw-workbench={""} open={true}>
        {"\n      "}
        <summary>{"⌘ Laboratório de parser · editar query manual"}</summary>
        {"\n      "}
        <div class={cx("section-body workbench")}>
          {"\n        "}
          <p class={cx("muted")}>
            {"Cole ou escreva uma query com "}
            <strong>{"AND, OR, NOT e parênteses"}</strong>
            {".\n          O diagnóstico sublinha o trecho incorreto e sugere a correção. "}
            <strong>{"links:domínio/**"}</strong>
            {", "}
            <strong>{"linksre:/expressão/i"}</strong>
            {" e "}
            <strong>{"textre:/expressão/i"}</strong>
            {" são filtros locais que só atuam sobre posts carregados pelo X. Aplicar converte em blocos."}
          </p>
          {"\n        "}
          <textarea
            class={cx("ctrl raw-code")}
            data-raw-query={""}
            spellcheck={"false"}
            placeholder={"filter:media (#troconudes OR #troconuds)"}
            value={"\n            " + (state.rawDirty ? state.rawQueryDraft : "") + "\n          "}
          />
          {"\n        "}
          <div class={cx("raw-preview")} data-raw-highlight={""}></div>
          {"\n        "}
          <div class={cx("rodx-issues")} data-raw-issues={""}></div>
          {"\n        "}
          <div class={cx("inline-label")} data-raw-status={""}>
            {"Pronto para analisar."}
          </div>
          {"\n        "}
          <div class={cx("row")}>
            <button class={cx("btn primary")} data-act={"raw-apply"}>
              {"↳ Aplicar como blocos"}
            </button>
            {"\n        "}
            <button class={cx("btn")} data-act={"raw-sync"}>
              {"Usar query gerada"}
            </button>
          </div>
          {"\n      "}
        </div>
        {"\n    "}
      </details>
      {"\n    "}
      {<PresetShelf />}
      {"\n    "}
      {<BlockBuilder />}
      {"\n    "}
      {GROUPS.map((group) => (
        <>
          <details
            class={cx("section")}
            data-group={group.id}
            open={(state.openedGroups.has(group.id) ? "open" : "") === "open"}
          >
            {"\n        "}
            <summary>
              {group.icon}
              {"  "}
              {group.title}
            </summary>
            {"\n        "}
            <div class={cx("section-body")}>
              <div class={cx("grid")}>{group.fields.map(renderField)}</div>
            </div>
            {"\n      "}
          </details>
        </>
      ))}
      {"\n    "}
      <p class={cx("muted hint")}>
        {
          "O campo livre aceita qualquer operador do buscador web do X.\n      Alguns filtros experimentais podem depender de alterações da plataforma.\n      A data final é tratada como inclusiva."
        }
      </p>
      {"\n    "}
      <button class={cx("btn rx-search-workbench-btn")} data-act={"block-fix"}>
        {"✦ Corrigir duplicatas e filtros redundantes com segurança"}
      </button>
    </>
  );
}

export function SavedSearches() {
  if (!state.searches.length) {
    return (
      <>
        <div class={cx("empty")}>
          {"Ainda não há pesquisas salvas."}
          <br />
          {"\n        "}
          <span class={cx("muted")}>
            {"Crie uma busca avançada ou importe uma pesquisa que já esteja aberta."}
          </span>
          <br />
          {"\n        "}
          <button class={cx("btn primary rx-search-workbench-btn-margin-top")} data-act={"new"}>
            {"Criar primeira pesquisa"}
          </button>
          {"\n      "}
        </div>
      </>
    );
  }
  return (
    <>
      {<SelectionList />}
      <div class={cx("row rx-search-workbench-row-margin-bottom")}>
        {"\n      "}
        <button class={cx("btn primary")} data-act={"new"}>
          {"+ Nova pesquisa"}
        </button>
        {"\n      "}
        <button
          class={cx("btn")}
          data-act={"capture"}
          disabled={(currentSearch() ? "" : "disabled") === "disabled"}
        >
          {"Salvar busca atual"}
        </button>
        {"\n    "}
      </div>
      {"\n    "}
      {state.searches.map((s, i) => (
        <>
          <article class={cx("saved-item")}>
            {"\n      "}
            <div class={cx("saved-top")}>
              <div class={cx("saved-title")}>
                {s.icon} {s.name}
              </div>
              {"\n        "}
              {s.pinned ? (
                <>
                  <span class={cx("chip")}>{"Na Home"}</span>
                </>
              ) : (
                ""
              )}
              {"\n        "}
              <span class={cx("chip")}>{SORTS.find(([key]) => key === s.sort)?.[1] || "Recentes"}</span>
              {"\n      "}
            </div>
            {"\n      "}
            <div class={cx("query-sm")}>{s.query}</div>
            {"\n      "}
            <div class={cx("muted")}>
              {s.resultLimit ? `Até ${s.resultLimit} posts visíveis` : "Exibição ilimitada"}
              {" · "}
              {s.sort === "live" ? "Recentes" : "Busca nativa"}
            </div>
            {"\n      "}
            <div class={cx("saved-actions")}>
              {"\n        "}
              <button class={cx("btn smol primary")} data-act={"open-search"} data-id={s.id}>
                {"Ver"}
              </button>
              {"\n        "}
              {s.sort !== "live" ? (
                <>
                  <button class={cx("btn smol")} data-act={"open-recent"} data-id={s.id}>
                    {"Recentes"}
                  </button>
                </>
              ) : (
                ""
              )}
              {"\n        "}
              <button class={cx("btn smol")} data-act={"edit"} data-id={s.id}>
                {"Editar"}
              </button>
              {"\n        "}
              <button class={cx("btn smol")} data-act={"pin"} data-id={s.id}>
                {s.pinned ? "Desafixar" : "Fixar"}
              </button>
              {"\n        "}
              <button class={cx("btn smol")} data-act={"duplicate"} data-id={s.id}>
                {"Duplicar"}
              </button>
              {"\n        "}
              <button
                class={cx("btn smol")}
                data-act={"up"}
                data-id={s.id}
                disabled={(i === 0 ? "disabled" : "") === "disabled"}
              >
                {"↑"}
              </button>
              {"\n        "}
              <button
                class={cx("btn smol")}
                data-act={"down"}
                data-id={s.id}
                disabled={(i === state.searches.length - 1 ? "disabled" : "") === "disabled"}
              >
                {"↓"}
              </button>
              {"\n        "}
              <button class={cx("btn smol danger")} data-act={"delete"} data-id={s.id}>
                {"Excluir"}
              </button>
              {"\n      "}
            </div>
            {"\n    "}
          </article>
        </>
      ))}
    </>
  );
}

export function DataSettings() {
  return (
    <>
      <div class={cx("stack")}>
        {"\n      "}
        <div class={cx("banner")}>
          {"Os dados abaixo pertencem exclusivamente à conta\n        "}
          <strong>{identityLabel()}</strong>
          {".\n        Não há sincronização com os servidores do X."}
        </div>
        {"\n      "}
        <section class={cx("section")}>
          <div class={cx("section-body")}>
            {"\n        "}
            <strong>{"☁ Sincronização pessoal no D1"}</strong>
            {"\n        "}
            <p class={cx("muted")}>
              {
                "Pesquisas, presets, configurações visuais, histórico e vistos ficam\n        separados por pessoa e por conta do X. A chave pessoal é diferente do\n        token compartilhado de envio ao Telegram. O modo local continua funcionando sem ela."
              }
            </p>
            {"\n        "}
            <button class={cx("btn primary")} data-act={"cloud-configure"}>
              {"Configurar chave pessoal"}
            </button>
            {"\n        "}
            <p class={cx("muted")}>
              {"Peça uma chave "}
              <code>{"rodx_..."}</code>
              {" criada pelo provisionamento do relay.\n        Nunca coloque o token do Telegram aqui."}
            </p>
            {"\n      "}
          </div>
        </section>
        {"\n      "}
        <div class={cx("line")}></div>
        {"\n      "}
        <strong>{"Backup das suas pesquisas"}</strong>
        {"\n      "}
        <p class={cx("muted")}>
          {
            "Exporte um JSON de todas as pesquisas desta conta e importe no\n        outro navegador ou dispositivo. A importação nunca modifica pesquisas de outra conta."
          }
        </p>
        {"\n      "}
        <button
          class={cx("btn")}
          data-act={"export"}
          disabled={(state.account ? "" : "disabled") === "disabled"}
        >
          {"↓ Exportar JSON"}
        </button>
        {"\n      "}
        <div class={cx("line")}></div>
        {"\n      "}
        <div class={cx("field")}>
          <label>{"Importar arquivo .json"}</label>
          {"\n        "}
          <input class={cx("ctrl")} type={"file"} data-file={"import"} accept={"application/json,.json"} />
        </div>
        {"\n      "}
        <div class={cx("field")}>
          <label>{"Estratégia de importação"}</label>
          {"\n        "}
          <select class={cx("ctrl")} data-import-strategy={""}>
            {"\n          "}
            <option value={"merge"}>{"Mesclar (mantém as pesquisas atuais)"}</option>
            {"\n          "}
            <option value={"replace"}>{"Substituir tudo nesta conta"}</option>
            {"\n        "}
          </select>
        </div>
        {"\n      "}
        <p class={cx("muted")}>
          {
            "Se IDs coincidirem, a pesquisa importada substituirá a existente\n        na opção Mesclar. Faça um backup antes de substituir tudo."
          }
        </p>
        {"\n      "}
        <div class={cx("line")}></div>
        {"\n      "}
        <strong>{"Armazenamento"}</strong>
        {"\n      "}
        <p class={cx("muted")}>
          {"Motor em uso: "}
          <strong>
            {gmAvailable
              ? "GM storage (compartilhado entre x.com e twitter.com)"
              : "localStorage (separado por domínio)"}
          </strong>
          {".\n        Identidade: "}
          <strong>{state.accountSource || "não detectada"}</strong>
          {
            ".\n        Identificação de conta é feita pelo perfil do usuário logado visível na interface.\n        Se o identificador de sessão não estiver acessível, o script usa o perfil conectado."
          }
        </p>
        {"\n      "}
        <div class={cx("field")}>
          <label>{"Conta manual (fallback para iPhone / layout sem perfil)"}</label>
          {"\n        "}
          <div class={cx("row")}>
            <input
              class={cx("ctrl rx-search-workbench-ctrl-flex")}
              data-manual-account={""}
              placeholder={"@meuusuario"}
              maxlength={"16"}
            />
            {"\n          "}
            <button class={cx("btn")} data-act={"set-manual-account"}>
              {"Usar conta"}
            </button>
          </div>
          {"\n        "}
          <p class={cx("muted")}>
            {
              "Use apenas se a detecção automática falhar. Ao trocar de conta,\n          selecione a conta correta. Nenhum token de sessão é salvo."
            }
          </p>
        </div>
        {"\n      "}
        <p class={cx("muted")}>
          {"RodX Search Deck v"}
          {VERSION}
          {" · Atalho: Alt + Shift + S"}
        </p>
        {"\n    "}
      </div>
    </>
  );
}

export function Workspace() {
  const disabled = !state.account;
  if (state.view === "editor" && !state.draft) state.draft = blankDraft();
  return (
    <>
      <div class={cx("scrim")} data-act={"close"}></div>
      {"\n      "}
      <section
        class={cx("panel")}
        role={"dialog"}
        aria-modal={"true"}
        data-view={state.view}
        aria-label={"RodX Search Deck"}
      >
        {"\n        "}
        <div class={cx("panel-head")}>
          {"\n          "}
          <div class={cx("head-row")}>
            <div>
              <div class={cx("brand")}>{"⌕ RodX Search Deck"}</div>
              {"\n            "}
              <div class={cx("sub")}>{"Timelines e pesquisas avançadas para o X"}</div>
            </div>
            {"\n            "}
            <div class={cx("row")}>
              <span class={cx("account")}>{identityLabel()}</span>
              {"\n              "}
              <button class={cx("btn smol")} data-act={"close"} aria-label={"Voltar ao X"}>
                {"✕ Fechar"}
              </button>
            </div>
            {"\n          "}
          </div>
          {"\n          "}
          <div class={cx("tabs")}>
            {"\n            "}
            <button
              class={cx(["tab ", state.view === "saved" ? "active" : ""].join(""))}
              data-act={"view-saved"}
            >
              {"Salvas ("}
              {state.searches.length}
              {")"}
            </button>
            {"\n            "}
            <button
              class={cx(["tab ", state.view === "editor" ? "active" : ""].join(""))}
              data-act={"view-editor"}
            >
              {"Editor"}
            </button>
            {"\n            "}
            <button
              class={cx(["tab ", state.view === "presets" ? "active" : ""].join(""))}
              data-act={"view-presets"}
            >
              {"Presets ("}
              {state.presets.length}
              {")"}
            </button>
            {"\n            "}
            <button
              class={cx(["tab ", state.view === "relay" ? "active" : ""].join(""))}
              data-act={"view-relay"}
            >
              {"Telegram"}
            </button>
            {"\n            "}
            <button
              class={cx(["tab ", state.view === "xrepost" ? "active" : ""].join(""))}
              data-act={"view-xrepost"}
            >
              {"Vídeos X"}
            </button>
            {"\n            "}
            <button class={cx("tab")} data-act={"view-network"}>
              {"REDE"}
            </button>
            {"\n            "}
            <button class={cx("tab")} data-act={"lists-studio"}>
              {"Listas e membros"}
            </button>
            <button
              class={cx(["tab ", state.view === "visual" ? "active" : ""].join(""))}
              data-act={"view-visual"}
            >
              {"Preferências"}
            </button>
            {"\n            "}
            <button
              class={cx(["tab ", state.view === "data" ? "active" : ""].join(""))}
              data-act={"view-data"}
            >
              {"Backup"}
            </button>
            {"\n          "}
          </div>
          {"\n        "}
        </div>
        {"\n        "}
        <div class={cx("body")} data-scroll-area={""}>
          {"\n          "}
          {state.message ? (
            <>
              <div class={cx("message")}>{state.message}</div>
            </>
          ) : (
            ""
          )}
          {"\n          "}
          {state.storageWarning ? (
            <>
              <div class={cx("storage-warning")}>
                {"⚠ "}
                {state.storageWarning}
              </div>
            </>
          ) : (
            ""
          )}
          {"\n          "}
          {disabled ? (
            <>
              <div class={cx("banner")}>
                {
                  "Conta não detectada. Abra a aba Backup para definir manualmente o @usuário, caso o X esconda os dados da sessão."
                }
              </div>
            </>
          ) : (
            ""
          )}
          {"\n          "}
          {state.view === "saved" ? (
            <SavedSearches />
          ) : state.view === "editor" ? (
            <SearchEditor />
          ) : state.view === "presets" ? (
            <Presets />
          ) : state.view === "relay" ? (
            Relay.settingsHTML()
          ) : state.view === "xrepost" ? (
            XRepost.htmlView()
          ) : state.view === "visual" ? (
            <VisualSettings />
          ) : (
            <DataSettings />
          )}
          {"\n        "}
        </div>
        {"\n        "}
        {state.view === "editor" && state.saveError ? (
          <>
            <div class={cx("save-feedback")} role={"alert"}>
              {"✕ Não foi possível salvar: "}
              {state.saveError}
            </div>
          </>
        ) : (
          ""
        )}
        {"\n        "}
        <footer class={cx("foot")}>
          {"\n          "}
          {state.view === "editor" ? (
            <>
              <button
                class={cx("btn primary")}
                data-act={"save"}
                disabled={(disabled || state.busy ? "disabled" : "") === "disabled"}
              >
                {state.editingId ? "Salvar alterações" : "Salvar pesquisa"}
              </button>
              {"\n              "}
              <button class={cx("btn")} data-act={"preview-search"}>
                {"Testar"}
              </button>
              {"\n              "}
              <button
                class={cx("btn")}
                data-act={"capture"}
                disabled={(currentSearch() ? "" : "disabled") === "disabled"}
              >
                {"Usar busca atual"}
              </button>
            </>
          ) : state.view === "relay" ? (
            <>
              <button class={cx("btn primary")} data-act={"relay-save"}>
                {"Salvar"}
              </button>
              {"\n                "}
              <button class={cx("btn")} data-act={"relay-health"}>
                {"Testar conexão"}
              </button>
            </>
          ) : state.view === "xrepost" ? (
            <>
              <button class={cx("btn primary")} data-act={"xrepost-refresh"}>
                {"Atualizar fila D1"}
              </button>
            </>
          ) : (
            <>
              <button
                class={cx("btn")}
                data-act={"capture"}
                disabled={(currentSearch() ? "" : "disabled") === "disabled"}
              >
                {"Capturar busca atual"}
              </button>
            </>
          )}
          {"\n          "}
          <span class={cx("spacer")}></span>
          {"\n          "}
          <button class={cx("btn ghost")} data-act={"close"}>
            {"Fechar"}
          </button>
          {"\n        "}
        </footer>
        {"\n      "}
      </section>
    </>
  );
}

export function VisualSettings() {
  const v = state.visual;
  return (
    <>
      <section class={cx("rodx-visual")} aria-label={"Personalização da interface"}>
        {"\n      "}
        <h2 class={cx("hero-title")}>{"RodX Studio · módulos e desempenho"}</h2>
        {"\n      "}
        <p class={cx("muted")}>
          {Studio.state.network.ready
            ? "Ponte única de rede ativa"
            : Studio.state.network.error || "Aguardando ponte de rede"}
        </p>
        {"\n      "}
        <div class={cx("grp")}>
          {Object.entries({
            lists: "Listas, membros e fila",
            profile: "Listas no perfil",
            layout: "Perfil compacto e barra do tweet",
            media: "Player e reprodução",
            links: "Links e Telegram",
            translation: "Tradução",
            hygiene: "Limpeza da interface",
            customTimeline: "Timeline própria das listas (opcional)",
          }).map(([key, label]) => (
            <>
              <label class={cx("tog")}>
                <input
                  type={"checkbox"}
                  data-studio-module={key}
                  checked={(Studio.config.modules[key] ? "checked" : "") === "checked"}
                />
                {label}
              </label>
            </>
          ))}
        </div>
        {"\n      "}
        <div class={cx("field")}>
          <label>{"Orçamento entre módulos (ms)"}</label>
          <input
            type={"number"}
            min={"3"}
            max={"12"}
            data-studio-budget={""}
            value={Studio.config.budgetMs}
          />
        </div>
        {"\n      "}
        <div class={cx("field")}>
          <label>{"Agrupar atualizações do DOM (ms)"}</label>
          <input
            type={"number"}
            min={"60"}
            max={"500"}
            data-studio-delay={""}
            value={Studio.config.scanDelayMs}
          />
        </div>
        {"\n      "}
        <div class={cx("field")}>
          <label>{"Meia-vida da frequência/recência de listas (dias)"}</label>
          {"\n        "}
          <input
            type={"number"}
            min={"1"}
            max={"180"}
            data-studio-half-life={""}
            value={Studio.config.frecencyHalfLifeDays || 14}
          />
        </div>
        {"\n      "}
        <button data-act={"runtime-apply"}>{"Aplicar módulos e recarregar"}</button>
        <button data-act={"runtime-diagnostics"}>{"Copiar diagnóstico de desempenho"}</button>
        {"\n      "}
        <h2 class={cx("hero-title")}>{"Aparência da timeline"}</h2>
        {"\n      "}
        <p class={cx("muted")}>
          {
            "Tamanho de fonte, densidade e hashtags acompanham Home, buscas, perfis, bookmarks e threads. O input nativo do X permanece sem alterações de layout."
          }
        </p>
        {"\n      "}
        <div class={cx("field")}>
          <label>
            {"Espaçamento "}
            <strong data-visual-value={"density"}>
              {v.density.toFixed(1)}
              {"×"}
            </strong>
          </label>
          {"\n        "}
          <input
            type={"range"}
            min={"0.55"}
            max={"1.4"}
            step={"0.05"}
            value={v.density}
            data-visual={"density"}
          />
        </div>
        {"\n      "}
        <div class={cx("field")}>
          <label>
            {"Fonte dos resultados "}
            <strong data-visual-value={"font"}>
              {v.font}
              {"px"}
            </strong>
          </label>
          {"\n        "}
          <input type={"range"} min={"11"} max={"19"} step={"1"} value={v.font} data-visual={"font"} />
        </div>
        {"\n      "}
        <label class={cx("tog")}>
          <input type={"checkbox"} data-visual={"snap"} checked={(v.snap ? "checked" : "") === "checked"} />
          {" Encaixe suave ao rolar (global)"}
        </label>
        {"\n      "}
        <label class={cx("tog")}>
          <input
            type={"checkbox"}
            data-visual={"compact"}
            checked={(v.compact ? "checked" : "") === "checked"}
          />
          {" Usar densidade compacta (tweets começam expandidos)"}
        </label>
        {"\n      "}
        <label class={cx("tog")}>
          <input
            type={"checkbox"}
            data-visual={"colorfulTags"}
            checked={(v.colorfulTags ? "checked" : "") === "checked"}
          />
          {" Hashtags com fundo colorido"}
        </label>
        {"\n      "}
        <label class={cx("tog")}>
          <input
            type={"checkbox"}
            data-visual={"blockTweetOpen"}
            checked={(v.blockTweetOpen ? "checked" : "") === "checked"}
          />
          {" Bloquear abertura do tweet ao tocar no conteúdo (desmarcar restaura o clique nativo)"}
        </label>
        {"\n      "}
        <label class={cx("tog")}>
          <input
            type={"checkbox"}
            data-visual={"translatePosts"}
            checked={(v.translatePosts ? "checked" : "") === "checked"}
          />
          {" Traduzir automaticamente quando o X oferecer tradução"}
        </label>
        {"\n      "}
        <label class={cx("tog")}>
          <input
            type={"checkbox"}
            data-visual={"translateForeignTags"}
            checked={(v.translateForeignTags ? "checked" : "") === "checked"}
          />
          {" Traduzir hashtags em outros idiomas (PT/ES/EN não recebem tradução)"}
        </label>
        {"\n      "}
        <p class={cx("muted")}>
          {
            "A tradução das hashtags usa o serviço público do Google Translate, quando disponível. As hashtags originais no post não são alteradas. No Safari, pode haver bloqueio de rede."
          }
        </p>
        {"\n      "}
        <div class={cx("field")}>
          <label>{"Player de vídeo"}</label>
          <select class={cx("ctrl")} data-visual={"playerMode"}>
            {[
              ["videojs", "Video.js 10.3.0 (padrão)"],
              ["twitter", "Player normal do X"],
              ["rodx", "Controles RodX"],
            ].map(([key, label]) => (
              <>
                <option value={key} selected={(v.playerMode === key ? "selected" : "") === "selected"}>
                  {label}
                </option>
              </>
            ))}
          </select>
        </div>
        {"\n      "}
        <label class={cx("tog")}>
          <input
            type={"checkbox"}
            data-visual={"videoMute"}
            checked={(v.videoMute ? "checked" : "") === "checked"}
          />
          {" Vídeos sempre mudos, exceto ao tocar no volume"}
        </label>
        {"\n      "}
        <p class={cx("muted")}>
          {"Resolução automática controlada pelo player do X (seletor desativado nesta versão)."}
        </p>
        {"\n      "}
        <div class={cx("field")}>
          <label>
            {"Iniciar vídeo com "}
            <strong data-visual-value={"autoPlayEnterPercent"}>
              {v.autoPlayEnterPercent}
              {"%"}
            </strong>
            {" da mídia visível"}
          </label>
          {"\n        "}
          <input
            type={"range"}
            min={"10"}
            max={"100"}
            step={"5"}
            data-visual={"autoPlayEnterPercent"}
            value={v.autoPlayEnterPercent}
          />
        </div>
        {"\n      "}
        <div class={cx("field")}>
          <label>
            {"Pausar depois que "}
            <strong data-visual-value={"autoPauseExitPercent"}>
              {v.autoPauseExitPercent}
              {"%"}
            </strong>
            {" sair da tela"}
          </label>
          {"\n        "}
          <input
            type={"range"}
            min={"10"}
            max={"100"}
            step={"5"}
            data-visual={"autoPauseExitPercent"}
            value={v.autoPauseExitPercent}
          />
        </div>
        {"\n      "}
        <label class={cx("tog")}>
          <input
            type={"checkbox"}
            data-visual={"swipeToCloseVideo"}
            checked={(v.swipeToCloseVideo ? "checked" : "") === "checked"}
          />
          {" Deslizar para baixo para sair do vídeo imersivo"}
        </label>
        {"\n      "}
        <p class={cx("muted")}>
          {
            "O início e a pausa usam limiares separados para não ficar oscilando ao rolar. A reprodução automática ainda depende das permissões do Safari e do player do X."
          }
        </p>
        {"\n      "}
        <label class={cx("tog")}>
          <input
            type={"checkbox"}
            data-visual={"hideSeen"}
            checked={(v.hideSeen ? "checked" : "") === "checked"}
          />
          {" Ocultar tweets já vistos nesta conta"}
        </label>
        {"\n      "}
        <div class={cx("field")}>
          <label>
            {"Quanto do tweet deve estar na tela para marcar visto "}
            <strong data-visual-value={"viewedThreshold"}>
              {Math.round(v.viewedThreshold * 100)}
              {"%"}
            </strong>
          </label>
          {"\n        "}
          <input
            type={"range"}
            min={"0.35"}
            max={"0.9"}
            step={"0.05"}
            value={v.viewedThreshold}
            data-visual={"viewedThreshold"}
          />
        </div>
        {"\n      "}
        <div class={cx("field")}>
          <label>
            {"Tempo mínimo antes de registrar a leitura "}
            <strong data-visual-value={"seenDelayMs"}>
              {(v.seenDelayMs / 1000).toFixed(1)}
              {"s"}
            </strong>
          </label>
          {"\n        "}
          <input
            type={"range"}
            min={"1000"}
            max={"8000"}
            step={"500"}
            value={v.seenDelayMs}
            data-visual={"seenDelayMs"}
          />
        </div>
        {"\n      "}
        <p class={cx("muted")}>
          {"O tweet só é marcado como visto depois de cumprir esse tempo visível e sair "}
          <strong>{"completamente"}</strong>
          {" da tela. Sair antes do tempo, trocar de aba ou ocultar o navegador não conta."}
        </p>
        {"\n    "}
      </section>
    </>
  );
}

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

export function applyXTheme(host) {
  if (!host) return;
  // X's own primary column gets the reliable text color, and the palette
  // follows that setting even if Safari uses another OS appearance.
  const element =
    document.querySelector<HTMLElement>(NATIVE_X_SELECTORS.primaryColumn) ||
    document.querySelector<HTMLElement>(DOM_SELECTORS.mainElement) ||
    document.body;
  const color = getComputedStyle(element).color || getComputedStyle(document.body).color;
  const rgb =
    color
      .match(/\d+(?:\.\d+)?/g)
      ?.slice(0, 3)
      .map(Number) || [];
  const lightText =
    rgb.length === 3
      ? rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 130
      : matchMedia("(prefers-color-scheme: dark)").matches;
  const palette = lightText
    ? ["#000000", "#16181c", "#202327", "#e7e9ea", "#71767b", "#2f3336"]
    : ["#ffffff", "#f7f9f9", "#eff3f4", "#0f1419", "#536471", "#eff3f4"];
  ["bg", "hover", "raised", "text", "muted", "border"].forEach((key, i) =>
    host.style.setProperty(`--rx-${key}`, palette[i], "important"),
  );
  host.style.setProperty("--rx-surface", palette[0], "important");
  host.style.setProperty("--rx-accent", "#1d9bf0", "important");
  host.style.setProperty("--rx-accent-weak", "rgba(29,155,240,.11)", "important");
}

const shadowStyleCache = new WeakMap<ShadowRoot, Map<string, HTMLStyleElement>>();

function ensureShadowStyles(root: ShadowRoot, styles: ReadonlyArray<readonly [string, string]>) {
  let registered = shadowStyleCache.get(root);
  if (!registered) {
    registered = new Map();
    shadowStyleCache.set(root, registered);
  }
  for (const [key, css] of styles) {
    if (!css) continue;
    const existing = registered.get(key);
    if (existing?.isConnected && existing.textContent === css) continue;
    existing?.remove();
    const sheet = root.ownerDocument.createElement("style");
    sheet.dataset.rodxStylesheet = key;
    sheet.textContent = css;
    root.prepend(sheet);
    registered.set(key, sheet);
  }
}

function ensureWorkbenchStyles(root: ShadowRoot, variant: "workspace" | "dock") {
  ensureShadowStyles(root, [
    ["search-deck.module", CSS],
    ["search-custom.module", CUSTOM_CSS],
    [variant === "workspace" ? "workspace-overrides" : "dock-overrides",
      variant === "workspace" ? workbenchOverrides2 : workbenchOverrides1],
  ]);
}

export function renderRoot() {
  if (!state.rootShadow) return;
  applyXTheme(state.rootHost);
  ensureWorkbenchStyles(state.rootShadow, "workspace");
  const oldBody = state.rootShadow.querySelector(RODX_SELECTORS.workspaceScrollArea);
  const oldView = state.rootShadow.querySelector(RODX_SELECTORS.replPanel)?.dataset.view;
  const restoreScroll = Boolean(state.open && oldBody && oldView === state.view);
  const scrollTop = restoreScroll ? oldBody.scrollTop : 0;
  mountView(state.rootShadow, () => (
    <>
      {"\n      "}
      {state.open ? <Workspace /> : ""}
    </>
  ));
  if (state.open) {
    applyComponentStyle(state.rootHost, "rx-search-workbench-rootHost", false);
    Studio.menu.panel("workspace", "RodX Studio", state.rootHost, closePanel);
  } else Studio.menu.close("workspace");
  if (restoreScroll) {
    const body = state.rootShadow.querySelector(RODX_SELECTORS.workspaceScrollArea);
    if (body) body.scrollTop = scrollTop;
  }
  if (state.open && state.view === "editor") {
    displayPreview();
    validateRawWorkbench(state.rootShadow.querySelector(RODX_SELECTORS.rawQueryField)?.value || "");
  }
}

export function renderDock() {
  const dock = state.dockShadow;
  if (!dock) return;
  applyXTheme(state.dockHost);
  ensureWorkbenchStyles(dock, "dock");
  const active = currentSearch();
  const pinned = state.searches.filter((search) => search.pinned);
  const onSearch = /^\/(?:search(?:\/|$)|hashtag\/)/.test(location.pathname);
  const horizontalScroll = dock.querySelector(RODX_SELECTORS.searchDock)?.scrollLeft || 0;
  mountView(dock, () => (
    <>
      <nav
        class={cx("dock")}
        data-route={onSearch ? "search" : "home"}
        aria-label={"Timelines personalizadas"}
      >
        {"\n      "}
        <span class={cx("dock-caption")}>{onSearch ? "Pesquisas" : "Minha Home"}</span>
        {"\n      "}
        <button data-act={"home"} class={cx(location.pathname === "/home" ? "active" : "")}>
          {"⌂ Início"}
        </button>
        {"\n      "}
        {pinned.map((search) => (
          <>
            <span class={cx("rodx-dock-item")} data-drag-id={search.id}>
              {"\n        "}
              <button
                class={cx("rodx-drag-handle")}
                draggable={"false"}
                data-drag-handle={search.id}
                title={"Segure e arraste para reorganizar"}
                aria-label={["Reorganizar ", search.name].join("")}
              >
                {"⠿"}
              </button>
              {"\n        "}
              <button
                data-act={"open-search"}
                data-id={search.id}
                class={cx(active?.query === search.query && active.sort === search.sort ? "active" : "")}
                title={search.query}
              >
                {search.icon} {search.name}
              </button>
            </span>
          </>
        ))}
        {"\n      "}
        {(Studio.services.lists?.quickLists() || []).map((list) => (
          <>
            <button data-studio-list={list.id} title={Studio.services.lists.displayName(list)}>
              {"☷ "}
              {Studio.services.lists.displayName(list)}
            </button>
          </>
        ))}
        {"\n      "}
        <button data-act={"lists-studio"}>{"☷ Listas"}</button>
        {"\n      "}
        <button data-act={"new"} class={cx("plus")} title={"Criar timeline"}>
          {"+ Criar"}
        </button>
        {"\n      "}
        <button data-act={"open"} title={"Organizar pesquisas"}>
          {"⚙"}
        </button>
        {"\n    "}
      </nav>
    </>
  ));
  dock
    .querySelectorAll(RODX_SELECTORS.studioListButtons)
    .forEach(
      (button) =>
        (button.onclick = () => Studio.navigate(studioListIndex(Studio) + "/" + button.dataset.studioList)),
    );
  const nav = dock.querySelector(RODX_SELECTORS.searchDock);
  if (nav) nav.scrollLeft = horizontalScroll;
}

export function inspectNativeQuery(query) {
  const text = String(query || "").trim();
  if (!text)
    return {
      level: "idle",
      message: "Digite uma pesquisa",
      details: [],
    };
  try {
    const blocks = parseQueryBlocks(text);
    const issues = analyzeDraft({
      fields: copyFields(),
      blocks,
    });
    const errors = issues.filter((item) => item.level === "error");
    const warnings = issues.filter((item) => item.level !== "error");
    if (errors.length)
      return {
        level: "error",
        message: `${errors.length} erro(s)`,
        details: issues,
      };
    if (warnings.length)
      return {
        level: "warning",
        message: `${warnings.length} aviso(s)`,
        details: issues,
      };
    return {
      level: "ok",
      message: "✓ Sintaxe OK",
      details: [],
    };
  } catch (error) {
    return {
      level: "error",
      message: "✕ Erro de parsing",
      details: [
        {
          level: "error",
          message: error.message,
        },
      ],
    };
  }
}

export function liveNativeQuery() {
  const input = document.querySelector<HTMLInputElement>(NATIVE_X_SELECTORS.nativeSearchInput);
  return input?.value?.trim() || nativeSearch()?.query || "";
}

export function editNativeSearch() {
  captureCurrent();
  state.message = "Busca convertida em blocos editáveis. Operadores desconhecidos ficam como blocos livres.";
  renderRoot();
}
