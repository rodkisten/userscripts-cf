import { mountView } from "../ui/solid-mount.tsx";
import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { DOM_SELECTORS, RODX_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-network-inspector-1.css?inline";
export function createNetworkInspector(Studio) {
  const records = new Map<any, any>();
  const order = [];
  const settings = {
    maxItems: 180,
    maxBytes: 12_000_000,
    ttlMs: 30 * 60000,
    bodyLimit: 1_500_000,
    ...(Studio.config.networkInspector || {}),
  };
  const configureCapture = () => {
    Studio.configure({ networkInspector: { ...settings } });
    document.documentElement?.setAttribute("data-rodx-inspect-body-limit", String(settings.bodyLimit));
    document.documentElement?.setAttribute("data-rodx-inspect-paused", String(!state.capture));
  };
  const selected = new Set<any>();
  const state = {
    capture: true,
    countDropped: 0,
    bytes: 0,
    active: "",
    tab: "Response",
    raw: false,
    filtered: false,
    reveal: false,
    search: "",
    status: "all",
    visible: 75,
    open: false,
  };
  configureCapture();
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );
  const sensitive =
    /authorization|cookie|csrf|token|secret|password|session|api[-_]?key|private[-_]?key|bearer|ct0|twid|client[-_]?transaction/i;
  const secretPatterns = [
    /(Bearer\s+)[a-z0-9_.~+\/-]+/gi,
    /((?:"|\b)(?:authorization|cookie|x-csrf-token|api[_-]?key|password|secret|access[_-]?token)(?:"|\b)\s*[:=]\s*["']?)[^\s,"'};]+/gi,
    /((?:[?&]|\\")(?:(?:access|auth|refresh|session)[_-]?token|key|secret|ct0)=)[^&#\s"']+/gi,
  ];
  function redact(value, key = "") {
    if (state.reveal) return value;
    if (sensitive.test(key)) return "[REDACTED]";
    if (Array.isArray(value)) return value.map((x) => redact(x));
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
    if (typeof value === "string")
      return secretPatterns.reduce((raw, re) => raw.replace(re, "$1[REDACTED]"), value);
    return value;
  }
  function viewText(raw) {
    if (raw == null || raw === "") return "";
    try {
      return JSON.stringify(redact(JSON.parse(raw)), null, 2);
    } catch {
      return redact(raw);
    }
  }
  function safeURL(value) {
    try {
      const url = new URL(value);
      for (const key of url.searchParams.keys())
        if (sensitive.test(key)) url.searchParams.set(key, "[REDACTED]");
      return url.href;
    } catch {
      return String(value);
    }
  }
  function bytes(entry) {
    return JSON.stringify(entry).length * 2;
  }
  function sweep() {
    const now = Date.now();
    while (order.length) {
      const first = records.get(order[0]);
      if (!first) {
        order.shift();
        continue;
      }
      if (
        order.length <= settings.maxItems &&
        state.bytes <= settings.maxBytes &&
        now - first.at <= settings.ttlMs
      )
        break;
      records.delete(order.shift());
      selected.delete(first.id);
      state.bytes -= first._size || 0;
      state.countDropped++;
      if (state.active === first.id) state.active = "";
    }
  }
  let renderTimer = 0;
  function refreshSoon() {
    if (!state.open || renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = 0;
      renderRows();
      renderDetail();
    }, RUNTIME_LIMITS.networkInspector.refreshSoonDelayMs);
  }
  Studio.on("network:inspect", (event) => {
    if (!state.capture) return;
    const id = String(event.id);
    const old = records.get(id);
    if (event.phase === "request") {
      if (old) return;
      const record = {
        ...event,
        id,
        operation: (() => {
          if (event.operationName) return event.operationName;
          try {
            const url = new URL(event.url);
            return url.searchParams.get("operationName") || url.pathname.split("/").pop() || "GraphQL";
          } catch {
            return "GraphQL";
          }
        })(),
      };
      record._size = bytes(record);
      records.set(id, record);
      order.push(id);
      state.bytes += record._size;
    } else if (old) {
      const phase = old.phase;
      Object.assign(old, event);
      if (event.phase === "request-body") old.phase = phase;
      const newBytes = bytes(old);
      state.bytes += newBytes - old._size;
      old._size = newBytes;
    } else {
      const record = { ...event, id, operation: "GraphQL", at: Date.now(), _size: 0 };
      record._size = bytes(record);
      records.set(id, record);
      order.push(id);
      state.bytes += record._size;
    }
    sweep();
    refreshSoon();
  });
  const root = (<section />) as HTMLElement;
  root.id = "rodx-network-root";
  root.style.setProperty("display", "none", "important");
  mountView(root, () => (
    <>
      {"\n      "}
      <style textContent={extractedCSS1} />
      {"\n      "}
      <div class={"rx-row"}>
        {"\n        "}
        <strong>{"REDE · GraphQL observado"}</strong>
        {"\n        "}
        <button data-rx={"pause"}>{"Pausar"}</button>
        {"\n        "}
        <button data-rx={"clear"}>{"Limpar"}</button>
        {"\n        "}
        <button data-rx={"export"}>{"Exportar seleção"}</button>
        {"\n      "}
      </div>
      {"\n      "}
      <p class={"rx-warning"} data-rx={"stats"}></p>
      {"\n      "}
      <p class={"rx-warning"} data-rx={"selectors"}></p>
      {"\n      "}
      <div class={"rx-row rx-retention"}>
        {"\n        "}
        <label>
          {"Requests "}
          <input type={"number"} data-rx-retain={"maxItems"} min={"20"} max={"1000"} value={"180"} />
        </label>
        {"\n        "}
        <label>
          {"Memória (MiB) "}
          <input type={"number"} data-rx-retain={"maxBytes"} min={"2"} max={"60"} value={"12"} />
        </label>
        {"\n        "}
        <label>
          {"TTL (min) "}
          <input type={"number"} data-rx-retain={"ttlMs"} min={"1"} max={"120"} value={"30"} />
        </label>
        {"\n        "}
        <label>
          {"Corpo (MiB) "}
          <input
            type={"number"}
            data-rx-retain={"bodyLimit"}
            min={"1"}
            max={"10"}
            value={"1.5"}
            step={"0.5"}
          />
        </label>
        {"\n      "}
      </div>
      {"\n      "}
      <div class={"rx-row"}>
        {"\n        "}
        <input
          type={"search"}
          data-rx={"filter"}
          placeholder={"Operação, URL, ID ou status"}
          aria-label={"Filtrar requests"}
        />
        {"\n        "}
        <select data-rx={"status"} aria-label={"Filtrar status"}>
          {"\n          "}
          <option value={"all"}>{"Todos"}</option>
          {"\n          "}
          <option value={"error"}>{"Erros"}</option>
          {"\n          "}
          <option value={"pending"}>{"Pendentes"}</option>
          {"\n          "}
          <option value={"success"}>{"Sucesso"}</option>
          {"\n        "}
        </select>
        {"\n      "}
      </div>
      {"\n      "}
      <div class={"rx-list"} data-rx={"list"}></div>
      {"\n      "}
      <div class={"rx-row"}>
        <button data-rx={"more"}>{"Mostrar mais"}</button>
      </div>
      {"\n      "}
      <div class={"rx-detail"} data-rx={"detail"}></div>
      {"\n      "}
      <p class={"rx-warning"}>
        {
          "\n        A captura começa quando o userscript inicializa, após @require. Chamadas anteriores e de workers isolados\n        não são recuperáveis. Headers forbidden/CORS não aparecem nas APIs do navegador.\n        Credenciais são mascaradas inicialmente e nunca são sincronizadas.\n      "
        }
      </p>
      {"\n    "}
    </>
  ));
  const $ = (selector) => root.querySelector<HTMLElement>(selector);
  function renderRows() {
    const term = state.search.toLocaleLowerCase("pt-BR");
    const match = (item) => {
      const status = Number(item.status || 0);
      if (state.status === "error" && !(item.error || status >= 400)) return false;
      if (state.status === "pending" && item.phase === "response") return false;
      if (state.status === "success" && !(status >= 200 && status < 400)) return false;
      return (
        !term ||
        [item.operation, item.url, item.method, status, item.id].some((value) =>
          String(value || "")
            .toLocaleLowerCase("pt-BR")
            .includes(term),
        )
      );
    };
    const rows = [...order]
      .reverse()
      .map((id) => records.get(id))
      .filter((x) => x && match(x));
    $(RODX_SELECTORS.inspectorStats).textContent =
      `${order.length} registros · ${(state.bytes / 1048576).toFixed(1)} MiB · ` +
      `${state.countDropped} descartados por limite/TTL · ${state.capture ? "capturando" : "pausado"}`;
    $(RODX_SELECTORS.inspectorPause).textContent = state.capture ? "Pausar" : "Retomar";
    const box = $(RODX_SELECTORS.inspectorRequestList);
    const previousScroll = box.scrollTop;
    mountView(
      box,
      () =>
        rows.slice(0, state.visible).map((item) => (
          <>
            {"\n        "}
            <div class={"rx-entry"}>
              {"\n          "}
              <input
                type={"checkbox"}
                data-rx-select={item.id}
                checked={(selected.has(item.id) ? "checked" : "") === "checked"}
                aria-label={["Selecionar registro ", item.id].join("")}
              />
              {"\n          "}
              <button data-rx-open={item.id} class={state.active === item.id ? "rx-current" : ""}>
                {"\n            "}
                <strong>
                  {item.method || "GET"} {item.operation}
                </strong>
                {"\n            "}
                <span class={"rx-small"}>
                  {" · "}
                  {item.status ?? "…"}
                  {" · "}
                  {item.kind || ""}
                  {"\n              · "}
                  {item.origin || "página"}
                  {item.batchCount ? ` · lote ${item.batchCount}` : ""}
                  {"\n              "}
                  {item.queryId ? ` · ${item.queryId}` : ""}
                </span>
                {"\n            "}
                <span class={"rx-small"}>
                  {new Date(item.at).toLocaleTimeString("pt-BR")}
                  {" ·\n              "}
                  {item.durationMs != null ? item.durationMs + " ms" : "pendente"}
                </span>
                {"\n          "}
              </button>
              {"\n        "}
            </div>
            {"\n      "}
          </>
        )) || (
          <>
            <p class={"rx-warning"}>{"Nenhum request corresponde ao filtro."}</p>
          </>
        ),
    );
    box.scrollTop = previousScroll;
    $(RODX_SELECTORS.inspectorLoadMore).hidden = rows.length <= state.visible;
  }
  function textValue(item) {
    if (state.tab === "Headers")
      return JSON.stringify({
        request: item.headers || {},
        response: item.responseHeaders || {},
        unavailable: "Headers restritos pelo navegador não são recuperáveis",
      });
    if (state.tab === "Payload") {
      const u = new URL(item.url || location.href, location.origin);
      return JSON.stringify({
        query: Object.fromEntries(u.searchParams.entries()),
        body: (() => {
          try {
            return JSON.parse(item.requestBody || "null");
          } catch {
            return item.requestBody || "";
          }
        })(),
      });
    }
    return state.filtered && item.filteredBody != null ? item.filteredBody : item.originalBody || "";
  }
  function makeTreeNode(label, value, path, depth = 0) {
    const object = value && typeof value === "object";
    if (!object) {
      const node = (<div />) as HTMLDivElement;
      node.className = "leaf";
      node.textContent = `${label}: ${JSON.stringify(value)}`;
      return node;
    }
    const details = (<details />) as HTMLElement;
    const summary = (<summary />) as HTMLElement;
    const keys = Object.keys(value);
    summary.textContent = `${label} ${Array.isArray(value) ? "[" : "{"}${keys.length}${Array.isArray(value) ? "]" : "}"}`;
    details.append(summary);
    const wrap = (<div />) as HTMLDivElement;
    details.append(wrap);
    details.dataset.path = path;
    details.addEventListener("toggle", () => {
      if (!(details as HTMLDetailsElement).open || details.dataset.loaded) return;
      details.dataset.loaded = "1";
      let offset = 0;
      const pushPage = () => {
        const fragment = document.createDocumentFragment();
        for (const key of keys.slice(offset, offset + 70)) {
          const nextPath = `${path}.${key}`;
          const child = makeTreeNode(key, value[key], nextPath, depth + 1);
          fragment.append(child);
        }
        offset += 70;
        wrap.querySelector<HTMLElement>(RODX_SELECTORS.inspectorPages)?.remove();
        wrap.append(fragment);
        if (offset < keys.length) {
          const more = (<button />) as HTMLButtonElement;
          more.type = "button";
          more.dataset.rxPage = "1";
          more.textContent = `Exibir mais ${Math.min(70, keys.length - offset)} de ${keys.length}`;
          more.onclick = pushPage;
          wrap.append(more);
        }
      };
      pushPage();
    });
    return details;
  }
  function renderDetail() {
    const item = records.get(state.active);
    const target = $(RODX_SELECTORS.inspectorDetail);
    if (!item) {
      target.textContent = "Selecione um request para inspecionar Headers, Payload e Response.";
      return;
    }
    const raw = textValue(item);
    const text = viewText(raw);
    const note = state.tab === "Payload" ? item.requestNote : item.note;
    mountView(target, () => (
      <>
        {"\n        "}
        <div class={"rx-row"}>
          <strong>
            {item.operation}
            {" #"}
            {item.id}
          </strong>
          {"\n          "}
          <button data-rx={"copy"}>{"Copiar"}</button>
          {"\n          "}
          <button data-rx={"reveal"} aria-pressed={state.reveal ? "true" : "false"}>
            {"\n            "}
            {state.reveal ? "Mascarar dados" : "Revelar localmente"}
            {"\n          "}
          </button>
          {"\n        "}
        </div>
        {"\n        "}
        <div class={"rx-small"}>{safeURL(item.url)}</div>
        {"\n        "}
        <div class={"rx-row"}>
          {["Headers", "Payload", "Response"].map((name) => (
            <>
              {"\n          "}
              <button data-rx-tab={name} aria-pressed={name === state.tab ? "true" : "false"}>
                {name}
              </button>
              {"\n        "}
            </>
          ))}
        </div>
        {"\n        "}
        {state.tab === "Response" && item.filteredBody != null ? (
          <>
            {"\n          "}
            <div class={"rx-row"}>
              {"\n            "}
              <button data-rx={"original"} aria-pressed={!state.filtered ? "true" : "false"}>
                {"Original"}
              </button>
              {"\n            "}
              <button data-rx={"filtered"} aria-pressed={state.filtered ? "true" : "false"}>
                {"Filtrada entregue ao X"}
              </button>
              {"\n          "}
            </div>
            {"\n        "}
          </>
        ) : (
          ""
        )}
        {"\n        "}
        <div class={"rx-row"}>
          {"\n          "}
          <button data-rx={"tree"} aria-pressed={!state.raw ? "true" : "false"}>
            {"JSON colapsável"}
          </button>
          {"\n          "}
          <button data-rx={"raw"} aria-pressed={state.raw ? "true" : "false"}>
            {"Texto"}
          </button>
          {"\n          "}
          <input type={"search"} data-rx={"body-find"} placeholder={"Buscar no conteúdo"} />
          {"\n          "}
          <button data-rx={"path"}>{"Expandir caminho"}</button>
          {"\n        "}
        </div>
        {"\n        "}
        <div class={"rx-warning"}>
          {note || ""}
          {"\n          "}
          {item.originalRetained === false ? " · Corpo completo não retido" : ""}
          {"\n        "}
        </div>
        {"\n        "}
        <div data-rx={"body"}></div>
        {"\n      "}
      </>
    ));
    const body = $(RODX_SELECTORS.inspectorBody);
    if (state.raw) {
      const pre = (<pre />) as HTMLElement;
      pre.textContent = state.reveal ? String(raw) : String(redact(String(raw)));
      body.append(pre);
    } else {
      try {
        const json = redact(JSON.parse(raw));
        const tree = (<div />) as HTMLDivElement;
        tree.className = "rx-tree";
        const node = makeTreeNode("$", json, "$");
        (node as HTMLDetailsElement).open = true;
        tree.append(node);
        body.append(tree);
      } catch {
        const pre = (<pre />) as HTMLElement;
        pre.textContent = text || "Aguardando resposta ou formato não JSON";
        body.append(pre);
      }
    }
  }
  function exportSelection() {
    const ids = selected.size ? [...selected] : state.active ? [state.active] : [];
    const rows = ids
      .map((id) => records.get(id))
      .filter(Boolean)
      .map((item) => {
        const copy = structuredClone(item);
        delete copy._size;
        copy.url = safeURL(copy.url);
        for (const key of ["headers", "responseHeaders"]) copy[key] = redact(copy[key] || {});
        for (const key of ["requestBody", "originalBody", "filteredBody"]) copy[key] = viewText(copy[key]);
        return copy;
      });
    if (!rows.length) return;
    const blob = new Blob(
      [JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), rows }, null, 2)],
      {
        type: "application/json",
      },
    );
    const href = URL.createObjectURL(blob);
    const anchor = (<a />) as HTMLAnchorElement;
    anchor.href = href;
    anchor.download = "rodx-network-redacted.json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), RUNTIME_LIMITS.networkInspector.exportSelectionDelayMs);
  }
  root.addEventListener("input", (event) => {
    if ((event.target as HTMLElement).matches(RODX_SELECTORS.inspectorFilter)) {
      state.search = (event.target as HTMLInputElement).value;
      state.visible = 75;
      renderRows();
    }
    if ((event.target as HTMLElement).matches(RODX_SELECTORS.inspectorBodySearch)) {
      const text = (event.target as HTMLInputElement).value.trim().toLocaleLowerCase("pt-BR");
      for (const node of root.querySelectorAll<HTMLElement>(RODX_SELECTORS.inspectorTreeRows)) {
        node.style.setProperty(
          "background",
          text && node.textContent.toLocaleLowerCase("pt-BR").includes(text) ? "#faca3766" : "",
          "important",
        );
      }
    }
  });
  root.addEventListener("change", (event) => {
    if ((event.target as HTMLElement).matches(RODX_SELECTORS.inspectorRetentionFields)) {
      const field = (event.target as HTMLElement).dataset.rxRetain;
      const limits = {
        maxItems: [20, 1000, 1],
        maxBytes: [2, 60, 1048576],
        ttlMs: [1, 120, 60000],
        bodyLimit: [1, 10, 1048576],
      };
      const [min, max, scale] = limits[field];
      const value = Math.min(
        max,
        Math.max(min, Math.round(Number((event.target as HTMLInputElement).value) || min)),
      );
      (event.target as HTMLInputElement).value = String(value);
      settings[field] = value * scale;
      configureCapture();
      sweep();
      renderRows();
      renderDetail();
    }
    if ((event.target as HTMLElement).matches(RODX_SELECTORS.inspectorStatus)) {
      state.status = (event.target as HTMLInputElement).value;
      renderRows();
    }
    if ((event.target as HTMLElement).matches(RODX_SELECTORS.inspectorSelection)) {
      if ((event.target as HTMLInputElement).checked)
        selected.add((event.target as HTMLElement).dataset.rxSelect);
      else selected.delete((event.target as HTMLElement).dataset.rxSelect);
    }
  });
  root.addEventListener("click", async (event) => {
    const open = (event.target as HTMLElement).closest(RODX_SELECTORS.inspectorOpenActions);
    if (open) {
      state.active = (open as HTMLElement).dataset.rxOpen;
      state.reveal = false;
      state.tab = "Response";
      renderRows();
      renderDetail();
      return;
    }
    const tab = (event.target as HTMLElement).closest(RODX_SELECTORS.inspectorTabs);
    if (tab) {
      state.tab = (tab as HTMLElement).dataset.rxTab;
      state.raw = false;
      renderDetail();
      return;
    }
    const action = ((event.target as HTMLElement).closest(RODX_SELECTORS.inspectorControls) as HTMLElement)
      ?.dataset.rx;
    switch (action) {
      case "pause":
        state.capture = !state.capture;
        configureCapture();
        renderRows();
        break;
      case "clear": {
        records.clear();
        order.length = 0;
        selected.clear();
        state.bytes = 0;
        state.active = "";
        renderRows();
        renderDetail();
        break;
      }
      case "more":
        state.visible += 75;
        renderRows();
        break;
      case "export": {
        const oldReveal = state.reveal;
        state.reveal = false;
        exportSelection();
        state.reveal = oldReveal;
        break;
      }
      case "reveal":
        state.reveal = !state.reveal;
        renderDetail();
        break;
      case "copy": {
        const body = textValue(records.get(state.active));
        await navigator.clipboard.writeText(
          state.raw ? (state.reveal ? String(body) : String(redact(String(body)))) : viewText(body),
        );
        break;
      }
      case "original":
        state.filtered = false;
        renderDetail();
        break;
      case "filtered":
        state.filtered = true;
        renderDetail();
        break;
      case "raw":
        state.raw = true;
        renderDetail();
        break;
      case "tree":
        state.raw = false;
        renderDetail();
        break;
      case "path": {
        const path = window.prompt("Caminho JSON, por exemplo $.data.user.result", "$");
        if (!path) break;
        const keys = path
          .replace(/^\$\.?/, "")
          .split(".")
          .filter(Boolean);
        let prefix = "$";
        for (const key of ["", ...keys]) {
          if (key) prefix += "." + key;
          const branch = [...root.querySelectorAll<HTMLElement>(RODX_SELECTORS.inspectorTreeDetails)].find(
            (el) => el.dataset.path === prefix,
          );
          if (branch) (branch as HTMLDetailsElement).open = true;
          await Promise.resolve(undefined);
        }
        root
          .querySelector<HTMLElement>(RODX_SELECTORS.inspectorTreePath(CSS.escape(prefix)))
          ?.scrollIntoView({ block: "nearest" });
        break;
      }
    }
  });
  function open() {
    for (const [field, scale] of [
      ["maxItems", 1],
      ["maxBytes", 1048576],
      ["ttlMs", 60000],
      ["bodyLimit", 1048576],
    ]) {
      (
        root.querySelector<HTMLElement>(RODX_SELECTORS.inspectorRetentionField(field)) as HTMLInputElement
      ).value = String(settings[field] / Number(scale));
    }
    if (state.open) return;
    state.open = true;
    root.style.setProperty("display", "block", "important");
    const diagnostic = Studio.diagnostics().selectors;
    $(RODX_SELECTORS.inspectorSelectors).textContent =
      `X nesta tela: ${diagnostic.tweets} tweets · ${diagnostic.userCells} células de usuário · ` +
      `coluna ${diagnostic.primaryColumnFound ? "encontrada" : "não encontrada"} · ` +
      `busca ${diagnostic.nativeSearchFound ? "encontrada" : "não encontrada"}. ` +
      "Indicadores locais; não confirmam a compatibilidade de todos os layouts.";
    renderRows();
    renderDetail();
    Studio.menu.panel("network", "RodX Studio · REDE", root, () => {
      state.open = false;
      root.style.setProperty("display", "none", "important");
    });
  }
  function close() {
    Studio.menu.close("network");
  }
  Studio.services.networkInspector = {
    open,
    close,
    stats: () => ({
      entries: order.length,
      bytes: state.bytes,
      dropped: state.countDropped,
    }),
  };
  if (typeof GM_registerMenuCommand === "function") GM_registerMenuCommand("RodX Studio · REDE", open);
  return Studio.services.networkInspector;
}
