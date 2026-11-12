// ==UserScript==
// @name         GoneWildStudio · Reddit Audio & Tags
// @namespace    https://local.gonewildstudio/
// @version      1.5.0
// @description  Reddit + Soundgasm Studio: player, catalogo do autor, hashtags e pesquisa no subreddit de origem; Audiochan preservado.
// @author       GoneWildStudio
// @match        https://www.reddit.com/*
// @match        https://reddit.com/*
// @match        https://new.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://soundgasm.net/*
// @match        https://www.soundgasm.net/*
// @match        https://audiochan.com/*
// @match        https://www.audiochan.com/*
// @match        https://audiochan.net/*
// @match        https://www.audiochan.net/*
// @run-at       document-start
// @weight       999
// @inject-into  content
// @noframes
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @connect      soundgasm.net
// @connect      www.soundgasm.net
// @connect      media.soundgasm.net
// @connect      audiochan.com
// @connect      www.audiochan.com
// @connect      audiochan.net
// @connect      audioerotica.com
// @connect      www.audioerotica.com
// @connect      audioerotica.net
// ==/UserScript==

function initGoneWild() {
  'use strict';

  const bridge = createBridge();
  if (/^(?:www\.)?soundgasm\.net$/i.test(location.hostname)) {
    bootSoundgasm(bridge);
    return;
  }
  if (/^(?:www\.)?audiochan\.(?:com|net)$/i.test(location.hostname)) {
    bootAudiochan(bridge);
    return;
  }

  const NS = 'gws';
  const VERSION = '1.5.0';
  const KEYS = {
    config: `${NS}:config:v1`,
    seen: `${NS}:seen:v1`,
    cache: `${NS}:audio-cache:v1`,
  };
  const DEFAULTS = Object.freeze({
    subreddits: ['GoneWildAudioGay'],
    removeAds: true,
    showTags: true,
    audio: true,
    hideSeen: false,
    networkFilter: true,
    onlyAudio: false,
  });
  const HOSTS = /(?:^|\.)(?:soundgasm\.net|audiochan\.(?:com|net)|audioerotica\.(?:com|net))$/i;
  const FILE_HOSTS = /(?:^|\.)(?:media\.soundgasm\.net|soundgasm\.net|audiochan\.(?:com|net)|audioerotica\.(?:com|net))$/i;
  const AUDIO_EXT = /\.(?:mp3|m4a|aac|ogg|opus|wav)(?:[?#]|$)/i;
  const TAG_RE = /\[([^\[\]\r\n]{1,180})\]/g;
  const CARD_SELECTOR = 'shreddit-post, [data-testid="search-post-unit"], [data-testid="sdui-post-unit"], article[data-testid="post-container"], [data-testid="post-container"], .Post, div[data-fullname], .thing.link[data-fullname], article.gws-result';
  const AD_SELECTOR = [
    'shreddit-ad-post', 'shreddit-ad', 'reddit-ad', 'ad-unit',
    '[data-testid="post-container"][data-promoted="true"]',
    '[data-testid="promoted-post"]', '[data-testid="ad-post"]',
    '[data-ad-slot]', '[data-slot="promoted"]',
    'article:has(> shreddit-post[promoted])',
    'article:has(> shreddit-post[is-promoted])',
    'article:has(> shreddit-post[ad-type])',
  ].join(',');

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const normalize = (v) => String(v || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const escapeHTML = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const debounce = (fn, delay) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; };
  const loadJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const storeJSON = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  const now = () => Date.now();
  const state = {
    settings: { ...DEFAULTS, ...loadJSON(KEYS.config, {}) },
    seen: loadJSON(KEYS.seen, {}),
    cache: loadJSON(KEYS.cache, {}),
    selected: { include: new Set(), exclude: new Set() },
    root: null,
    shell: null,
    cards: new WeakMap(),
    allCards: new Set(),
    waiting: new Set(),
    queue: [],
    inflight: 0,
    processing: false,
    observer: null,
    adObserver: null,
    route: location.href,
    lastAudio: null,
    netActive: false,
    menu: null,
    search: { active: false, view: null, controller: null, serial: 0, returnURL: null, after: null, query: '', loading: false },
  };

  if (!Array.isArray(state.settings.subreddits)) state.settings.subreddits = [...DEFAULTS.subreddits];
  state.settings.subreddits = state.settings.subreddits.filter((s) => typeof s === 'string' && /^[a-z0-9_]{2,32}$/i.test(s)).slice(0, 30);

  // Read/write only script-owned keys; never touch Reddit auth or cookies.
  const saveSettings = () => { storeJSON(KEYS.config, state.settings); publishSettings(); refreshAll(); };
  const saveSeen = () => {
    const entries = Object.entries(state.seen).sort((a, b) => b[1] - a[1]).slice(0, 5000);
    state.seen = Object.fromEntries(entries);
    storeJSON(KEYS.seen, state.seen);
    publishSettings();
  };
  const saveCache = debounce(() => {
    const entries = Object.entries(state.cache).sort((a, b) => (b[1]?.at ?? 0) - (a[1]?.at ?? 0)).slice(0, 500);
    state.cache = Object.fromEntries(entries);
    storeJSON(KEYS.cache, state.cache);
  }, 700);

  const isTargetSub = (name) => state.settings.subreddits.some((s) => normalize(s) === normalize(name));
  const routeSub = () => decodeURIComponent(location.pathname.match(/\/r\/([^/]+)/i)?.[1] || '');
  const enabledHere = () => Boolean(routeSub() && isTargetSub(routeSub()));
  const subFromPath = (href) => {
    try { return decodeURIComponent(new URL(href, location.origin).pathname.match(/\/r\/([^/]+)/i)?.[1] || ''); }
    catch { return ''; }
  };
  const postID = (raw) => {
    const str = String(raw || '');
    const m = str.match(/(?:t3_|post-|\/comments\/)([a-z0-9]{5,12})(?:\b|\/|$)/i);
    return m ? `t3_${m[1].toLowerCase()}` : /^[a-z0-9]{5,12}$/i.test(str) ? `t3_${str.toLowerCase()}` : '';
  };

  // The page's native network layer is in another JS world in Safari. This tiny shim
  // runs in the page world. If Safari/CSP refuses it, DOM filtering still works.
  function pageNetworkShim(configKey, seenKey) {
    'use strict';
    if (window.__gwsNetworkInstalled) return;
    Object.defineProperty(window, '__gwsNetworkInstalled', { value: true });
    const load = (key, defaultValue) => { try { return JSON.parse(localStorage.getItem(key)) ?? defaultValue; } catch { return defaultValue; } };
    const enabled = (cfg, sr) => (cfg.subreddits || []).some((s) => s.toLowerCase() === (sr || '').toLowerCase());
    const idOf = (v) => {
      const source = String(v || '');
      const match = source.match(/(?:t3_|post-|\/comments\/)([a-z0-9]{5,12})\b/i);
      if (match) return `t3_${match[1].toLowerCase()}`;
      return /^[a-z0-9]{5,12}$/i.test(source) ? `t3_${source.toLowerCase()}` : '';
    };
    const isAd = (node) => !!(node && (node.promoted === true || node.is_promoted === true || node.isSponsored === true || node.is_sponsored === true || node.adType || node.ad_type));
    function mutateJSON(data, cfg, seen, sr) {
      let removed = 0;
      const skip = (item) => {
        const itemData = item?.data || item;
        if (cfg.removeAds && (isAd(item) || isAd(itemData))) return true;
        if (!cfg.hideSeen || !cfg.networkFilter) return false;
        const name = itemData?.subreddit || sr;
        const id = idOf(itemData?.name || itemData?.id || itemData?.permalink);
        return enabled(cfg, name) && id && !!seen[id];
      };
      const walk = (node, depth = 0) => {
        if (!node || typeof node !== 'object' || depth > 8) return;
        if (Array.isArray(node)) { for (const child of node) walk(child, depth + 1); return; }
        // Limit mutation to standard Reddit Listing nodes, not arbitrary API objects.
        if (node.kind === 'Listing' && Array.isArray(node.data?.children)) {
          const prior = node.data.children.length;
          node.data.children = node.data.children.filter((child) => !skip(child));
          removed += prior - node.data.children.length;
        }
        for (const [key, value] of Object.entries(node)) {
          if (key === 'children' || key === 'data' && node.kind === 'Listing') continue;
          if (typeof value === 'object' && value) walk(value, depth + 1);
        }
        if (node.kind === 'Listing' && node.data) walk(node.data, depth + 1);
      };
      walk(data);
      return removed;
    }
    function mutateHTML(html, cfg, seen, sr) {
      if (!html.includes('shreddit-post') && !html.includes('promoted')) return null;
      const template = document.createElement('template');
      template.innerHTML = html;
      let removed = 0;
      template.content.querySelectorAll('shreddit-post').forEach((post) => {
        const node = post.closest('article') || post;
        const name = post.getAttribute('subreddit-prefixed-name')?.replace(/^r\//i, '') || post.getAttribute('subreddit-name') || sr;
        const id = idOf(post.getAttribute('id') || post.getAttribute('post-id') || post.getAttribute('thingid') || post.getAttribute('permalink'));
        const ad = ['promoted', 'is-promoted', 'ad-type'].some((x) => post.hasAttribute(x)) || /\bPromoted\b/i.test(post.getAttribute('post-type') || '');
        if (cfg.removeAds && ad || cfg.hideSeen && cfg.networkFilter && enabled(cfg, name) && !!seen[id]) { node.remove(); removed++; }
      });
      template.content.querySelectorAll('shreddit-ad-post, shreddit-ad, reddit-ad').forEach((el) => {
        if (cfg.removeAds) { (el.closest('article') || el).remove(); removed++; }
      });
      return removed ? template.innerHTML : null;
    }
    const qualifies = (url, method) => {
      try {
        const u = new URL(url, location.href);
        if (!/^(?:GET|HEAD)$/i.test(method || 'GET') || u.origin !== location.origin) return null;
        if (!/(?:\/svc\/shreddit\/|\/search(?:\.json)?(?:\/|\?)|\/(?:hot|new|top|rising|controversial|comments)(?:\/|\.json)|\.json(?:\?|$))/i.test(u.pathname + u.search)) return null;
        return u;
      } catch { return null; }
    };
    const originalFetch = window.fetch;
    window.fetch = async function (request, init) {
      const url = typeof request === 'string' || request instanceof URL ? String(request) : request?.url;
      const method = init?.method || request?.method || 'GET';
      const response = await Reflect.apply(originalFetch, this, arguments);
      const u = qualifies(url, method);
      if (!u || !response.ok || response.type === 'opaque' || response.bodyUsed) return response;
      const cfg = load(configKey, {});
      if (!cfg.removeAds && !(cfg.hideSeen && cfg.networkFilter)) return response;
      const seen = load(seenKey, {});
      const sr = u.pathname.match(/\/r\/([^/]+)/)?.[1] || u.searchParams.get('name') || '';
      const type = response.headers.get('content-type') || '';
      try {
        if (/json/i.test(type)) {
          const data = await response.clone().json();
          if (!mutateJSON(data, cfg, seen, sr)) return response;
          return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers: response.headers });
        }
        if (/html/i.test(type) && /\/svc\/shreddit\//.test(u.pathname)) {
          const html = await response.clone().text();
          const mutated = mutateHTML(html, cfg, seen, sr);
          if (mutated == null) return response;
          return new Response(mutated, { status: response.status, statusText: response.statusText, headers: response.headers });
        }
      } catch { /* Return original response intact. */ }
      return response;
    };
    // XHR also carries listing data on some Reddit builds. This hook is best-effort.
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__gwsURL = url;
      this.__gwsMethod = method;
      return Reflect.apply(open, this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      const xhr = this;
      const u = qualifies(xhr.__gwsURL, xhr.__gwsMethod);
      if (u) xhr.addEventListener('readystatechange', () => {
        if (xhr.readyState !== 4 || (xhr.responseType && xhr.responseType !== 'text') || xhr.status < 200 || xhr.status >= 300) return;
        try {
          const cfg = load(configKey, {});
          const body = xhr.responseText;
          if (!body || !/json/i.test(xhr.getResponseHeader('content-type') || '')) return;
          const data = JSON.parse(body);
          const sr = u.pathname.match(/\/r\/([^/]+)/)?.[1] || '';
          if (!mutateJSON(data, cfg, load(seenKey, {}), sr)) return;
          const rewritten = JSON.stringify(data);
          Object.defineProperty(xhr, 'responseText', { configurable: true, get: () => rewritten });
          Object.defineProperty(xhr, 'response', { configurable: true, get: () => rewritten });
        } catch { /* Keep native XHR behavior on unsupported builds. */ }
      }, true);
      return Reflect.apply(send, this, arguments);
    };
    document.dispatchEvent(new CustomEvent('gws:network-ready'));
  }

  function injectNetworkHook() {
    const source = `;(${pageNetworkShim.toString()})(${JSON.stringify(KEYS.config)}, ${JSON.stringify(KEYS.seen)});`;
    try {
      const script = document.createElement('script');
      script.textContent = source;
      (document.documentElement || document.head).appendChild(script);
      script.remove();
    } catch (e) { console.debug('[GoneWildStudio] Inline shim unavailable', e); }
    // Safari CSP sometimes rejects inline scripts but permits blob: scripts.
    setTimeout(() => {
      if (state.netActive || !document.documentElement) return;
      try {
        const blobURL = URL.createObjectURL(new Blob([source], { type:'text/javascript' }));
        const script = document.createElement('script');
        script.src = blobURL;
        script.onload = script.onerror = () => { script.remove(); URL.revokeObjectURL(blobURL); };
        document.documentElement.appendChild(script);
        setTimeout(() => { script.remove(); URL.revokeObjectURL(blobURL); }, 3000);
      } catch (e) { console.debug('[GoneWildStudio] Blob shim unavailable, using DOM fallback', e); }
    }, 250);
  }
  const publishSettings = () => document.dispatchEvent(new CustomEvent('gws:settings-changed'));
  document.addEventListener('gws:network-ready', () => { state.netActive = true; updateCounters(); });
  if (document.documentElement) injectNetworkHook();
  else document.addEventListener('DOMContentLoaded', injectNetworkHook, { once: true });

  function stylesheet() {
    const style = document.createElement('style');
    style.id = 'gws-styles';
    style.textContent = `
      :root { --gws-pink: #f38ab5; --gws-bg: #17191c; }
      ${AD_SELECTOR.split(',').map((selector) => `body.gws-remove-ads ${selector.trim()}`).join(',')} { display:none !important; }
      .gws-hidden { display:none !important; }
      /* Audiochan-style presentation lives INSIDE EACH REDDIT POST, never in an external list. */
      .gws-inline { width:100%; max-width:100%; box-sizing:border-box; margin:7px 0 10px;
        clear:both; color:inherit; font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
        overflow-wrap:anywhere; min-width:0; }
      .gws-native-title { display:none !important; }
      .gws-categories { display:flex; gap:5px; align-items:center; flex-wrap:wrap; margin-bottom:9px; }
      .gws-title { margin:0 0 9px; padding:0; color:var(--color-neutral-content-strong,#f5f0f3);
        font:750 clamp(19px,4.6vw,26px)/1.24 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;
        letter-spacing:-.55px; overflow-wrap:anywhere; }
      .gws-title a { color:inherit !important; text-decoration:none !important; }
      .gws-title a:active { opacity:.74; }
      .gws-tags { display:flex; flex-wrap:wrap; gap:6px; padding:0 0 7px; align-items:center; }
      .gws-tag { color:#e5d6df; background:rgba(140,126,135,.17);
        border:1px solid rgba(200,178,195,.14); border-radius:6px;
        font:550 12px/1.35 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;
        padding:7px 9px; min-height:33px; max-width:100%; overflow-wrap:anywhere;
        cursor:pointer; touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
      .gws-tag::first-letter { color:#e77cbd; }
      .gws-tag.gws-category { font-weight:700; padding:5px 7px; min-height:29px;
        border-color:rgba(255,130,157,.38); background:rgba(118,32,50,.22); color:#fa909e; }
      .gws-tag.gws-category.gws-rating { background:rgba(241,124,176,.13);
        border-color:rgba(241,124,176,.37); color:#f29ac0; }
      .gws-tag[data-active="include"] { border-color:#ec7caf; background:rgba(243,138,181,.25); color:white; }
      .gws-tag[data-active="exclude"] { border-color:#f07070; background:rgba(240,112,112,.18); color:#ff8f8f; text-decoration:line-through; }
      .gws-tag-extra[hidden] { display:none !important; }
      .gws-expand { appearance:none; font:550 12px -apple-system,system-ui,sans-serif;
        color:#c6b5c1; border:0; background:transparent; min-height:33px; padding:5px 3px;
        cursor:pointer; touch-action:manipulation; }
      .gws-expand[hidden] { display:none !important; }
      .gws-controls { padding-top:3px; }
      .gws-controls .gws-action { min-height:32px; padding:6px 9px; }
      .gws-inline[hidden], .gws-categories[hidden], .gws-tags[hidden] {display:none !important;}
      .gws-row { display:flex; flex-wrap:wrap; gap:7px; align-items:center; margin-top:4px; }
      .gws-action { appearance:none; border:1px solid rgba(150,150,165,.30); background:rgba(130,130,140,.09); color:inherit; border-radius:7px; padding:7px 10px; font:500 12px/1.2 -apple-system,system-ui,sans-serif; cursor:pointer; min-height:34px; touch-action:manipulation; }
      .gws-action[data-seen="yes"] { color:#9ea2ac; }
      .gws-audio { border:1px solid rgba(243,138,181,.18); background:rgba(243,138,181,.045); border-radius:11px; margin-top:8px; padding:10px; min-width:0; }
      .gws-audio-head { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; font:600 12px -apple-system,system-ui,sans-serif; margin-bottom:7px; }
      .gws-audio a { color:#f497be; text-decoration:none; font-weight:600; overflow-wrap:anywhere; }
      .gws-audio audio { display:block; width:100%; min-width:0; height:42px; }
      .gws-muted { opacity:.65; font:400 11px/1.35 -apple-system,system-ui,sans-serif; }
      .gws-searchbar { position:relative; z-index:2; box-sizing:border-box; display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding:10px; margin:4px 0 12px; border:1px solid rgba(243,138,181,.20); border-radius:11px; color:#e7e7e7; background:#151518; font:13px -apple-system,system-ui,sans-serif; }
      .gws-searchbar .gws-search-input { flex:1 1 150px; min-width:0; min-height:40px; padding:8px 10px; background:#222329; color:white; border:1px solid #3c3c43; border-radius:7px; font-size:16px; }
      .gws-searchbar button { min-height:40px; padding:7px 10px; border-radius:8px; border:1px solid #694153; color:#f6b0ce; background:#2b2027; font:600 12px -apple-system,system-ui,sans-serif; }
      .gws-searchchips { display:flex; gap:5px; flex-wrap:wrap; width:100%; }
      .gws-searchchips button { min-height:30px; padding:4px 7px; }
      #gws-floating { position:fixed !important; right:10px !important; bottom:calc(88px + env(safe-area-inset-bottom,0px)) !important; z-index:2147483600 !important; width:49px !important; height:49px !important; border-radius:50% !important; color:#171017 !important; background:#f28eb5 !important; box-shadow:0 5px 24px #0009 !important; font:700 22px -apple-system,system-ui,sans-serif !important; border:1px solid #ffffff44 !important; display:none; align-items:center; justify-content:center; cursor:pointer; touch-action:manipulation; }

      /* Studio results are a real in-page list, not a floating panel. */
      body.gws-studio-search-active [data-testid="search-post-unit"]:not(.gws-result),
      body.gws-studio-search-active [data-testid="sdui-post-unit"]:not(.gws-result),
      body.gws-studio-search-active shreddit-post:not(.gws-result),
      body.gws-studio-search-active .Post:not(.gws-result),
      body.gws-studio-search-active [data-testid="post-container"]:not(.gws-result) { display:none !important; }
      .gws-result { color:inherit; padding:14px 12px 12px; border-bottom:1px solid rgba(130,135,142,.24); width:100%; max-width:100%; min-width:0; box-sizing:border-box; }
      .gws-result-meta { display:flex; flex-wrap:wrap; gap:8px; color:#9cabb6; font:500 12px/1.35 -apple-system,system-ui,sans-serif; margin:0 0 10px; }
      .gws-result .gws-inline { margin:0; padding:0; }
      .gws-result-stats { display:flex; gap:12px; color:#9aa6b3; font:400 12px -apple-system,system-ui,sans-serif; margin-top:9px; }
      #gws-results-view { box-sizing:border-box; width:100%; max-width:760px; margin:0 auto; padding:0 0 18px; overflow:clip; color:inherit; }
      #gws-results-view[hidden] { display:none!important; }
      .gws-result-message { font:500 13px/1.5 -apple-system,system-ui,sans-serif; color:#c8c3c7; padding:14px 12px; }
      .gws-results-title { display:flex; justify-content:space-between; gap:8px; align-items:center; padding:10px 12px 6px; font:700 14px -apple-system,system-ui,sans-serif; color:#f3b1d0; }
      #gws-more { display:block; margin:12px auto 24px; border:1px solid #694a59; background:#292026; color:#f6acc8; border-radius:9px; padding:9px 16px; min-height:40px; font:600 13px -apple-system,system-ui,sans-serif; }
      #gws-more[hidden]{display:none!important;}
      .gws-searchbar { width:calc(100% - 20px); max-width:740px; margin:10px auto 12px; padding:8px; gap:7px; border-radius:12px; clear:both; position:relative; z-index:1; overflow:hidden; }
      .gws-searchbar .gws-search-input { flex:1 1 175px; width:100%; font-size:16px; }
      .gws-searchbar .gws-searchchips { min-width:0; }
      .gws-searchbar button { overflow-wrap:anywhere; }
      .gws-inline { position:relative; z-index:0; overflow:hidden; }
      .gws-tags { max-width:100%; overflow-wrap:anywhere; gap:5px; }
      .gws-tag { flex:0 1 auto; text-align:left; white-space:normal; word-break:break-word; }
      .gws-title { font-size:clamp(18px,4.4vw,23px); line-height:1.3; font-weight:700; }
      .gws-audio { padding:9px; border-radius:9px; }
      .gws-audio audio { max-width:100%; }
      .gws-controls { display:flex; flex-wrap:wrap; gap:6px; }
      @media(max-width:480px) { .gws-result { padding:12px 8px; } .gws-searchbar { width:calc(100% - 16px); } .gws-action {font-size:12px;} }
      #gws-floating.gws-on {display:none !important;}
      @media(max-width:480px){ .gws-inline{margin:7px 0;} .gws-action{padding:7px 9px;} }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function setupShell() {
    if (state.shell?.isConnected || !document.body) return;
    state.shell = document.createElement('div');
    state.shell.id = 'gws-shell';
    state.shell.style.cssText = 'position:fixed;inset:0;z-index:2147483650;pointer-events:none;';
    state.root = state.shell.attachShadow({ mode: 'open' });
    state.root.innerHTML = `<style>
      :host{all:initial;color-scheme:dark;font:14px -apple-system,BlinkMacSystemFont,system-ui,sans-serif}
      *,*:before,*:after{box-sizing:border-box}
      #shade{display:none;position:fixed;inset:0;background:#000b;pointer-events:auto}
      #sheet{display:none;position:fixed;bottom:0;left:0;right:0;max-height:min(82dvh,700px);overflow-y:auto;overscroll-behavior:contain;background:#191a20;color:#f2eef1;padding:12px 16px calc(20px + env(safe-area-inset-bottom,0px));border-radius:18px 18px 0 0;border-top:1px solid #604253;pointer-events:auto;box-shadow:0 -12px 45px #0008}
      #sheet.open,#shade.open{display:block} h2{font-size:18px;letter-spacing:-.3px;margin:6px 0 12px} h3{font-size:13px;margin:18px 0 7px;color:#f4a6c7}
      button{border:1px solid #56505a;background:#2b2a30;color:white;min-height:38px;border-radius:8px;padding:8px 11px;font:600 13px -apple-system,system-ui,sans-serif;touch-action:manipulation}
      button.primary{background:#e68cb1;color:#1b1218;border-color:#e68cb1} input[type=text]{width:100%;padding:10px;background:#25262d;border:1px solid #52515b;color:white;border-radius:8px;font:16px -apple-system,system-ui,sans-serif;min-height:42px}
      input[type=checkbox]{accent-color:#f59ac1;width:18px;height:18px;flex:none} label.toggle{display:flex;align-items:center;gap:9px;min-height:39px;font-size:13px}
      .top{display:flex;justify-content:space-between;align-items:center;gap:10px}.buttons{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}.fine{color:#aaa4ae;line-height:1.5;font-size:11px}.status{color:#e89dbe;font-size:11px}.sep{height:1px;background:#333139;margin:12px 0}
      #menu{display:none;position:fixed;left:12px;right:12px;bottom:calc(78px + env(safe-area-inset-bottom,0px));border-radius:12px;background:#28232a;color:white;border:1px solid #554450;padding:9px;box-shadow:0 10px 40px #0009;pointer-events:auto;max-width:360px;margin:auto}
      #menu.open{display:block}.menu-title{font-size:12px;color:#f0a7c4;margin:4px 3px 8px;overflow-wrap:anywhere}.menu-buttons{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}.menu-buttons button{padding:7px 4px;font-size:12px}
    </style>
    <div id="shade"></div>
    <section id="sheet" role="dialog" aria-label="GoneWildStudio" aria-modal="true">
      <div class="top"><h2>🎧 GoneWildStudio <small style="font-size:11px;opacity:.5">${VERSION}</small></h2><button id="close" aria-label="Fechar">✕</button></div>
      <div class="status" id="status"></div>
      <h3>Subreddits habilitados</h3>
      <input type="text" id="subs" placeholder="GoneWildAudioGay, GoneWildAudio" spellcheck="false">
      <p class="fine">Separe nomes por vírgula. A remoção de anúncios vale para todo o Reddit; as demais funções, só para essas comunidades.</p>
      <h3>Feed</h3>
      <label class="toggle"><input id="removeAds" type="checkbox"> Remover posts patrocinados e anúncios</label>
      <label class="toggle"><input id="showTags" type="checkbox"> Categorias e hashtags nos cards estilo Audiochan</label>
      <label class="toggle"><input id="audio" type="checkbox"> Detectar links e incluir players</label>
      <label class="toggle"><input id="hideSeen" type="checkbox"> Ocultar posts marcados como vistos</label>
      <label class="toggle"><input id="networkFilter" type="checkbox"> Filtrar vistos também nas respostas da rede</label>
      <label class="toggle"><input id="onlyAudio" type="checkbox"> Mostrar apenas posts com links de áudio encontrados</label>
      <div class="buttons"><button id="save" class="primary">Salvar alterações</button><button id="clearTags">Limpar busca</button><button id="clearSeen">Limpar vistos</button></div>
      <div class="sep"></div>
      <div id="count" class="fine"></div>
      <p class="fine">Cada post do feed mostra categorias, título sem colchetes e hashtags abaixo do título. Toque numa tag para pesquisar imediatamente sem recarregar a página; pressione para incluir ou excluir. Players usam controles nativos.</p>
    </section>
    <div id="menu" role="menu"><div id="menu-title" class="menu-title"></div><div class="menu-buttons"><button data-menu="add">+ Incluir</button><button data-menu="exclude">− Excluir</button><button data-menu="reddit">Pesquisar</button></div><div class="buttons"><button data-menu="close" style="width:100%">Fechar</button></div></div>`;
    document.body.appendChild(state.shell);
    const fab = document.createElement('button');
    fab.id = 'gws-floating';
    fab.type = 'button';
    fab.textContent = '♫';
    fab.setAttribute('aria-label', 'Configurar GoneWildStudio');
    fab.addEventListener('click', openSheet);
    document.body.appendChild(fab);
    state.root.querySelector('#shade').addEventListener('click', closeSheet);
    state.root.querySelector('#close').addEventListener('click', closeSheet);
    state.root.querySelector('#save').addEventListener('click', () => {
      const names = state.root.querySelector('#subs').value.split(/[\n,;]+/).map((s) => s.trim().replace(/^r\//i, '')).filter((s) => /^[A-Za-z0-9_]{2,32}$/.test(s));
      state.settings.subreddits = [...new Set(names)];
      for (const key of ['removeAds', 'showTags', 'audio', 'hideSeen', 'networkFilter', 'onlyAudio']) state.settings[key] = state.root.querySelector(`#${key}`).checked;
      saveSettings(); closeSheet(); rescan();
    });
    state.root.querySelector('#clearSeen').addEventListener('click', () => {
      if (!confirm('Limpar todo o histórico local de posts vistos?')) return;
      state.seen = {}; saveSeen(); refreshAll(); updateCounters();
    });
    state.root.querySelector('#clearTags').addEventListener('click', clearSearch);
    state.root.querySelector('#menu').addEventListener('click', (event) => {
      const action = event.target.closest('[data-menu]')?.dataset.menu;
      if (!action) return;
      const tag = state.menu;
      hideTagMenu();
      if (action === 'add') toggleTag(tag, 'include');
      if (action === 'exclude') toggleTag(tag, 'exclude');
      if (action === 'reddit') {
        const key = normalize(tag);
        state.selected.include.add(key); state.selected.exclude.delete(key);
        searchReddit();
      }
    });
    updateShellRoute();
  }
  const rootEl = (sel) => state.root?.querySelector(sel);
  function updateCounters() {
    const status = rootEl('#status');
    if (status) status.textContent = `Vistos: ${Object.keys(state.seen).length} • Interceptação: ${state.netActive ? 'ativa' : 'indisponível (DOM ativo)'}`;
    const count = rootEl('#count');
    if (count) count.textContent = `${state.allCards.size} posts reconhecidos nesta sessão • ${Object.keys(state.cache).length} resultados de áudio em cache`;
  }
  function openSheet() {
    setupShell();
    const s = state.settings;
    rootEl('#subs').value = s.subreddits.join(', ');
    for (const key of ['removeAds', 'showTags', 'audio', 'hideSeen', 'networkFilter', 'onlyAudio']) rootEl(`#${key}`).checked = Boolean(s[key]);
    rootEl('#sheet').classList.add('open');
    rootEl('#shade').classList.add('open');
    updateCounters();
  }
  function closeSheet() { rootEl('#sheet')?.classList.remove('open'); rootEl('#shade')?.classList.remove('open'); }
  function updateShellRoute() {
    const fab = $('#gws-floating');
    if (fab) fab.classList.remove('gws-on');
    if (!enabledHere()) closeSheet();
  }
  function showTagMenu(tag) {
    state.menu = tag;
    const menu = rootEl('#menu');
    if (!menu) return;
    rootEl('#menu-title').textContent = `# ${tag}`;
    menu.classList.add('open');
  }
  function hideTagMenu() { rootEl('#menu')?.classList.remove('open'); }

  function parseTags(title) {
    const tags = []; const seen = new Set();
    for (const match of String(title || '').matchAll(new RegExp(TAG_RE.source, 'g'))) {
      const tag = match[1].trim().replace(/\s+/g, ' ');
      if (!tag || seen.has(normalize(tag))) continue;
      tags.push(tag); seen.add(normalize(tag));
      // Exibir todas as hashtags, sem limite por quantidade.
    }
    return tags;
  }
  const titleWithoutTags = (title) => String(title || '').replace(new RegExp(TAG_RE.source, 'g'), ' ').replace(/\s{2,}/g, ' ').trim();
  function safeURL(raw, base = location.origin) {
    try { const url = new URL(String(raw), base); return /^https?:$/.test(url.protocol) ? url : null; }
    catch { return null; }
  }
  function getMeta(post) {
    const host = post.matches('shreddit-post') ? post : $('shreddit-post', post) || post;
    // Native search results do NOT use shreddit-post. Support both 2025/2026
    // SDUI variants, as well as our own search results.
    const link = $('a[href*="/comments/"]', post);
    const path = host.getAttribute('data-gws-url') || host.getAttribute('permalink') || host.getAttribute('content-href') || link?.getAttribute('href') || '';
    const id = postID(host.getAttribute('data-fullname')) || postID(host.getAttribute('id')) || postID(host.getAttribute('post-id')) ||
      postID(host.getAttribute('thingid')) || postID(host.getAttribute('data-post-id')) || postID(path);
    if (!id) return null;
    const sub = (host.getAttribute('data-gws-sub') || host.getAttribute('subreddit-prefixed-name') || host.getAttribute('subreddit-name') ||
      subFromPath(path) || routeSub()).replace(/^r\//i, '');
    const titleEl = $('[data-testid="post-title-text"]', post) || $('a[data-testid="post-title"]', post) ||
      $('[data-testid="post-title"]', post) || $('[slot="title"]', post) || $('h3', post) ||
      $('a[id^="post-title"]', post) || $('a.title', post) || $('a[href*="/comments/"]', post);
    const title = host.getAttribute('data-gws-title') || host.getAttribute('post-title') || titleEl?.textContent?.trim() || '';
    if (!title) return null;
    const href = safeURL(path)?.href || safeURL(link?.href)?.href ||
      new URL(`/r/${encodeURIComponent(sub)}/comments/${id.slice(3)}/`, location.origin).href;
    const tags = parseTags(title);
    const nsfw = ['nsfw', 'is-nsfw', 'over-18', 'over18'].some((key) => host.hasAttribute(key)) ||
      /^(?:true|1)$/i.test(host.getAttribute('data-nsfw') || '') ||
      !!$('[slot="nsfw-badge"], [data-testid="nsfw-badge"]', post);
    if (nsfw && !tags.some((tag) => normalize(tag) === 'nsfw')) tags.push('NSFW');
    return { id, sub, href, title, titleEl, tags, host, card: post, ui: null,
      sourceTitle: null, resolved: false, audioItems: [], audioChecked: false,
      bodyText: '', bodyReady: false, author: '' };
  }
  function findPosts(node = document) {
    if (!node.querySelectorAll) return [];
    const list = node.matches?.(CARD_SELECTOR) ? [node, ...$$(CARD_SELECTOR, node)] : $$(CARD_SELECTOR, node);
    const unique = [];
    for (const post of list) {
      // Prefer real shreddit-post over a wrapper. Do not process its parent twice.
      if (!post.matches('shreddit-post') && (post.querySelector('shreddit-post') || post.closest('shreddit-post'))) continue;
      if (!post.matches('.gws-result') && post.querySelector('[data-testid="search-post-unit"], [data-testid="sdui-post-unit"]')) continue;
      if (post.closest('.gws-inline, #gws-shell')) continue;
      unique.push(post);
    }
    return unique;
  }
  function markSeen(meta, wanted) {
    if (wanted) state.seen[meta.id] = now();
    else delete state.seen[meta.id];
    saveSeen(); refreshAll(); updateCounters();
  }
  function makeButton(text, action, label) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'gws-action'; button.textContent = text;
    if (label) button.setAttribute('aria-label', label);
    button.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); action(e); });
    return button;
  }
  function makeTagButton(tag) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'gws-tag'; button.textContent = `# ${tag}`;
    button.dataset.tag = normalize(tag);
    let timer = null, longPressed = false;
    button.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') return;
      longPressed = false;
      timer = setTimeout(() => { longPressed = true; showTagMenu(tag); }, 500);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'touchmove']) button.addEventListener(ev, () => clearTimeout(timer), { passive:true });
    button.addEventListener('contextmenu', (event) => { event.preventDefault(); showTagMenu(tag); });
    button.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation();
      if (!longPressed) toggleTag(tag, 'include');
      longPressed = false;
    });
    return button;
  }
  function registerPost(post) {
    const previous = state.cards.get(post);
    if (previous?.ui?.container?.isConnected) return;
    // React sometimes replaces a title subtree but reuses the same post element.
    // Recover its enhanced card instead of leaving the original title hidden.
    if (previous) {
      previous.sourceTitle?.classList.remove('gws-native-title');
      state.allCards.delete(previous);
      state.cards.delete(post);
    }
    const meta = getMeta(post);
    if (!meta || !isTargetSub(meta.sub) || !enabledHere()) return;
    state.cards.set(post, meta); state.allCards.add(meta);
    createPostUI(meta);
    if (state.settings.audio) state.observer?.observe(post);
    filterPost(meta);
  }
  const isCategoryTag = (tag) => /^(?:(?:M|F|A|NB|T|TM|TF|MM|FF|MF|FM){1,3}4(?:M|F|A|NB|T|TM|TF|MM|FF|MF|FM){1,3}|SFW|NSFW|18\+)$/i.test(tag.replace(/\s/g, ''));

  function nativeTitleTarget(meta) {
    const title = meta.titleEl;
    if (!title) return null;
    // Never hide a generic permalink fallback; it might include unrelated metadata.
    const specific = title.matches('h3, [slot="title"], [data-testid="post-title-text"], [data-testid="post-title"], a[id^="post-title"], a.title');
    if (!specific) return null;
    // If the heading is nested in the permalink, hide the permalink as a
    // whole; otherwise an empty anchor can disrupt mobile flex layouts.
    const link = title.closest('a[href*="/comments/"]');
    return link && normalize(link.textContent) === normalize(title.textContent) ? link : title;
  }

  function applyTitleVisibility(meta) {
    const source = meta.sourceTitle;
    if (source?.isConnected) source.classList.toggle('gws-native-title', Boolean(meta.ui?.container?.isConnected));
  }

  function createPostUI(meta) {
    const ui = document.createElement('section');
    ui.className = 'gws-inline';
    ui.dataset.gwsPost = meta.id;
    ui.setAttribute('aria-label', 'GoneWildStudio: postagem com título e hashtags');

    // Category tags appear above the title, as in Audiochan.
    const categories = document.createElement('div');
    categories.className = 'gws-categories';
    const categoryTags = meta.tags.filter(isCategoryTag);
    for (const tag of categoryTags) {
      const chip = makeTagButton(tag);
      chip.classList.add('gws-category');
      if (/^(?:NSFW|SFW|18\+)$/i.test(tag)) chip.classList.add('gws-rating');
      categories.appendChild(chip);
    }
    categories.hidden = !categoryTags.length || !state.settings.showTags;

    // Original title is replaced in the visible feed, not merely stripped in place.
    const headline = document.createElement('h2');
    headline.className = 'gws-title';
    const titleLink = document.createElement('a');
    titleLink.href = meta.href;
    titleLink.textContent = titleWithoutTags(meta.title) || meta.title || 'Postagem';
    titleLink.setAttribute('aria-label', `Abrir postagem: ${titleLink.textContent}`);
    headline.appendChild(titleLink);

    // No arbitrary cap or collapsed tags: all are visible on every post.
    const tags = document.createElement('div');
    tags.className = 'gws-tags';
    const topicTags = meta.tags.filter((tag) => !isCategoryTag(tag));
    for (const tag of topicTags) tags.appendChild(makeTagButton(tag));
    tags.hidden = !state.settings.showTags || !topicTags.length;
    const expandButton = null;

    const row = document.createElement('div');
    row.className = 'gws-row gws-controls';
    const seenBtn = makeButton('✓ Marcar visto', () => markSeen(meta, !state.seen[meta.id]));
    const audioBtn = makeButton('♫ Buscar áudio', () => { meta.audioChecked = false; queueAudio(meta, true); });
    const externalLink = document.createElement('a');
    externalLink.textContent = '↗ Post'; externalLink.href = meta.href; externalLink.className = 'gws-action';
    externalLink.style.cssText = 'text-decoration:none;display:inline-flex;align-items:center;';
    row.append(seenBtn, audioBtn, externalLink);

    const audio = document.createElement('div');
    audio.className = 'gws-audio-area';
    ui.append(categories, headline, tags, audio, row);
    meta.ui = { container:ui, categories, headline, tags, expandButton, row, seenBtn, audioBtn, audio };

    const native = nativeTitleTarget(meta);
    meta.sourceTitle = native;
    // Position this UI exactly where the native title sits within each feed card.
    const anchor = native?.closest?.('a[href*="/comments/"]') || native || meta.titleEl;
    if (anchor?.parentElement && meta.host.contains(anchor)) anchor.insertAdjacentElement('beforebegin', ui);
    else meta.host.insertBefore(ui, meta.host.firstChild);
    applyTitleVisibility(meta);
    updateSeenButton(meta);
  }
  function updateSeenButton(meta) {
    if (!meta.ui) return;
    const seen = Boolean(state.seen[meta.id]);
    meta.ui.seenBtn.textContent = seen ? '↶ Desmarcar visto' : '✓ Marcar visto';
    meta.ui.seenBtn.dataset.seen = seen ? 'yes' : 'no';
  }

  function getSearchQuery() {
    // Reddit search indexes tokenized title text. Searching for quoted [tags]
    // is unreliable, because brackets are punctuation, not part of a token.
    // For compact tag chips use native title:"phrase" search syntax.
    const val = ($('#gws-input')?.value || '').trim();
    const escaped = (text) => text.replace(/["\\]/g, ' ').trim();
    const terms = [...state.selected.include].map((tag) => `title:"${escaped(tag)}"`);
    const rejected = [...state.selected.exclude].map((tag) => `NOT title:"${escaped(tag)}"`);
    const included = [val, ...terms].filter(Boolean);
    return [...included, ...rejected].join(' AND ').replace(/ AND NOT /g, ' NOT ');
  }

  function searchURL() {
    const sub = routeSub();
    const url = new URL(`/r/${encodeURIComponent(sub)}/search/`, location.origin);
    const query = getSearchQuery();
    if (query) url.searchParams.set('q', query);
    url.searchParams.set('restrict_sr', '1');
    url.searchParams.set('type', 'link');
    url.searchParams.set('sort', 'relevance');
    url.searchParams.set('gws', '1');
    const term = ($('#gws-input')?.value || '').trim();
    if (term) url.searchParams.set('gwsText', term);
    for (const tag of state.selected.include) url.searchParams.append('gwsTag', tag);
    for (const tag of state.selected.exclude) url.searchParams.append('gwsNot', tag);
    return url;
  }

  function isStudioRoute() {
    return enabledHere() && new URL(location.href).searchParams.get('gws') === '1' && /\/search\/?$/i.test(location.pathname);
  }

  function createSearchView() {
    const bar = $('#gws-searchbar');
    if (!bar) return null;
    let view = $('#gws-results-view');
    if (!view) {
      view = document.createElement('section');
      view.id = 'gws-results-view';
      view.setAttribute('aria-label', 'Resultados de busca GoneWildStudio');
      const heading = document.createElement('div');
      heading.className = 'gws-results-title'; heading.textContent = '♫ Resultados do Studio';
      const status = document.createElement('div'); status.className = 'gws-result-message'; status.id = 'gws-result-status';
      status.setAttribute('role', 'status');
      const results = document.createElement('div'); results.id = 'gws-results-list';
      const more = document.createElement('button'); more.id = 'gws-more'; more.type = 'button';
      more.textContent = 'Carregar mais'; more.hidden = true;
      more.addEventListener('click', () => loadSearchResults(true));
      view.append(heading, status, results, more);
    }
    bar.insertAdjacentElement('afterend', view);
    state.search.view = view;
    return view;
  }

  function resetSearchView({ restoreURL = true } = {}) {
    state.search.controller?.abort(); state.search.controller = null;
    state.search.serial++;
    state.search.active = false; state.search.after = null;
    state.search.query = ''; state.search.loading = false;
    document.body?.classList.remove('gws-studio-search-active');
    const view = $('#gws-results-view');
    view?.remove(); state.search.view = null;
    // Undo native post hiding without damaging Reddit's own display rules.
    for (const post of document.querySelectorAll('[data-gws-native-hidden]')) {
      post.removeAttribute('data-gws-native-hidden');
      post.classList.remove('gws-hidden');
    }
    if (restoreURL && state.search.returnURL && location.href !== state.search.returnURL) {
      history.pushState({ gws: false }, '', state.search.returnURL);
      state.route = location.href;
    }
    state.search.returnURL = null;
    rescan();
  }

  function hideNativeFeed() {
    // Only hide post nodes. Do not hide entire main/search root containers.
    for (const p of findPosts(document)) {
      if (p.matches('.gws-result') || p.closest('#gws-results-view')) continue;
      p.setAttribute('data-gws-native-hidden', '');
      (p.closest('article') || p).classList.add('gws-hidden');
    }
  }

  function renderResult(item) {
    if (!item || !item.id || !item.title || !isTargetSub(item.subreddit)) return null;
    const url = safeURL(item.permalink) || safeURL(`/r/${item.subreddit}/comments/${item.id}/`);
    if (!url) return null;
    const article = document.createElement('article');
    article.className = 'gws-result';
    article.setAttribute('post-id', `t3_${item.id}`);
    article.dataset.gwsSub = item.subreddit;
    article.dataset.gwsTitle = item.title;
    article.dataset.gwsUrl = url.href;
    if (item.over_18) article.setAttribute('nsfw', '');
    const header = document.createElement('div'); header.className = 'gws-result-meta';
    const sub = document.createElement('span'); sub.textContent = `r/${item.subreddit}`;
    const user = document.createElement('span'); user.textContent = item.author ? `u/${item.author}` : '';
    header.append(sub, user);
    const h = document.createElement('h3');
    const a = document.createElement('a'); a.href = url.href; a.textContent = item.title;
    h.append(a);
    const stats = document.createElement('div'); stats.className = 'gws-result-stats';
    stats.textContent = `${Number(item.score || 0).toLocaleString()} votos · ${Number(item.num_comments || 0)} comentários`;
    article.append(header, h, stats);
    return article;
  }

  function parseHTMLResults(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const found = [];
    for (const unit of doc.querySelectorAll('[data-testid="search-post-unit"], [data-testid="sdui-post-unit"], shreddit-post')) {
      const a = unit.querySelector('a[href*="/comments/"]');
      const id = postID(unit.getAttribute('post-id') || unit.getAttribute('id') || a?.getAttribute('href'));
      const title = unit.getAttribute('post-title') || unit.querySelector('[data-testid="post-title-text"], [data-testid="post-title"], h3')?.textContent?.trim();
      if (!id || !title || !a) continue;
      const sub = subFromPath(a.getAttribute('href')) || routeSub();
      const nsfw = ['nsfw', 'is-nsfw', 'over-18'].some((key) => unit.hasAttribute(key)) ||
        Boolean(unit.querySelector('[data-testid="nsfw-badge"], [slot="nsfw-badge"]'));
      found.push({ id: id.slice(3), subreddit: sub, title, permalink: a.getAttribute('href'), over_18: nsfw });
    }
    return found;
  }

  async function requestSearch(query, after, signal) {
    const sub = routeSub();
    const api = new URL(`/r/${encodeURIComponent(sub)}/search.json`, location.origin);
    api.searchParams.set('q', query);
    api.searchParams.set('restrict_sr', '1');
    api.searchParams.set('sort', 'relevance');
    api.searchParams.set('limit', '50');
    api.searchParams.set('type', 'link');
    api.searchParams.set('raw_json', '1');
    if (after) api.searchParams.set('after', after);
    const result = await fetch(api.href, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal });
    if (result.ok && /json/i.test(result.headers.get('content-type') || '')) {
      try {
        const data = await result.json();
        const listing = data?.data || data?.[0]?.data;
        if (Array.isArray(listing?.children)) {
          return { items: listing.children.map((p) => p.data).filter(Boolean), after: listing.after || null, fallback: false };
        }
      } catch { /* Some web builds return HTML/anti-bot data with status 200. */ }
    }
    // Restricted Reddit builds may return 403/HTML instead of JSON; try an
    // HTML snapshot in the SAME page without assigning location.
    if (after) throw new Error('Paginação JSON não autorizada pelo Reddit.');
    const page = searchURL(); page.searchParams.delete('gws'); page.searchParams.delete('gwsText');
    page.searchParams.delete('gwsTag'); page.searchParams.delete('gwsNot');
    const html = await fetch(page.href, { credentials:'same-origin', headers:{ Accept:'text/html' }, signal });
    if (!html.ok) throw new Error(`Busca indisponível (HTTP ${html.status}).`);
    return { items: parseHTMLResults(await html.text()), after: null, fallback: true };
  }

  async function loadSearchResults(more = false) {
    if (!enabledHere()) return;
    if (state.search.loading && more) return;
    if (!state.search.active) return;
    const view = createSearchView();
    if (!view) return;
    const list = $('#gws-results-list');
    const status = $('#gws-result-status');
    const moreBtn = $('#gws-more');
    if (!list || !status || !moreBtn) return;
    const query = state.search.query;
    const after = more ? state.search.after : null;
    if (!more) list.replaceChildren();
    const current = ++state.search.serial;
    state.search.controller?.abort();
    const controller = new AbortController();
    state.search.controller = controller;
    state.search.loading = true;
    status.textContent = more ? 'Carregando mais...' : 'Buscando posts...';
    moreBtn.hidden = true;
    try {
      if (!query) { status.textContent = 'Toque em uma hashtag ou digite um termo para buscar.'; return; }
      const response = await requestSearch(query, after, controller.signal);
      if (state.search.serial !== current || !state.search.active) return;
      const fragment = document.createDocumentFragment();
      const existing = new Set($$('.gws-result', list).map((el) => el.getAttribute('post-id')));
      const newCards = [];
      for (const item of response.items) {
        if (!item || existing.has(`t3_${item.id}`) || state.settings.hideSeen && state.seen[`t3_${item.id}`]) continue;
        const card = renderResult(item);
        if (!card) continue;
        existing.add(`t3_${item.id}`); fragment.append(card); newCards.push(card);
      }
      list.append(fragment);
      newCards.forEach(registerPost);
      state.search.after = response.after;
      moreBtn.hidden = !response.after;
      const total = $$('.gws-result', list).length;
      status.textContent = total ? `${total} posts encontrados${response.fallback ? ' · resultados HTML' : ''}` :
        'Nenhum resultado retornado pelo Reddit para essa combinação.';
      syncSearch();
    } catch (err) {
      if (controller.signal.aborted) return;
      status.textContent = `${err.message || 'Falha na pesquisa.'} A página não foi recarregada.`;
      console.debug('[GoneWildStudio] Search request failed', err);
    } finally {
      if (current === state.search.serial) state.search.loading = false;
    }
  }

  function searchReddit() {
    if (!enabledHere()) return;
    if (!state.search.active) state.search.returnURL = location.href;
    state.search.active = true;
    state.search.query = getSearchQuery().trim();
    const url = searchURL();
    history.pushState({ gws: true }, '', url.href);
    state.route = location.href;
    document.body?.classList.add('gws-studio-search-active');
    createSearchView();
    hideNativeFeed();
    loadSearchResults(false);
    syncSearch();
  }

  function toggleTag(tag, kind = 'include') {
    const key = normalize(tag);
    if (!key) return;
    const primary = state.selected[kind], other = state.selected[kind === 'include' ? 'exclude' : 'include'];
    if (primary.has(key)) primary.delete(key);
    else { primary.add(key); other.delete(key); }
    syncSearch();
    // Immediate SPA search. No location.assign, no page reload.
    searchReddit();
  }

  function clearSearch() {
    state.selected.include.clear(); state.selected.exclude.clear();
    const input = $('#gws-input'); if (input) input.value = '';
    resetSearchView();
    syncSearch(); refreshAll();
  }

  function syncSearch() {
    const holder = $('#gws-chips');
    if (holder) {
      holder.replaceChildren();
      for (const kind of ['include', 'exclude']) for (const value of state.selected[kind]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = `${kind === 'exclude' ? '−' : '+'} #${value} ×`;
        b.addEventListener('click', () => toggleTag(value, kind));
        holder.appendChild(b);
      }
    }
    for (const meta of state.allCards) if (meta.ui) {
      for (const b of meta.ui.container.querySelectorAll('.gws-tag[data-tag]')) {
        const key = b.dataset.tag;
        b.dataset.active = state.selected.include.has(key) ? 'include' : state.selected.exclude.has(key) ? 'exclude' : '';
      }
    }
  }

  function searchBar() {
    let bar = $('#gws-searchbar');
    if (!enabledHere()) { bar?.remove(); return; }
    if (bar?.isConnected) return;
    bar = document.createElement('section'); bar.id = 'gws-searchbar'; bar.className = 'gws-searchbar';
    bar.setAttribute('aria-label', 'Busca de hashtags GoneWildStudio');
    bar.innerHTML = `<strong style="color:#f1a3c4;white-space:nowrap">♫ Studio</strong><input id="gws-input" class="gws-search-input" type="search" aria-label="Termo de busca" placeholder="Buscar títulos e hashtags" autocomplete="off"><button id="gws-search" type="button">Buscar</button><button id="gws-reset" type="button">Limpar</button><button id="gws-settings" type="button" aria-label="Configurações do Studio">⚙</button><div id="gws-chips" class="gws-searchchips"></div>`;
    const main = $('main') || $('[role="main"]') || $('shreddit-app') || document.body;
    // Never insert into a post's own parent: search cards often have nested
    // wrappers and doing so places the toolbar INSIDE the first post.
    main.insertBefore(bar, main.firstChild);
    $('#gws-search').addEventListener('click', searchReddit);
    $('#gws-reset').addEventListener('click', clearSearch);
    $('#gws-settings').addEventListener('click', openSheet);
    $('#gws-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); searchReddit(); }
    });
    const autoSearch = debounce(() => {
      if ($('#gws-input')?.value?.trim() || state.selected.include.size || state.selected.exclude.size) searchReddit();
      else if (state.search.active) clearSearch();
    }, 650);
    $('#gws-input').addEventListener('input', autoSearch);
    if (isStudioRoute()) {
      const url = new URL(location.href);
      const text = url.searchParams.get('gwsText');
      if (text) $('#gws-input').value = text;
      state.selected.include = new Set(url.searchParams.getAll('gwsTag').map(normalize));
      state.selected.exclude = new Set(url.searchParams.getAll('gwsNot').map(normalize));
      if (!state.selected.include.size && !state.selected.exclude.size && !text) {
        $('#gws-input').value = url.searchParams.get('q') || '';
      }
      state.search.active = true;
      state.search.query = getSearchQuery();
      state.search.returnURL = new URL(`/r/${encodeURIComponent(routeSub())}/`, location.origin).href;
      document.body.classList.add('gws-studio-search-active');
      createSearchView();
      hideNativeFeed();
      loadSearchResults();
    }
    syncSearch();
    updateShellRoute();
  }

  function filterPost(meta) {
    if (!meta.card.isConnected) return;
    const tokens = new Set(meta.tags.map(normalize));
    const include = [...state.selected.include].every((tag) => tokens.has(tag));
    const exclude = [...state.selected.exclude].every((tag) => !tokens.has(tag));
    const localTerm = normalize($('#gws-input')?.value || '');
    const textMatch = !localTerm || normalize(`${meta.title} ${meta.tags.join(' ')}`).includes(localTerm);
    const audios = !state.settings.onlyAudio || !meta.audioChecked || meta.audioItems.length > 0;
    const visible = (!state.settings.hideSeen || !state.seen[meta.id]) &&
      (state.search.active && !meta.card.matches('.gws-result') ? false :
       (state.search.active ? true : include && exclude && textMatch)) && audios;
    const wrapper = meta.card.closest('article') || meta.card;
    wrapper.classList.toggle('gws-hidden', !visible);
    if (state.search.active && !meta.card.matches('.gws-result')) meta.card.setAttribute('data-gws-native-hidden', '');
    updateSeenButton(meta);
  }
  function refreshAll() {
    for (const meta of state.allCards) {
      if (!meta.card.isConnected) { state.allCards.delete(meta); continue; }
      if (!enabledHere() || !isTargetSub(meta.sub)) {
        meta.sourceTitle?.classList.remove('gws-native-title');
        meta.ui?.container.remove();
        (meta.card.closest('article') || meta.card).classList.remove('gws-hidden');
        state.cards.delete(meta.card);
        state.allCards.delete(meta);
        continue;
      }
      filterPost(meta);
      if (meta.ui) {
        meta.ui.categories.hidden = !state.settings.showTags || !meta.ui.categories.childElementCount;
        meta.ui.tags.hidden = !state.settings.showTags || !meta.ui.tags.querySelector('[data-tag]');
        meta.ui.audioBtn.hidden = !state.settings.audio;
        applyTitleVisibility(meta);
      }
    }
    syncSearch(); searchBar(); updateShellRoute();
    document.body?.classList.toggle('gws-remove-ads', state.settings.removeAds);
  }

  function removeAds(node = document) {
    if (!state.settings.removeAds || !node.querySelectorAll) return;
    for (const ad of $$(AD_SELECTOR, node)) {
      const card = ad.closest('article') || ad;
      card.remove();
    }
    if (node.matches?.(AD_SELECTOR)) (node.closest('article') || node).remove();
    // Attribute-based ad labels. Avoid any global text-only deletion that might hide real posts.
    for (const post of $$('shreddit-post[promoted], shreddit-post[is-promoted], shreddit-post[ad-type]', node)) {
      (post.closest('article') || post).remove();
    }
  }

  function scan(node = document) {
    if (!document.body) return;
    if (state.settings.removeAds) removeAds(node);
    if (!enabledHere()) return;
    if (state.allCards.size > 300) for (const meta of state.allCards) if (!meta.card.isConnected) state.allCards.delete(meta);
    if (!$('#gws-searchbar')) searchBar();
    for (const p of findPosts(node)) {
      if (state.search.active && !p.matches('.gws-result')) {
        p.setAttribute('data-gws-native-hidden', '');
        (p.closest('article') || p).classList.add('gws-hidden');
        continue;
      }
      registerPost(p);
    }
  }
  const rescan = debounce(() => scan(document), 75);

  function extractLinks(text) {
    const input = String(text || '').replace(/\\\//g, '/').replace(/&amp;/gi, '&').replace(/&#x2f;/gi, '/');
    const urls = [];
    for (const m of input.matchAll(/https?:\/\/[^\s<>"'\])}]+/gi)) {
      const url = safeURL(m[0].replace(/[.,;:!?]+$/, ''));
      if (url && (HOSTS.test(url.hostname) || FILE_HOSTS.test(url.hostname) && AUDIO_EXT.test(url.pathname))) urls.push(url.href);
    }
    return [...new Set(urls)].slice(0, 5);
  }
  function readCardAudioLinks(meta) {
    const result = [];
    for (const a of $$('a[href]', meta.card)) {
      const href = safeURL(a.href);
      if (href && (HOSTS.test(href.hostname) || FILE_HOSTS.test(href.hostname) && AUDIO_EXT.test(href.pathname))) result.push(href.href);
    }
    const source = meta.card.getAttribute('content-href') || '';
    return [...new Set([...result, ...extractLinks(meta.card.textContent), ...extractLinks(source)])].slice(0, 5);
  }
  async function redditPostBody(meta) {
    const url = new URL(`/r/${encodeURIComponent(meta.sub)}/comments/${meta.id.slice(3)}.json`, location.origin);
    if (url.origin !== location.origin) return '';
    url.searchParams.set('raw_json', '1'); url.searchParams.set('limit', '0');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const resp = await fetch(url.href, { credentials:'same-origin', headers:{ Accept:'application/json' }, signal:controller.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const item = json?.[0]?.data?.children?.[0]?.data;
      if (!item) return '';
      meta.bodyText = String(item.selftext || '');
      meta.bodyReady = true;
      meta.author = String(item.author || '');
      return [item.selftext, item.url_overridden_by_dest, item.url, item.media?.reddit_video?.fallback_url].filter(Boolean).join('\n');
    } finally { clearTimeout(timer); }
  }
  function externalRequest(url) {
    const gm = (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') ? GM.xmlHttpRequest.bind(GM) : (typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null);
    if (!gm) return fetch(url, { credentials:'omit', mode:'cors' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); });
    return new Promise((resolve, reject) => {
      try {
        gm({
          method:'GET', url, timeout:12000, responseType:'text',
          onload: (res) => res.status >= 200 && res.status < 300 ? resolve(String(res.responseText ?? res.response ?? '')) : reject(new Error(`HTTP ${res.status}`)),
          onerror: () => reject(new Error('Falha de rede')),
          ontimeout: () => reject(new Error('Tempo excedido')),
        });
      } catch (e) { reject(e); }
    });
  }
  function resolveMediaFromHTML(html, pageURL) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const candidates = [];
    for (const el of doc.querySelectorAll('audio[src], audio source[src], meta[property="og:audio"], meta[name="twitter:player:stream"], a[href]')) {
      candidates.push(el.getAttribute('src') || el.getAttribute('content') || el.getAttribute('href') || '');
    }
    // Soundgasm's jPlayer exposes its stream in JavaScript (often media.soundgasm.net/sounds/*.m4a).
    const decoded = html.replace(/\\\//g, '/').replace(/\\u002f/gi, '/').replace(/&amp;/gi, '&');
    for (const m of decoded.matchAll(/https?:\/\/[^\s'"<>\\]+\.(?:m4a|mp3|aac|ogg|opus|wav)(?:\?[^\s'"<>\\]*)?/gi)) candidates.push(m[0]);
    for (const value of candidates) {
      const url = safeURL(value, pageURL);
      if (url && AUDIO_EXT.test(url.href) && FILE_HOSTS.test(url.hostname)) return url.href;
    }
    return null;
  }
  async function resolveSource(url) {
    const target = safeURL(url);
    if (!target || !HOSTS.test(target.hostname)) return null;
    if (AUDIO_EXT.test(target.href)) return target.href;
    const html = await externalRequest(target.href);
    return resolveMediaFromHTML(html, target.href);
  }
  async function gatherAudio(meta, force = false) {
    if (!meta.card.isConnected || !state.settings.audio || !enabledHere()) return;
    const stored = state.cache[meta.id];
    if (!force && stored && now() - stored.at < 7 * 86400000) {
      meta.audioItems = (stored.items || []).map((item) => ({ ...item }));
      meta.audioChecked = true;
      try { await redditPostBody(meta); }
      catch (e) { console.debug('[GoneWildStudio] Source context unavailable', e); }
      await enrichAudioLinks(meta);
      showAudio(meta); filterPost(meta); return;
    }
    const links = readCardAudioLinks(meta);
    try { links.push(...extractLinks(await redditPostBody(meta))); }
    catch (e) { console.debug('[GoneWildStudio] Could not load post body', meta.id, e.message); }
    const unique = [...new Set(links)].slice(0, 5);
    const items = [];
    for (const link of unique) {
      const url = safeURL(link);
      if (!url) continue;
      let playable = AUDIO_EXT.test(url.href) ? url.href : null;
      if (!playable) { try { playable = await resolveSource(url.href); } catch (e) { console.debug('[GoneWildStudio] External player unavailable', url.hostname, e.message); } }
      items.push({ external: url.href, playable });
    }
    meta.audioItems = items; meta.audioChecked = true;
    await enrichAudioLinks(meta);
    state.cache[meta.id] = { at:now(), items:items.map(({external, playable}) => ({ external, playable })) }; saveCache();
    showAudio(meta); filterPost(meta); updateCounters();
  }
  async function enrichAudioLinks(meta) {
    const context = { subreddit:meta.sub, permalink:meta.href, title:meta.title,
      description:meta.bodyText || '', author:meta.author || '' };
    for (const item of meta.audioItems) {
      item.studioHref = await bridge.decorate(item.external, context);
    }
    // Keep source links in the card contextualized, including Audiochan.
    for (const anchor of $$('a[href]', meta.card)) {
      const current = safeURL(anchor.href);
      if (!current || !/^(?:www\.)?(?:soundgasm\.net|audiochan\.(?:com|net))$/i.test(current.hostname) ||
          current.hash.startsWith('#gws=') || current.searchParams.has('gws_post')) continue;
      const match = meta.audioItems.find((item) => {
        try { const source = new URL(item.external); return source.origin + source.pathname === current.origin + current.pathname; }
        catch { return false; }
      });
      if (match?.studioHref) anchor.href = match.studioHref;
    }
  }

  function showAudio(meta) {
    const target = meta.ui?.audio;
    if (!target || !meta.card.isConnected) return;
    target.replaceChildren();
    if (!meta.audioItems.length) return;
    for (const [index, item] of meta.audioItems.entries()) {
      const audioUI = document.createElement('div'); audioUI.className = 'gws-audio';
      const header = document.createElement('div'); header.className = 'gws-audio-head';
      const name = document.createElement('span');
      name.textContent = `♫ ${new URL(item.external).hostname} ${meta.audioItems.length > 1 ? `(${index + 1})` : ''}`;
      const external = document.createElement('a');
      external.href = item.studioHref || item.external;
      const audiochanSource = /^(?:www\.)?audiochan\.(?:com|net)$/i.test(new URL(item.external).hostname);
      external.textContent = audiochanSource ? 'Abrir no Audiochan ↗'
        : item.studioHref && item.studioHref !== item.external ? 'Abrir no Studio ↗' : 'Abrir áudio ↗';
      external.target = '_blank'; external.rel = 'noopener noreferrer';
      header.append(name, external); audioUI.append(header);
      if (item.playable) {
        const player = document.createElement('audio');
        player.controls = true; player.preload = 'none'; player.playsInline = true;
        player.src = item.playable;
        player.addEventListener('play', () => {
          if (state.lastAudio && state.lastAudio !== player) state.lastAudio.pause();
          state.lastAudio = player;
        });
        player.addEventListener('error', () => {
          player.remove();
          if (!audioUI.querySelector('.gws-muted')) {
            const hint = document.createElement('div'); hint.className = 'gws-muted';
            hint.textContent = 'A mídia não abriu neste navegador. Use “Abrir áudio” para acessar a fonte original.';
            audioUI.appendChild(hint);
          }
        });
        audioUI.append(player);
      } else {
        const hint = document.createElement('div'); hint.className = 'gws-muted';
        hint.textContent = 'Sem URL de mídia direta disponível. Abra no site original.';
        audioUI.append(hint);
      }
      target.append(audioUI);
    }
  }
  function queueAudio(meta, force = false) {
    if (meta.audioChecked && !force || state.waiting.has(meta.id) || !state.settings.audio) return;
    state.waiting.add(meta.id);
    state.queue.push({ meta, force });
    pumpQueue();
  }
  function pumpQueue() {
    while (state.inflight < 2 && state.queue.length) {
      const job = state.queue.shift();
      if (!job.meta.card.isConnected) { state.waiting.delete(job.meta.id); continue; }
      state.inflight++;
      gatherAudio(job.meta, job.force).catch((e) => console.debug('[GoneWildStudio] Audio scan error', e)).finally(() => {
        state.inflight--; state.waiting.delete(job.meta.id); pumpQueue();
      });
    }
  }

  function onRouteChange() {
    if (state.route === location.href) return;
    state.route = location.href;
    const stillStudio = isStudioRoute();
    if (state.search.active && !stillStudio) {
      // Back button or Reddit's SPA navigation returns to the regular feed.
      resetSearchView({ restoreURL: false });
      state.selected.include.clear(); state.selected.exclude.clear();
    }
    // Do not clear chips on our own history.pushState navigation.
    const bar = $('#gws-searchbar');
    if (bar?.isConnected && !enabledHere()) bar.remove();
    updateShellRoute();
    rescan();
  }
  function initialize() {
    if (!document.body) return;
    if (!$('#gws-styles')) stylesheet();
    document.body.classList.toggle('gws-remove-ads', state.settings.removeAds);
    setupShell();
    state.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const meta = state.cards.get(entry.target);
        if (meta && state.settings.audio && (!state.search.active || meta.card.matches('.gws-result'))) queueAudio(meta);
        state.observer.unobserve(entry.target);
      }
    }, { rootMargin:'350px 0px', threshold:0 });
    scan(document);
    const mutation = new MutationObserver((records) => {
      let changed = false;
      for (const record of records) {
        if (record.type === 'attributes') {
          if (state.settings.removeAds && record.target.matches?.(AD_SELECTOR)) removeAds(record.target);
          continue;
        }
        for (const n of record.addedNodes) {
          if (n.nodeType !== Node.ELEMENT_NODE) continue;
          if (n.id === 'gws-shell' || n.id === 'gws-floating' || n.id === 'gws-styles' || n.closest?.('.gws-inline, #gws-shell, #gws-searchbar, #gws-results-view')) continue;
          // Ignore our own nodes so MutationObserver cannot spin endlessly.
          if (n.matches?.('.gws-inline, .gws-audio, .gws-searchbar')) continue;
          if (n.matches?.(CARD_SELECTOR) || n.closest?.(CARD_SELECTOR) ||
              n.matches?.('shreddit-ad-post, shreddit-ad, reddit-ad, ad-unit') ||
              n.querySelector?.(CARD_SELECTOR)) changed = true;
        }
      }
      if (changed) rescan();
      onRouteChange();
    });
    mutation.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['promoted', 'is-promoted', 'ad-type'] });
    window.addEventListener('popstate', onRouteChange);
    window.addEventListener('pageshow', rescan);
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.gws-tag') && !event.composedPath().includes(rootEl('#menu'))) hideTagMenu();
      queueMicrotask(onRouteChange);
    }, { passive:true });
    // React SPA route transitions may not dispatch popstate. This is only a low-rate fallback.
    setInterval(onRouteChange, 1300);
    updateCounters();
    console.info(`[GoneWildStudio] v${VERSION} initialized`, { subreddit:routeSub(), network:state.netActive });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once:true });
  else initialize();
  // Cross-origin context transport. The fragment is not sent as part of an HTTP
  // request, but any JS running on the destination page can read it.
  // gzip uses Safari's native CompressionStream; b. is the no-compression fallback.
  function createBridge() {
    const SOUNDGASM = /^(?:www\.)?soundgasm\.net$/i;
    const AUDIOCHAN = /^(?:www\.)?audiochan\.(?:com|net)$/i;
    const REDDIT = /^(?:[a-z0-9-]+\.)?reddit\.com$/i;
    const encodeBase64 = (buffer) => {
      const bytes = new Uint8Array(buffer);
      let encoded = '';
      for (let index = 0; index < bytes.length; index += 8192) {
        encoded += String.fromCharCode(...bytes.subarray(index, index + 8192));
      }
      return btoa(encoded).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    };
    const decodeBase64 = (value) => {
      const text = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
      return Uint8Array.from(text, (char) => char.charCodeAt(0));
    };
    const validSub = (name) => /^[a-z0-9_]{2,32}$/i.test(String(name || ''));
    const safeReddit = (raw) => {
      try {
        const url = new URL(String(raw || ''), 'https://www.reddit.com');
        return /^https?:$/.test(url.protocol) && REDDIT.test(url.hostname) && /\/comments\//.test(url.pathname) ? url.href : '';
      } catch { return ''; }
    };
    function sanitize(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
      const subreddit = String(input.subreddit || input.sub || '').replace(/^r\//i, '');
      const permalink = safeReddit(input.permalink || input.post);
      if (!validSub(subreddit) && !permalink) return null;
      return {
        v: 2,
        subreddit: validSub(subreddit) ? subreddit : (permalink.match(/\/r\/([^/]+)/)?.[1] || ''),
        permalink,
        title: String(input.title || ''),
        description: String(input.description || ''),
        author: String(input.author || ''),
      };
    }
    async function pack(input) {
      const data = sanitize(input);
      if (!data) return '';
      const bytes = new TextEncoder().encode(JSON.stringify(data));
      if (typeof CompressionStream === 'function') {
        try {
          const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
          return `z.${encodeBase64(await new Response(stream).arrayBuffer())}`;
        } catch (error) { console.debug('[GoneWildStudio] compression fallback', error); }
      }
      return `b.${encodeBase64(bytes)}`;
    }
    async function unpack(value) {
      if (!value || value.length > 500000) return null;
      try {
        const [mode, data] = [value.slice(0, 2), value.slice(2)];
        if (!data || !/^[A-Za-z0-9_-]+$/.test(data)) return null;
        const bytes = decodeBase64(data);
        let contents;
        if (mode === 'z.' && typeof DecompressionStream === 'function') {
          const output = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
          contents = await new Response(output).text();
        } else if (mode === 'b.') contents = new TextDecoder().decode(bytes);
        else return null;
        if (!contents || contents.length > 250000) return null;
        return sanitize(JSON.parse(contents));
      } catch (error) {
        console.debug('[GoneWildStudio] Invalid audio context', error);
        return null;
      }
    }
    async function decorate(raw, input) {
      try {
        const url = new URL(raw);
        const context = sanitize(input);
        if (!context) return raw;
        if (AUDIOCHAN.test(url.hostname)) {
          // No UI replacement on Audiochan: only transport the original Reddit URL.
          // Use a query parameter so the website's own hash routing remains intact.
          if (context.permalink) url.searchParams.set('gws_post', context.permalink);
          return url.href;
        }
        if (!SOUNDGASM.test(url.hostname) || !/^\/u\/[^/]+\/[^/]+/.test(url.pathname)) return raw;
        url.searchParams.set('subreddit', context.subreddit);
        if (context.permalink) url.searchParams.set('permalink', context.permalink);
        const fragment = await pack(context);
        if (fragment) url.hash = `gws=${fragment}`;
        return url.href;
      } catch { return raw; }
    }
    function searchURL(rawSub, tag) {
      const subreddit = String(rawSub || '').replace(/^r\//i, '');
      const cleanedTag = String(tag || '').replace(/["\\]/g, ' ').trim();
      if (!cleanedTag) return '';
      const scoped = validSub(subreddit);
      // Only scope to the originating subreddit when it is known. Direct
      // Soundgasm visits use Reddit's global search, never a guessed sub.
      const url = new URL(scoped
        ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search/`
        : 'https://www.reddit.com/search/');
      url.searchParams.set('q', `title:"${cleanedTag}"`);
      if (scoped) url.searchParams.set('restrict_sr', '1');
      url.searchParams.set('sort', 'relevance');
      url.searchParams.set('type', 'link');
      // Let the Reddit userscript rehydrate the clicked tag on arrival.
      if (scoped) {
        url.searchParams.set('gws', '1');
        url.searchParams.append('gwsTag', cleanedTag);
      }
      return url.href;
    }
    async function readLocation() {
      const params = new URL(location.href).searchParams;
      const token = location.hash.match(/(?:^#|&)gws=([^&]+)/)?.[1];
      const fromHash = token ? await unpack(decodeURIComponent(token)) : null;
      const subreddit = String(params.get('subreddit') || '').replace(/^r\//i, '');
      const permalink = safeReddit(params.get('permalink'));
      if (fromHash) return { ...fromHash, subreddit: fromHash.subreddit || (validSub(subreddit) ? subreddit : ''), permalink: fromHash.permalink || permalink };
      return sanitize({ subreddit, permalink, title:'', description:'' });
    }
    return { decorate, unpack, pack, readLocation, searchURL, safeReddit, validSub };
  }

  // Minimal, self-contained Markdown renderer. Never inject post HTML into the DOM.
  // Handles Reddit Markdown, including [link] followed by (URL) on the next line.
  function renderRedditMarkdown(markdown, target) {
    // Reddit occasionally puts a line break between a Markdown link label and
    // destination. Normalize that before processing block-level Markdown.
    const raw = String(markdown || '').replace(/\r\n?/g, '\n').replace(/\]\s*\n\s*\(/g, '](');
    const doc = target.ownerDocument || document;
    const fragment = doc.createDocumentFragment();
    const allowedURL = (value) => {
      try {
        const url = new URL(value, 'https://www.reddit.com');
        return /^https?:$/.test(url.protocol) ? url.href : '';
      } catch { return ''; }
    };
    const appendInline = (parent, text, depth = 0) => {
      if (depth > 5 || !text) { parent.append(doc.createTextNode(text || '')); return; }
      // Each token gets its own DOM node so HTML in the Markdown is text, not code.
      const tokens = /(`[^`\n]+`)|\[([^\]\n]{1,300})\]\s*\((https?:\/\/[^\s)]+(?:\([^\n)]*\)[^\s)]*)*)\)|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s<>'"\[\]]+)|(\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/gi;
      let cursor = 0;
      for (const match of text.matchAll(tokens)) {
        const start = match.index;
        if (start > cursor) parent.append(doc.createTextNode(text.slice(cursor, start)));
        const source = match[0];
        if (match[1]) {
          const code = doc.createElement('code'); code.textContent = source.slice(1, -1); parent.append(code);
        } else if (match[2] || match[4] || match[5]) {
          const isBare = !!match[5];
          let urlValue = match[3] || match[4] || match[5];
          let suffix = '';
          if (isBare) {
            const m = urlValue.match(/[.,;!?]+$/);
            if (m) { suffix = m[0]; urlValue = urlValue.slice(0, -suffix.length); }
            // Avoid treating trailing closing punctuation as part of a pasted URL.
            while (urlValue.endsWith(')') && (urlValue.match(/\(/g) || []).length < (urlValue.match(/\)/g) || []).length) {
              suffix = ')' + suffix; urlValue = urlValue.slice(0, -1);
            }
          }
          const href = allowedURL(urlValue);
          if (href) {
            const link = doc.createElement('a'); link.href = href;
            link.target = '_blank'; link.rel = 'noopener noreferrer';
            link.textContent = match[2] || (match[4] || urlValue);
            parent.append(link);
          } else parent.append(doc.createTextNode(source));
          if (suffix) parent.append(doc.createTextNode(suffix));
        } else if (match[6]) {
          const bold = source.startsWith('**') || source.startsWith('__');
          const strike = source.startsWith('~~');
          const node = doc.createElement(strike ? 'del' : bold ? 'strong' : 'em');
          appendInline(node, source.slice(bold || strike ? 2 : 1, bold || strike ? -2 : -1), depth + 1);
          parent.append(node);
        }
        cursor = start + source.length;
      }
      if (cursor < text.length) parent.append(doc.createTextNode(text.slice(cursor)));
    };
    const lines = raw.split('\n');
    const blank = (i) => i >= lines.length || !lines[i].trim();
    const listMatch = (line) => /^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/.exec(line);
    const breakLine = (parent, content) => {
      const items = content.split('\n');
      items.forEach((line, i) => { if (i) parent.append(doc.createElement('br')); appendInline(parent, line); });
    };
    for (let i = 0; i < lines.length;) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const codeStart = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (codeStart) {
        const fence = codeStart[1][0]; const count = codeStart[1].length;
        const captured = []; i++;
        while (i < lines.length && !new RegExp(`^\\s{0,3}${fence}{${count},}\\s*$`).test(lines[i])) captured.push(lines[i++]);
        if (i < lines.length) i++;
        const pre = doc.createElement('pre'); const code = doc.createElement('code');
        code.textContent = captured.join('\n'); pre.append(code); fragment.append(pre); continue;
      }
      const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (heading) {
        const h = doc.createElement(`h${Math.min(6, heading[1].length)}`);
        appendInline(h, heading[2]); fragment.append(h); i++; continue;
      }
      if (/^\s{0,3}(?:(?:[-*_]\s*){3,})\s*$/.test(line)) { fragment.append(doc.createElement('hr')); i++; continue; }
      if (/^\s{0,3}>/.test(line)) {
        const quoted = [];
        while (i < lines.length && /^\s{0,3}>/.test(lines[i])) quoted.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
        const quote = doc.createElement('blockquote'); breakLine(quote, quoted.join('\n')); fragment.append(quote); continue;
      }
      const firstList = listMatch(line);
      if (firstList) {
        const ordered = /^\d/.test(firstList[1]);
        const list = doc.createElement(ordered ? 'ol' : 'ul');
        while (i < lines.length) {
          const next = listMatch(lines[i]);
          if (!next || /^\d/.test(next[1]) !== ordered) break;
          const item = doc.createElement('li'); appendInline(item, next[2]); list.append(item); i++;
        }
        fragment.append(list); continue;
      }
      const paragraph = [];
      while (!blank(i)) {
        // A new block starts after the first line, except a Markdown link whose
        // target appears on the following line, e.g. "[here]\n(https://...)".
        if (paragraph.length && (/^\s{0,3}(?:#{1,6}\s+|>|`{3,}|~{3,})/.test(lines[i]) || listMatch(lines[i]))) break;
        paragraph.push(lines[i++]);
      }
      const p = doc.createElement('p'); breakLine(p, paragraph.join('\n')); fragment.append(p);
    }
    target.replaceChildren(fragment);
  }

  // Audiochan keeps its native player and layout. Only add a return link if this
  // URL was opened by GoneWildStudio from a Reddit post.
  function bootAudiochan(bridge) {
    const url = new URL(location.href);
    const post = bridge.safeReddit(url.searchParams.get('gws_post'));
    if (!post) return;
    const install = () => {
      if (!document.body || document.getElementById('gws-audiochan-return')) return;
      const link = document.createElement('a');
      link.id = 'gws-audiochan-return';
      link.href = post;
      link.textContent = '↶ Voltar ao post no Reddit';
      link.setAttribute('aria-label', 'Voltar ao post de origem no Reddit');
      link.rel = 'noopener noreferrer';
      const style = document.createElement('style');
      style.id = 'gws-audiochan-style';
      style.textContent = `
        #gws-audiochan-return { display:inline-flex!important;align-items:center;justify-content:center;
          box-sizing:border-box;max-width:calc(100% - 24px);margin:12px;
          border:1px solid rgba(255,151,200,.36);border-radius:10px;
          padding:10px 13px;min-height:42px;background:#211b21;color:#f7b0d1;
          font:600 14px/1.2 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;
          text-decoration:none!important;overflow-wrap:anywhere;white-space:normal;
          -webkit-tap-highlight-color:transparent;position:relative;z-index:2;}
        #gws-audiochan-return:focus-visible{outline:2px solid #faabd0;outline-offset:2px;}
      `;
      (document.head || document.documentElement).append(style);
      // Place the link in normal document flow so it doesn't cover the player,
      // sticky navigation, or Safari's bottom toolbar.
      (document.querySelector('main') || document.body).prepend(link);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
    else install();
  }

  function bootSoundgasm(bridge) {
    const SELECTOR = '.jp-audio .jp-title li, .jp-audio .jp-title, .jp-title, h1';
    const TAG_RE_SG = /\[([^\[\]\r\n]{1,180})\]/g;
    const esc = (text) => String(text || '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const fmt = (seconds) => {
      if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
      const number = Math.floor(seconds);
      const hours = Math.floor(number / 3600);
      const minutes = Math.floor(number / 60) % 60;
      return `${hours ? `${hours}:${String(minutes).padStart(2, '0')}` : minutes}:${String(number % 60).padStart(2, '0')}`;
    };
    const categoryTag = (tag) => /^(?:(?:M|F|A|NB|T|TM|TF|MM|FF|MF|FM){1,3}4(?:M|F|A|NB|T|TM|TF|MM|FF|MF|FM){1,3}|NSFW|SFW|18\+)$/i.test(tag.replace(/\s/g, ''));
    const validTag = (tag) => {
      const value = String(tag || '').replace(/\s+/g, ' ').trim();
      return value.length > 0 && value.length <= 180 && !/^https?:\/\//i.test(value) && !/[\r\n<>]/.test(value);
    };
    const bracketTags = (text, whole = text, offset = 0) => {
      const result = [];
      for (const match of String(text || '').matchAll(/\[([^\[\]\r\n]{1,180})\]/g)) {
        // Markdown links, e.g. [here](https://...), are NOT hashtags.
        if (/^\s*\(/.test(String(whole).slice(offset + match.index + match[0].length))) continue;
        const value = match[1].replace(/\s+/g, ' ').trim();
        if (validTag(value)) result.push(value);
      }
      return result;
    };
    const parseTags = (title, description = '') => {
      const found = bracketTags(title);
      const text = String(description || '').replace(/\r\n?/g, '\n');
      // Explicit "Tags: [BFE][Comfort]" and consecutive groups without a label.
      // Do not turn incidental references like [script](URL) into filters.
      for (const block of text.matchAll(/(?:\b(?:tags?|keywords?|kinks?|themes?|genres?)\s*:\s*)((?:\s*\[[^\[\]\r\n]{1,180}\])+)/gi)) {
        found.push(...bracketTags(block[1], text, block.index + block[0].indexOf(block[1])));
      }
      for (const block of text.matchAll(/(?:\[[^\[\]\r\n]{1,180}\][ \t]*){2,}/g)) {
        found.push(...bracketTags(block[0], text, block.index));
      }
      const seen = new Set();
      return found.filter((tag) => {
        const key = tag.normalize('NFKC').toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    const cleanedTitle = (title) => String(title || '').replace(TAG_RE_SG, ' ').replace(/\s{2,}/g, ' ').trim() || String(title || '').trim();
    const pathParts = location.pathname.split('/').filter(Boolean);
    const urlAuthor = pathParts[0] === 'u' && pathParts[1] ? decodeURIComponent(pathParts[1]) : '';
    const authorURL = (author, subreddit = '') => {
      const url = new URL(`/u/${encodeURIComponent(author)}`, location.origin);
      if (bridge.validSub(subreddit)) url.searchParams.set('subreddit', subreddit);
      return url.href;
    };
    const addTag = (tag, target, subreddit = '') => {
      const href = bridge.searchURL(subreddit, tag);
      const chip = document.createElement('a');
      chip.className = `gws-sg-tag${categoryTag(tag) ? ' gws-sg-category' : ''}`;
      chip.href = href;
      chip.target = '_blank';
      chip.rel = 'noopener noreferrer';
      chip.title = subreddit ? `Pesquisar ${tag} em r/${subreddit} (nova aba)` : `Pesquisar ${tag} no Reddit (nova aba)`;
      const hash = document.createElement('strong'); hash.textContent = '#';
      const value = document.createElement('span'); value.textContent = tag;
      chip.append(hash, value);
      target.append(chip);
      return chip;
    };
    const originalTitle = () => (document.querySelector(SELECTOR)?.textContent || '').trim();
    const rawDescription = () => (document.querySelector('.jp-audio .jp-description, .jp-description')?.innerText || '').trim();
    const pickMedia = () => {
      for (const element of document.querySelectorAll('audio[src], audio source[src]')) {
        const url = element.currentSrc || element.getAttribute('src');
        try { const parsed = new URL(url, location.href); if (/\.(?:m4a|mp3|aac|ogg|wav)(?:$|\?)/i.test(parsed.href) && /^https?:$/.test(parsed.protocol)) return parsed.href; } catch { /* next */ }
      }
      const scripts = Array.from(document.querySelectorAll('script:not([src])'), (script) => script.textContent).join('\n');
      const match = scripts.match(/\bm4a\s*:\s*["'](https?:[^"']+)["']/i) || scripts.match(/https?:\/\/media\.soundgasm\.net\/sounds\/[^\s"'<>]+\.m4a/i);
      const candidate = match?.[1] || match?.[0];
      try { const url = new URL(candidate); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch { return ''; }
    };

    function addStyles() {
      const style = document.createElement('style');
      style.id = 'gws-soundgasm-style';
      style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap');
        html:has(body.gws-sg-enhanced){background:#08080b!important;color-scheme:dark!important;}
        body.gws-sg-enhanced{margin:0!important;padding:0!important;background:#08080b!important;color:#ede6ec!important;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,system-ui,sans-serif!important;min-width:320px!important;overflow-x:hidden!important;}
        body.gws-sg-enhanced > :not(#gws-sg-root):not(script):not(style){display:none!important;}
        #gws-sg-root, #gws-sg-root *{box-sizing:border-box!important;}
        #gws-sg-root{--pink:#f28dbb;--lav:#a87afa;--ink:#08080b;--gray:#b6acba;--line:rgba(255,255,255,.10);position:relative;isolation:isolate;max-width:800px;width:100%;min-height:100svh;margin:0 auto;padding:calc(18px + env(safe-area-inset-top,0px)) max(17px,env(safe-area-inset-right,0px)) calc(40px + env(safe-area-inset-bottom,0px)) max(17px,env(safe-area-inset-left,0px));color:#f4eff3!important;font-family:'Instrument Sans',-apple-system,BlinkMacSystemFont,system-ui,sans-serif!important;font-size:14px!important;line-height:1.4!important;}
        #gws-sg-root:before{content:'';position:absolute;z-index:-1;top:-220px;left:0;right:0;height:540px;background:radial-gradient(ellipse at 75% 22%,rgba(206,80,148,.20),transparent 55%),radial-gradient(ellipse at 12% 65%,rgba(95,51,169,.18),transparent 65%);pointer-events:none;}
        #gws-sg-root button,#gws-sg-root input,#gws-sg-root select{font:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
        #gws-sg-root button{cursor:pointer;border:0;}
        #gws-sg-root a{color:inherit;text-decoration:none;}
        #gws-sg-root a:focus-visible,#gws-sg-root button:focus-visible,#gws-sg-root input:focus-visible{outline:2px solid #ff9ed6;outline-offset:3px;}
        .gws-sg-header{display:flex;gap:12px;justify-content:space-between;align-items:center;margin-bottom:27px;}
        .gws-sg-brand{display:flex;align-items:center;gap:9px;color:#eee0e9;font-weight:780;font-size:16px;letter-spacing:-.6px;}
        .gws-sg-logo{display:grid;place-items:center;width:36px;height:36px;color:#160916;border-radius:11px;background:linear-gradient(145deg,#ff9cc4,#b280ff);font-size:20px;}
        .gws-sg-source{border:1px solid var(--line);padding:8px 11px;border-radius:999px;font-size:12px;font-weight:650;color:#dbc7d7!important;white-space:nowrap;}
        .gws-sg-eyebrow{font-size:11px;letter-spacing:.15em;text-transform:uppercase;font-weight:800;color:#ed8ab5;margin:0 0 13px;}
        .gws-sg-chips{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin:0 0 17px;}
        .gws-sg-tag{display:inline-flex;align-items:center;gap:6px;min-height:34px;max-width:100%;padding:7px 10px;background:rgba(174,160,173,.12);border:1px solid rgba(214,190,210,.18)!important;border-radius:8px;font-size:12px!important;font-weight:630!important;overflow-wrap:anywhere;transition:background .15s,border-color .15s;}
        .gws-sg-tag strong{color:#ec84c1!important;font-weight:800!important;}
        .gws-sg-tag:active{background:rgba(242,141,187,.23);}
        .gws-sg-tag.gws-sg-category{border-color:rgba(245,139,193,.38)!important;color:#f5a8cb!important;background:rgba(224,102,149,.12);}
        .gws-sg-tag.gws-sg-category strong{color:#f5a8cb!important;}
        #gws-sg-root h1{font-size:clamp(28px,7.7vw,50px)!important;line-height:1.08!important;letter-spacing:-.045em!important;font-weight:810!important;margin:0 0 16px!important;text-wrap:balance;overflow-wrap:anywhere;color:#f7f1f5!important;}
        .gws-sg-byline{color:#aaa1ad;font-size:13px;margin-bottom:25px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
        .gws-sg-byline b{color:#f0b0d2;font-weight:650;}
        .gws-sg-panel{background:linear-gradient(145deg,rgba(37,29,40,.94),rgba(20,19,25,.97) 65%);border:1px solid rgba(238,167,206,.14);box-shadow:0 22px 60px rgba(0,0,0,.19),inset 0 1px rgba(255,255,255,.035);border-radius:21px;padding:18px 14px 16px;margin:0 0 24px;min-width:0;}
        .gws-sg-panelhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:20px;}
        .gws-sg-pill{font-size:11px;font-weight:750;color:#cdb9ca;background:rgba(242,141,187,.10);border-radius:999px;padding:7px 10px;letter-spacing:.02em;}
        .gws-sg-pill span{color:#f4a8c9;}
        .gws-sg-status{font-size:11px;color:#aeb0b8;text-align:right;}
        .gws-sg-wave-wrap{position:relative;touch-action:none;user-select:none;-webkit-user-select:none;border-radius:12px;overflow:hidden;background:linear-gradient(180deg,rgba(242,141,187,.025),rgba(0,0,0,.10));margin:0 0 5px;}
        #gws-sg-wave{display:block;width:100%;height:118px;touch-action:none;cursor:crosshair;}
        .gws-sg-time{display:flex;justify-content:space-between;gap:10px;align-items:center;color:#bab0bc;font-size:12px;font-variant-numeric:tabular-nums;margin:8px 2px 16px;}
        .gws-sg-progress{width:100%;height:5px;margin:0 0 11px;accent-color:var(--pink);display:block;cursor:pointer;}
        .gws-sg-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr)) auto repeat(2,minmax(0,1fr));align-items:center;justify-items:center;gap:clamp(4px,2.5vw,14px);min-height:70px;width:100%;}
        .gws-sg-control{display:inline-flex;align-items:center;justify-content:center;min-width:0;width:min(100%,56px);height:46px;padding:0 3px;border-radius:999px;background:transparent;color:#d4c7d3;font-size:13px!important;line-height:1!important;white-space:nowrap;font-weight:720!important;font-variant-numeric:tabular-nums;}
        .gws-sg-control:active{background:rgba(255,255,255,.09);}
        .gws-sg-control.gws-sg-play{width:68px;height:68px;background:linear-gradient(135deg,#fc91bd,#d47dda)!important;color:#210b1e!important;font-size:27px!important;box-shadow:0 6px 30px rgba(237,126,185,.18);}
        .gws-sg-secondary{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:19px;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:16px;}
        .gws-sg-rate,.gws-sg-loop,.gws-sg-wave-btn,.gws-sg-copy,.gws-sg-jump{background:rgba(255,255,255,.07)!important;color:#ddceda!important;border-radius:10px;padding:9px 12px;min-height:37px;font-size:12px!important;font-weight:700!important;}
        .gws-sg-secondary .gws-sg-on{color:#ffadd5!important;background:rgba(242,141,187,.18)!important;}
        .gws-sg-skip{font-size:14px!important;color:#d4c3d2!important;}
        .gws-sg-seekrow{display:flex;align-items:center;gap:8px;}
        .gws-sg-seekrow input{width:85px;min-width:0;background:#121218;color:#fff;border:1px solid #38313b;border-radius:8px;padding:8px;font-size:16px!important;text-align:center;}
        .gws-sg-section{border-top:1px solid var(--line);padding-top:22px;margin-top:22px;}
        .gws-sg-section h2{font-size:16px!important;letter-spacing:-.02em;margin:0 0 12px!important;font-weight:760;color:#f1dce9!important;}
        #gws-sg-root .gws-sg-description{display:block;width:100%;max-width:100%;min-width:0;overflow-wrap:anywhere;word-break:normal;white-space:normal;text-align:left!important;color:#d8cfd9!important;line-height:1.7!important;font-size:15px!important;font-weight:400;user-select:text;-webkit-user-select:text;}
        #gws-sg-root .gws-sg-description :is(p,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre){max-width:100%;min-width:0;text-align:left!important;box-sizing:border-box;}
        #gws-sg-root .gws-sg-description p{margin:0 0 1.05em!important;line-height:inherit!important;color:inherit!important;}
        #gws-sg-root .gws-sg-description :is(h1,h2,h3,h4,h5,h6){color:#f6eaf3!important;line-height:1.3!important;letter-spacing:-.025em;margin:1.45em 0 .55em!important;font-weight:700!important;overflow-wrap:anywhere;}
        #gws-sg-root .gws-sg-description h1{font-size:22px!important;}
        #gws-sg-root .gws-sg-description h2{font-size:19px!important;}
        #gws-sg-root .gws-sg-description :is(h3,h4,h5,h6){font-size:16px!important;}
        #gws-sg-root .gws-sg-description :is(ul,ol){margin:0 0 1.1em!important;padding-left:1.45em!important;}
        #gws-sg-root .gws-sg-description li{display:list-item!important;margin:0 0 .35em!important;}
        #gws-sg-root .gws-sg-description blockquote{margin:1.2em 0!important;border-left:3px solid #e68cb5;padding:7px 0 7px 15px;color:#beb1c1;background:rgba(246,148,193,.05);}
        #gws-sg-root .gws-sg-description :is(strong,b){font-weight:700!important;color:#f4e4ef!important;}
        #gws-sg-root .gws-sg-description em{font-style:italic!important;}
        #gws-sg-root .gws-sg-description del{text-decoration:line-through;}
        #gws-sg-root .gws-sg-description :is(code,pre){font-family:ui-monospace,Menlo,monospace!important;font-size:.9em;background:rgba(255,255,255,.075);border-radius:6px;}
        #gws-sg-root .gws-sg-description code{padding:2px 5px;}
        #gws-sg-root .gws-sg-description pre{overflow-x:auto;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere;}
        #gws-sg-root .gws-sg-description pre code{padding:0;background:none;}
        #gws-sg-root .gws-sg-description hr{height:1px;border:0;background:var(--line);margin:1.7em 0;}
        #gws-sg-root .gws-sg-description a{color:#f7a5d0!important;text-decoration:underline!important;text-underline-offset:3px;overflow-wrap:anywhere;}
        #gws-sg-root .gws-sg-description a:active{color:#ffd1e8!important;}
        #gws-sg-root .gws-sg-description > :last-child{margin-bottom:0!important;}
        #gws-sg-root .gws-sg-section{width:100%;min-width:0;display:block;clear:both;text-align:left!important;}
        #gws-sg-root .gws-sg-actions{display:flex;flex-wrap:wrap;align-items:stretch;justify-content:flex-start;width:100%;min-width:0;}
        #gws-sg-root .gws-sg-actions :is(a,button){flex:0 1 auto;max-width:100%;min-width:0;text-align:center;white-space:normal;}
        #gws-sg-root :is(.gws-sg-panel,.gws-sg-section,.gws-sg-byline,.gws-sg-header){max-width:100%;min-width:0;}
        @media(max-width:480px){#gws-sg-root .gws-sg-actions :is(a,button){flex:1 1 auto;}#gws-sg-root .gws-sg-description{font-size:15px!important;}}
        .gws-sg-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px;}
        .gws-sg-actions a,.gws-sg-actions button{display:inline-flex;align-items:center;justify-content:center;min-height:39px;padding:8px 11px;border-radius:9px;border:1px solid var(--line)!important;background:rgba(255,255,255,.045)!important;color:#eacbdc!important;font-size:12px!important;font-weight:670!important;}
        .gws-sg-note{margin:11px 2px 0;color:#99909c;font-size:11px;line-height:1.5;}
        @media(max-width:380px){.gws-sg-panel{padding:14px 10px;}.gws-sg-controls{gap:4px}.gws-sg-control.gws-sg-play{width:62px;height:62px;}#gws-sg-root{padding-left:12px;padding-right:12px;}.gws-sg-header{margin-bottom:18px;}}
        .gws-sg-authorlink{display:inline-flex;align-items:center;gap:5px;color:#f5a5d1!important;font-weight:720!important;text-decoration:none!important;padding:5px 0;border-bottom:1px solid rgba(245,165,209,.35);}
        .gws-sg-byline .gws-sg-authorlink{font-size:13px;}
        .gws-sg-subtitle{margin:-6px 0 21px;color:#ad9eaf;font-size:13px;line-height:1.6;}
        .gws-sg-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin:8px 0 16px;}
        .gws-sg-toolbar input,.gws-sg-toolbar select{min-width:0;width:100%;height:46px;border:1px solid rgba(255,255,255,.16);background:#1c1920;color:#f0e6f0;border-radius:11px;padding:0 13px;font-size:16px!important;}
        .gws-sg-toolbar select{width:auto;max-width:145px;font-size:13px!important;}
        .gws-sg-catalog{display:grid;grid-template-columns:minmax(0,1fr);gap:15px;align-items:stretch;}
        .gws-sg-card{min-width:0;padding:17px;border:1px solid rgba(238,167,206,.15);background:linear-gradient(150deg,rgba(34,28,38,.97),rgba(18,18,23,.97));border-radius:19px;box-shadow:inset 0 1px rgba(255,255,255,.03);}
        .gws-sg-card .gws-sg-chips{margin:0 0 11px;}
        .gws-sg-cardtitle{display:block;font-size:clamp(19px,4.8vw,25px)!important;line-height:1.2!important;font-weight:760!important;letter-spacing:-.035em;color:#f5ebf2!important;overflow-wrap:anywhere;margin:0 0 12px;text-decoration:none!important;}
        .gws-sg-cardtitle:active,.gws-sg-cardtitle:hover{color:#f1a0ca!important;}
        .gws-sg-cardmeta{display:flex;align-items:center;gap:7px;justify-content:space-between;flex-wrap:wrap;margin:10px 0;color:#b3a3b2;font-size:12px;}
        .gws-sg-cardmeta a{color:#f4a1cc!important;text-decoration:none!important;font-weight:690!important;}
        .gws-sg-cardsummary{margin:12px 0 0;color:#b6a9ba;font-size:13px;line-height:1.6;overflow-wrap:anywhere;}
        .gws-sg-card details{margin-top:12px;border-top:1px solid rgba(255,255,255,.10);padding-top:12px;}
        .gws-sg-card summary{display:inline-flex;align-items:center;min-height:40px;cursor:pointer;color:#f1a9ce;font-weight:690;font-size:13px;list-style:none;touch-action:manipulation;}
        .gws-sg-card summary::-webkit-details-marker{display:none;}
        .gws-sg-card .gws-sg-description{margin-top:7px;}
        .gws-sg-empty{text-align:center;color:#ad9dab;margin:20px 0;font-size:14px;}
        @media(max-width:480px){.gws-sg-toolbar{grid-template-columns:1fr;}.gws-sg-toolbar select{max-width:100%;}.gws-sg-card{padding:14px;}}
        @media(prefers-reduced-motion:reduce){#gws-sg-root *{transition:none!important;animation:none!important;}}
      `;
      document.head.appendChild(style);
    }
    const fromProfile = async () => {
      if (pathParts[0] !== 'u' || pathParts.length !== 2 || !urlAuthor) return;
      // Soundgasm profile pages use .sound-details (not .jp-audio).
      // Parse the native list BEFORE hiding it. If the site has changed its
      // structure, leave the original page intact rather than showing an empty UI.
      const blocks = Array.from(document.querySelectorAll('.sound-details'));
      if (!blocks.length) return;
      const author = urlAuthor;
      const context = await bridge.readLocation();
      const subreddit = bridge.validSub(context?.subreddit) ? context.subreddit : '';
      let ref = null;
      try {
        const saved = JSON.parse(sessionStorage.getItem(`gws:source:${author.toLowerCase()}`) || 'null');
        if (saved && Date.now() - saved.at < 86400000 && saved.path?.startsWith(`/u/${encodeURIComponent(author)}/`)) ref = saved;
      } catch { /* optional */ }
      const recordings = [];
      const known = new Set();
      for (const block of blocks) {
        const links = Array.from(block.querySelectorAll('a[href]'));
        const candidate = links.find((link) => {
          try {
            const u = new URL(link.getAttribute('href'), location.href);
            const parts = u.pathname.split('/').filter(Boolean);
            return /^(?:www\.)?soundgasm\.net$/i.test(u.hostname) && parts[0] === 'u' && decodeURIComponent(parts[1] || '') === author && parts.length >= 3;
          } catch { return false; }
        });
        if (!candidate) continue;
        const url = new URL(candidate.getAttribute('href'), location.href);
        if (known.has(url.pathname)) continue;
        known.add(url.pathname);
        const heading = block.querySelector('.sound-title, .jp-title, h2, h3') || candidate;
        const title = (heading.textContent || candidate.textContent || '').trim();
        const descriptionElement = block.querySelector('.sound-description, .jp-description, .sound-desc, .description');
        let description = (descriptionElement?.innerText || descriptionElement?.textContent || '').trim();
        if (!description) {
          const clone = block.cloneNode(true);
          clone.querySelectorAll('.sound-title, .jp-title, .playCount, script, style').forEach((node) => node.remove());
          description = (clone.textContent || '').trim();
        }
        description = description.replace(/\s*Play Count:\s*[\d,.]+\s*$/i, '').trim();
        const plays = (block.querySelector('.playCount, .play-count')?.textContent || block.textContent || '').match(/Play\s*Count\s*:\s*([\d,.]+)/i)?.[1] || '';
        const tags = parseTags(title, description);
        const audioURL = ref?.path === url.pathname ? ref.href : url.href;
        const linked = new URL(audioURL);
        if (subreddit && !linked.searchParams.has('subreddit')) linked.searchParams.set('subreddit', subreddit);
        recordings.push({ title, cleaned: cleanedTitle(title), tags, description, plays: Number(plays.replace(/[,\.]/g, '')) || 0, href:linked.href, index:recordings.length });
      }
      if (!recordings.length) return;
      addStyles();
      const root = document.createElement('main');
      root.id = 'gws-sg-root';
      root.innerHTML = `
        <header class="gws-sg-header"><div class="gws-sg-brand"><span class="gws-sg-logo">♫</span><span>gonewild<span style="color:#ef94c1">studio</span></span></div><a class="gws-sg-source" href="https://www.reddit.com" target="_blank" rel="noopener noreferrer">↗ Reddit</a></header>
        <p class="gws-sg-eyebrow">SOUNDGASM / CATÁLOGO</p>
        <h1 id="gws-sg-profile-name"></h1>
        <p class="gws-sg-subtitle" id="gws-sg-profile-summary"></p>
        <div class="gws-sg-toolbar">
          <input type="search" id="gws-sg-profile-search" autocomplete="off" placeholder="Buscar títulos e hashtags…" aria-label="Buscar gravações por título, descrição ou hashtag">
          <select id="gws-sg-profile-sort" aria-label="Ordenar gravações"><option value="original">Ordem original</option><option value="popular">Mais reproduzidos</option><option value="title">Título A–Z</option></select>
        </div>
        <div class="gws-sg-catalog" id="gws-sg-catalog"></div>
        <p class="gws-sg-empty" id="gws-sg-profile-empty" hidden>Nenhum áudio corresponde à pesquisa.</p>
      `;
      root.querySelector('#gws-sg-profile-name').textContent = `@${author}`;
      const summary = root.querySelector('#gws-sg-profile-summary');
      summary.textContent = `${recordings.length} ${recordings.length === 1 ? 'gravação' : 'gravações'}${subreddit ? ` · Tags pesquisadas em r/${subreddit}` : ' · Tags pesquisadas em todo o Reddit'}`;
      const list = root.querySelector('#gws-sg-catalog');
      const cardData = recordings.map((item) => {
        const card = document.createElement('article'); card.className = 'gws-sg-card';
        const categories = document.createElement('div'); categories.className = 'gws-sg-chips';
        const tags = document.createElement('div'); tags.className = 'gws-sg-chips';
        for (const tag of item.tags) addTag(tag, categoryTag(tag) ? categories : tags, subreddit);
        if (categories.childElementCount) card.append(categories);
        const titleLink = document.createElement('a');
        titleLink.href = item.href;
        titleLink.className = 'gws-sg-cardtitle';
        titleLink.textContent = item.cleaned;
        titleLink.setAttribute('aria-label', `Ouvir ${item.cleaned}`);
        card.append(titleLink);
        if (tags.childElementCount) card.append(tags);
        const metadata = document.createElement('div'); metadata.className = 'gws-sg-cardmeta';
        const plays = document.createElement('span'); plays.textContent = item.plays ? `${item.plays.toLocaleString('pt-BR')} reproduções` : 'Áudio do Soundgasm';
        const listen = document.createElement('a'); listen.href = item.href; listen.textContent = '▶ Ouvir áudio';
        metadata.append(plays, listen); card.append(metadata);
        if (item.description) {
          const preview = document.createElement('p'); preview.className = 'gws-sg-cardsummary';
          preview.textContent = item.description.length > 220 ? `${item.description.slice(0, 220).trim()}…` : item.description;
          card.append(preview);
          const details = document.createElement('details');
          const summary = document.createElement('summary'); summary.textContent = 'Descrição completa ↓';
          const content = document.createElement('div'); content.className = 'gws-sg-description';
          details.append(summary, content);
          details.addEventListener('toggle', () => {
            if (details.open && !content.hasChildNodes()) renderRedditMarkdown(item.description, content);
          });
          card.append(details);
        }
        return { item, card, search: `${item.title} ${item.tags.join(' ')} ${item.description}`.normalize('NFKC').toLocaleLowerCase() };
      });
      let filterTimer = 0;
      const input = root.querySelector('#gws-sg-profile-search');
      const sort = root.querySelector('#gws-sg-profile-sort');
      const empty = root.querySelector('#gws-sg-profile-empty');
      const render = () => {
        const words = input.value.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
        const relevant = cardData.filter(({search}) => words.every((word) => search.includes(word)));
        if (sort.value === 'popular') relevant.sort((a,b) => b.item.plays - a.item.plays || a.item.index - b.item.index);
        else if (sort.value === 'title') relevant.sort((a,b) => a.item.cleaned.localeCompare(b.item.cleaned));
        else relevant.sort((a,b) => a.item.index - b.item.index);
        list.replaceChildren(...relevant.map(({card}) => card));
        empty.hidden = relevant.length > 0;
        summary.textContent = `${relevant.length} de ${recordings.length} gravações${subreddit ? ` · r/${subreddit}` : ' · Reddit global'}`;
      };
      input.addEventListener('input', () => { clearTimeout(filterTimer); filterTimer = setTimeout(render, 90); });
      sort.addEventListener('change', render);
      render();
      document.body.append(root);
      document.body.classList.add('gws-sg-enhanced');
      document.title = `${author} · GoneWildStudio`;
      console.info('[GoneWildStudio] Soundgasm author catalogue', { author, recordings: recordings.length, subreddit });
    };

    const fromScript = async () => {
      const context = await bridge.readLocation();
      const titleFromSite = originalTitle();
      const mergedTitle = context?.title || titleFromSite || decodeURIComponent(location.pathname.split('/').pop() || '').replace(/[-_]/g, ' ');
      const author = urlAuthor || context?.author || '';
      const subreddit = context?.subreddit || '';
      const originalPost = bridge.safeReddit(context?.permalink);
      const description = context?.description || rawDescription();
      const tags = parseTags(mergedTitle, description);
      const cleanName = cleanedTitle(mergedTitle);
      let media = pickMedia();
      addStyles();
      document.body.classList.add('gws-sg-enhanced');
      const root = document.createElement('main'); root.id = 'gws-sg-root';
      root.innerHTML = `
        <header class="gws-sg-header"><div class="gws-sg-brand"><span class="gws-sg-logo">♫</span><span>gonewild<span style="color:#ef94c1">studio</span></span></div><a class="gws-sg-source" id="gws-sg-back" href="${esc(originalPost || 'https://www.reddit.com')}">${originalPost ? '↶ Reddit' : 'Soundgasm ✦'}</a></header>
        <div class="gws-sg-eyebrow">SOUNDGASM / AUDIO STUDIO</div>
        <div class="gws-sg-chips" id="gws-sg-categories"></div>
        <h1 id="gws-sg-title"></h1>
        <div class="gws-sg-chips" id="gws-sg-tags"></div>
        <div class="gws-sg-byline"><span>Por <a class="gws-sg-authorlink" id="gws-sg-author-link" href="#" aria-label="Ver catálogo de áudios do autor"><b id="gws-sg-author"></b> ↗</a></span><span id="gws-sg-subname"></span></div>
        <section class="gws-sg-panel" aria-label="Player de áudio"><div class="gws-sg-panelhead"><div class="gws-sg-pill"><span>●</span> STUDIO PLAYER</div><div class="gws-sg-status" id="gws-sg-status">Preparando player…</div></div>
          <div class="gws-sg-wave-wrap"><canvas id="gws-sg-wave" height="118" role="slider" tabindex="0" aria-label="Posição na gravação" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></canvas></div>
          <input type="range" id="gws-sg-progress" class="gws-sg-progress" min="0" max="100" step="0.01" value="0" aria-label="Progresso preciso do áudio">
          <div class="gws-sg-time"><span id="gws-sg-current">0:00</span><span id="gws-sg-duration">0:00</span></div>
          <div class="gws-sg-controls"><button type="button" class="gws-sg-control" id="gws-sg-back15" aria-label="Voltar 15 segundos">↶ 15</button><button type="button" class="gws-sg-control gws-sg-skip" id="gws-sg-back5" aria-label="Voltar 5 segundos">−5</button><button type="button" class="gws-sg-control gws-sg-play" id="gws-sg-play" aria-label="Reproduzir">▶</button><button type="button" class="gws-sg-control gws-sg-skip" id="gws-sg-next5" aria-label="Avançar 5 segundos">+5</button><button type="button" class="gws-sg-control" id="gws-sg-next15" aria-label="Avançar 15 segundos">15 ↷</button></div>
          <div class="gws-sg-secondary"><button type="button" class="gws-sg-rate" id="gws-sg-speed" aria-label="Velocidade de reprodução">1×</button><button type="button" class="gws-sg-loop" id="gws-sg-loop">↻ Repetir</button><div class="gws-sg-seekrow"><label for="gws-sg-timefield">Ir para</label><input id="gws-sg-timefield" type="text" inputmode="decimal" placeholder="12:34" aria-label="Ir para o tempo"><button type="button" id="gws-sg-jump" class="gws-sg-jump">OK</button></div></div>
          <div class="gws-sg-actions"><button type="button" id="gws-sg-realwave" class="gws-sg-wave-btn">◒ Analisar waveform real</button><button type="button" id="gws-sg-share" class="gws-sg-copy">↗ Copiar link</button><button type="button" id="gws-sg-native" class="gws-sg-copy">Player original</button></div>
          <p class="gws-sg-note" id="gws-sg-wave-note">Visualização decorativa com seek preciso. Para mostrar amplitudes reais, analise a mídia quando possível.</p>
          <audio id="gws-sg-audio" preload="metadata" playsinline></audio>
        </section>
        <section class="gws-sg-section"><h2>Descrição original</h2><div class="gws-sg-description" id="gws-sg-description"></div><div class="gws-sg-actions" id="gws-sg-post-actions"><a id="gws-sg-post-link" href="#" target="_blank" rel="noopener noreferrer">↶ Voltar ao post no Reddit</a><button type="button" id="gws-sg-description-copy">⧉ Copiar descrição</button></div></section>`;
      document.body.appendChild(root);
      const element = (selector) => root.querySelector(selector);
      element('#gws-sg-title').textContent = cleanName;
      element('#gws-sg-author').textContent = author || 'Anônimo';
      const authorLink = element('#gws-sg-author-link');
      if (urlAuthor) {
        authorLink.href = authorURL(urlAuthor, subreddit);
        authorLink.title = `Ver todos os áudios de ${urlAuthor}`;
        // Preserve the contextual Reddit link for THIS audio if the user
        // returns through the author catalogue; do not apply it to others.
        try {
          sessionStorage.setItem(`gws:source:${urlAuthor.toLowerCase()}`, JSON.stringify({
            path: location.pathname, href: location.href, at: Date.now(),
          }));
        } catch { /* session storage is optional */ }
      } else authorLink.replaceWith(document.createTextNode(author || 'Anônimo'));
      if (subreddit) element('#gws-sg-subname').textContent = `• r/${subreddit}`;
      element('#gws-sg-back').target = originalPost ? '_blank' : '_self';
      element('#gws-sg-back').rel = 'noopener noreferrer';
      if (!originalPost) element('#gws-sg-back').href = location.origin;
      const action = element('#gws-sg-post-link');
      if (originalPost) action.href = originalPost;
      else action.hidden = true;
      const descriptionNode = element('#gws-sg-description');
      if (description) {
        renderRedditMarkdown(description, descriptionNode);
      } else {
        descriptionNode.textContent = 'Não há descrição associada a este áudio.';
      }
      document.title = `${cleanName} · GoneWildStudio`;
      for (const tag of tags) addTag(tag, element(categoryTag(tag) ? '#gws-sg-categories' : '#gws-sg-tags'), subreddit);
      const mediaElement = element('#gws-sg-audio');
      mediaElement.controls = false;
      mediaElement.style.display = 'none';
      const nativeAudio = document.querySelector('#jp_audio_0, .jp-jplayer audio');
      if (nativeAudio) { try { nativeAudio.pause(); nativeAudio.muted = true; } catch { /* no audio yet */ } }
      if (media) mediaElement.src = media;
      const play = element('#gws-sg-play');
      const progress = element('#gws-sg-progress');
      const canvas = element('#gws-sg-wave');
      const ctx = canvas.getContext('2d');
      const status = element('#gws-sg-status');
      const waveNote = element('#gws-sg-wave-note');
      const peaks = { values:null, loading:false };
      const PLAYBACK_KEY = 'gws:playback:v1';
      // Key by canonical Soundgasm page, not by the huge #gws context or parameters.
      const recordingKey = `${location.hostname.toLowerCase().replace(/^www\./,'')}${location.pathname.replace(/\/$/, '')}`;
      const readPlayback = () => {
        try {
          const record = JSON.parse(localStorage.getItem(PLAYBACK_KEY) || '{}')[recordingKey];
          return record && typeof record === 'object' ? record : null;
        } catch { return null; }
      };
      const previous = readPlayback();
      const restoredSpeed = Number(previous?.speed);
      if (Number.isFinite(restoredSpeed) && restoredSpeed >= .5 && restoredSpeed <= 3) mediaElement.playbackRate = restoredSpeed;
      if (previous?.loop === true) mediaElement.loop = true;
      let restored = false;
      let lastSavedAt = 0;
      let pendingSeek = Number.isFinite(Number(previous?.position)) && Number(previous?.position) > 0 && previous?.completed !== true
        ? Number(previous.position) : null;
      const remember = (force = false, finished = false) => {
        // Do not accidentally overwrite an existing position before metadata is
        // available and the previous position has actually been restored.
        if (!restored || mediaElement.readyState < HTMLMediaElement.HAVE_METADATA) return;
        const stamp = Date.now();
        if (!force && stamp - lastSavedAt < 4000) return;
        lastSavedAt = stamp;
        const total = Number.isFinite(mediaElement.duration) ? mediaElement.duration : 0;
        const time = Number.isFinite(mediaElement.currentTime) ? mediaElement.currentTime : 0;
        try {
          const all = JSON.parse(localStorage.getItem(PLAYBACK_KEY) || '{}');
          const records = all && typeof all === 'object' && !Array.isArray(all) ? all : {};
          const completed = finished || mediaElement.ended;
          records[recordingKey] = {
            position: completed ? 0 : Math.max(0, time), duration: total,
            speed: mediaElement.playbackRate, loop: mediaElement.loop,
            completed, updatedAt: stamp,
          };
          const recent = Object.entries(records).sort((a,b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0)).slice(0, 200);
          localStorage.setItem(PLAYBACK_KEY, JSON.stringify(Object.fromEntries(recent)));
        } catch (error) { console.debug('[GoneWildStudio] Playback persistence unavailable', error); }
      };
      let scrubbing = false;
      let waveRAF = 0;
      let drawWidth = 0;
      let drawHeight = 118;
      const rates = [0.75, 1, 1.1, 1.25, 1.5, 1.75, 2];
      element('#gws-sg-speed').textContent = `${mediaElement.playbackRate}×`;
      element('#gws-sg-loop').classList.toggle('gws-sg-on', mediaElement.loop);
      element('#gws-sg-loop').setAttribute('aria-pressed', String(mediaElement.loop));
      const currentTime = () => Number.isFinite(mediaElement.currentTime) ? mediaElement.currentTime : 0;
      const duration = () => Number.isFinite(mediaElement.duration) ? mediaElement.duration : 0;
      const setStatus = (value) => { status.textContent = value; };
      function drawWave() {
        if (!ctx || !drawWidth) return;
        const w = drawWidth, h = drawHeight;
        ctx.clearRect(0, 0, w, h);
        const count = peaks.values?.length || Math.min(135, Math.floor(w / 4));
        const gap = w / count;
        const played = duration() ? currentTime() / duration() : 0;
        for (let i = 0; i < count; i++) {
          // Before decoding, only the timeline is represented, not invented sound peaks.
          // A decorative timeline is clearly labeled, and never claimed to be sampled audio.
          const amplitude = peaks.values ? peaks.values[i] : Math.min(.65, .16 + .20 * Math.abs(Math.sin(i * .29) * Math.cos(i * .093)) + .12 * Math.abs(Math.sin(i * .67)));
          const barH = Math.max(3, amplitude * (h - 18));
          ctx.fillStyle = (i + .5) / count <= played ? '#f18cb8' : (peaks.values ? '#685b6c' : '#403740');
          ctx.fillRect(i * gap + 1, h / 2 - barH / 2, Math.max(1.2, gap - 2), barH);
        }
        const x = Math.max(0, Math.min(w, played * w));
        ctx.fillStyle = '#ffbddc';
        ctx.fillRect(x - 1, 0, 2, h);
      }
      const syncTime = () => {
        const current = currentTime();
        const total = duration();
        if (!scrubbing) progress.value = String(total ? current / total * 100 : 0);
        element('#gws-sg-current').textContent = fmt(current);
        element('#gws-sg-duration').textContent = fmt(total);
        canvas.setAttribute('aria-valuenow', String(Math.round(total ? current / total * 100 : 0)));
        drawWave();
      };
      const rafSync = () => { syncTime(); if (!mediaElement.paused) waveRAF = requestAnimationFrame(rafSync); };
      const seek = (seconds) => {
        if (!Number.isFinite(seconds)) return;
        if (!duration()) { pendingSeek = Math.max(0, seconds); return; }
        try {
          mediaElement.currentTime = Math.max(0, Math.min(duration(), seconds));
          syncTime();
          remember(true);
        } catch {
          // Safari can reject seeks until the media range becomes seekable.
          pendingSeek = seconds;
        }
      };
      const seekFraction = (fraction) => { if (duration()) seek(Math.max(0, Math.min(1, fraction)) * duration()); };
      const pointerSeek = (event) => {
        const rect = canvas.getBoundingClientRect();
        seekFraction((event.clientX - rect.left) / Math.max(1, rect.width));
      };
      canvas.addEventListener('pointerdown', (event) => {
        event.preventDefault(); scrubbing = true;
        try { canvas.setPointerCapture(event.pointerId); } catch { /* non-capturing browser */ }
        pointerSeek(event);
      });
      canvas.addEventListener('pointermove', (event) => { if (scrubbing) pointerSeek(event); });
      const release = () => { scrubbing = false; };
      canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
      canvas.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); seek(currentTime() + (event.key === 'ArrowLeft' ? -5 : 5));
        }
      });
      progress.addEventListener('input', () => { scrubbing = true; seekFraction(Number(progress.value) / 100); });
      progress.addEventListener('change', () => { scrubbing = false; syncTime(); });
      play.addEventListener('click', async () => {
        try {
          if (mediaElement.paused) await mediaElement.play();
          else mediaElement.pause();
        } catch (error) { setStatus(`Falha ao tocar: ${error.message}`); }
      });
      element('#gws-sg-back15').addEventListener('click', () => seek(currentTime() - 15));
      element('#gws-sg-back5').addEventListener('click', () => seek(currentTime() - 5));
      element('#gws-sg-next5').addEventListener('click', () => seek(currentTime() + 5));
      element('#gws-sg-next15').addEventListener('click', () => seek(currentTime() + 15));
      element('#gws-sg-speed').addEventListener('click', () => {
        const current = rates.findIndex((rate) => Math.abs(rate - mediaElement.playbackRate) < .01);
        const next = rates[(current + 1) % rates.length];
        mediaElement.playbackRate = next;
        element('#gws-sg-speed').textContent = `${next}×`;
      });
      element('#gws-sg-loop').addEventListener('click', () => {
        mediaElement.loop = !mediaElement.loop;
        element('#gws-sg-loop').classList.toggle('gws-sg-on', mediaElement.loop);
        element('#gws-sg-loop').setAttribute('aria-pressed', String(mediaElement.loop));
      });
      const jump = () => {
        const raw = element('#gws-sg-timefield').value.trim();
        if (!/^(?:\d+:)?\d{1,2}:\d{2}$|^\d{1,5}(?:\.\d+)?$/.test(raw)) return;
        const parts = raw.split(':').map(Number);
        const seconds = parts.reduce((sum, value) => sum * 60 + value, 0);
        seek(seconds);
      };
      element('#gws-sg-jump').addEventListener('click', jump);
      element('#gws-sg-timefield').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); jump(); } });
      const restorePlayback = () => {
        if (!duration()) return;
        if (pendingSeek != null) {
          const requested = Math.min(pendingSeek, Math.max(0, duration() - .3));
          if (requested > 0) {
            try { mediaElement.currentTime = requested; pendingSeek = null; }
            catch { return; } // Retry once canplay/loadeddata fires.
          } else pendingSeek = null;
        }
        restored = true;
        syncTime();
        setStatus(previous?.position > 0 && previous?.completed !== true
          ? `Retomado em ${fmt(currentTime())} · salvo neste dispositivo` : 'Pronto para reproduzir');
      };
      mediaElement.addEventListener('loadedmetadata', restorePlayback);
      mediaElement.addEventListener('loadeddata', () => { if (!restored) restorePlayback(); });
      mediaElement.addEventListener('canplay', () => { if (!restored) restorePlayback(); });
      mediaElement.addEventListener('timeupdate', () => { syncTime(); remember(); });
      mediaElement.addEventListener('durationchange', syncTime);
      mediaElement.addEventListener('seeking', syncTime);
      mediaElement.addEventListener('seeked', () => remember(true));
      mediaElement.addEventListener('ratechange', () => remember(true));
      mediaElement.addEventListener('play', () => { play.textContent = 'Ⅱ'; play.setAttribute('aria-label','Pausar'); cancelAnimationFrame(waveRAF); rafSync(); });
      mediaElement.addEventListener('pause', () => { play.textContent = '▶'; play.setAttribute('aria-label','Reproduzir'); cancelAnimationFrame(waveRAF); syncTime(); remember(true); });
      mediaElement.addEventListener('ended', () => { play.textContent = '▶'; cancelAnimationFrame(waveRAF); syncTime(); remember(true, true); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') remember(true); });
      window.addEventListener('pagehide', () => remember(true), { capture:true });
      mediaElement.addEventListener('error', () => setStatus('Áudio indisponível neste navegador'));
      const resizeWave = () => {
        if (!ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const width = Math.max(50, Math.floor(canvas.getBoundingClientRect().width));
        drawWidth = width; drawHeight = 118;
        canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(drawHeight * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawWave();
      };
      if (typeof ResizeObserver === 'function') new ResizeObserver(resizeWave).observe(canvas);
      else window.addEventListener('resize', resizeWave);
      resizeWave();
      if (!media) {
        setStatus('Aguardando mídia do Soundgasm…');
        play.disabled = true;
        let attempts = 0;
        const retry = setInterval(() => {
          attempts++;
          media = pickMedia();
          if (media) {
            clearInterval(retry);
            mediaElement.src = media;
            play.disabled = false;
            setStatus('Carregando duração…');
          } else if (attempts >= 32) {
            clearInterval(retry);
            setStatus('Não encontrei o arquivo M4A');
          }
        }, 250);
      } else setStatus('Carregando duração…');
      if (navigator.mediaSession) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({ title: cleanName, artist: author, album: subreddit ? `r/${subreddit}` : 'Soundgasm' });
          const actions = {
            play: () => mediaElement.play().catch(() => {}),
            pause: () => mediaElement.pause(),
            seekbackward: (d) => seek(currentTime() - (d.seekOffset || 15)),
            seekforward: (d) => seek(currentTime() + (d.seekOffset || 15)),
            seekto: (d) => seek(d.seekTime),
          };
          for (const [name, handler] of Object.entries(actions)) {
            try { navigator.mediaSession.setActionHandler(name, handler); } catch { /* unsupported action */ }
          }
        } catch { /* optional native media metadata */ }
      }
      const copy = async (text) => {
        try { await navigator.clipboard.writeText(text); return true; }
        catch { return false; }
      };
      element('#gws-sg-native').addEventListener('click', () => {
        mediaElement.pause();
        document.body.classList.remove('gws-sg-enhanced');
        root.remove();
        if (nativeAudio) nativeAudio.muted = false;
      });
      element('#gws-sg-share').addEventListener('click', async () => {
        const ok = await copy(location.href);
        element('#gws-sg-share').textContent = ok ? '✓ Link copiado' : 'Copie a URL do Safari';
      });
      element('#gws-sg-description-copy').addEventListener('click', async () => {
        const ok = await copy(description);
        element('#gws-sg-description-copy').textContent = ok ? '✓ Descrição copiada' : 'Não foi possível copiar';
      });
      // Real waveform uses a bounded, optional decode so 30+ minute recordings
      // do not exhaust iPhone Safari's memory. Never pass compressed bytes as peaks.
      element('#gws-sg-realwave').addEventListener('click', async () => {
        if (peaks.loading || peaks.values) return;
        if (!media) { setStatus('Arquivo não encontrado'); return; }
        if (!duration()) { setStatus('Aguarde a duração carregar'); return; }
        if (duration() > 11 * 60) {
          waveNote.textContent = 'Este áudio é longo demais para decodificar com segurança no iPhone. O seek preciso continua disponível.';
          return;
        }
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) { waveNote.textContent = 'Web Audio não está disponível neste navegador.'; return; }
        peaks.loading = true;
        element('#gws-sg-realwave').textContent = '◒ Analisando…';
        let timeout;
        try {
          const buffer = await new Promise((resolve, reject) => {
            const gm = typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function' ? GM.xmlHttpRequest.bind(GM) : (typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null);
            const LIMIT = 14 * 1024 * 1024;
            if (gm) {
              let xhr;
              try { xhr = gm({ method:'GET', url:media, responseType:'arraybuffer', timeout:30000, onprogress: (e) => { if (e.loaded > LIMIT) { xhr?.abort(); reject(new Error('Arquivo excede 14 MB')); } }, onload: (r) => { const bytes = r.response; if (r.status >= 200 && r.status < 300 && bytes?.byteLength <= LIMIT) resolve(bytes); else reject(new Error('Arquivo indisponível ou muito grande')); }, onerror: () => reject(new Error('Erro ao carregar waveform')), ontimeout:() => reject(new Error('Tempo esgotado')) }); }
              catch (error) { reject(error); }
            } else {
              const controller = new AbortController();
              timeout = setTimeout(() => controller.abort(), 30000);
              fetch(media, { mode:'cors', signal:controller.signal }).then(async (resp) => {
                if (!resp.ok || Number(resp.headers.get('content-length') || 0) > LIMIT) throw new Error('Arquivo indisponível ou muito grande');
                const bytes = await resp.arrayBuffer();
                if (bytes.byteLength > LIMIT) throw new Error('Arquivo excede 14 MB');
                resolve(bytes);
              }).catch(reject);
            }
          });
          const ac = new AudioCtx();
          try {
            const decoded = await ac.decodeAudioData(buffer);
            const samples = decoded.getChannelData(0);
            const bars = Math.min(160, Math.max(40, Math.floor(drawWidth / 3)));
            const stride = Math.max(1, Math.floor(samples.length / (bars * 64)));
            const peaksArray = new Float32Array(bars);
            for (let index = 0; index < bars; index++) {
              const from = Math.floor(index / bars * samples.length);
              const to = Math.floor((index + 1) / bars * samples.length);
              let sum = 0, count = 0;
              for (let sample = from; sample < to; sample += stride) { const amplitude = samples[sample] || 0; sum += amplitude * amplitude; count++; }
              peaksArray[index] = Math.sqrt(sum / Math.max(1, count));
            }
            const max = Math.max(.001, ...peaksArray);
            peaks.values = Array.from(peaksArray, (sample) => Math.max(.045, Math.min(1, sample / max)));
            drawWave();
            waveNote.textContent = 'Waveform real gerada a partir das amostras do áudio. Toque na onda para navegar.';
            element('#gws-sg-realwave').textContent = '✓ Waveform real';
          } finally { await ac.close().catch(() => {}); }
        } catch (error) {
          waveNote.textContent = `Não foi possível analisar a mídia (${error.message}). O player continua com navegação precisa.`;
          element('#gws-sg-realwave').textContent = '◒ Tentar waveform';
        } finally { clearTimeout(timeout); peaks.loading = false; }
      });
      console.info('[GoneWildStudio] Soundgasm enhanced player active', { subreddit, source: Boolean(originalPost), context: Boolean(context) });
    };
    const initializeSoundgasm = () => {
      if (pathParts[0] !== 'u') return;
      if (pathParts.length === 2) {
        const renderProfile = () => fromProfile().catch((error) => console.warn('[GoneWildStudio] Soundgasm profile error', error));
        if (document.querySelector('.sound-details')) renderProfile();
        else {
          const observer = new MutationObserver(() => {
            if (!document.querySelector('.sound-details')) return;
            observer.disconnect();
            renderProfile();
          });
          observer.observe(document.body || document.documentElement, { childList:true, subtree:true });
          setTimeout(() => observer.disconnect(), 6000);
        }
        return;
      }
      if (pathParts.length >= 3) fromScript().catch((error) => console.warn('[GoneWildStudio] Soundgasm error', error));
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeSoundgasm, { once:true });
    else initializeSoundgasm();
  }
}

export default { init: initGoneWild };
