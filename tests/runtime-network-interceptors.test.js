import { describe, it, expect, vi } from "vitest";
import { createNetworkInterceptors } from "../src/runtime/network-interceptors.js";

describe("context network interceptors", () => {
  it("modifies request and response without consuming the response body", async () => {
    const http = { request: vi.fn(async (url) => new Response(url)) };
    const hooks = createNetworkInterceptors(http);
    hooks.interceptRequest((request) => ({ ...request, url: "/changed" }));
    hooks.interceptResponse(async (response) => new Response((await response.clone().text()).toUpperCase()));
    const response = await hooks.request("/original");
    expect(await response.text()).toBe("/CHANGED");
    expect(http.request).toHaveBeenCalledWith("/changed", expect.objectContaining({ url: "/changed" }));
    hooks.dispose();
  });
  it("unsubscribes and isolates handler errors", async () => {
    const http = { request: vi.fn(async () => new Response("ok")) };
    const onError = vi.fn();
    const hooks = createNetworkInterceptors(http, { onError });
    const off = hooks.interceptResponse(() => { throw Error("broken"); });
    expect(await (await hooks.request("/")).text()).toBe("ok");
    expect(onError).toHaveBeenCalledOnce();
    off();
    await hooks.request("/");
    expect(onError).toHaveBeenCalledOnce();
  });
});
