import { useEffect, useState } from "react";
import styles, { css } from "./GitHub.module.css";

type Favorite = { name: string; url: string };
type Workflow = { id: number; name: string; path: string };
type Run = { id: number; name: string; status: string; conclusion: string | null; html_url: string };
type DashboardSettings = { files: Favorite[]; workflows: Workflow[] };
const defaults: DashboardSettings = { files: [], workflows: [] };
function currentRepo() {
  const parts = location.pathname.split("/").filter(Boolean);
  return parts.length >= 2 && !["settings", "notifications", "search", "orgs"].includes(parts[0])
    ? parts[0] + "/" + parts[1]
    : "";
}

function Dashboard({
  ctx,
  controller,
}: {
  ctx: any;
  controller: { toggleFile: (name: string, url: string) => void };
}) {
  const [repo, setRepo] = useState(currentRepo);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<DashboardSettings>(defaults);
  const [runs, setRuns] = useState<Run[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);
  const [repoInput, setRepoInput] = useState("");
  useEffect(() => {
    const navigate = () => setRepo(currentRepo());
    window.addEventListener("popstate", navigate);
    window.addEventListener("turbo:load", navigate);
    return () => {
      window.removeEventListener("popstate", navigate);
      window.removeEventListener("turbo:load", navigate);
    };
  }, []);
  useEffect(() => {
    let active = true;
    setSettings(defaults);
    setRuns([]);
    setWorkflows([]);
    if (!repo) {
return;
}
    void ctx.storage
      .get("githubDashboard:" + repo, defaults)
      .then((value: DashboardSettings) => {
        if (active) {
setSettings({ ...defaults, ...value });
}
      })
      .catch((error: unknown) => {
        if (active) {
setMessage(String(error));
}
      });
    return () => {
      active = false;
    };
  }, [ctx, repo]);
  useEffect(() => {
    if (!repo) {
return;
}
    let active = true;
    setBusy(true);
    const get = async (path: string) => {
      const savedToken = await ctx.storage.get("actionsToken", "");
      const response = await fetch("https://api.github.com/repos/" + repo + path, {
        signal: ctx.signal,
        credentials: "omit",
        headers: {
          Accept: "application/vnd.github+json",
          ...(savedToken ? { Authorization: "Bearer " + savedToken } : {}),
        },
      });
      if (!response.ok) {
throw new Error("GitHub API " + response.status);
}
      return response.json();
    };
    void Promise.all([get("/actions/workflows?per_page=100"), get("/actions/runs?per_page=20")])
      .then(([workflowData, runData]) => {
        if (!active) {
return;
}
        setWorkflows(workflowData.workflows ?? []);
        setRuns(runData.workflow_runs ?? []);
        setMessage("");
      })
      .catch((error: unknown) => {
        if (active && !ctx.signal.aborted) {
setMessage(String(error));
}
      })
      .finally(() => {
        if (active) {
setBusy(false);
}
      });
    return () => {
      active = false;
    };
  }, [ctx, repo, version]);
  const save = (next: DashboardSettings) => {
    setSettings(next);
    void ctx.storage.set("githubDashboard:" + repo, next);
  };
  useEffect(() => {
    controller.toggleFile = (name, url) => {
      setSettings((previous) => {
        const next = {
          ...previous,
          files: previous.files.some((file) => file.url === url)
            ? previous.files.filter((file) => file.url !== url)
            : [...previous.files, { name, url }],
        };
        void ctx.storage.set("githubDashboard:" + repo, next);
        return next;
      });
    };
  }, [ctx, repo, controller]);
  const request = async (path: string, body?: object) => {
    setBusy(true);
    try {
      const savedToken = await ctx.storage.get("actionsToken", "");
      const response = await fetch("https://api.github.com/repos/" + repo + path, {
        method: "POST",
        signal: ctx.signal,
        credentials: "omit",
        headers: {
          Accept: "application/vnd.github+json",
          ...(savedToken ? { Authorization: "Bearer " + savedToken } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
throw new Error("GitHub API " + response.status);
}
      setMessage("Solicitação enviada.");
      setVersion((value) => value + 1);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.dashboard} data-ghft-dashboard="">
      <nav className={styles.favoriteBar} aria-label="Favoritos GitHub">
        <button className={styles.button} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          ⌘ {open ? "Fechar" : "Favoritos"}
        </button>
        {settings.files.map((file) => (
          <a key={file.url} className={styles.favorite} href={file.url}>
            {file.name}
          </a>
        ))}
        {settings.workflows.map((workflow) => (
          <a
            key={workflow.id}
            className={styles.favorite}
            href={"/" + repo + "/actions/workflows/" + workflow.path.split("/").pop()}
          >
            ▶ {workflow.name}
          </a>
        ))}
      </nav>
      {open && (
        <div className={styles.dashboardPanel}>
          <header>
            <strong>GitHub · {repo || "Escolha um repositório"}</strong>
            <button className={styles.button} onClick={() => setOpen(false)}>
              ✕
            </button>
          </header>
          <div className={styles.dashboardControls}>
            <button
              className={styles.button}
              disabled={busy}
              onClick={() => setVersion((value) => value + 1)}
            >
              ↻ Atualizar
            </button>
            <label>
              Repositório{" "}
              <input
                value={repoInput}
                onChange={(event) => setRepoInput(event.target.value)}
                placeholder="owner/repo"
              />
            </label>
            <button
              className={styles.button}
              onClick={() => {
                if (/^[\w.-]+\/[\w.-]+$/.test(repoInput)) {
                  setRepo(repoInput);
                  setRepoInput("");
                }
              }}
            >
              Abrir
            </button>
            <h3>Workflows</h3>
            {workflows.map((workflow) => (
              <div key={workflow.id} className={styles.favorite}>
                <span>{workflow.name}</span>
                <button
                  className={styles.button}
                  onClick={() =>
                    save({
                      ...settings,
                      workflows: settings.workflows.some((item) => item.id === workflow.id)
                        ? settings.workflows.filter((item) => item.id !== workflow.id)
                        : [...settings.workflows, workflow],
                    })
                  }
                >
                  ☆
                </button>
                <button
                  className={styles.button}
                  disabled={busy}
                  onClick={() => {
                    if (confirm("Executar " + workflow.name + " na main?"))
                      {
void request("/actions/workflows/" + workflow.id + "/dispatches", { ref: "main" });
}
                  }}
                >
                  ▶
                </button>
              </div>
            ))}
            <h3>Execuções recentes</h3>
            {runs.map((run) => (
              <div key={run.id} className={styles.favorite}>
                <a href={run.html_url}>
                  {run.name} · {run.status} · {run.conclusion ?? "..."}
                </a>
                <button
                  className={styles.button}
                  disabled={busy || run.conclusion !== "failure"}
                  onClick={() => {
                    if (confirm("Reexecutar falhas #" + run.id + "?"))
                      {
void request("/actions/runs/" + run.id + "/rerun-failed-jobs");
}
                  }}
                >
                  ↻
                </button>
              </div>
            ))}
            <p role="status">{busy ? "Carregando…" : message}</p>
          </div>
        </div>
      )}
    </section>
  );
}

export function mountGitHubDashboard(ctx: any) {
  const controller = { toggleFile: (_name: string, _url: string) => {} };
  const stylesheet = ctx.ui.style(css);
  const dispose = ctx.ui.mountReact(<Dashboard ctx={ctx} controller={controller} />);
  return {
    toggleFile: (name: string, url: string) => controller.toggleFile(name, url),
    load: () => window.dispatchEvent(new Event("turbo:load")),
    dispose: () => {
      dispose();
      stylesheet.remove();
    },
  };
}

type CommitInfo = { sha: string; message: string; author: string };
const COMMIT_TTL_MS = 5 * 60 * 1000;
const COMMIT_CACHE_MAX = 300;
const commitCache = new Map<string, { expires: number; value: CommitInfo | null }>();
const commitPending = new Map<string, Promise<CommitInfo | null>>();
let commitActive = 0;
const commitQueue: Array<() => void> = [];
async function withCommitSlot<T>(work: () => Promise<T>): Promise<T> {
  if (commitActive >= 3) {
await new Promise<void>((resolve) => commitQueue.push(resolve));
}
  commitActive++;
  try {
    return await work();
  } finally {
    commitActive--;
    commitQueue.shift()?.();
  }
}

async function fetchLatestCommit(props: {
  ctx: any;
  owner: string;
  repo: string;
  path: string;
}): Promise<CommitInfo | null> {
  const key = props.owner + "/" + props.repo + "/" + props.path;
  const cached = commitCache.get(key);
  if (cached && cached.expires > Date.now()) {
return cached.value;
}
  const existing = commitPending.get(key);
  if (existing) {
return existing;
}
  const task = withCommitSlot(async () => {
    const token = await props.ctx.storage.get("actionsToken", "");
    const url =
      "https://api.github.com/repos/" +
      encodeURIComponent(props.owner) +
      "/" +
      encodeURIComponent(props.repo) +
      "/commits?per_page=1&path=" +
      encodeURIComponent(props.path);
    const response = await fetch(url, {
      signal: props.ctx.signal,
      credentials: "omit",
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
    });
    if (!response.ok) {
throw Error("HTTP " + response.status);
}
    const entries = await response.json();
    const entry = entries[0];
    const value: CommitInfo | null = entry
      ? {
          sha: entry.sha,
          message: entry.commit.message.split("\\n")[0],
          author: entry.commit.author?.name || entry.author?.login || "",
        }
      : null;
    commitCache.delete(key);
    commitCache.set(key, { expires: Date.now() + COMMIT_TTL_MS, value });
    if (commitCache.size > COMMIT_CACHE_MAX) {
commitCache.delete(commitCache.keys().next().value!);
}
    return value;
  });
  commitPending.set(key, task);
  try {
    return await task;
  } finally {
    commitPending.delete(key);
  }
}

export function FileCommit(props: { ctx: any; owner: string; repo: string; path: string; href: string }) {
  const [commit, setCommit] = useState<CommitInfo | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setCommit(null);
    setError("");
    void fetchLatestCommit(props)
      .then((entry) => {
        if (active) {
setCommit(entry);
}
      })
      .catch((caught) => {
        if (active && !props.ctx.signal.aborted) {
setError(String(caught));
}
      });
    return () => {
      active = false;
    };
  }, [props.ctx, props.owner, props.repo, props.path]);
  if (!commit) {
return <span title={error} />;
}
  return (
    <span className={styles.commitHint} title={commit.author + " · " + commit.sha}>
      <a href={"/" + props.owner + "/" + props.repo + "/commit/" + commit.sha}>{commit.message}</a>
      {" · "}
      <a href={props.href.replace("/blob/", "/blame/")}>blame</a>
    </span>
  );
}
