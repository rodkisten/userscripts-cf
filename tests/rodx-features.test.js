import fs from "node:fs";
import assert from "node:assert/strict";
import { parse } from "@babel/parser";
import { CSS_SELECTORS, X_SELECTORS } from "../src/selectors.js";
import { Window } from "happy-dom";
const directory = new URL("../src/userscripts/rodx-studio/", import.meta.url);
const sourceFiles = [];
for (const entry of fs.readdirSync(directory, { recursive: true }))
  if (entry.endsWith(".js")) {
    let code = fs.readFileSync(new URL(entry, directory), "utf8");
    const ast = parse(code, { sourceType: "module" });
    const values = { CSS_SELECTORS, X_SELECTORS };
    for (const node of ast.program.body) {
      if (node.type !== "ImportDeclaration" || !node.source.value.endsWith(".css?inline")) continue;
      const css = fs.readFileSync(
        new URL(node.source.value.replace("?inline", ""), new URL(entry, directory)),
        "utf8",
      );
      values[node.specifiers[0].local.name] = css;
    }
    code = code.replace(/^import[^;]+;\s*/gm, "");
    // These fixtures evaluate individual declarations. Resolve their imported data explicitly.
    code = code.replace(/CSS_SELECTORS\.(s\d+)/g, (_, key) => {
      const value = CSS_SELECTORS[key];
      return typeof value === "function" ? "(" + value.toString() + ")" : JSON.stringify(value);
    });
    for (const [name, value] of Object.entries(values)) {
      if (typeof value !== "string") continue;
      code = code.replace(new RegExp("\\b" + name + "\\b", "g"), () => JSON.stringify(value));
    }
    code = code.replace(
      /cssDeclarations\(/g,
      '(css => css.slice(css.indexOf("{") + 1, css.lastIndexOf("}")))(',
    );
    // Import declarations are not evaluated by this isolated-function harness.
    code = code.replace(/^import[^;]+;\s*/gm, "");
    sourceFiles.push(code);
  }
const source = sourceFiles.join("\n");
const functions = new Map();
function walk(n, code) {
  if (!n || typeof n !== "object") return;
  if (n.type === "FunctionDeclaration" && !functions.has(n.id?.name))
    functions.set(n.id.name, code.slice(n.start, n.end));
  for (const [key, value] of Object.entries(n)) {
    if (["loc", "start", "end"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((item) => walk(item, code));
    else if (value && typeof value === "object") walk(value, code);
  }
}
for (const code of sourceFiles) walk(parse(code, { sourceType: "module" }), code);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let count = 0;
const pass = (n) => {
  count++;
  console.log("PASS", n);
};
function realm() {
  const w = new Window({ url: "https://x.com/home" });
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.Headers = Headers;
  w.Request = Request;
  w.Response = Response;
  w.ReadableStream = ReadableStream;
  return w;
}
{
  const w = realm();
  const events = [];
  w.document.addEventListener("fixture:inspect", (e) => events.push(JSON.parse(e.detail)));
  w.fetch = () =>
    Promise.resolve(
      new Response('{"data":{"ok":true}}', { headers: { "content-type": "application/json" } }),
    );
  w.eval(functions.get("studioPageBridge") + ";window.bridge=studioPageBridge;");
  w.bridge(w, "fixture");
  const request = new Request("https://x.com/i/api/graphql/hash/ListByRestId", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"variables":{"listId":"123"},"queryId":"hash"}',
  });
  const response = await w.fetch(request);
  await pause(80);
  assert.equal((await response.json()).data.ok, true);
  const body = events.find((x) => x.phase === "request-body");
  assert(body?.requestBody.includes("123"));
  assert.equal(request.bodyUsed, false);
  pass("Giant bridge captures Request body without consuming native body");
  const before = events.length;
  w.document.documentElement.setAttribute("data-rodx-inspect-paused", "true");
  await w.fetch("https://x.com/graphql");
  await pause(20);
  assert.equal(events.length, before);
  pass("Pause disables tracing in the existing bridge");
  w.document.documentElement.setAttribute("data-rodx-inspect-paused", "false");
  const multipart = '--part\r\nContent-Type: application/json\r\n\r\n{"data":{"ok":1}}\r\n--part--';
  // Use a fresh bridge realm to keep the existing interceptor's native fetch intact.
  const z = realm();
  let traces = [];
  z.fetch = () =>
    Promise.resolve(
      new Response(multipart, { headers: { "content-type": "multipart/mixed;boundary=part" } }),
    );
  z.document.addEventListener("multi:inspect", (e) => traces.push(JSON.parse(e.detail)));
  z.eval(functions.get("studioPageBridge") + ';studioPageBridge(window,"multi");');
  const r = await z.fetch("https://x.com/graphql");
  assert.equal(await r.text(), multipart);
  await pause(30);
  assert.equal(traces.at(-1).originalBody, multipart);
  pass("Multipart captured passively; native response remains complete");
  await z.happyDOM.abort();
  const q = realm();
  let trace = [];
  q.fetch = () =>
    Promise.resolve(new Response("x".repeat(30000), { headers: { "content-type": "text/plain" } }));
  q.document.documentElement.setAttribute("data-rodx-inspect-body-limit", "16384");
  q.document.addEventListener("big:inspect", (e) => trace.push(JSON.parse(e.detail)));
  q.eval(functions.get("studioPageBridge") + ';studioPageBridge(window,"big");');
  const big = await q.fetch("https://x.com/graphql");
  assert.equal((await big.text()).length, 30000);
  await pause(30);
  assert.equal(trace.at(-1).originalBody.length, 16384);
  assert.equal(trace.at(-1).originalRetained, false);
  pass("Configured capture size is explicit and leaves source unchanged");
  await q.happyDOM.abort();
  await w.happyDOM.abort();
}
{
  const w = realm();
  w.eval(
    `let listUsage={accounts:{}}; const LIST_USAGE_KEY='usage';const Studio={config:{frecencyHalfLifeDays:14},state:{account:'rod'},emit(){}};const validListId=x=>/^\\d+$/.test(x);const displayListName=x=>x.name;const state={lists:[{id:'123',name:'Zebra'},{id:'456',name:'Abacate'}]};` +
      [
        "halfLifeMs",
        "usageAccount",
        "statsForAccount",
        "usageStat",
        "scoreAt",
        "markListUsed",
        "mergeUsageAccount",
        "orderedQuickLists",
      ]
        .map((n) => functions.get(n))
        .join("\n") +
      ";window.usage={markListUsed,orderedQuickLists,scoreAt,mergeUsageAccount,statsForAccount};",
  );
  const u = w.usage;
  assert(u.markListUsed("123", "confirmed"));
  assert(!u.markListUsed("123", "confirmed"));
  assert.equal(u.orderedQuickLists()[0].id, "123");
  const current = u.statsForAccount().stats["123"];
  assert(Math.abs(u.scoreAt("123", current.updatedAt + 14 * 86400000) - 0.5) < 1e-8);
  pass("Existing giant picker ranks confirmed frequency and recency with deduplication");
  const at = Date.now(),
    local = { stats: { 123: { score: 1, count: 1, lastUsed: at, updatedAt: at } }, applied: { "123:a": at } },
    remote = {
      stats: { 123: { score: 1, count: 1, lastUsed: at, updatedAt: at } },
      applied: { "123:b": at },
    };
  const merged = u.mergeUsageAccount(local, remote, at);
  assert.equal(merged.stats["123"].score, 2);
  assert.equal(merged.stats["123"].count, 2);
  const again = u.mergeUsageAccount(merged, remote, at);
  assert.equal(again.stats["123"].score, 2);
  pass("Giant relay import unions concurrent usage without counting an event twice");
  await w.happyDOM.abort();
}
{
  const w = realm();
  let callbacks = new Map(),
    configured;
  const Studio = {
    config: {},
    services: {},
    configure: (patch) => (configured = patch),
    on: (n, cb) => callbacks.set(n, cb),
    menu: {
      panel(n, title, root) {
        w.document.body.append(root);
      },
      close() {},
    },
    diagnostics: () => ({ selectors: { tweets: 0, userCells: 0 } }),
  };
  w.Studio = Studio;
  w.eval(functions.get("createNetworkInspector") + ";createNetworkInspector(Studio);");
  const handler = callbacks.get("network:inspect");
  handler({
    phase: "request",
    id: 1,
    url: "https://x.com/graphql",
    at: Date.now(),
    method: "POST",
    requestBody: "",
  });
  handler({
    phase: "request-body",
    id: 1,
    requestBody: '{"variables":{"listId":"123"}}',
    requestRetained: true,
  });
  handler({ phase: "response", id: 1, status: 200, originalBody: '{"data":{"ok":true}}', durationMs: 3 });
  Studio.services.networkInspector.open();
  const root = w.document.getElementById("rodx-network-root");
  root.querySelector('[data-rx-open="1"]').click();
  assert(root.textContent.includes("JSON colapsável"));
  root.querySelector('[data-rx-tab="Payload"]').click();
  const details = root.querySelector(".rx-tree details");
  if (details) {
    details.open = true;
    details.dispatchEvent(new w.Event("toggle"));
  }
  assert(root.textContent.includes("variables") || root.textContent.includes("body"));
  pass("Inspector on giant runtime accepts delayed body and renders JSON tree");
  const limit = root.querySelector('[data-rx-retain="bodyLimit"]');
  limit.value = "4";
  limit.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert.equal(configured.networkInspector.bodyLimit, 4 * 1048576);
  assert.equal(w.document.documentElement.getAttribute("data-rodx-inspect-body-limit"), String(4 * 1048576));
  pass("Network body limit persists through centralized configuration");
  await w.happyDOM.abort();
}
assert(source.length > 700000);
assert(source.includes("function createListsModule"));
assert(source.includes("function startRodX"));
assert(source.includes("media.setup"));
assert(source.includes("CloudSync"));
pass("Complete giant script retains list, deck, media and cloud modules");
console.log(count + " checks passed");
{
  const w = realm();
  w.eval(
    `const validListId=id=>/^\\d+$/.test(String(id));const normalize=value=>String(value).toLowerCase();const INVALID_LIST_NAMES=new Set(['seguidores','membros']);` +
      functions.get("cleanListName") +
      "\n" +
      functions.get("parseApiListObject") +
      `;window.names={cleanListName,parseApiListObject};`,
  );
  assert.equal(w.names.cleanListName("Seguidores"), "");
  assert.equal(w.names.cleanListName("🍫"), "🍫");
  assert.equal(w.names.parseApiListObject({ __typename: "User", rest_id: "123", name: "Dono" }), null);
  pass("Giant metadata parser preserves emoji names and rejects follower labels and owners");
  w.eval(
    `const validListId=id=>/^\\d+$/.test(String(id));const parseApiListObject=window.names.parseApiListObject;const directNameRefreshes=new Map();let record={id:'123',name:'🍫',apiName:'🍫',nameVerifiedAt:'2020-01-01'};let returnedId='123';const requests=[];const Studio={emit(){}};const requestTemplates={ListByRestId:{method:'POST',path:'/i/api/graphql/q/ListByRestId',params:{},readPayload:{variables:{listId:'999'},queryId:'q'}}};const getOne=async()=>record;const now=()=>new Date().toISOString();const refresh=async()=>{};const ingestListResponse=async()=>{};const put=async(_,row)=>{record=row;};const requestInternal=async(path,options)=>{requests.push({path,options});await new Promise(r=>setTimeout(r,10));return {data:{list:{__typename:'List',rest_id:returnedId,name:'🍫'}}};};` +
      functions.get("refreshListName") +
      `;window.refreshFixture={refreshListName,requests,record:()=>record,setId:id=>returnedId=id};`,
  );
  const f = w.refreshFixture;
  const [a, b] = await Promise.all([f.refreshListName("123"), f.refreshListName("123")]);
  assert(a.updated && b.updated);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].options.method, "POST");
  assert.equal(f.requests[0].options.payload.variables.listId, "123");
  assert.notEqual(f.record().nameVerifiedAt, "2020-01-01");
  pass("Refresh on giant module deduplicates POST and validates unchanged name as confirmed");
  f.setId("456");
  const c = await f.refreshListName("123");
  assert.equal(c.updated, false);
  assert.match(c.error, /ID/);
  pass("Refresh never substitutes another list name when response ID differs");
  await w.happyDOM.abort();
}
console.log("TOTAL " + count + " checks passed");
