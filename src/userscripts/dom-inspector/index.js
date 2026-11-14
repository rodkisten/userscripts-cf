import { EditorState } from "@codemirror/state";
import { EditorView, basicSetup } from "codemirror";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { search, searchKeymap } from "@codemirror/search";
import { keymap } from "@codemirror/view";

const styles = `
:host{all:initial;color-scheme:dark;font:13px system-ui;color:#f4f4f5}
*{box-sizing:border-box}
.panel{position:fixed;inset:auto 8px max(8px,env(safe-area-inset-bottom)) 8px;height:min(72dvh,690px);background:#111118;border:1px solid #383844;border-radius:18px;z-index:2147483647;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 50px #000a}
.panel.full{inset:0;height:100dvh;border-radius:0}
header,.tabs,.tools{display:flex;align-items:center;gap:6px;padding:9px;border-bottom:1px solid #333}
header strong{flex:1}button,input{font:inherit;border:1px solid #41414d;background:#242430;color:inherit;border-radius:9px;padding:9px;min-height:36px}
button.active{background:#49408d}input{min-width:0;flex:1}
main{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column}
.editor{flex:1;min-height:120px;overflow:auto}.cm-editor{height:100%;font-size:12px}
small{color:#aaa}.row{padding:9px;border-bottom:1px solid #333;overflow-wrap:anywhere}
.selected{background:#282844}.overlay{position:fixed;pointer-events:none;border:2px solid #a78bfa;background:#a78bfa33;z-index:2147483646}
`;
export default {
  init(ctx) {
    let host, shadow, editor, selected, overlay, observer;
    let tab = "dom", full = false, autoScroll = false, matches = [], index = 0;
    const requests = [];
    const clean = () => { editor?.destroy(); observer?.disconnect(); overlay?.remove(); host?.remove(); editor = null; host = null; };
    function highlight(element) {
      selected = element;
      overlay?.remove();
      if (!element) return;
      const rect = element.getBoundingClientRect();
      overlay = document.createElement("div");
      overlay.style.cssText = `position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #a78bfa;background:#a78bfa33;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
      document.documentElement.append(overlay);
      if (autoScroll) element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    function viewCode(value, language = html()) {
      editor?.destroy();
      const target = shadow.querySelector(".editor");
      target.replaceChildren();
      editor = new EditorView({ parent: target, state: EditorState.create({
        doc: value, extensions: [basicSetup, language, oneDark, search(), keymap.of(searchKeymap), EditorState.readOnly.of(true)]
      }) });
    }
    function selectorOf(el) {
      if (!el) return "";
      if (el.id) return "#" + CSS.escape(el.id);
      const segments = [];
      for (let node = el; node?.nodeType === 1 && segments.length < 7; node = node.parentElement) {
        let part = node.localName;
        if (node.classList.length) part += "." + [...node.classList].slice(0,2).map(x=>CSS.escape(x)).join(".");
        segments.unshift(part);
        if (node.id) break;
      }
      return segments.join(" > ");
    }
    function refresh() {
      if (!shadow) return;
      const source = tab === "dom" ? document.documentElement.outerHTML :
        tab === "css" ? selected ? [...getComputedStyle(selected)].map(key=>key+": "+getComputedStyle(selected).getPropertyValue(key)+";").join("\n") : "Select an element" :
        JSON.stringify(requests, null, 2);
      viewCode(source, tab === "network" ? json() : html());
      shadow.querySelector(".status").textContent = tab === "dom" ? "Live DOM" : tab === "css" ? selectorOf(selected) : requests.length + " requests";
    }
    function open() {
      if (host) { host.remove(); clean(); return; }
      host = document.createElement("div");
      host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
      shadow = host.attachShadow({mode:"open"});
      shadow.innerHTML = `<style>${styles}</style><section class="panel" style="pointer-events:auto" role="dialog" aria-label="DOM Inspector"><header><strong>⌘ Inspector</strong><small class="status"></small><button data-act="full" aria-label="Fullscreen">⛶</button><button data-act="close" aria-label="Close">✕</button></header><nav class="tabs"><button data-tab="dom" class="active">DOM</button><button data-tab="css">CSS</button><button data-tab="network">Network</button></nav><div class="tools"><input aria-label="CSS selector" placeholder="CSS selector, #id, .class"><button data-act="pick">◎</button><button data-act="copy">Copy</button></div><div class="tools"><button data-act="prev">↑</button><input aria-label="Hierarchy level" type="range" min="0" max="8" value="0"><button data-act="next">↓</button><label><input type="checkbox" data-act="scroll" style="min-height:0"> Scroll</label></div><main><div class="editor"></div></main></section>`;
      document.documentElement.append(host);
      shadow.addEventListener("click", event => {
        const button = event.target.closest("button"); if (!button) return;
        if (button.dataset.tab) { tab=button.dataset.tab; shadow.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===button)); refresh(); return; }
        const action = button.dataset.act;
        if (action==="close") return clean();
        if (action==="full") { full=!full; shadow.querySelector(".panel").classList.toggle("full",full); editor?.requestMeasure(); }
        if (action==="copy") navigator.clipboard?.writeText(selectorOf(selected));
        if (action==="pick") {
          host.style.display="none";
          const pick = e => { e.preventDefault(); e.stopPropagation(); document.removeEventListener("click",pick,true); host.style.display=""; highlight(e.target); shadow.querySelector('input[aria-label="CSS selector"]').value=selectorOf(e.target); refresh(); };
          document.addEventListener("click",pick,true);
        }
        if (action==="prev") { selected=selected?.parentElement||selected; highlight(selected); refresh(); }
        if (action==="next") { selected=selected?.firstElementChild||selected; highlight(selected); refresh(); }
      });
      shadow.querySelector('input[aria-label="CSS selector"]').addEventListener("input", e => {
        try { matches=[...document.querySelectorAll(e.target.value)].filter(el=>el!==host); index=0; highlight(matches[0]); } catch { matches=[]; highlight(null); }
      });
      shadow.querySelector('input[type="range"]').addEventListener("input",e=>{
        let node=matches[index]||selected; for(let i=0;i<Number(e.target.value);i++) node=node?.parentElement||node; highlight(node); refresh();
      });
      shadow.querySelector('[data-act="scroll"]').addEventListener("change",e=>autoScroll=e.target.checked);
      observer=new MutationObserver(()=>{ if(tab==="dom" && host) { /* Manual refresh avoids feedback loops and large-page editor churn. */ } });
      observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true});
      refresh();
    }
    ctx.dock?.register([{id:"inspector",label:"DOM & Network Inspector",run:open}]);
    ctx.signal?.addEventListener("abort",clean,{once:true});
  }
};
