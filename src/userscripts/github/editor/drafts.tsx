import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Dexie, { type Table } from "dexie";
import { findCodeMirror, replaceCodeMirrorDocument } from "../../github-color-studio/index.js";
import { YamlActions } from "./yaml.js";

type Draft = { key: string; base: string; entries: string[]; cursor: number; savedAt: number };
const db = new Dexie("rod-github-editor");
db.version(1).stores({ drafts: "key" });
const drafts: Table<Draft, string> = db.table("drafts");
const limit = 20;

export function EditorDrafts() {
  const [key, setKey] = useState("");
  useEffect(() => {
    const refresh = () => {
      const url = new URL(location.href);
      setKey(/^\/[^/]+\/[^/]+\/edit\/.+/.test(url.pathname) ? url.pathname + url.search : "");
    };
    refresh();
    const timer = window.setInterval(refresh, 400);
    return () => window.clearInterval(timer);
  }, []);
  return key ? <DraftControls key={key} fileKey={key} /> : null;
}

function DraftControls({ fileKey }: { fileKey: string }) {
  const [state, setState] = useState<Draft>();
  const [pending, setPending] = useState<Draft>();
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(0);
  const [open, setOpen] = useState(false);
  const [apply, setApply] = useState<(draft: Draft) => void>(() => () => {});

  useEffect(() => {
    let active = true;
    let ready = false;
    let current: Draft | undefined;
    let observed = "";
    let editedAt = 0;
    let writes = Promise.resolve();
    const stillHere = () => location.pathname + location.search === fileKey;
    const persist = (draft: Draft) => {
      current = draft;
      setState(draft);
      writes = writes
        .then(async () => {
          await drafts.put(draft);
          if (active) {
            setSavedAt(draft.savedAt);
            setError("");
          }
        })
        .catch(() => {
          if (active) {
            setError("Falha ao salvar o rascunho neste navegador.");
          }
        });
    };
    setApply(() => (draft: Draft) => {
      const view = stillHere() ? findCodeMirror() : null;
      if (view) {
        const live = view.state.doc.toString();
        if (current && live !== current.entries[current.cursor] && draft.entries === current.entries) {
          const entries = [...current.entries.slice(0, current.cursor + 1), live].slice(-limit);
          persist({ ...current, entries, cursor: entries.length - 1, savedAt: Date.now() });
          return;
        }
        observed = draft.entries[draft.cursor];
        replaceCodeMirrorDocument(view, observed);
        persist({ ...draft, savedAt: Date.now() });
        setPending(undefined);
      }
    });
    const timer = window.setInterval(() => {
      if (!stillHere()) {
        return;
      }
      const view = findCodeMirror();
      if (!view) {
        return;
      }
      const source = view.state.doc.toString();
      if (!current) {
        current = { key: fileKey, base: source, entries: [source], cursor: 0, savedAt: 0 };
        observed = source;
        setState(current);
        void drafts
          .get(fileKey)
          .then((draft) => {
            if (active) {
              if (draft && draft.entries[draft.cursor] !== source) {
                setPending(draft);
              } else {
                if (draft) {
                  current = draft;
                  setState(draft);
                  setSavedAt(draft.savedAt);
                }
                ready = true;
              }
            }
          })
          .catch(() => {
            ready = true;
            if (active) {
              setError("Histórico local indisponível.");
            }
          });
        return;
      }
      if (source !== observed) {
        observed = source;
        editedAt = Date.now();
      }
      if (
        (ready || current.savedAt) &&
        source !== current.entries[current.cursor] &&
        Date.now() - editedAt >= 600
      ) {
        const entries = [...current.entries.slice(0, current.cursor + 1), source].slice(-limit);
        persist({ ...current, entries, cursor: entries.length - 1, savedAt: Date.now() });
      }
    }, 250);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [fileKey]);

  if (!state) {
    return null;
  }
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger style={{ position: "fixed", bottom: 16, left: 16, zIndex: 1000, fontSize: 16 }}>
        {pending ? "Rascunho disponível" : "Histórico do editor"}
      </Dialog.Trigger>
      <Dialog.Content
        style={{
          position: "fixed",
          bottom: 60,
          left: 16,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100dvh - 96px)",
          overflowY: "auto",
          zIndex: 1000,
          background: "Canvas",
          color: "CanvasText",
          border: "1px solid",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <Dialog.Title>Histórico do editor</Dialog.Title>
        <Dialog.Description aria-live="polite">
          {error ||
            (savedAt
              ? "Salvo localmente às " + new Date(savedAt).toLocaleTimeString()
              : "Aguardando alterações")}
        </Dialog.Description>
        {pending && (
          <button type="button" onClick={() => apply(pending)}>
            Carregar pendente
          </button>
        )}
        {pending && (
          <button
            type="button"
            onClick={() => {
              const view = findCodeMirror();
              if (view) {
                const source = view.state.doc.toString();
                apply({ ...state, entries: [state.base, source], cursor: 1 });
              }
            }}
          >
            Manter edição atual
          </button>
        )}
        <button
          type="button"
          disabled={!!pending || state.cursor === 0}
          onClick={() => apply({ ...state, cursor: state.cursor - 1 })}
        >
          Desfazer
        </button>
        <button
          type="button"
          disabled={!!pending || state.cursor >= state.entries.length - 1}
          onClick={() => apply({ ...state, cursor: state.cursor + 1 })}
        >
          Refazer
        </button>
        {/\.ya?ml$/i.test(new URL(fileKey, location.origin).pathname) && <YamlActions fileKey={fileKey} />}
        <Dialog.Close>Fechar</Dialog.Close>
      </Dialog.Content>
    </Dialog.Root>
  );
}
