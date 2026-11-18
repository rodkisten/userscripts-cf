/** @jsxImportSource react */
import type { ReactNode } from "react";
import { RuntimeProvider } from "./runtime-context-react.js";
import type { ReactScriptContext } from "./react-context-contract.js";
export function RuntimeMount({ context, children }: { context: ReactScriptContext; children: ReactNode }) {
  return <RuntimeProvider context={context}>{children}</RuntimeProvider>;
}
