import { createSignal, For, Show, onCleanup } from "solid-js";
import { mountPoint } from "../../runtime/solid-ui/mount-point.tsx";
import styles from "./GitHub.module.css";

type Favorite = { name: string; url: string };
type Workflow = { id: number; name: string; path: string; state?: string };
type Run = { id: number; name: string; conclusion: string | null; status: string; html_url: string; created_at: string; workflow_id: number };
type Settings = { files: Favorite[]; workflows: Workflow[]; count: number; filter: string; iconTheme: string };
const defaults: Settings = { files: [], workflows: [], count: 10, filter: "all", iconTheme: "atom" };
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
  const [message, setMessage] = createSignal("");
  const [open, setOpen] = createSignal(false);
  const [repo, setRepo] = createSignal("");
  let request = 0;
  let dragIndex: number | null = null;
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
  const load = async () => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length < 2 || ["settings","notifications","search","orgs","topics"].includes(parts[0])) return;
    const name = parts[0] + "/" + parts[1];
    if (name !== repo()) {
      setRepo(name);
      const stored = await ctx.storage.get("githubDashboard:" + name, defaults);
      if (ctx.signal.aborted || repo() !== name) return;
      setSettings({ ...defaults, ...(stored || {}) });
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
  const dispatch = async (workflow: Workflow) => {
    const ref = prompt("Branch/ref para executar " + workflow.name, "main");
    if (!ref?.trim()) return;
    setBusy(true);
    try {
      await api("/repos/" + repo() + "/actions/workflows/" + workflow.id + "/dispatches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: ref.trim() }),
      });
      setMessage("Workflow solicitado: " + workflow.name);
      void load();
    } catch (error) { setMessage(String(error) + " · confira workflow_dispatch e token Actions: write"); }
    finally { setBusy(false); }
  };
  const reorder = (to: number) => {
    if (dragIndex === null || dragIndex === to) return;
    const next = [...settings().files];
    const [item] = next.splice(dragIndex, 1);
    next.splice(to, 0, item);
    dragIndex = null;
    save({ files: next });
  };
  const mount = mountPoint(document.body, () => (
    <section class={styles.dashboard} data-ghft-dashboard="">
      <nav class={styles.favoriteBar} aria-label="Arquivos favoritos">
        <button class={styles.button} onClick={() => setOpen(!open())} aria-expanded={open()}>⌘ {open() ? "Fechar" : "GitHub +"}</button>
        <For each={settings().files}>{(file, i) =>
          <a class={styles.favorite} href={file.url} draggable="true"
            onDragStart={(e) => { dragIndex = i(); e.dataTransfer?.setData("text/plain", file.url); }}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); reorder(i()); }}
            onPointerDown={(e) => { if (e.pointerType === "touch") dragIndex = i(); }}
            onPointerUp={(e) => { if (e.pointerType === "touch" && dragIndex !== null) reorder(i()); }}
            title={file.name}><span>{icon(file.name, settings().iconTheme)}</span> {file.name}</a>}
        </For>
      </nav>
      <Show when={open()}>
        <div class={styles.dashboardPanel}>
          <header><strong>GitHub · {repo()}</strong><button class={styles.button} onClick={() => setOpen(false)}>✕</button></header>
          <div class={styles.dashboardControls}>
            <label>Últimas <input type="number" min="1" max="100" value={settings().count}
              onChange={e => { save({ count: Math.max(1, Math.min(100, Number(e.currentTarget.value) || 10)) }); void load(); }}/></label>
            <select aria-label="Filtrar execuções" value={settings().filter} onChange={e => save({ filter: e.currentTarget.value })}>
              <option value="all">Todas</option><option value="success">Sucesso</option><option value="failure">Falha</option>
            </select>
            <select aria-label="Ícones" value={settings().iconTheme} onChange={e => save({ iconTheme: e.currentTarget.value })}>
              <option value="atom">File icons</option><option value="simple">Simples</option>
            </select>
            <button class={styles.button} disabled={busy()} onClick={() => void load()}>↻</button>
          </div>
          <h4>Workflows favoritos</h4>
          <For each={settings().workflows}>{w => <div class={styles.dashboardItem}>
            <a href={"/" + repo() + "/actions/workflows/" + w.path.split("/").pop()}>{w.name}</a>
            <button class={styles.button} onClick={() => void dispatch(w)}>▶</button>
            <button class={styles.button} aria-label="Remover favorito" onClick={() => toggleWorkflow(w)}>★</button>
          </div>}</For>
          <details><summary>Adicionar workflows</summary>
            <For each={workflows()}>{w => <button class={styles.workflowChoice}
              onClick={() => toggleWorkflow(w)}>{settings().workflows.some(f => f.id === w.id) ? "★" : "☆"} {w.name}</button>}</For>
          </details>
          <h4>Execuções recentes</h4>
          <For each={runs().filter(r => settings().filter === "all" || r.conclusion === settings().filter)}>{run =>
            <a class={styles.dashboardItem} href={run.html_url}>
              <span>{run.conclusion === "success" ? "✓" : run.conclusion === "failure" ? "✕" : "◌"}</span>
              <span>{run.name} <small>#{run.id} · {new Date(run.created_at).toLocaleString()}</small></span>
            </a>}</For>
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
  ctx.listen(window, "popstate", navigate);
  ctx.listen(window, "turbo:load", navigate);
  void load();
  ctx.onDispose(() => { request++; mount.dispose(); });
  return { toggleFile, load };
}
