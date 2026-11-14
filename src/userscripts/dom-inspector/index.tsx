import { createSignal, Show, createEffect } from "solid-js";
import { observePageFetch, observePageXHR } from "../../runtime/network-interceptors.js";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import styles, { css } from "./Inspector.module.css";

export const INSPECTOR_CONFIG = Object.freeze({
  maxSourceCharacters: 500_000,
  maxCapturedRequests: 150,
  maxBodyCharacters: 120_000,
  autoScroll: false,
  refreshDelayMs: 350,
  maxHierarchyDepth: 12,
});
export default {
  init(ctx) {
    const [open, setOpen] = createSignal(false);
    const [tab, setTab] = createSignal("dom");
    const [selector, setSelector] = createSignal("");
    const [status, setStatus] = createSignal("");
    const [full, setFull] = createSignal(false);
    const [scroll, setScroll] = createSignal(INSPECTOR_CONFIG.autoScroll);
    const [records, setRecords] = createSignal([]);
    const [depth, setDepth] = createSignal(0);
    const [selectionName, setSelectionName] = createSignal("Nenhum elemento");
    const [picking, setPicking] = createSignal(false);
    const [live, setLive] = createSignal(false);
    let editor, editorRoot, selected, overlay, refreshTimer, pickerListener, pickerCancelListener, highlightTarget, highlightFrame = 0, lastRect = "", domObserver;
    const stop = () => { domObserver?.disconnect(); domObserver = undefined; cancelAnimationFrame(highlightFrame); highlightFrame = 0; editor?.destroy(); editor = undefined; editorRoot = undefined; overlay?.remove(); overlay = undefined; clearTimeout(refreshTimer); cancelPicker(); };
    const cancelPicker = () => {
      if (pickerListener) document.removeEventListener("pointerdown", pickerListener, true);
      if (pickerCancelListener) document.removeEventListener("keydown", pickerCancelListener, true);
      pickerListener = undefined;
      pickerCancelListener = undefined;
      setPicking(false);
    };
    const own = el => !!el?.closest?.("[data-userscripts-cf-ui], [data-userscripts-cf-shadow]") || el === overlay;
    const pickSelector = el => !el ? "" : el.id ? "#"+CSS.escape(el.id) : el.localName + [...el.classList].slice(0,2).map(x=>"."+CSS.escape(x)).join("");
    const followHighlight = () => {
      if (!highlightTarget?.isConnected || !overlay) {
        overlay?.remove(); overlay = undefined;
        highlightTarget = undefined;
        highlightFrame = 0;
        return;
      }
      const r = highlightTarget.getBoundingClientRect();
      const rect = `${r.left}px,${r.top}px,${r.width}px,${r.height}px`;
      if (rect !== lastRect) {
        overlay.style.left = `${r.left}px`;
        overlay.style.top = `${r.top}px`;
        overlay.style.width = `${r.width}px`;
        overlay.style.height = `${r.height}px`;
        lastRect = rect;
      }
      highlightFrame = requestAnimationFrame(followHighlight);
    };
    const markElement = el => {
      cancelAnimationFrame(highlightFrame);
      overlay?.remove(); overlay = undefined;
      highlightTarget = el;
      lastRect = "";
      if (!el) return;
      overlay = document.createElement("div");
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;outline:2px solid #a78bfa;background:#a78bfa33";
      document.documentElement.append(overlay);
      followHighlight();
    };
    const highlight = el => {
      selected = el;
      markElement(el);
      setSelectionName(el ? pickSelector(el) : "Nenhum elemento");
      setDepth(0);
      if (!el) return;
      if (scroll()) el.scrollIntoView({behavior:"smooth",block:"center"});

    };
    const moveSelection = direction => {
      const next = direction === "parent" ? selected?.parentElement : direction === "child" ? selected?.firstElementChild : direction === "previous" ? selected?.previousElementSibling : selected?.nextElementSibling;
      if (!next || own(next)) return;
      highlight(next);
      setSelector(pickSelector(next));
      renderSource();
    };
    const traverse = level => {
      if (!selected) return;
      let node = selected;
      for (let i = 0; i < level && node.parentElement; i++) node = node.parentElement;
      if (!own(node)) {
        markElement(node);
        setDepth(level);
        setSelectionName(pickSelector(node));
      }
    };
    const locateInSource = () => {
      if (!editor || !selected || tab() !== "dom") return;
      const source = editor.state.doc.toString();
      const marker = selected.outerHTML.slice(0, Math.min(100, selected.outerHTML.indexOf(">") + 1));
      const index = source.indexOf(marker);
      if (index >= 0) editor.dispatch({ selection: { anchor: index }, scrollIntoView: true });
      else setStatus("Elemento não localizado no snapshot");
    };
    const renderSource = () => {
      if (!editorRoot || !open()) return;
      const mode=tab();
      const source=mode==="dom" ? document.documentElement.outerHTML :
        mode==="css" ? selected ? [...getComputedStyle(selected)].map(k=>k+": "+getComputedStyle(selected).getPropertyValue(k)+";").join("\n") : "Select an element first" :
        JSON.stringify(records(),null,2);
      const content = source.slice(0, INSPECTOR_CONFIG.maxSourceCharacters);
      if (editor && editor.dom.parentElement === editorRoot) {
        if (editor.state.doc.toString() !== content) editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:content}});
      } else {
        editor?.destroy();
        editor=new EditorView({parent:editorRoot,state:EditorState.create({doc:content,extensions:[lineNumbers(),javascript(),oneDark,EditorState.readOnly.of(true),EditorView.lineWrapping]})});
      }
      setStatus(mode==="network"?records().length+" requests":source.length+" chars");
    };
    const schedule = () => { clearTimeout(refreshTimer); refreshTimer=setTimeout(renderSource,INSPECTOR_CONFIG.refreshDelayMs); };
    const updateLiveObserver = () => {
      domObserver?.disconnect();
      domObserver = undefined;
      clearTimeout(refreshTimer);
      if (!live() || !open() || tab() !== "dom") return;
      domObserver = new MutationObserver(mutations => {
        if (mutations.some(m => !own(m.target) && m.target !== overlay && ![...m.addedNodes].every(node => node === overlay))) schedule();
      });
      domObserver.observe(document.documentElement, {subtree:true, childList:true, attributes:true, characterData:true});
    };
    const select = value => {
      setSelector(value);
      try { const matches=[...document.querySelectorAll(value)].filter(el=>!own(el)); highlight(matches[0]);setStatus(matches.length+" matches"); } catch { highlight(null);setStatus("Invalid selector"); }
    };
    const copy = text => { if (ctx.clipboard?.copy) ctx.clipboard.copy(text); else navigator.clipboard?.writeText(text); };
    const pick = () => {
      cancelPicker();
      setPicking(true);
      setOpen(false);
      pickerListener = event => {
        const target = event.composedPath?.().find(node => node instanceof Element && !own(node));
        if (!target || own(event.target)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelPicker();
        highlight(target);
        setSelector(pickSelector(target));
        setTab("css");
        setOpen(true);
        queueMicrotask(renderSource);
      };
      pickerCancelListener = event => {
        if (event.key === "Escape") {
          cancelPicker();
          setOpen(true);
        }
      };
      document.addEventListener("pointerdown", pickerListener, true);
      document.addEventListener("keydown", pickerCancelListener, true);
    };
    // Context interceptors observe ctx.http traffic, not arbitrary native page fetches.
    ctx.interceptRequest?.(request => { setRecords(prev=>[...prev,{type:"request",url:request.url,method:request.method||"GET"}].slice(-INSPECTOR_CONFIG.maxCapturedRequests)); return request; });
    ctx.interceptResponse?.(response => { setRecords(prev=>[...prev,{type:"response",url:response.url,status:response.status}].slice(-INSPECTOR_CONFIG.maxCapturedRequests)); return response; });
    observePageFetch(event => { setRecords(prev => [...prev, event].slice(-INSPECTOR_CONFIG.maxCapturedRequests)); if (open() && tab() === "network") schedule(); }, { signal: ctx.signal, maxBodyCharacters: INSPECTOR_CONFIG.maxBodyCharacters });
    observePageXHR(event => { setRecords(prev => [...prev, { transport: "xhr", ...event }].slice(-INSPECTOR_CONFIG.maxCapturedRequests)); if (open() && tab() === "network") schedule(); }, { signal: ctx.signal, maxBodyCharacters: INSPECTOR_CONFIG.maxBodyCharacters });
    createEffect(() => { const isOpen = open(); tab(); live(); updateLiveObserver(); if (isOpen) queueMicrotask(renderSource); else { editor?.destroy(); editor = undefined; editorRoot = undefined; } });
    ctx.dock?.register([{id:"inspector",label:"🔬 DOM Inspector",run:()=>{cancelPicker();setOpen(true)}}]);
    ctx.ui.mountSolid(()=> <><Show when={picking()}><button class={styles.cancelPicker} type="button" onClick={()=>{cancelPicker();setOpen(true)}}>Cancelar seleção ✕</button></Show><Show when={open()}><section class={[styles.panel, { [styles.full]: full() }]} role="region" aria-label="DOM Inspector">
      <header class={styles.header}><strong>Inspector</strong><small>{status()}</small><button onClick={()=>setFull(v=>!v)}>⛶</button><button onClick={()=>setOpen(false)}>✕</button></header>
      <nav class={styles.tabs} role="tablist" aria-label="Inspector views">{["dom","css","network"].map(t=><button type="button" role="tab" aria-selected={tab()===t} class={{ [styles.active]: tab() === t }} onClick={()=>{setTab(t);queueMicrotask(renderSource)}}>{t.toUpperCase()}</button>)}</nav>
      <div class={styles.tools}><input value={selector()} placeholder="CSS selector" onInput={e=>select(e.currentTarget.value)}/><button onClick={pick}>◎</button><button onClick={()=>copy(selector())}>Copy</button></div>
      <div class={styles.tools}><button title="Pai" aria-label="Elemento pai" onClick={()=>moveSelection("parent")}>↑</button><button title="Filho" aria-label="Primeiro filho" onClick={()=>moveSelection("child")}>↓</button><button title="Anterior" aria-label="Irmão anterior" onClick={()=>moveSelection("previous")}>←</button><button title="Próximo" aria-label="Próximo irmão" onClick={()=>moveSelection("next")}>→</button><label class={styles.switch}><input type="checkbox" checked={scroll()} onChange={e=>setScroll(e.currentTarget.checked)}/> Scroll</label><label class={styles.switch}><input type="checkbox" checked={live()} onChange={e=>setLive(e.currentTarget.checked)}/> Live</label><button onClick={renderSource}>Refresh</button><button title="Localizar no código" aria-label="Localizar elemento no código" onClick={()=>{setTab("dom");queueMicrotask(()=>{renderSource();locateInSource()})}}>⌕</button></div>
      <div class={styles.hierarchy}><output class={styles.selection} title={selectionName()}>{selectionName()}</output><label for="inspector-depth">Nível {depth()}</label><input id="inspector-depth" aria-label="Subir na hierarquia DOM" type="range" min="0" max={INSPECTOR_CONFIG.maxHierarchyDepth} value={depth()} disabled={!selected} onInput={e=>traverse(Number(e.currentTarget.value))}/></div>
      <div class={styles.editor} ref={el=>{editorRoot=el;queueMicrotask(renderSource)}}/>
    </section></Show></>,{styles:[css]});
    // Live DOM updates are opt-in, debounced and exclude the inspector UI and overlay.
    ctx.onDispose(stop);
  }
};
