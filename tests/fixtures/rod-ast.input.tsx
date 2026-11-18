import React from "react";
import type { ScriptContext } from "../../src/core/runtime.js";
import type { DomEngine } from "../../src/runtime/dom-engine.js";
type IsAny<T> = 0 extends (1 & T) ? true : false;
type Assert<T extends true> = T;
type DomIsTyped = Assert<IsAny<DomEngine> extends false ? true : false>;
const _domTypeProof: DomIsTyped = true;
void _domTypeProof;

/** Typed real-world fixture: transformed output must pass TypeScript. */
export async function init(ctx: ScriptContext) {
  const response: Response = await fetch("/api/posts");
  const windowResponse: Response = await window.fetch("/api/window");
  const firstPost: Element | null = document.querySelector(".post");
  const posts: NodeListOf<Element> = document.querySelectorAll(".post");
  const nativeNode: HTMLDivElement = document.createElement("div");
  const ticker: number = setInterval(() => console.log("tick"), 1000);
  const onClick: EventListener = () => console.log("clicked");
  document.addEventListener("click", onClick);
  ctx.onDispose(() => document.removeEventListener("click", onClick));
  // @keep
  const native = window.location.href;
  const nested = async (): Promise<Response> => fetch("/api/more");
  return { response, windowResponse, nested, native, firstPost, posts, nativeNode, ticker };
}

/** Unannotated JS-style parameters and inferred return types. */
export function inferred(ctx: ScriptContext) {
  const one = document.querySelector("#root");
  const all = document.querySelectorAll("a");
  const timer = setInterval(() => void one, 500);
  return { one, all, timer };
}

/** Context alias must preserve the actual parameter identifier. */
export function aliased(context: ScriptContext) {
  const element = document.querySelector("main");
  const request = fetch("/api/context");
  return { element, request };
}

/** Global variants that are deliberately left native until contract verification. */
export function globalVariants(ctx: ScriptContext) {
  const selfWindow = self;
  const parentWindow = window.parent;
  const topWindow = window.top;
  const global = globalThis;
  const parentRequest = parent.fetch("/api/parent");
  const selfRequest = self.fetch("/api/self");
  const globalRequest = globalThis.fetch("/api/global");
  const timer = window.setInterval(() => void ctx, 200);
  return { selfWindow, parentWindow, topWindow, global, parentRequest, selfRequest, globalRequest, timer };
}

/** Native cleanup, observer lifecycle and React hooks must remain intact. */
export function manualLifecycle(ctx: ScriptContext) {
  const timer = setInterval(() => void ctx, 1000);
  ctx.onDispose(() => clearInterval(timer));
  const observer = new MutationObserver(() => void ctx);
  observer.observe(document.body, { childList: true });
  ctx.onDispose(() => observer.disconnect());
  return { timer, observer };
}

/** Independent owners must not affect each other's rewrites. */
export function independent(ctx: ScriptContext) {
  document.addEventListener("visibilitychange", () => void ctx);
  return setInterval(() => void ctx, 750);
}

export function Preview() {
  return <button className="rounded">React JSX</button>;
}

/** Compile-time contract: AST output must preserve native selector inference. */
export function selectorTypeParity(ctx: ScriptContext) {
  const anchors: NodeListOf<HTMLAnchorElement> = document.querySelectorAll("a");
  const inputs: NodeListOf<HTMLInputElement> = document.querySelectorAll("input");
  const buttons: NodeListOf<HTMLButtonElement> = document.querySelectorAll<HTMLButtonElement>(".action");
  const svg: NodeListOf<SVGCircleElement> = document.querySelectorAll("circle");
  const dynamicSelector: string = ".dynamic";
  const dynamic: NodeListOf<Element> = document.querySelectorAll(dynamicSelector);
  const first: HTMLAnchorElement | null = document.querySelector("a");
  const maybe: Element | null = document.querySelector(dynamicSelector);
  const scoped: NodeListOf<HTMLAnchorElement> = ctx.dom.scope(document.body).querySelectorAll("a");
  return { anchors, inputs, buttons, svg, dynamic, first, maybe, scoped };
}
