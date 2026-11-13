import { gmClipboard } from "../userscript-capabilities.ts";
import { onSettled } from "solid-js";
import { mountPoint } from "./mount-point.tsx";
import styles, { css } from "./clipboard.module.css";
function ClipboardFallback(props: { text: string; done: (ok: boolean) => void }) {
  let input!: HTMLTextAreaElement;
  onSettled(() => {
    input.focus();
    input.select();
    input.setSelectionRange(0, props.text.length);
    props.done(document.execCommand("copy"));
  });
  return (
    <>
      <style>{css}</style>
      <textarea ref={input} class={styles.input} readonly value={props.text} />
    </>
  );
}
export async function clipboardText(text: string) {
  const clipboard = gmClipboard();
  if (clipboard) {
    await clipboard(text, "text");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {}
  let resolve!: (ok: boolean) => void;
  const promise = new Promise<boolean>((done) => {
    resolve = done;
  });
  const mount = mountPoint(document.body, () => <ClipboardFallback text={text} done={resolve} />);
  try {
    if (!(await promise)) throw Error("O navegador não permitiu a cópia.");
  } finally {
    mount.dispose();
  }
}
