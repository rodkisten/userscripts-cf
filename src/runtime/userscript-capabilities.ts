// Tampermonkey may inject GM APIs as lexical bindings rather than properties of
// window/globalThis. Resolve the granted bindings inside the userscript closure.
export function gmRequest(): ((options: any) => any) | undefined {
  if (typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function") return GM.xmlHttpRequest.bind(GM);
  if (typeof GM_xmlhttpRequest === "function") return GM_xmlhttpRequest;
}
export function gmClipboard(): ((text: string, type?: string) => any) | undefined {
  if (typeof GM_setClipboard === "function") return GM_setClipboard;
  if (typeof GM !== "undefined" && typeof GM.setClipboard === "function") return GM.setClipboard.bind(GM);
}
