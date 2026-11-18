import React from "react";
import type { ScriptContext } from "../../src/core/runtime.js";
export async function init(ctx: ScriptContext) {
  const response = await fetch("/api/posts");
  const firstPost = document.querySelector(".post");
  const posts = document.querySelectorAll(".post");
  const nativeNode = document.createElement("div");
  const onClick: EventListener = () => console.log("clicked");
  document.addEventListener("click", onClick);
  ctx.onDispose(() => document.removeEventListener("click", onClick));
  // @keep
  const native = window.location.href;
  const nested = async () => fetch("/api/more");
  return { response, nested, native, firstPost, posts, nativeNode };
}
export function Preview() {
  return <button className="rounded">React JSX</button>;
}
