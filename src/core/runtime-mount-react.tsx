/** @jsxImportSource react */
import type { ReactNode } from "react";
import { RuntimeProvider } from "./runtime-context-react.js";
import type { ScriptContext } from "./runtime.js";
export function RuntimeMount({ context, children }: { context: ScriptContext; children: ReactNode }) {
  return <RuntimeProvider context={context}>{children}</RuntimeProvider>;
}
