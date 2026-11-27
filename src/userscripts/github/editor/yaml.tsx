import { useState } from "react";
import { findCodeMirror, replaceCodeMirrorDocument } from "../../github-color-studio/index.js";

import { formatYaml } from "./format-yaml.js";

export function YamlActions({ fileKey }: { fileKey: string }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function processYaml(applyFormat: boolean) {
    const view = findCodeMirror();
    if (!view || location.pathname + location.search !== fileKey) {
      setStatus("Editor indisponível.");
      return;
    }
    const source = view.state.doc.toString();
    setBusy(true);
    setStatus("");
    try {
      const formatted = await formatYaml(source);
      if (!applyFormat) {
        setStatus("Sintaxe YAML válida.");
      } else if (
        location.pathname + location.search !== fileKey ||
        findCodeMirror() !== view ||
        view.state.doc.toString() !== source
      ) {
        setStatus("O editor mudou durante a formatação. Tente novamente.");
      } else if (formatted === source) {
        setStatus("O YAML já está formatado.");
      } else {
        replaceCodeMirrorDocument(view, formatted);
        setStatus("YAML formatado com o padrão do Prettier.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" disabled={busy} onClick={() => void processYaml(false)}>
        Validar YAML
      </button>
      <button type="button" disabled={busy} onClick={() => void processYaml(true)}>
        Formatar YAML
      </button>
      <div role="status" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {status}
      </div>
    </>
  );
}
