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
import { diagnosticSpans, highlightQuery, highlightWithIssues } from "../search/highlight.js";
import { QueryEngine, compileQuery } from "../search/query-compiler.js";
import { parseQueryBlocks } from "../search/query-parser.js";
import { analyzeDraft } from "../search/validation.js";
import { html } from "../shared/text.js";
import { state } from "../state/deck.js";
import { gmAvailable } from "../storage/gm.js";
import { CSS, CUSTOM_CSS } from "../styles/deck.js";
import { Relay } from "../telegram/relay.js";
import { XRepost } from "../tweets/publisher.js";
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
  el.innerHTML = highlightQuery(query);
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
    pane.innerHTML = issues.length
      ? issues
          .map(
            (issue) =>
              `<div class="issue" data-level="${issue.level}">${issue.level === "error" ? "✕" : "⚠"} ${html(issue.message)}` +
              (issue.ids[0]
                ? ` <button class="btn smol" data-act="focus-block" data-id="${html(issue.ids[0])}">Ver bloco</button>`
                : "") +
              "</div>",
          )
          .join("")
      : '<div class="issue" data-level="ok">✓ Query compilada sem conflitos detectados. A disponibilidade dos operadores depende do X.</div>';
  const raw = state.rootShadow.querySelector(RODX_SELECTORS.rawQueryField);
  if (raw && !state.rawDirty) {
    state.rawQueryDraft = query.startsWith("Adicione hashtags,") ? "" : query;
    raw.value = state.rawQueryDraft;
  }
  const colored = state.rootShadow.querySelector(RODX_SELECTORS.rawHighlight);
  if (colored) colored.innerHTML = highlightQuery(raw?.value || "");
}

export function validateRawWorkbench(text) {
  const target = state.rootShadow?.querySelector(RODX_SELECTORS.rawStatus);
  const colored = state.rootShadow?.querySelector(RODX_SELECTORS.rawHighlight);
  const list = state.rootShadow?.querySelector(RODX_SELECTORS.rawIssues);
  const issues = diagnosticSpans(text);
  if (colored) colored.innerHTML = highlightWithIssues(text, issues);
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
    list.innerHTML = issues
      .map(
        (i) => `<button type="button" class="rodx-issue-line"
      data-raw-position="${i.start}" data-raw-end="${i.end}" data-level="${i.severity}">
      ${i.severity === "error" ? "✕" : "⚠"} ${html(i.message)}<small>${html(i.suggestion || "")}</small></button>`,
      )
      .join("");
  return issues;
}

export function renderField([key, title, type, data]) {
  const value = state.draft.fields[key] ?? "";
  const attr = `data-field="${html(key)}"`;
  let ctrl = "";
  if (type === "select") {
    ctrl = `<select class="ctrl" ${attr}>${data.map(([id, label]) => `<option value="${html(id)}" ${id === value ? "selected" : ""}>${html(label)}</option>`).join("")}</select>`;
  } else if (type === "textarea") {
    ctrl = `<textarea class="ctrl" ${attr} placeholder="${html(data)}" rows="3">${html(value)}</textarea>`;
  } else {
    ctrl = `<input class="ctrl" ${attr} type="${type}" value="${html(value)}"
        ${type === "number" ? 'min="0" step="1"' : ""} placeholder="${html(data)}" />`;
  }
  return `<div class="field ${type === "textarea" ? "wide" : ""}">
      <label for="">${html(title)}</label>${ctrl}</div>`;
}

export function tagTrayHTML() {
  migrateLegacyTags(state.draft);
  const target = tray();
  const issues = analyzeDraft(state.draft);
  const bad = new Set(issues.filter((i) => i.level === "error").flatMap((i) => i.ids));
  const label = {
    hashtag: "＃",
    keyword: "⌕",
    phrase: "“”",
  };
  return `<section class="chip-tray" aria-label="Editor de hashtags e termos">
      <div class="row rx-search-workbench-row" >
        <h2 class="hero-title">＃ Hashtags e palavras</h2>
        <button class="op-pill" data-act="toggle-tray" title="Alternar entre E e OU">${target.op === "OR" ? "OU (OR)" : "E (AND)"} ⇄</button>
      </div>
      <p class="hero-sub">Digite normalmente e separe por <strong>vírgula</strong> ou Enter. Toque num chip para alternar entre hashtag → palavra → frase exata. ✎ edita.</p>
      <div class="chip-entry" data-chip-entry>
        ${target.children
          .map(
            (block, index) => `<span class="term-chip ${bad.has(block.id) ? "bad" : ""}"
          data-kind="${html(block.type)}" data-chip-node="${html(block.id)}">
          <button class="chip-main" title="Trocar tipo" data-act="chip-cycle" data-id="${html(block.id)}">${html(label[block.type] || "⌕")} ${html(block.type === "hashtag" ? "#" + block.value.replace(/^#/, "") : block.type === "phrase" ? "“" + block.value + "”" : block.value)}</button>
          <button class="chip-edit" title="Editar valor" data-act="chip-edit" data-id="${html(block.id)}">✎</button>
          <button class="chip-x" title="Remover" data-act="chip-remove" data-id="${html(block.id)}">×</button></span>`,
          )
          .join("")}
        <input data-chip-input aria-label="Adicionar hashtags separadas por vírgulas"
          placeholder="#hashtag, outra, palavra…" autocomplete="off" spellcheck="false" />
      </div>
      <div class="row rx-search-workbench-row-margin-top" ><span class="inline-label">${target.children.length} termo(s) · toque no operador para mudar a combinação</span></div>
    </section>`;
}

export function renderTags() {
  const container = state.rootShadow?.querySelector(RODX_SELECTORS.tagTray);
  if (container && state.draft) container.innerHTML = tagTrayHTML();
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

export function selectionHTML() {
  return `<section class="rodx-selection-list rx-search-workbench-rodx-selection-list" >
      <div class="row rx-search-workbench-row-align-items" ><strong>Seleções guardadas</strong>
        <span class="muted rx-search-workbench-muted" >(${state.selectionList.length})</span></div>
      <p class="muted">Selecione uma palavra no post ou {uma frase inteira}, e guarde aqui para reutilizar.</p>
      <div class="row rx-search-workbench-row-flex-wrap-gap" >${
        state.selectionList
          .map(
            (term, index) => `
        <span class="chip rx-search-workbench-chip" >
          <span>${html(term)}</span>
          <button class="btn mini" title="Adicionar à pesquisa" data-act="selection-use" data-index="${index}">+</button>
          <button class="btn mini" title="Excluir da pesquisa" data-act="selection-exclude" data-index="${index}">−</button>
          <button class="btn mini" title="Remover da lista" data-act="selection-delete" data-index="${index}">×</button>
        </span>`,
          )
          .join("") || '<span class="muted">Nenhuma seleção ainda.</span>'
      }</div>
    </section>`;
}

export function presetsHTML() {
  return `${selectionHTML()}<section class="preset-shelf" aria-label="Biblioteca de presets">
      <h3>Presets e baselines (${state.presets.length})</h3>
      <p class="muted">Salve uma query como receita reutilizável. Combine várias com E/OU e acrescente novas hashtags sem alterar a receita original.</p>
      ${
        state.presets.length
          ? state.presets
              .map(
                (preset) => `<div class="preset-card">
        <div class="preset-name"><strong>✦ ${html(preset.name)}</strong><span class="spacer"></span>
          <span class="inline-label">${html(new Date(preset.updatedAt).toLocaleDateString("pt-BR"))}</span></div>
        <div class="query-sm">${html(preset.query)}</div>
        <div class="preset-list">
          <button class="btn primary" data-act="preset-insert" data-id="${html(preset.id)}">＋ Adicionar à busca</button>
          <button class="btn" data-act="preset-edit" data-id="${html(preset.id)}">Editar base</button>
          <button class="btn danger" data-act="preset-delete" data-id="${html(preset.id)}">Excluir</button>
        </div>
      </div>`,
              )
              .join("")
          : '<p class="muted">Nenhum preset salvo. Monte uma query no Editor e toque em Salvar preset.</p>'
      }
      <div class="row"><button class="btn primary" data-act="view-editor">🧩 Abrir editor</button></div>
    </section>`;
}

export function presetShelfHTML() {
  return `<section class="preset-shelf">
      <h3>✦ Inserir presets</h3>
      <div class="preset-list">${state.presets.map((p) => `<button class="btn smol" data-act="preset-insert" data-id="${html(p.id)}">＋ ${html(p.name)}</button>`).join("") || '<span class="muted">Salve uma base abaixo para reutilizá-la depois.</span>'}</div>
      <div class="row rx-search-workbench-row-margin-top-margin-top-11px" >
        <input class="ctrl rx-search-workbench-ctrl"  maxlength="100" data-preset-name
          value="${html(state.draft.presetName || "")}" placeholder="Nome da base · Ex.: Mídia + hashtags" />
        <button class="btn primary" data-act="preset-save">${state.presetEditingId ? "Atualizar preset" : "Salvar preset"}</button>
        ${state.presetEditingId ? '<button class="btn" data-act="preset-save-new">Salvar como novo</button>' : ""}
      </div>
      <p class="inline-label">Cada base salva a expressão completa atual. Inserir uma base cria novos blocos independentes para você personalizar.</p>
    </section>`;
}

export function blockValueHTML(block) {
  if (block.type === "media") {
    return `<select class="ctrl" data-block-value="${html(block.id)}">
        <option value="">Selecione mídia…</option>
        ${BLOCK_MEDIA.map(
          ([key, label]) => `<option value="${key}"
          ${key === block.value ? "selected" : ""}>${html(label)}</option>`,
        ).join("")}
      </select>`;
  }
  const examples = {
    hashtag: "#fotografia",
    keyword: "retrato",
    phrase: "minha frase",
    author: "@NASA",
    raw: "min_faves:100",
  };
  return `<input class="ctrl" data-block-value="${html(block.id)}"
      aria-label="Valor do bloco" value="${html(block.value)}"
      placeholder="${html(examples[block.type] || "")}" />`;
}

export function blockHTML(block, depth = 0, isRoot = false) {
  if (block.kind === "term") {
    return `<div class="block-term" data-block-node="${html(block.id)}">
        <select class="ctrl" data-block-type="${html(block.id)}" aria-label="Tipo do bloco">
          ${BLOCK_TYPES.map(
            ([key, label]) => `<option value="${key}"
            ${block.type === key ? "selected" : ""}>${html(label)}</option>`,
          ).join("")}
        </select>
        ${blockValueHTML(block)}
        <label class="block-neg" title="Excluir resultados que correspondem a este bloco">
          <input type="checkbox" data-block-not="${html(block.id)}"
            ${block.not ? "checked" : ""} /> NÃO</label>
        <button class="btn mini ghost" data-act="block-up" data-id="${html(block.id)}"
          title="Mover para cima">↑</button>
        <button class="btn mini ghost" data-act="block-down" data-id="${html(block.id)}"
          title="Mover para baixo">↓</button>
        <button class="btn mini danger" data-act="block-remove" data-id="${html(block.id)}"
          title="Remover bloco">×</button>
      </div>`;
  }
  return `<section class="block-group ${isRoot ? "root" : ""} level-${depth}"
      data-block-node="${html(block.id)}" aria-label="Grupo lógico">
      <div class="block-head">
        <span class="block-head-title">${isRoot ? "GRUPO PRINCIPAL" : "Subgrupo"}</span>
        <span class="hint-small">Combinar com</span>
        <button class="op-pill" data-act="block-toggle-op" data-id="${html(block.id)}"
          aria-label="Alternar operador lógico do grupo">${block.op === "AND" ? "E (AND)" : "OU (OR)"} ⇄</button>
        ${
          !isRoot
            ? `<button class="op-pill" data-act="block-toggle-not" data-id="${html(block.id)}"
          title="Excluir este grupo">${block.not ? "NÃO ativo" : "NÃO"}</button>`
            : ""
        }
        ${
          isRoot
            ? ""
            : `<span class="spacer"></span>
          <button class="btn mini ghost" data-act="block-up" data-id="${html(block.id)}">↑</button>
          <button class="btn mini ghost" data-act="block-down" data-id="${html(block.id)}">↓</button>
          <button class="btn mini danger" data-act="block-remove" data-id="${html(block.id)}">×</button>`
        }
      </div>
      <div class="block-content">${
        block.children.filter((c) => !c.tagTray).length
          ? block.children
              .filter((c) => !c.tagTray)
              .map(
                (
                  child,
                  i,
                ) => `${i ? `<div class="block-join"><button class="op-pill" data-act="block-toggle-op" data-id="${html(block.id)}">${block.op === "OR" ? "OU ⇄" : "E ⇄"}</button></div>` : ""}
        ${blockHTML(child, depth + 1)}`,
              )
              .join("")
          : '<div class="block-empty">Adicione abaixo palavras, mídia e grupos, ou use o campo de hashtags acima.</div>'
      }</div>
      <div class="builder-buttons rx-search-workbench-builder-buttons" >
        <button class="btn mini quick-add" data-act="block-add-tag" data-id="${html(block.id)}">＋ Hashtag</button>
        <button class="btn mini" data-act="block-add-keyword" data-id="${html(block.id)}">＋ Palavra</button>
        <button class="btn mini" data-act="block-add-media" data-id="${html(block.id)}">＋ Mídia</button>
        <button class="btn mini" data-act="block-add-group" data-id="${html(block.id)}"
          ${depth >= MAX_BLOCK_DEPTH - 2 ? 'disabled title="Limite de subgrupos"' : ""}>＋ ( Grupo )</button>
      </div>
    </section>`;
}

export function builderHTML() {
  return `<section class="builder" aria-label="Construtor de busca por blocos">
      <div class="builder-header">
        <div><h3 class="hero-title">🧩 Montar query com blocos</h3>
          <p class="hero-sub rx-search-workbench-hero-sub" >Combine hashtags, palavras e mídia usando E, OU, NÃO e parênteses.</p></div>
      </div>
      <div class="builder-buttons rx-search-workbench-builder-buttons-margin-bottom" >
        <button class="btn mini quick-add" data-act="template-tag-or-word">＃ Hashtag OU palavra</button>
        <button class="btn mini" data-act="template-tag-and-group">＃ E (＃ OU palavra)</button>
        <button class="btn mini" data-act="template-media-or">📷 Fotos OU vídeos</button>
        <button class="btn mini danger" data-act="block-clear">Limpar blocos</button>
      </div>
      <div data-blocks-container>${blockHTML(state.draft.blocks, 0, true)}</div>
      <p class="block-help"><strong>E</strong> exige as duas condições. <strong>OU</strong> aceita qualquer uma.
        <strong>NÃO</strong> exclui um termo. Grupos produzem <code>(... OR ...)</code>.
        Os filtros destacados acima e os filtros avançados entram como <strong>E</strong> com a expressão dos blocos.</p>
    </section>`;
}

export function renderBlockEditor() {
  const root = state.rootShadow;
  const container = root?.querySelector(RODX_SELECTORS.blocksContainer);
  if (container && state.draft) container.innerHTML = blockHTML(state.draft.blocks, 0, true);
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

export function editorHTML() {
  const draft = state.draft;
  migrateLegacyTags(draft);
  return `<div class="editor-top stack">
      <div class="grid">
        <div class="field wide"><label>Nome da timeline</label>
          <input class="ctrl" data-meta="name" maxlength="100" placeholder="Ex.: Tech Brasil, Notícias, Futebol" value="${html(draft.name)}" /></div>
        <div class="field"><label>Ícone / emoji</label>
          <input class="ctrl" data-meta="icon" maxlength="4" value="${html(draft.icon)}" placeholder="🔎" /></div>
        <div class="field"><label>Visualização padrão</label>
          <select class="ctrl" data-meta="sort">${SORTS.map(([key, label]) => `<option value="${key}" ${key === draft.sort ? "selected" : ""}>${html(label)}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>Máximo de posts visíveis (0 = ilimitado)</label>
        <input class="ctrl" type="number" min="0" max="${MAX_VISIBLE}" step="1"
          data-meta="resultLimit" value="${html(draft.resultLimit)}" />
      </div>
      <label class="tog"><input type="checkbox" data-meta="pinned" ${draft.pinned ? "checked" : ""} /> Mostrar como aba na Home</label>
    </div>
    <div data-tag-tray>${tagTrayHTML()}</div>
    <section class="priority" aria-label="Filtros de mídia">
      <h2 class="hero-title">▣ Tipo de mídia</h2>
      <p class="hero-sub">Filtro global aplicado à query inteira. Para mídias alternativas, use um grupo OU no builder.</p>
      <div class="priority-grid">
        ${renderField(["media", "Tipo de mídia", "select", [["any", "Qualquer postagem"], ...BLOCK_MEDIA]])}
      </div>
    </section>
    <div class="query-lab" data-lab>
      <div class="query-lab-top"><strong>⌕ Query em tempo real</strong>
        <div class="row"><span class="lab-status" data-analyzer-summary>Validando…</span>
        <button class="btn smol" data-act="copy-query" title="Copiar query">⧉ Copiar</button></div></div>
      <code class="query" data-query-preview></code>
      <div class="issues" data-query-diagnostics></div>
    </div>
    <details class="section" data-raw-workbench open>
      <summary>⌘ Laboratório de parser · editar query manual</summary>
      <div class="section-body workbench">
        <p class="muted">Cole ou escreva uma query com <strong>AND, OR, NOT e parênteses</strong>.
          O diagnóstico sublinha o trecho incorreto e sugere a correção. <strong>links:domínio/**</strong>, <strong>linksre:/expressão/i</strong> e <strong>textre:/expressão/i</strong> são filtros locais que só atuam sobre posts carregados pelo X. Aplicar converte em blocos.</p>
        <textarea class="ctrl raw-code" data-raw-query spellcheck="false" placeholder="filter:media (#troconudes OR #troconuds)">${html(state.rawDirty ? state.rawQueryDraft : "")}</textarea>
        <div class="raw-preview" data-raw-highlight></div>
        <div class="rodx-issues" data-raw-issues></div>
        <div class="inline-label" data-raw-status>Pronto para analisar.</div>
        <div class="row"><button class="btn primary" data-act="raw-apply">↳ Aplicar como blocos</button>
        <button class="btn" data-act="raw-sync">Usar query gerada</button></div>
      </div>
    </details>
    ${presetShelfHTML()}
    ${builderHTML()}
    ${GROUPS.map(
      (group) => `<details class="section" data-group="${group.id}"
      ${state.openedGroups.has(group.id) ? "open" : ""}>
        <summary>${group.icon} &nbsp;${html(group.title)}</summary>
        <div class="section-body"><div class="grid">${group.fields.map(renderField).join("")}</div></div>
      </details>`,
    ).join("")}
    <p class="muted hint">O campo livre aceita qualquer operador do buscador web do X.
      Alguns filtros experimentais podem depender de alterações da plataforma.
      A data final é tratada como inclusiva.</p>
    <button class="btn rx-search-workbench-btn" data-act="block-fix" >✦ Corrigir duplicatas e filtros redundantes com segurança</button>`;
}

export function savedHTML() {
  if (!state.searches.length) {
    return `<div class="empty">Ainda não há pesquisas salvas.<br />
        <span class="muted">Crie uma busca avançada ou importe uma pesquisa que já esteja aberta.</span><br />
        <button class="btn primary rx-search-workbench-btn-margin-top"  data-act="new">Criar primeira pesquisa</button>
      </div>`;
  }
  return `${selectionHTML()}<div class="row rx-search-workbench-row-margin-bottom" >
      <button class="btn primary" data-act="new">+ Nova pesquisa</button>
      <button class="btn" data-act="capture" ${currentSearch() ? "" : "disabled"}>Salvar busca atual</button>
    </div>
    ${state.searches
      .map(
        (s, i) => `<article class="saved-item">
      <div class="saved-top"><div class="saved-title">${html(s.icon)} ${html(s.name)}</div>
        ${s.pinned ? '<span class="chip">Na Home</span>' : ""}
        <span class="chip">${html(SORTS.find(([key]) => key === s.sort)?.[1] || "Recentes")}</span>
      </div>
      <div class="query-sm">${html(s.query)}</div>
      <div class="muted">${s.resultLimit ? `Até ${s.resultLimit} posts visíveis` : "Exibição ilimitada"} · ${html(s.sort === "live" ? "Recentes" : "Busca nativa")}</div>
      <div class="saved-actions">
        <button class="btn smol primary" data-act="open-search" data-id="${html(s.id)}">Ver</button>
        ${s.sort !== "live" ? `<button class="btn smol" data-act="open-recent" data-id="${html(s.id)}">Recentes</button>` : ""}
        <button class="btn smol" data-act="edit" data-id="${html(s.id)}">Editar</button>
        <button class="btn smol" data-act="pin" data-id="${html(s.id)}">${s.pinned ? "Desafixar" : "Fixar"}</button>
        <button class="btn smol" data-act="duplicate" data-id="${html(s.id)}">Duplicar</button>
        <button class="btn smol" data-act="up" data-id="${html(s.id)}" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="btn smol" data-act="down" data-id="${html(s.id)}" ${i === state.searches.length - 1 ? "disabled" : ""}>↓</button>
        <button class="btn smol danger" data-act="delete" data-id="${html(s.id)}">Excluir</button>
      </div>
    </article>`,
      )
      .join("")}`;
}

export function dataHTML() {
  return `<div class="stack">
      <div class="banner">Os dados abaixo pertencem exclusivamente à conta
        <strong>${html(identityLabel())}</strong>.
        Não há sincronização com os servidores do X.</div>
      <section class="section"><div class="section-body">
        <strong>☁ Sincronização pessoal no D1</strong>
        <p class="muted">Pesquisas, presets, configurações visuais, histórico e vistos ficam
        separados por pessoa e por conta do X. A chave pessoal é diferente do
        token compartilhado de envio ao Telegram. O modo local continua funcionando sem ela.</p>
        <button class="btn primary" data-act="cloud-configure">Configurar chave pessoal</button>
        <p class="muted">Peça uma chave <code>rodx_...</code> criada pelo provisionamento do relay.
        Nunca coloque o token do Telegram aqui.</p>
      </div></section>
      <div class="line"></div>
      <strong>Backup das suas pesquisas</strong>
      <p class="muted">Exporte um JSON de todas as pesquisas desta conta e importe no
        outro navegador ou dispositivo. A importação nunca modifica pesquisas de outra conta.</p>
      <button class="btn" data-act="export" ${state.account ? "" : "disabled"}>↓ Exportar JSON</button>
      <div class="line"></div>
      <div class="field"><label>Importar arquivo .json</label>
        <input class="ctrl" type="file" data-file="import" accept="application/json,.json" /></div>
      <div class="field"><label>Estratégia de importação</label>
        <select class="ctrl" data-import-strategy>
          <option value="merge">Mesclar (mantém as pesquisas atuais)</option>
          <option value="replace">Substituir tudo nesta conta</option>
        </select></div>
      <p class="muted">Se IDs coincidirem, a pesquisa importada substituirá a existente
        na opção Mesclar. Faça um backup antes de substituir tudo.</p>
      <div class="line"></div>
      <strong>Armazenamento</strong>
      <p class="muted">Motor em uso: <strong>${gmAvailable ? "GM storage (compartilhado entre x.com e twitter.com)" : "localStorage (separado por domínio)"}</strong>.
        Identidade: <strong>${html(state.accountSource || "não detectada")}</strong>.
        Identificação de conta é feita pelo perfil do usuário logado visível na interface.
        Se o identificador de sessão não estiver acessível, o script usa o perfil conectado.</p>
      <div class="field"><label>Conta manual (fallback para iPhone / layout sem perfil)</label>
        <div class="row"><input class="ctrl rx-search-workbench-ctrl-flex"  data-manual-account
          placeholder="@meuusuario" maxlength="16" />
          <button class="btn" data-act="set-manual-account">Usar conta</button></div>
        <p class="muted">Use apenas se a detecção automática falhar. Ao trocar de conta,
          selecione a conta correta. Nenhum token de sessão é salvo.</p></div>
      <p class="muted">RodX Search Deck v${VERSION} · Atalho: Alt + Shift + S</p>
    </div>`;
}

export function panelHTML() {
  const disabled = !state.account;
  if (state.view === "editor" && !state.draft) state.draft = blankDraft();
  return `<div class="scrim" data-act="close"></div>
      <section class="panel" role="dialog" aria-modal="true" data-view="${html(state.view)}" aria-label="RodX Search Deck">
        <div class="panel-head">
          <div class="head-row"><div><div class="brand">⌕ RodX Search Deck</div>
            <div class="sub">Timelines e pesquisas avançadas para o X</div></div>
            <div class="row"><span class="account">${html(identityLabel())}</span>
              <button class="btn smol" data-act="close" aria-label="Voltar ao X">✕ Fechar</button></div>
          </div>
          <div class="tabs">
            <button class="tab ${state.view === "saved" ? "active" : ""}" data-act="view-saved">Salvas (${state.searches.length})</button>
            <button class="tab ${state.view === "editor" ? "active" : ""}" data-act="view-editor">Editor</button>
            <button class="tab ${state.view === "presets" ? "active" : ""}" data-act="view-presets">Presets (${state.presets.length})</button>
            <button class="tab ${state.view === "relay" ? "active" : ""}" data-act="view-relay">Telegram</button>
            <button class="tab ${state.view === "xrepost" ? "active" : ""}" data-act="view-xrepost">Vídeos X</button>
            <button class="tab" data-act="view-network">REDE</button>
            <button class="tab" data-act="lists-studio">Listas e membros</button><button class="tab ${state.view === "visual" ? "active" : ""}" data-act="view-visual">Preferências</button>
            <button class="tab ${state.view === "data" ? "active" : ""}" data-act="view-data">Backup</button>
          </div>
        </div>
        <div class="body" data-scroll-area>
          ${state.message ? `<div class="message">${html(state.message)}</div>` : ""}
          ${state.storageWarning ? `<div class="storage-warning">⚠ ${html(state.storageWarning)}</div>` : ""}
          ${disabled ? '<div class="banner">Conta não detectada. Abra a aba Backup para definir manualmente o @usuário, caso o X esconda os dados da sessão.</div>' : ""}
          ${state.view === "saved" ? savedHTML() : state.view === "editor" ? editorHTML() : state.view === "presets" ? presetsHTML() : state.view === "relay" ? Relay.settingsHTML() : state.view === "xrepost" ? XRepost.htmlView() : state.view === "visual" ? visualHTML() : dataHTML()}
        </div>
        ${state.view === "editor" && state.saveError ? `<div class="save-feedback" role="alert">✕ Não foi possível salvar: ${html(state.saveError)}</div>` : ""}
        <footer class="foot">
          ${
            state.view === "editor"
              ? `<button class="btn primary" data-act="save" ${disabled || state.busy ? "disabled" : ""}>${state.editingId ? "Salvar alterações" : "Salvar pesquisa"}</button>
              <button class="btn" data-act="preview-search">Testar</button>
              <button class="btn" data-act="capture" ${currentSearch() ? "" : "disabled"}>Usar busca atual</button>`
              : state.view === "relay"
                ? `<button class="btn primary" data-act="relay-save">Salvar</button>
                <button class="btn" data-act="relay-health">Testar conexão</button>`
                : state.view === "xrepost"
                  ? `<button class="btn primary" data-act="xrepost-refresh">Atualizar fila D1</button>`
                  : `<button class="btn" data-act="capture" ${currentSearch() ? "" : "disabled"}>Capturar busca atual</button>`
          }
          <span class="spacer"></span>
          <button class="btn ghost" data-act="close">Fechar</button>
        </footer>
      </section>`;
}

export function visualHTML() {
  const v = state.visual;
  return `<section class="rodx-visual" aria-label="Personalização da interface">
      <h2 class="hero-title">RodX Studio · módulos e desempenho</h2>
      <p class="muted">${html(Studio.state.network.ready ? "Ponte única de rede ativa" : Studio.state.network.error || "Aguardando ponte de rede")}</p>
      <div class="grp">${Object.entries({
        lists: "Listas, membros e fila",
        profile: "Listas no perfil",
        layout: "Perfil compacto e barra do tweet",
        media: "Player e reprodução",
        links: "Links e Telegram",
        translation: "Tradução",
        hygiene: "Limpeza da interface",
        customTimeline: "Timeline própria das listas (opcional)",
      })
        .map(
          ([key, label]) =>
            `<label class="tog"><input type="checkbox" data-studio-module="${key}" ${Studio.config.modules[key] ? "checked" : ""}>${label}</label>`,
        )
        .join("")}</div>
      <div class="field"><label>Orçamento entre módulos (ms)</label><input type="number" min="3" max="12" data-studio-budget value="${Studio.config.budgetMs}"></div>
      <div class="field"><label>Agrupar atualizações do DOM (ms)</label><input type="number" min="60" max="500" data-studio-delay value="${Studio.config.scanDelayMs}"></div>
      <div class="field"><label>Meia-vida da frequência/recência de listas (dias)</label>
        <input type="number" min="1" max="180" data-studio-half-life
          value="${Studio.config.frecencyHalfLifeDays || 14}"></div>
      <button data-act="runtime-apply">Aplicar módulos e recarregar</button><button data-act="runtime-diagnostics">Copiar diagnóstico de desempenho</button>
      <h2 class="hero-title">Aparência da timeline</h2>
      <p class="muted">Tamanho de fonte, densidade e hashtags acompanham Home, buscas, perfis, bookmarks e threads. O input nativo do X permanece sem alterações de layout.</p>
      <div class="field"><label>Espaçamento <strong data-visual-value="density">${v.density.toFixed(1)}×</strong></label>
        <input type="range" min="0.55" max="1.4" step="0.05" value="${v.density}" data-visual="density"></div>
      <div class="field"><label>Fonte dos resultados <strong data-visual-value="font">${v.font}px</strong></label>
        <input type="range" min="11" max="19" step="1" value="${v.font}" data-visual="font"></div>
      <label class="tog"><input type="checkbox" data-visual="snap" ${v.snap ? "checked" : ""}> Encaixe suave ao rolar (global)</label>
      <label class="tog"><input type="checkbox" data-visual="compact" ${v.compact ? "checked" : ""}> Usar densidade compacta (tweets começam expandidos)</label>
      <label class="tog"><input type="checkbox" data-visual="colorfulTags" ${v.colorfulTags ? "checked" : ""}> Hashtags com fundo colorido</label>
      <label class="tog"><input type="checkbox" data-visual="blockTweetOpen" ${v.blockTweetOpen ? "checked" : ""}> Bloquear abertura do tweet ao tocar no conteúdo (desmarcar restaura o clique nativo)</label>
      <label class="tog"><input type="checkbox" data-visual="translatePosts" ${v.translatePosts ? "checked" : ""}> Traduzir automaticamente quando o X oferecer tradução</label>
      <label class="tog"><input type="checkbox" data-visual="translateForeignTags" ${v.translateForeignTags ? "checked" : ""}> Traduzir hashtags em outros idiomas (PT/ES/EN não recebem tradução)</label>
      <p class="muted">A tradução das hashtags usa o serviço público do Google Translate, quando disponível. As hashtags originais no post não são alteradas. No Safari, pode haver bloqueio de rede.</p>
      <div class="field"><label>Player de vídeo</label><select class="ctrl" data-visual="playerMode">${[
        ["videojs", "Video.js 10.3.0 (padrão)"],
        ["twitter", "Player normal do X"],
        ["rodx", "Controles RodX"],
      ]
        .map(
          ([key, label]) =>
            `<option value="${key}" ${v.playerMode === key ? "selected" : ""}>${label}</option>`,
        )
        .join("")}</select></div>
      <label class="tog"><input type="checkbox" data-visual="videoMute" ${v.videoMute ? "checked" : ""}> Vídeos sempre mudos, exceto ao tocar no volume</label>
      <p class="muted">Resolução automática controlada pelo player do X (seletor desativado nesta versão).</p>
      <div class="field"><label>Iniciar vídeo com <strong data-visual-value="autoPlayEnterPercent">${v.autoPlayEnterPercent}%</strong> da mídia visível</label>
        <input type="range" min="10" max="100" step="5" data-visual="autoPlayEnterPercent" value="${v.autoPlayEnterPercent}"></div>
      <div class="field"><label>Pausar depois que <strong data-visual-value="autoPauseExitPercent">${v.autoPauseExitPercent}%</strong> sair da tela</label>
        <input type="range" min="10" max="100" step="5" data-visual="autoPauseExitPercent" value="${v.autoPauseExitPercent}"></div>
      <label class="tog"><input type="checkbox" data-visual="swipeToCloseVideo" ${v.swipeToCloseVideo ? "checked" : ""}> Deslizar para baixo para sair do vídeo imersivo</label>
      <p class="muted">O início e a pausa usam limiares separados para não ficar oscilando ao rolar. A reprodução automática ainda depende das permissões do Safari e do player do X.</p>
      <label class="tog"><input type="checkbox" data-visual="hideSeen" ${v.hideSeen ? "checked" : ""}> Ocultar tweets já vistos nesta conta</label>
      <div class="field"><label>Quanto do tweet deve estar na tela para marcar visto <strong data-visual-value="viewedThreshold">${Math.round(v.viewedThreshold * 100)}%</strong></label>
        <input type="range" min="0.35" max="0.9" step="0.05" value="${v.viewedThreshold}" data-visual="viewedThreshold"></div>
      <div class="field"><label>Tempo mínimo antes de registrar a leitura <strong data-visual-value="seenDelayMs">${(v.seenDelayMs / 1000).toFixed(1)}s</strong></label>
        <input type="range" min="1000" max="8000" step="500" value="${v.seenDelayMs}" data-visual="seenDelayMs"></div>
      <p class="muted">O tweet só é marcado como visto depois de cumprir esse tempo visível e sair <strong>completamente</strong> da tela. Sair antes do tempo, trocar de aba ou ocultar o navegador não conta.</p>
    </section>`;
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
    document.querySelector(NATIVE_X_SELECTORS.primaryColumn) ||
    document.querySelector(DOM_SELECTORS.mainElement) ||
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

export function renderRoot() {
  if (!state.rootShadow) return;
  applyXTheme(state.rootHost);
  const oldBody = state.rootShadow.querySelector(RODX_SELECTORS.workspaceScrollArea);
  const oldView = state.rootShadow.querySelector(RODX_SELECTORS.replPanel)?.dataset.view;
  const restoreScroll = Boolean(state.open && oldBody && oldView === state.view);
  const scrollTop = restoreScroll ? oldBody.scrollTop : 0;
  state.rootShadow.innerHTML = `<style>${CSS}${CUSTOM_CSS}${workbenchOverrides2}</style>
      ${state.open ? panelHTML() : ""}`;
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
  const active = currentSearch();
  const pinned = state.searches.filter((search) => search.pinned);
  const onSearch = /^\/(?:search(?:\/|$)|hashtag\/)/.test(location.pathname);
  const horizontalScroll = dock.querySelector(RODX_SELECTORS.searchDock)?.scrollLeft || 0;
  dock.innerHTML = `<style>
${CSS}${CUSTOM_CSS}${workbenchOverrides1}</style><nav class="dock" data-route="${onSearch ? "search" : "home"}" aria-label="Timelines personalizadas">
      <span class="dock-caption">${onSearch ? "Pesquisas" : "Minha Home"}</span>
      <button data-act="home" class="${location.pathname === "/home" ? "active" : ""}">⌂ Início</button>
      ${pinned
        .map(
          (search) => `<span class="rodx-dock-item" data-drag-id="${html(search.id)}">
        <button class="rodx-drag-handle" draggable="false" data-drag-handle="${html(search.id)}" title="Segure e arraste para reorganizar" aria-label="Reorganizar ${html(search.name)}">⠿</button>
        <button data-act="open-search" data-id="${html(search.id)}"
        class="${active?.query === search.query && active.sort === search.sort ? "active" : ""}"
        title="${html(search.query)}">${html(search.icon)} ${html(search.name)}</button></span>`,
        )
        .join("")}
      ${(Studio.services.lists?.quickLists() || []).map((list) => `<button data-studio-list="${html(list.id)}" title="${html(Studio.services.lists.displayName(list))}">☷ ${html(Studio.services.lists.displayName(list))}</button>`).join("")}
      <button data-act="lists-studio">☷ Listas</button>
      <button data-act="new" class="plus" title="Criar timeline">+ Criar</button>
      <button data-act="open" title="Organizar pesquisas">⚙</button>
    </nav>`;
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
  const input = document.querySelector(NATIVE_X_SELECTORS.nativeSearchInput);
  return input?.value?.trim() || nativeSearch()?.query || "";
}

export function editNativeSearch() {
  captureCurrent();
  state.message = "Busca convertida em blocos editáveis. Operadores desconhecidos ficam como blocos livres.";
  renderRoot();
}
