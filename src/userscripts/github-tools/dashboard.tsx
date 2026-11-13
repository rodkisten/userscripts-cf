import { createSignal, For, Show } from "solid-js";
import { mountPoint } from "../../runtime/solid-ui/mount-point.tsx";
import styles from "./GitHub.module.css";
import { materialIcon } from "./material-icons.ts";

type Favorite = { name: string; url: string };
type Workflow = { id: number; name: string; path: string; state?: string };
type Run = { id: number; name: string; conclusion: string | null; status: string; html_url: string; created_at: string; workflow_id: number; head_branch?: string };
type Settings = { files: Favorite[]; workflows: Workflow[]; count: number; filter: string; iconTheme: string; repositories: string[]; dragMode: boolean; barPosition: { x: number; y: number } | null };
const defaults: Settings = { files: [], workflows: [], count: 10, filter: "all", iconTheme: "atom", repositories: [], dragMode: false, barPosition: null };
const icon = (name: string, theme: string) => {
  if (theme === "simple") return "▤";
  const ext = name.split(".").pop()?.toLowerCase();
  return ({ ts: "🔷", tsx: "⚛", js: "🟨", jsx: "⚛", json: "⚙", md: "📖", yml: "⚙", yaml: "⚙", css: "🎨", html: "🌐", py: "🐍", sh: "⌘", vue: "💚", svg: "◇" } as Record<string,string>)[ext || ""] || "📄";
};
export function mountGitHubDashboard(ctx: any) {
  const [settings, setSettings] = createSignal<Settings>({ ...defaults });
  const [runs, setRuns] = createSignal<Run[]>([]);
  const [workflows, setWorkflows] = createSignal<Workflow[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [customized, setCustomized] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [open, setOpen] = createSignal(false);
  const [repo, setRepo] = createSignal("");
  const [sourceRepo, setSourceRepo] = createSignal("");
  const [repoInput, setRepoInput] = createSignal("");
  const [runSearch, setRunSearch] = createSignal("");
  const [branchFilter, setBranchFilter] = createSignal("");
  const [dispatchWorkflow, setDispatchWorkflow] = createSignal<Workflow | null>(null);
  const [dispatchRef, setDispatchRef] = createSignal("main");
  const [dispatchInputs, setDispatchInputs] = createSignal("{}");

  const [repositories, setRepositories] = createSignal<string[]>([]);
  const GLOBAL_REPOS_KEY = "githubDashboard:repositories:v1";
  void ctx.storage.get(GLOBAL_REPOS_KEY, []).then((stored: unknown) => {
    if (Array.isArray(stored) && !ctx.signal.aborted)
      setRepositories(stored.filter((value): value is string => typeof value === "string"));
  });
  let request = 0;
  let dragIndex: number | null = null;
  let touchTimer: ReturnType<typeof setTimeout> | undefined;
  let touchStart: { x: number; y: number; pointerId: number } | undefined;
  let touchDragging = false;
  const clearTouch = () => {
    if (touchTimer) clearTimeout(touchTimer);
    touchTimer = undefined;
    touchStart = undefined;
    touchDragging = false;
  };
  const touchDown = (event: PointerEvent, index: number) => {
    if (event.pointerType !== "touch") return;
    clearTouch();
    touchStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    touchTimer = setTimeout(() => {
      if (!touchStart || ctx.signal.aborted) return;
      dragIndex = index;
      touchDragging = true;
      navigator.vibrate?.(15);
    }, 350);
  };
  const touchMove = (event: PointerEvent) => {
    if (!touchStart || event.pointerId !== touchStart.pointerId) return;
    if (!touchDragging && Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) > 9)
      clearTouch();
    if (touchDragging) event.preventDefault();
  };
  const touchUp = (event: PointerEvent) => {
    if (!touchStart || event.pointerId !== touchStart.pointerId) return;
    if (touchDragging) {
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-ghft-favorite-index]");
      const index = Number(target?.getAttribute("data-ghft-favorite-index"));
      if (target && Number.isSafeInteger(index)) reorder(index);
      dragIndex = null;
    }
    clearTouch();
  };
  const save = (patch: Partial<Settings>) => {
    const next = { ...settings(), ...patch };
    setSettings(next);
    void ctx.storage.set("githubDashboard:" + repo(), next);
  };
  const api = async (path: string, options: RequestInit = {}) => {
    const token = await ctx.storage.get("actionsToken", "");
    const response = await fetch("https://api.github.com" + path, {
      ...options, signal: ctx.signal, credentials: "omit",
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: "Bearer " + token } : {}), ...options.headers },
    });
    if (!response.ok) throw Error("GitHub API " + response.status + (response.status === 403 ? " · permissões ou rate limit" : ""));
    return response.status === 204 ? null : response.json();
  };
  const load = async (selected?: string) => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length < 2 || ["settings","notifications","search","orgs","topics"].includes(parts[0])) return;
    const name = selected || sourceRepo() || parts[0] + "/" + parts[1];
    if (name !== repo()) {
      setSourceRepo(name);
      setRepo(name);
      const stored = await ctx.storage.get("githubDashboard:" + name, defaults);
      if (ctx.signal.aborted || repo() !== name) return;
      setSettings({ ...defaults, ...(stored || {}) });
      setCustomized(true);
    }
    const id = ++request;
    setBusy(true);
    try {
      const [list, recent] = await Promise.all([
        api("/repos/" + name + "/actions/workflows?per_page=100"),
        api("/repos/" + name + "/actions/runs?per_page=" + Math.max(1, Math.min(100, settings().count))),
      ]);
      if (id !== request || ctx.signal.aborted) return;
      setWorkflows((list.workflows || []).map((w: any) => ({ id: w.id, name: w.name, path: w.path, state: w.state })));
      setRuns(recent.workflow_runs || []);
      setMessage("");
    } catch (error) { if (id === request) setMessage(String(error)); }
    finally { if (id === request) setBusy(false); }
  };
  const toggleFile = (name: string, url: string) => {
    const files = settings().files;
    save({ files: files.some(f => f.url === url) ? files.filter(f => f.url !== url) : [...files, { name, url }] });
  };
  const toggleWorkflow = (workflow: Workflow) => {
    const items = settings().workflows;
    save({ workflows: items.some(w => w.id === workflow.id) ? items.filter(w => w.id !== workflow.id) : [...items, workflow] });
  };
  const dispatch = async () => {
    const workflow = dispatchWorkflow();
    if (!workflow || !dispatchRef().trim()) return;
    let inputs: Record<string, string>;
    try {
      const parsed: unknown = JSON.parse(dispatchInputs() || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
          Object.values(parsed).some(value => typeof value !== "string"))
        throw Error("Inputs devem ser um objeto JSON de strings.");
      inputs = parsed as Record<string, string>;
    } catch (error) { setMessage("Inputs inválidos: " + String(error)); return; }
    setBusy(true);
    try {
      await api("/repos/" + repo() + "/actions/workflows/" + workflow.id + "/dispatches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: dispatchRef().trim(), inputs }),
      });
      setDispatchWorkflow(null);
      setMessage("Workflow solicitado: " + workflow.name);
      void load();
    } catch (error) { setMessage(String(error) + " · confira workflow_dispatch e token Actions: write"); }
    finally { setBusy(false); }
  };
  const runAction = async (run: Run, action: "rerun-failed-jobs" | "cancel") => {
    if (!confirm((action === "cancel" ? "Cancelar" : "Reexecutar falhas de") + " #" + run.id + "?")) return;
    setBusy(true);
    try {
      await api("/repos/" + repo() + "/actions/runs/" + run.id + "/" + action, { method: "POST" });
      setMessage("Ação solicitada para #" + run.id);
      void load();
    } catch (error) { setMessage(String(error) + " · token Actions: write necessário"); }
    finally { setBusy(false); }
  };
  const addRepository = () => {
    const name = repoInput().trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(name)) {
      setMessage("Use proprietário/repositório.");
      return;
    }
    const next = Array.from(new Set([...repositories(), name]));
    setRepositories(next);
    void ctx.storage.set(GLOBAL_REPOS_KEY, next);
    setRepoInput("");
    void load(name);
  };
  const reorder = (to: number) => {
    if (dragIndex === null || dragIndex === to) return;
    const next = [...settings().files];
    const [item] = next.splice(dragIndex, 1);
    next.splice(to, 0, item);
    dragIndex = null;
    save({ files: next });
  };
  let barDrag: { x: number; y: number; baseX: number; baseY: number } | null = null;
  const startBarDrag = (event: PointerEvent) => {
    if (!settings().dragMode || (event.target as Element).closest("a,button")) return;
    barDrag = { x: event.clientX, y: event.clientY, baseX: settings().barPosition?.x || 0, baseY: settings().barPosition?.y || 0 };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const moveBarDrag = (event: PointerEvent) => {
    if (!barDrag) return;
    const x = Math.max(-innerWidth + 100, Math.min(innerWidth - 100, barDrag.baseX + event.clientX - barDrag.x));
    const y = Math.max(-60, Math.min(innerHeight - 80, barDrag.baseY + event.clientY - barDrag.y));
    setSettings(current => ({ ...current, barPosition: { x, y } }));
  };
  const endBarDrag = () => {
    if (!barDrag) return;
    barDrag = null;
    save({ barPosition: settings().barPosition });
  };
  const mount = mountPoint(document.body, () => (
    <section class={styles.dashboard} data-ghft-dashboard="" style={{ transform: settings().barPosition ? "translate(" + settings().barPosition!.x + "px," + settings().barPosition!.y + "px)" : undefined }}>
      <nav class={styles.favoriteBar} aria-label="Arquivos e workflows favoritos" onPointerDown={startBarDrag} onPointerMove={moveBarDrag} onPointerUp={endBarDrag} onPointerCancel={endBarDrag}>
        <button class={styles.button} onClick={() => setOpen(!open())} aria-expanded={open() ? "true" : "false"}>⌘ {open() ? "Fechar" : "Favoritos"}</button>
        <For each={settings().files}>{(file, i) =>
          <a class={styles.favorite} href={file.url} draggable="true" data-ghft-favorite-index={i()}
            onDragStart={(e) => { dragIndex = i(); e.dataTransfer?.setData("text/plain", file.url); }}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); reorder(i()); }}
            onPointerDown={(e) => touchDown(e, i())}
            onPointerMove={touchMove}
            onPointerUp={touchUp}
            onPointerCancel={clearTouch}
            onClick={() => setOpen(false)} title={file.name}><img class={styles.favoriteIcon} src={materialIcon(file.name)} alt="" /> {file.name}</a>}
        </For>
        <For each={settings().workflows}>{workflow =>
          <a class={styles.favorite} href={"/" + repo() + "/actions/workflows/" + workflow.path.split("/").pop()}
            title={workflow.name} onClick={() => setOpen(false)}>▶ {workflow.name}</a>
        }</For>
      </nav>
      <Show when={!customized() && busy()}><div class={styles.loadingBar} role="status">Carregando arquivos…</div></Show>
      <Show when={open()}>
        <div class={styles.dashboardPanel}>
          <header><strong>GitHub · {repo()}</strong><button class={styles.button} onClick={() => setOpen(false)}>✕</button></header>
          <div class={styles.dashboardControls}>
            <label class={styles.dragSetting}><input type="checkbox" checked={settings().dragMode}
              onChange={event => save({ dragMode: event.currentTarget.checked })}/> Arrastar barra</label>
            <button class={styles.button} onClick={() => save({ barPosition: null })}>Redefinir posição</button>
            <label>Últimas <input type="number" min="1" max="100" value={settings().count}
              onChange={e => { save({ count: Math.max(1, Math.min(100, Number(e.currentTarget.value) || 10)) }); void load(); }}/></label>
            <select aria-label="Filtrar execuções" value={settings().filter} onChange={e => save({ filter: e.currentTarget.value })}>
              <option value="all">Todas</option><option value="success">Sucesso</option><option value="failure">Falha</option><option value="running">Rodando</option>
            </select>
            <select aria-label="Ícones" value={settings().iconTheme} onChange={e => save({ iconTheme: e.currentTarget.value })}>
              <option value="atom">File icons</option><option value="simple">Simples</option>
            </select>
            <button class={styles.button} disabled={busy()} onClick={() => void load()}>↻</button>
          </div>
          <details><summary>Repositórios no Dock</summary>
            <div class={styles.dashboardControls}>
              <input aria-label="Adicionar repositório" placeholder="owner/repo" value={repoInput()}
                onInput={e => setRepoInput(e.currentTarget.value)} />
              <button class={styles.button} onClick={addRepository}>Adicionar</button>
            </div>
            <For each={repositories()}>{name =>
              <button class={styles.workflowChoice} onClick={() => void load(name)}>{name}</button>
            }</For>
            {/* TODO(GITHUB-CROSS-REPO): Integrate global repository storage with
                typed Rod Dock settings and permission-scoped private repo tests. */}
          </details>
          <h4>Workflows favoritos</h4>
          <For each={settings().workflows}>{w => <div class={styles.dashboardItem}>
            <a href={"/" + repo() + "/actions/workflows/" + w.path.split("/").pop()}>{w.name}</a>
            <button class={styles.button} onClick={() => { setDispatchWorkflow(w); setDispatchInputs("{}"); }}>▶</button>
            <button class={styles.button} aria-label="Remover favorito" onClick={() => toggleWorkflow(w)}>★</button>
          </div>}</For>
          <details><summary>Reordenar arquivos no celular</summary>
            <For each={settings().files}>{(file, i) => <div class={styles.dashboardItem}>
              <span>{file.name}</span>
              <button class={styles.button} disabled={i() === 0} onClick={() => { dragIndex = i(); reorder(i() - 1); }} aria-label={"Subir " + file.name}>↑</button>
              <button class={styles.button} disabled={i() === settings().files.length - 1} onClick={() => { dragIndex = i(); reorder(i() + 1); }} aria-label={"Descer " + file.name}>↓</button>
              <button class={styles.button} onClick={() => toggleFile(file.name, file.url)} aria-label={"Remover " + file.name}>✕</button>
            </div>}</For>
          </details>
          <details><summary>Adicionar workflows</summary>
            <For each={workflows()}>{w => <button class={styles.workflowChoice}
              onClick={() => toggleWorkflow(w)}>{settings().workflows.some(f => f.id === w.id) ? "★" : "☆"} {w.name}</button>}</For>
          </details>
          <Show when={dispatchWorkflow()}>{w =>
            <div class={styles.dispatchForm}>
              <strong>Executar: {w().name}</strong>
              <label>Branch/ref <input value={dispatchRef()} onInput={e => setDispatchRef(e.currentTarget.value)} /></label>
              <label>Inputs JSON <textarea rows="3" spellcheck={false} value={dispatchInputs()} onInput={e => setDispatchInputs(e.currentTarget.value)} /></label>
              <div><button class={styles.button} disabled={busy()} onClick={() => void dispatch()}>Executar</button>
              <button class={styles.button} onClick={() => setDispatchWorkflow(null)}>Cancelar</button></div>
            </div>
          }</Show>
          <h4>Execuções recentes</h4>
          <div class={styles.dashboardControls}>
            <input aria-label="Buscar workflows" placeholder="Buscar workflow" value={runSearch()} onInput={e => setRunSearch(e.currentTarget.value)} />
            <input aria-label="Filtrar branch" placeholder="Branch" value={branchFilter()} onInput={e => setBranchFilter(e.currentTarget.value)} />
          </div>
          <For each={runs().filter(r =>
            (settings().filter === "all" || r.conclusion === settings().filter ||
              (settings().filter === "running" && r.status !== "completed")) &&
            r.name.toLowerCase().includes(runSearch().toLowerCase()) &&
            (!branchFilter() || (r.head_branch || "").toLowerCase().includes(branchFilter().toLowerCase()))
          )}>{run =>
            <div class={styles.runRow}><a class={styles.dashboardItem} href={run.html_url}>
              <span>{run.conclusion === "success" ? "✓" : run.conclusion === "failure" ? "✕" : "◌"}</span>
              <span>{run.name} <small>#{run.id} · {run.head_branch || "?"} · {new Date(run.created_at).toLocaleString()}</small></span>
            </a>
            <div class={styles.runActions}>
              <button class={styles.button} disabled={busy() || run.conclusion !== "failure"} onClick={() => void runAction(run, "rerun-failed-jobs")}>↻ Falhas</button>
              <button class={styles.button} disabled={busy() || run.status === "completed"} onClick={() => void runAction(run, "cancel")}>✕</button>
              <button class={styles.button} onClick={() => void navigator.clipboard.writeText(run.html_url).then(() => setMessage("Link copiado")).catch(() => setMessage("Cópia indisponível"))}>⧉</button>
            </div></div>}</For>
          <p role="status">{busy() ? "Carregando…" : message()}</p>
          {/* TODO(GITHUB-DOCK): Expose dashboard preferences as typed Rod Dock settings
              across repositories, with per-repo credentials and secure cross-origin
              permission handling. Complete when remote repos can be selected,
              persisted and refreshed without visiting their pages; test Safari. */}
        </div>
      </Show>
    </section>
  ));
  const navigate = () => { void load(); };
  // Dashboard is opened from its own compact launcher. Avoid duplicate
  // GM commands: the shared runtime already mirrors them into Rod Dock.
  ctx.listen(window, "popstate", navigate);
  ctx.listen(window, "turbo:load", navigate);
  void load();
  ctx.onDispose(() => { clearTouch(); request++; mount.dispose(); });
  return { toggleFile, load };
}

type CommitInfo = { sha: string; message: string; author: string };
const COMMIT_TTL_MS = 5 * 60 * 1000;
const COMMIT_CACHE_MAX = 300;
const commitCache = new Map<string, { expires: number; value: CommitInfo | null }>();
const commitPending = new Map<string, Promise<CommitInfo | null>>();
let commitActive = 0;
const commitQueue: Array<() => void> = [];
async function withCommitSlot<T>(work: () => Promise<T>): Promise<T> {
  if (commitActive >= 3) await new Promise<void>(resolve => commitQueue.push(resolve));
  commitActive++;
  try { return await work(); }
  finally { commitActive--; commitQueue.shift()?.(); }
}
async function fetchLatestCommit(props: { ctx: any; owner: string; repo: string; path: string }): Promise<CommitInfo | null> {
  const key = props.owner + "/" + props.repo + "/" + props.path;
  const cached = commitCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const existing = commitPending.get(key);
  if (existing) return existing;
  const task = withCommitSlot(async () => {
    const token = await props.ctx.storage.get("actionsToken", "");
    const url = "https://api.github.com/repos/" + encodeURIComponent(props.owner) + "/" +
      encodeURIComponent(props.repo) + "/commits?per_page=1&path=" + encodeURIComponent(props.path);
    const response = await fetch(url, { signal: props.ctx.signal, credentials: "omit",
      headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: "Bearer " + token } : {}) } });
    if (!response.ok) throw Error("HTTP " + response.status);
    const entries = await response.json();
    const entry = entries[0];
    const value: CommitInfo | null = entry ? { sha: entry.sha, message: entry.commit.message.split("\\n")[0],
      author: entry.commit.author?.name || entry.author?.login || "" } : null;
    commitCache.delete(key);
    commitCache.set(key, { expires: Date.now() + COMMIT_TTL_MS, value });
    if (commitCache.size > COMMIT_CACHE_MAX) commitCache.delete(commitCache.keys().next().value!);
    return value;
  });
  commitPending.set(key, task);
  try { return await task; } finally { commitPending.delete(key); }
}
export function FileCommit(props: { ctx: any; owner: string; repo: string; path: string; href: string }) {
  const [commit, setCommit] = createSignal<{ sha: string; message: string; author: string } | null>(null);
  const [error, setError] = createSignal("");
  void (async () => {
    try {
      const entry = await fetchLatestCommit(props);
      if (entry) setCommit(entry);
    } catch (e) { if (!props.ctx.signal.aborted) setError(String(e)); }
  })();
  return <Show when={commit()} fallback={<span title={error()} />}>{entry =>
    <span class={styles.commitHint} title={entry().author + " · " + entry().sha}>
      <a href={"/" + props.owner + "/" + props.repo + "/commit/" + entry().sha}>{entry().message}</a>
      {" · "}<a href={props.href.replace("/blob/", "/blame/")}>blame</a>
    </span>}</Show>;
}
