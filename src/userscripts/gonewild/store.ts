import { createStore } from "solid-js";
import { DEFAULTS, KEYS, normalize, readJSON, writeJSON, type Post, type Settings } from "./domain.ts";
export function createStudioStore() {
  const saved = { ...DEFAULTS, ...readJSON<Partial<Settings>>(KEYS.config, {}) };
  saved.subreddits = (Array.isArray(saved.subreddits) ? saved.subreddits : DEFAULTS.subreddits)
    .filter((name) => /^[\w]{2,32}$/.test(name))
    .slice(0, 30);
  const [state, setState] = createStore({
    settings: saved,
    seen: readJSON<Record<string, number>>(KEYS.seen, {}),
    postCount: 0,
    resolved: {} as Record<string, { checked: boolean; count: number }>,
    search: {
      text: "",
      include: [] as string[],
      exclude: [] as string[],
      active: false,
      loading: false,
      error: "",
      results: [] as Post[],
      after: "",
    },
  });
  const actions = {
    settings(patch: Partial<Settings>) {
      // Persist the staged action payload, never the pre-commit public snapshot.
      setState((draft) => {
        const next = { ...draft.settings, ...patch };
        draft.settings = next;
        writeJSON(KEYS.config, next);
      });
    },
    seen(id: string, wanted: boolean) {
      setState((draft) => {
        const next = { ...draft.seen };
        if (wanted) next[id] = Date.now();
        else delete next[id];
        const bounded = Object.fromEntries(
          Object.entries(next)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5000),
        );
        draft.seen = bounded;
        writeJSON(KEYS.seen, bounded);
      });
    },
    clearSeen() {
      setState((draft) => {
        draft.seen = {};
      });
      writeJSON(KEYS.seen, {});
    },
    tag(tag: string, kind: "include" | "exclude" = "include") {
      setState((draft) => {
        const other = kind === "include" ? "exclude" : "include";
        const match = draft.search[kind].findIndex((item) => normalize(item) === normalize(tag));
        if (match >= 0) draft.search[kind].splice(match, 1);
        else draft.search[kind].push(tag);
        draft.search[other] = draft.search[other].filter((item) => normalize(item) !== normalize(tag));
      });
    },
    clearSearch() {
      setState((draft) => {
        Object.assign(draft.search, {
          text: "",
          include: [],
          exclude: [],
          active: false,
          results: [],
          after: "",
          error: "",
        });
      });
    },
  };
  return { state, setState, actions };
}
export type StudioStore = ReturnType<typeof createStudioStore>;
