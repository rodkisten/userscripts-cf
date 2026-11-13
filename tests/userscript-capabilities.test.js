import test from "node:test";
import assert from "node:assert/strict";
import { build } from "vite";
import { Window } from "happy-dom";

test("GM capabilities remain available when the manager provides lexical bindings only", async () => {
  const built = await build({
    configFile: new URL("../vite.config.js", import.meta.url).pathname,
    logLevel: "silent",
    build: {
      write: false,
      lib: {
        entry: new URL("../src/runtime/userscript-capabilities.ts", import.meta.url).pathname,
        name: "Capabilities",
        formats: ["iife"],
      },
    },
  });
  const source = (Array.isArray(built) ? built : [built])
    .flatMap((result) => result.output)
    .find((chunk) => chunk.type === "chunk").code;
  const host = new Window({
    url: "https://soundgasm.net/u/reader/audio",
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true },
  });
  try {
    assert.equal(host.GM_xmlhttpRequest, undefined);
    host.eval(
      `(()=>{const GM_xmlhttpRequest=()=>"request";const GM_setClipboard=()=>"clipboard";${source};window.capabilityProof=[Capabilities.gmRequest()(),Capabilities.gmClipboard()()];})()`,
    );
    assert.deepEqual([...host.capabilityProof], ["request", "clipboard"]);
    assert.equal(host.GM_xmlhttpRequest, undefined);
  } finally {
    await host.happyDOM.abort();
  }
});
