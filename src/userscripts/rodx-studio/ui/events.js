import { cssDeclarations } from "../../../core/css.js";
import inlineCSS1 from "../../../styles/inline/userscripts-rodx-studio-ui-events-1.css?inline";
import { CSS_SELECTORS } from "../../../selectors.js";
import { Studio } from "../core/studio.js";
import { FeedFilters } from "../feeds/filters.js";
import { extractIdentity } from "../identity/account.js";
import { PlayerPreference } from "../media/player.js";
import { VideoTransport } from "../media/transport.js";
import { actionForSearch, captureCurrent, getPreviewQuery, newDraft, saveDraft } from "../search/actions.js";
import { compactBlockTree } from "../search/block-editing.js";
import { findBlockNode, normalizeBlockTree } from "../search/blocks.js";
import { NativeQueryTags } from "../search/native-tags.js";
import {
  applyRawBlocks,
  chipAction,
  deletePreset,
  editPreset,
  insertPreset,
  savePreset,
  toggleBlockOperator,
} from "../search/presets.js";
import { QueryEngine, hrefFor } from "../search/query-compiler.js";
import { state } from "../state/deck.js";
import { normalizeVisual } from "../state/visual.js";
import { loadAccount, saveState } from "../storage/account.js";
import { exportJSON, importJSON } from "../storage/backup.js";
import { CloudSync } from "../sync/cloud.js";
import { Relay } from "../telegram/relay.js";
import { ResultEnhancer } from "../tweets/enhancer.js";
import { XRepost } from "../tweets/publisher.js";
import { repaint } from "./dock.js";
import { openPanel } from "./preferences.js";
import {
  addChips,
  displayPreview,
  editNativeSearch,
  liveNativeQuery,
  modifyBlocks,
  renderBlockEditor,
  renderRoot,
  validateRawWorkbench,
} from "./search-workbench.js";
import { showRodxToast } from "./toast.js";

export async function performAction(action, id = "") {
  switch (action) {
    case "lists-studio":
      return Studio.services.lists?.open();
    case "runtime-apply": {
      const root = state.rootShadow;
      const modules = {
        ...Studio.config.modules,
      };
      root
        .querySelectorAll(CSS_SELECTORS.s253)
        .forEach((input) => (modules[input.dataset.studioModule] = input.checked));
      Studio.configure({
        modules,
        budgetMs: Number(root.querySelector(CSS_SELECTORS.s254).value),
        scanDelayMs: Number(root.querySelector(CSS_SELECTORS.s255).value),
        frecencyHalfLifeDays: Number(root.querySelector(CSS_SELECTORS.s256).value),
      });
      location.reload();
      return;
    }
    case "runtime-diagnostics": {
      const data = JSON.stringify(Studio.diagnostics(), null, 2);
      await navigator.clipboard.writeText(data);
      showRodxToast("Diagnóstico copiado (sem tokens ou pesquisas).");
      return;
    }
    case "open":
      return openPanel("saved");
    case "close":
      state.open = false;
      return renderRoot();
    case "view-saved":
      return openPanel("saved");
    case "view-editor":
      return openPanel("editor");
    case "view-presets":
      return openPanel("presets");
    case "view-data":
      return openPanel("data");
    case "view-relay":
      return openPanel("relay");
    case "view-xrepost":
      return openPanel("xrepost");
    case "xrepost-refresh":
    case "xrepost-next":
    case "xrepost-tab":
    case "xrepost-prepare":
    case "xrepost-edit":
    case "xrepost-delay":
    case "xrepost-copy":
    case "xrepost-save":
      return XRepost.action(action, id);
    case "view-network":
      state.open = false;
      renderRoot();
      queueMicrotask(() => Studio.services.networkInspector?.open());
      return;
    case "view-visual":
      return openPanel("visual");
    case "cloud-configure":
      return CloudSync.configure();
    case "relay-save":
    case "relay-health":
    case "relay-refresh":
    case "relay-cancel":
    case "relay-force":
      return await Relay.action(action);
    case "new":
      return newDraft();
    case "capture":
      return captureCurrent();
    case "home":
      return location.assign("/home");
    case "copy-native": {
      const query = liveNativeQuery();
      if (!query) throw new Error("Nada para copiar.");
      try {
        await navigator.clipboard.writeText(query);
      } catch (_) {
        const ta = document.createElement("textarea");
        ta.value = query;
        document.body.append(ta);
        ta.select();
        if (!document.execCommand("copy")) throw new Error("Não foi possível copiar automaticamente.");
        ta.remove();
      }
      return;
    }
    case "edit-current-native":
      return editNativeSearch();
    case "set-manual-account": {
      const raw = state.rootShadow?.querySelector(CSS_SELECTORS.s257)?.value || "";
      const handle = raw.trim().replace(/^@/, "").toLowerCase();
      if (!/^[a-z0-9_]{1,15}$/.test(handle)) throw new Error("Informe um @usuário válido.");
      state.manualAccount = handle;
      const identity = extractIdentity();
      if (identity.id || (identity.handle && identity.handle !== handle)) {
        state.message = "O X já identificou uma conta automaticamente. Não alterei a conta ativa.";
        return renderRoot();
      }
      await loadAccount(identity);
      state.message = `Conta manual: @${handle}.`;
      return repaint();
    }
    case "save":
      return await saveDraft();
    case "preset-save":
      return await savePreset();
    case "preset-save-new":
      return await savePreset(true);
    case "preset-insert":
      return insertPreset(id);
    case "preset-edit":
      return editPreset(id);
    case "preset-delete":
      return await deletePreset(id);
    case "toggle-tray":
    case "chip-cycle":
    case "chip-edit":
    case "chip-remove":
      return chipAction(action, id);
    case "block-toggle-op":
      return toggleBlockOperator(id);
    case "block-toggle-not": {
      const found = findBlockNode(state.draft.blocks, id);
      if (!found || found.node.kind !== "group" || !found.parent) return;
      found.node.not = !found.node.not;
      return renderBlockEditor();
    }
    case "block-fix": {
      const removed = compactBlockTree(state.draft.blocks);
      state.autoFixSummary = `${removed} duplicata(s) ou filtro(s) redundante(s) eliminados. Conflitos sem solução inequívoca foram preservados em vermelho.`;
      state.message = state.autoFixSummary;
      renderRoot();
      return;
    }
    case "raw-apply":
      return applyRawBlocks();
    case "raw-sync": {
      const raw = state.rootShadow?.querySelector(CSS_SELECTORS.s206);
      if (raw) raw.value = getPreviewQuery();
      state.rawDirty = false;
      state.rawQueryDraft = raw?.value || "";
      if (raw) validateRawWorkbench(raw.value);
      return;
    }
    case "focus-block": {
      const item = [...(state.rootShadow?.querySelectorAll(CSS_SELECTORS.s258) || [])].find(
        (el) => el.dataset.blockNode === id || el.dataset.chipNode === id,
      );
      item?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }
    case "preview-search":
      return location.assign(hrefFor(getPreviewQuery(), state.draft.sort));
    case "block-clear":
    case "block-up":
    case "block-down":
    case "block-remove":
    case "block-add-tag":
    case "block-add-keyword":
    case "block-add-media":
    case "block-add-group":
    case "template-tag-or-word":
    case "template-tag-and-group":
    case "template-media-or": {
      // Keep a copy for rollback of oversized/invalid template additions.
      state.draft._previousBlocks = normalizeBlockTree(state.draft.blocks);
      try {
        return modifyBlocks(action, id);
      } finally {
        delete state.draft._previousBlocks;
      }
    }
    case "copy-query": {
      const q = getPreviewQuery();
      try {
        await navigator.clipboard.writeText(q);
      } catch (_) {
        const ta = document.createElement("textarea");
        ta.value = q;
        ta.style.cssText = cssDeclarations(inlineCSS1);
        document.body.append(ta);
        ta.select();
        const copied = document.execCommand("copy");
        ta.remove();
        if (!copied)
          throw new Error("Permissão de copiar bloqueada. Selecione o texto no preview para copiar.");
      }
      state.message = "Query copiada.";
      return renderRoot();
    }
    case "export":
      return exportJSON();
    case "open-search":
    case "open-recent":
    case "edit":
    case "pin":
    case "duplicate":
    case "up":
    case "down":
    case "delete":
      return await actionForSearch(action, id);
    default:
      return;
  }
}

export function onClick(event) {
  const selectionButton = event.target.closest?.(CSS_SELECTORS.s259);
  if (selectionButton) {
    event.preventDefault();
    const index = Number(selectionButton.dataset.index),
      term = state.selectionList[index];
    if (term != null) {
      if (selectionButton.dataset.act === "selection-delete") {
        state.selectionList.splice(index, 1);
        void saveState().catch((e) => showRodxToast(e.message, "error"));
        renderRoot();
      } else if (term.startsWith("#"))
        NativeQueryTags.modify(term, selectionButton.dataset.act === "selection-exclude" ? "exclude" : "add");
      else {
        const old = NativeQueryTags.current(),
          mode = selectionButton.dataset.act === "selection-exclude";
        const updated = QueryEngine.termChange(old, term, mode ? "exclude" : "add");
        if (!NativeQueryTags.write(updated)) showRodxToast("Abra a busca nativa do X.");
      }
    }
    return;
  }
  const el = event.target.closest?.(CSS_SELECTORS.s260);
  if (!el) {
    const issue = event.target.closest?.(CSS_SELECTORS.s261);
    if (issue) {
      const raw = state.rootShadow?.querySelector(CSS_SELECTORS.s206);
      raw?.focus();
      raw?.setSelectionRange(Number(issue.dataset.rawPosition), Number(issue.dataset.rawEnd));
      return;
    }
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (el.dataset.act === "close") {
    state.open = false;
    renderRoot();
    return;
  }
  Promise.resolve()
    .then(() => performAction(el.dataset.act, el.dataset.id))
    .catch((err) => {
      console.error("[RodX]", err);
      state.message = err?.message || String(err);
      if (["save", "preset-save", "preset-save-new"].includes(el.dataset.act)) {
        state.saveError = state.message;
      }
      state.open = true;
      renderRoot();
    });
}

export function onFieldChange(event) {
  const target = event.target;
  if (target.matches?.(CSS_SELECTORS.s262)) {
    const name = target.dataset.visual;
    const v =
      name === "playerMode"
        ? target.value
        : target.type === "checkbox"
          ? target.checked
          : Number(target.value);
    state.visual = normalizeVisual({
      ...state.visual,
      [name]: v,
    });
    const label = state.rootShadow?.querySelector(CSS_SELECTORS.s292(name));
    if (label)
      label.textContent =
        name === "font"
          ? `${state.visual.font}px`
          : name === "viewedThreshold"
            ? `${Math.round(state.visual.viewedThreshold * 100)}%`
            : name === "seenDelayMs"
              ? `${(state.visual.seenDelayMs / 1000).toFixed(1)}s`
              : name === "autoPlayEnterPercent" || name === "autoPauseExitPercent"
                ? `${state.visual[name]}%`
                : `${state.visual.density.toFixed(1)}×`;
    if (event.type === "change")
      void saveState().catch((error) => {
        state.message = error.message;
        renderRoot();
      });
    if (name === "playerMode" && Studio.enabled("media")) {
      PlayerPreference.scan();
      if (PlayerPreference.needsRodX()) VideoTransport.scan();
    }
    FeedFilters.publish();
    ResultEnhancer.scan(true);
    return;
  }
  if (!state.draft) return;
  if (target.matches?.(CSS_SELECTORS.s206)) {
    state.rawDirty = true;
    state.rawQueryDraft = target.value;
    validateRawWorkbench(target.value);
    return;
  }
  if (target.matches?.(CSS_SELECTORS.s205)) {
    state.draft.presetName = target.value;
    return;
  }
  if (target.matches?.(CSS_SELECTORS.s263)) {
    const value = target.value;
    if (/[,;\n]/.test(value)) {
      const endsWithSep = /[,;\n]$/.test(value);
      const parts = value.split(/[,;\n]/);
      const carry = endsWithSep ? "" : parts.pop();
      const ready = endsWithSep ? parts.slice(0, -1) : parts;
      if (ready.some((p) => p.trim())) {
        try {
          addChips(ready.join(","));
        } catch (error) {
          state.message = error.message;
          renderRoot();
        }
      }
      state.rootShadow?.querySelector(CSS_SELECTORS.s263)?.setAttribute("data-pending", carry || "");
      const current = state.rootShadow?.querySelector(CSS_SELECTORS.s263);
      if (current) current.value = carry || "";
    }
    return;
  }
  const blockId =
    target.getAttribute?.("data-block-type") ||
    target.getAttribute?.("data-block-value") ||
    target.getAttribute?.("data-block-op") ||
    target.getAttribute?.("data-block-not");
  if (blockId) {
    const found = findBlockNode(state.draft.blocks, blockId);
    if (!found) return;
    if (target.hasAttribute("data-block-type") && found.node.kind === "term") {
      found.node.type = target.value;
      found.node.value = "";
      renderBlockEditor();
      return;
    }
    if (target.hasAttribute("data-block-value") && found.node.kind === "term") {
      found.node.value = target.value;
    }
    if (target.hasAttribute("data-block-op") && found.node.kind === "group") {
      found.node.op = target.value === "OR" ? "OR" : "AND";
      renderBlockEditor();
      return;
    }
    if (target.hasAttribute("data-block-not") && found.node.kind === "term") {
      found.node.not = target.checked;
    }
    displayPreview();
    return;
  }
  if (!target.matches?.(CSS_SELECTORS.s264)) return;
  if (target.dataset.field) {
    state.draft.fields[target.dataset.field] = target.value;
  } else {
    state.draft[target.dataset.meta] = target.type === "checkbox" ? target.checked : target.value;
  }
  displayPreview();
}

export function onGroupToggle(event) {
  const node = event.target;
  if (!node.matches?.(CSS_SELECTORS.s265)) return;
  if (node.open) state.openedGroups.add(node.dataset.group);
  else state.openedGroups.delete(node.dataset.group);
}

export async function onFileChange(event) {
  if (!event.target.matches?.(CSS_SELECTORS.s266)) return;
  const file = event.target.files?.[0];
  const strategy = state.rootShadow.querySelector(CSS_SELECTORS.s267)?.value || "merge";
  try {
    await importJSON(file, strategy);
  } catch (err) {
    console.error("[RodX]", err);
    state.message = `Falha ao importar: ${err.message}`;
    renderRoot();
  }
}
