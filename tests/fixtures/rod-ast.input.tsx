import React from "react";
type Ctx = { http: { fetch: typeof fetch }; events: { dom: { add: (target: EventTarget, type: string, listener: EventListener) => void; remove: (target: EventTarget, type: string, listener: EventListener) => void } }; onDispose: (fn: () => void) => void };
export async function init(ctx: Ctx) {
  const response = await fetch("/api/posts");
  const onClick: EventListener = () => console.log("clicked");
  document.addEventListener("click", onClick);
  ctx.onDispose(() => document.removeEventListener("click", onClick));
  // @keep
  const native = window.location.href;
  const nested = async () => fetch("/api/more");
  return { response, nested, native };
}
export function Preview() { return <button className="rounded">React JSX</button>; }
