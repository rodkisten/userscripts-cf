// ==UserScript==
// @name         Instagram salvos → XTelegram
// @namespace    https://rod.migos.club/userscripts-cf
// @version      4.0.1
// @updateURL    https://userscripts-cf.kisten.workers.dev/instagram-saved.meta.js
// @downloadURL  https://userscripts-cf.kisten.workers.dev/instagram-saved.user.js
// @description  Vite IIFE; roteamento SPA e storage GM isolado por módulo.
// @match        https://www.instagram.com/*
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @require      https://rod.migos.club/menu/dist/menu.iife.min.js
// @connect      xtelegram-cf.migos.club
// ==/UserScript==

(function installSandbox(factory, key) {
  const instances = (window.__userscriptsCF ||= {});
  const instanceKey = key + ":sandbox";
  if (instances[instanceKey]) return;
  const bridge = {
    async call(operation, { id, key: name, value, fallback }) {
      const storageKey = "userscripts-cf:v1:" + id + ":" + name;
      if (operation === "get") return GM_getValue(storageKey, fallback);
      if (operation === "set") return GM_setValue(storageKey, value);
      if (operation === "delete") return GM_deleteValue(storageKey);
      throw Error("Unsupported storage operation");
    },
  };

  instances[instanceKey] = factory().boot(bridge);
})(function sandboxRuntime() {
  var UserscriptsCF = (function (exports) {
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var NotReadyError = class extends Error {
      constructor(r) {
        const o = Error;
        const t = o.stackTraceLimit;
        if (t !== void 0) o.stackTraceLimit = 0;
        super();
        if (t !== void 0) o.stackTraceLimit = t;
        this.source = r;
      }
    };
    var StatusError = class extends Error {
      constructor(r, o) {
        try {
          var t = String(o instanceof Error ? o.message : o);
        } catch {}
        super(t, { cause: o });
        this.source = r;
      }
    };
    function unwrapStatusError(r) {
      return r instanceof StatusError ? r.cause : r;
    }

    var REACTIVE_MANUAL_WRITE = 1024;

    var REACTIVE_FRAME_READ = 2048;

    var REACTIVE_MISSED_WAKE = 4096;

    var REACTIVE_REASK = 8192;

    var REACTIVE_STAGED_READ = 16384;

    var REACTIVE_PROBED = 32768;

    var REACTIVE_LANE_DIRTY = 65536;

    var REACTIVE_LANE_READ = 1 << 17;

    var REACTIVE_SCREEN_READ = 1 << 18;

    var REACTIVE_PROBE_UNANSWERED = 1 << 19;

    var REACTIVE_WINDOW = 1 << 21;

    var REACTIVE_AHEAD = 1 << 20;

    var REACTIVE_RELEASE_AFTER = 1 << 22;

    var CONFIG_HELD_FRAME = 1 << 20;

    var CONFIG_INPUTS_PUBLISHED = 1024;

    var CONFIG_OVERRIDE = 2048;

    var CONFIG_SLOT_NODE = 4096;

    var CONFIG_MANUAL_WRITE = 1 << 18;

    var CONFIG_STAGED_ERROR = 1 << 21;

    var CONFIG_VERDICT = 32768;

    var CONFIG_PROMOTED = 1 << 22;

    var CONFIG_ASYNC = 1 << 29;
    var NOT_PENDING = {};
    var NO_SNAPSHOT = {};
    var defaultContext = {};

    var $REFRESH = Symbol("refresh");
    var NewSet = Set;

    function markDisposal(e) {
      let n = e.pe;
      while (n) {
        n.R |= 32;
        markDisposal(n);
        n = n.Ge;
      }
    }
    var cleanupError;
    function runCleanup(e) {
      try {
        e();
      } catch (e) {
        cleanupError ||= [e];
        schedule();
      }
    }
    function rethrowCleanupError(e) {
      const n = cleanupError;
      cleanupError = void 0;
      if (n && !e) throw n[0];
    }
    function disposeChildren(e, n = false, r) {
      const t = e.R;
      if (t & 64) return;
      if (n) {
        if (!r && e.T !== null && (e.T.me !== null || e.T.Le !== null)) disposeChildren(e, false, true);
        e.R = t | 64;
        if (e.X) {
          clearInFlight(e);
          if ((e.m & 1 && e.T?.Re != null) || t & 2048 || pendingNodes.length) schedule();
        }
      }
      let l = r ? e.T.me : e.pe;
      if (r) e.T.me = null;
      else e.pe = null;
      while (l) {
        const e = l;
        e.l &= -33;
        deleteFromHeap(e, dirtyQueue);
        clearDeps(e);
        l.Me = l;
        disposeChildren(l, true);
        l = l.Ge;
      }
      if (!r) e.be = 0;
      if (n && !r && !(t & 32) && e._parent !== null && !(e._parent.R & 64)) {
        const n = e.Me;
        const r = e.Ge;
        if (n !== null) n.Ge = r;
        else e._parent.pe = r;
        if (r !== null) r.Me = n;
        e.Me = null;
      }
      runDisposal(e, r);
      if (n && e.ze) {
        const n = e.ze;
        e.ze = void 0;
        runCleanup(n);
      }
    }
    function linkChild(e, n) {
      const r = e.pe;
      n.Me = null;
      n.Ge = r;
      if (r !== null) r.Me = n;
      e.pe = n;
    }
    function runDisposal(e, n) {
      const r = n ? e.T.Le : e.ke;
      if (!r) return;
      if (n) e.T.Le = null;
      else e.ke = null;
      if (Array.isArray(r)) for (let e = r.length - 1; e >= 0; e--) runCleanup(r[e]);
      else runCleanup(r);
    }
    function childId(e, n) {
      let r = e;
      while (r.l & 4 && r._parent) r = r._parent;
      if (r.id != null) return formatId(r.id, n ? r.be++ : r.be);
      throw new Error();
    }

    function getNextChildId(e) {
      return childId(e, true);
    }

    function inheritId(e, n, r) {
      return e?.id ?? (n ? r?.id : r?.id != null ? getNextChildId(r) : void 0);
    }
    function formatId(e, n) {
      const r = n.toString(36),
        t = r.length - 1;
      return e + (t ? String.fromCharCode(64 + t) : "") + r;
    }

    function getObserver() {
      return tracking ? context : null;
    }

    function getOwner() {
      return context;
    }

    function cleanup(e, n = context) {
      if (!n) return e;
      if (!n.ke) n.ke = e;
      else if (Array.isArray(n.ke)) n.ke.push(e);
      else n.ke = [n.ke, e];
      return e;
    }

    function isDisposed(e) {
      return !!(e.R & 64);
    }
    function disposeRootSelf(e = true) {
      disposeChildren(this, e);
      if (cleanupError && !globalQueue.Y) rethrowCleanupError();
    }

    function createOwner(e) {
      const n = context;
      const r = e?.transparent ?? false;
      const t = {
        id: inheritId(e, r, n),
        l: r ? 4 : 0,
        R: 0,
        Qe: true,
        Ke: n?.Qe ? n.Ke : n,
        pe: null,
        Ge: null,
        Me: null,
        ke: null,
        A: n?.A || defaultContext,
        be: 0,
        T: null,
        _parent: n,
        dispose: disposeRootSelf,
      };
      if (n) linkChild(n, t);
      return t;
    }

    function createRoot$1(e, n) {
      const r = createOwner(n);
      return runWithOwner(r, () => e(disposeRootSelf.bind(r, true)));
    }

    function _typeof(o) {
      "@babel/helpers - typeof";
      return (
        (_typeof =
          "function" == typeof Symbol && "symbol" == typeof Symbol.iterator
            ? function (o) {
                return typeof o;
              }
            : function (o) {
                return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype
                  ? "symbol"
                  : typeof o;
              }),
        _typeof(o)
      );
    }

    function toPrimitive(t, r) {
      if ("object" != _typeof(t) || !t) return t;
      var e = t[Symbol.toPrimitive];
      if (void 0 !== e) {
        var i = e.call(t, r || "default");
        if ("object" != _typeof(i)) return i;
        throw new TypeError("@@toPrimitive must return a primitive value.");
      }
      return ("string" === r ? String : Number)(t);
    }

    function toPropertyKey(t) {
      var i = toPrimitive(t, "string");
      return "symbol" == _typeof(i) ? i : i + "";
    }

    function _defineProperty(e, r, t) {
      return (
        (r = toPropertyKey(r)) in e
          ? Object.defineProperty(e, r, {
              value: t,
              enumerable: !0,
              configurable: !0,
              writable: !0,
            })
          : (e[r] = t),
        e
      );
    }

    var laneReadHook = null;
    var laneStageHook = null;
    var laneOutcomeHook = null;
    var laneWriteHook = null;
    var applyGuessesHook = null;
    var laneSeamsHook = null;
    var laneCorrectionsHook = null;
    var endLanesHook = null;
    var lanesBlockedHook = null;

    var laneAdoptHook = null;

    var laneServedHook = null;

    var guessing = false;
    var catchHook = null;
    var freshHook = null;
    var hiddenHook = null;
    var boundarySeamHook = null;
    var heldRunHook = null;

    var storeParkHook = null;
    var storeCommitHook = null;
    function installStoreHooks(e, o) {
      storeParkHook = e;
      storeCommitHook = o;
    }

    var releaseMarksHook = null;
    var releaseAmbientMarksHook = null;
    var observeFlightHook = null;

    var holdWorkHook = null;

    var stageMarkHook = null;
    var keepReadersHook = null;
    var attachHook = null;
    var holdStagingHook = null;

    var wireExternalSourceHook = void 0;
    var externalUntrackHook = void 0;

    var transactions = [];
    function newTransaction(e, o = null) {
      const n = {
        ln: [],
        rn: [[], []],
        fn: [],
        eo: null,
        _parent: o,
        P: e,
        Pe: null,
        tt: 0,
        nt: false,
        nn: null,
        Ue: false,
        un: false,
        I: null,
      };
      if (!e) transactions.push(n);
      return n;
    }

    var passLane = null;
    function setPassLane(e) {
      passLane = e;
    }

    var flushTransaction = null;

    var latestOpened = null;

    var passTx = null;
    function joinPassTx(e, o) {
      if ((globalQueue.Y && !o) || flushTransaction !== null) return joinFuture(e);
      if (passTx === null) passTx = resolveTx(e);
      else merge(resolveTx(e), passTx);
      schedule();
    }

    function txOf(e) {
      return (e.T.Re = resolveTx(e.T.Re));
    }

    function liveTx(e) {
      e = resolveTx(e);
      return transactions.indexOf(e) !== -1 ? e : null;
    }
    function resolveTx(e) {
      while (e.eo !== null) e = e.eo;
      return e;
    }

    function joinFuture(e) {
      if (laneStageHook && e?.P) return;
      const o = flushTransaction;
      if (o === null) flushTransaction = e === null ? newTransaction(false) : resolveTx(e);
      else if (e !== null) merge(resolveTx(e), o);
      if (!globalQueue.Y) schedule();
    }

    function merge(e, o) {
      e = resolveTx(e);
      o = resolveTx(o);
      if (e === o || e.P || o.P) return;
      e.eo = o;
      o.tt += e.tt;
      o.nt ||= e.nt;
      append(o.ln, e.ln);
      append(o.rn[0], e.rn[0]);
      append(o.rn[1], e.rn[1]);
      append(o.fn, e.fn);
      if (e.I !== null) append((o.I ??= []), e.I);
      transactions.splice(transactions.indexOf(e), 1);
    }

    function blocked(e) {
      const o = judge;
      judge ??= e;
      const n = e.tt !== 0 || blockedBy(e.ln, e) || !!lanesBlockedHook?.(e);
      judge = o;
      return n;
    }
    var judge = null;

    function ownSource(e, o) {
      const n = e.T?.se;
      if (n === void 0) return true;
      for (const e of n) {
        const n = e.T?.Re;
        if (n == null || resolveTx(n) === o) return true;
      }
      return false;
    }
    function blockedBy(e, o, n = false) {
      for (let t = 0; t < e.length; t++) {
        const l = e[t];
        if (
          !(l.m & 1) ||
          l.R & 64 ||
          l.l & 8192 ||
          (l.T.Re !== null && txOf(l) !== o) ||
          (n && !ownSource(l, o))
        )
          continue;
        if (l.i === 1) {
          if (!(observeFlightHook && l.l & -2147483648 && !o.P) && onScreen(l, judge ?? o)) return true;
          continue;
        }
        for (let e = l.o; e !== null; e = e.t) {
          const n = e.u;
          if (
            ((n.i === 1 && n.m & 1 && !(observeFlightHook && n.l & -2147483648 && !o.P)) ||
              n.R & 2048 ||
              (n.l & 16384 && n.m === 1)) &&
            (e.Ne === n.de || n.T?.U != null) &&
            !(n.R & 64) &&
            onScreen(n, judge ?? o)
          )
            return true;
        }
      }
      return false;
    }

    function onScreen(e, o) {
      return !(e.R & 32 && removalStagedBy(e, o)) && !hiddenHook?.(e);
    }

    function removalStagedBy(e, o) {
      let n = e;
      while (n?.R & 32) n = n._parent;
      return n?.l & 256 && n.T?.Re != null && txOf(n) === resolveTx(o);
    }

    var heldTrims = [];
    function heldTrim(e) {
      heldTrims.push(e);
    }

    var deferredZombies = [];
    function deferZombie(e) {
      deleteFromHeap(e, dirtyQueue);
      e.R &= -4;
      deferredZombies.push(e);
    }

    function holdNode(e, o) {
      e.l |= 256;
      list(e, o);
    }

    function list(e, o) {
      const n = ext(e);
      if (n.Re === o) return;
      n.Re = o;
      o.ln.push(e);
    }

    function holdFrame(e, o) {
      for (let n = e.pe; n !== null; n = n.Ge) {
        if (n.T?.Re?.P) continue;
        if (n.X !== void 0) {
          if (!(n.l & 256)) holdNode(n, o);
          n.l |= CONFIG_HELD_FRAME;
        }
        holdFrame(n, o);
      }
    }
    var dirtyQueue = {
      et: new Array(2e3).fill(void 0),
      p: false,
      Fe: 0,
      Et: 0,
    };
    var clock = 0;
    var scheduled = false;
    var halted = false;
    var haltNotified = false;
    var syncDepth = 0;

    var actionDepth = 0;

    var question = 0;
    function setQuestion(e) {
      question = e;
    }
    function schedule() {
      if (halted) {
        notifyHalted();
        return;
      }
      if (scheduled) return;
      scheduled = true;
      if (!syncDepth && !globalQueue.Y) queueMicrotask(flush);
    }

    var ROOT_ERROR_HOOK = Symbol.for("solid-js/root-error-hook");
    var HALTED = "[REACTIVITY_HALTED]";
    function haltReactivity(e) {
      if (halted) return;
      halted = true;
      rethrowCleanupError(true);
      let o = HALTED;
      const n = e !== void 0 && globalThis.reportError;
      n || e === void 0 ? console.error(o) : console.error(o, e);
      n && n(e);
    }
    function notifyHalted() {
      if (haltNotified) return;
      haltNotified = true;
      console.error(HALTED);
    }
    var GlobalQueue = class GlobalQueue {
      constructor() {
        _defineProperty(this, "rn", [[], []]);
        _defineProperty(this, "Y", false);
      }
      flush() {
        if (this.Y) return;
        this.Y = true;
        resyncUnflushedCompanions();
        passLane = null;
        passTx = null;
        try {
          sweepDormant();
          runHeap(dirtyQueue, GlobalQueue._e);
          this.settle();
          clock++;
          scheduled = dirtyQueue.Et >= dirtyQueue.Fe || pendingNodes.length !== 0;
          this.run(1);
          this.run(2);
        } finally {
          this.Y = false;
          passTx = null;
        }
      }

      settle() {
        if (laneCorrectionsHook?.()) runHeap(dirtyQueue, GlobalQueue._e);
        const e = flushTransaction;
        flushTransaction = latestOpened = null;
        applyGuessesHook?.(e);
        const o = e !== null && !e.P ? resolveTx(e) : null;
        if (o !== null) {
          const e = pendingNodes.length;
          for (let n = 0; n < e; n++) {
            const e = pendingNodes[n];
            if (!(e.l & 2304) && (e.T === null || e.T.Re === null || !e.T.Re.P)) {
              if (e.ue === NOT_PENDING && e.m & 4 && e.i !== 1) continue;
              if (
                e.ue !== NOT_PENDING &&
                !(e.m & 5) &&
                e.T?.me == null &&
                e.T?.Le == null &&
                isSame(e, e.le, e.ue)
              ) {
                e.ue = NOT_PENDING;
                e.l &= -129;
                continue;
              }
              holdNode(e, o);
            }
            if (e.l & 128) holdFrame(e, o);
          }
          pendingNodes.length = 0;
          storeParkHook?.(o);
          const n = deferredZombies.splice(0);
          if (observeFlightHook) {
            n.sort((e, o) => e.he - o.he);
            for (let e = 0; e < n.length; e++) if ((n[e].R & 96) === 32 && n[e].l & 32768) recompute(n[e]);
          }
        } else {
          commitPendingNodes();
          for (let e = 0; e < heldTrims.length; e++) {
            const o = heldTrims[e];
            if (o.T?.U == null && !o.Ae) trimStaleDeps(o);
          }
        }
        if (heldTrims.length) heldTrims.length = 0;
        const n = this.rn;
        let t = null;
        if (laneSeamsHook) {
          this.rn = t = [[], []];
          laneSeamsHook(o);
          if (stagedReaders.length) stagedReaders.length = 0;
        }
        this.rn = [[], []];
        for (let e = transactions.length - 1; e >= 0; e--) {
          const o = transactions[e];
          if (blocked(o)) continue;
          transactions.splice(e, 1);
          endLanesHook?.(o);
          land(o);
          e = transactions.length;
        }
        storeCommitHook?.();
        const l = o && liveTx(o);
        releaseAmbientMarksHook?.(l);
        const s = l !== null;
        for (let e = 0; e < 2; e++) {
          if (s) append(l.rn[e], n[e]);
          this.rn[e] =
            s || t?.[e].length || this.rn[e].length
              ? (t ? t[e] : []).concat(s ? [] : n[e], this.rn[e])
              : n[e];
        }
        if (deferredZombies.length !== 0) {
          const e = deferredZombies.splice(0).sort((e, o) => e.he - o.he);
          for (let o = 0; o < e.length; o++) if (!(e[o].R & 64)) recompute(e[o]);
        }
        boundarySeamHook?.();
      }
      run(e) {
        const o = this.rn[e - 1];
        if (o.length) {
          this.rn[e - 1] = [];
          runQueue(o, e);
        }
      }
      enqueue(e, o, n = passLane) {
        if (e) (n?.P ? n : this).rn[e - 1].push(o);
        schedule();
      }

      notify(e, o, n, t) {
        if (catchHook?.(e, n & o, t)) return true;
        if (o & 1) {
          if (n & 1) {
            if (passLane === null) joinFuture(null);
          }
          return true;
        }
        return false;
      }
    };

    function reruns(e) {
      let o;
      for (let n = 0; n < e.fn.length; n++) {
        const t = e.fn[n];
        const l = t.T?.U?.source;
        if (t.R & 64 || (t.m & 2 && (t.i || !(t.l & 8388608)) && l !== t && (l?.m ?? 2) & 2)) continue;
        if (t.R & 2048 || (observeFlightHook && t.l & 32768)) {
          o ||= t.i || l === t || t.l & 256;
          if (!e.P) t.R &= ~REACTIVE_FRAME_READ;
          t.Ae = false;
          for (let e = t.pe; e !== null; e = e.Ge) if (e.i) e.Ae = false;
          if (!laneAdoptHook?.(t)) enqueueSub(t);
        }
      }
      e.fn.length = 0;
      return o;
    }
    function land(e) {
      const o = reruns(e);
      if (releaseMarksHook && e.I !== null) releaseMarksHook(e.I);
      for (let o = 0; o < e.ln.length; o++) {
        const n = e.ln[o];
        if (n.T.Re === null || txOf(n) !== e) continue;
        n.T.Re = null;
        commitPendingNode(n);
      }
      if (flushTransaction === e) flushTransaction = null;
      if (o) globalQueue.rn[1].push(() => releaseQueues(e));
      else releaseQueues(e);
    }

    function releaseQueues(e) {
      for (let o = 0; o < 2; o++) {
        append(globalQueue.rn[o], e.rn[o]);
        e.rn[o] = [];
      }
    }
    function append(e, o) {
      for (let n = 0; n < o.length; n++) e.push(o[n]);
    }
    var pendingNodes = [];

    var stagedReaders = [];

    function staleReader(e, o) {
      if (!(e.R & 2048)) {
        e.R |= REACTIVE_FRAME_READ;
        o.fn.push(e);
      }
    }
    function queuePendingNode(e) {
      pendingNodes.push(e);
      if (!globalQueue.Y) markUnflushedStaged();
    }

    var notifyEpoch = 0;
    function bumpNotifyEpoch() {
      notifyEpoch++;
    }
    function insertSubs(e) {
      e.we = notifyEpoch;
      const n = (e.l & 512) !== 0 && e.T?.De !== void 0;
      for (let o = e.o; o !== null; o = o.t) {
        const e = o.u;
        if (e.R & 4 && o.Ne === e.de && o !== e._) e.R |= REACTIVE_MISSED_WAKE;
        if (n && e.l & 8) {
          e.R |= 256;
          continue;
        }
        enqueueSub(e);
      }
    }

    function laneDirty(e, o) {
      insertSubs(e);
      for (let n = e.o; n !== null; n = n.t) {
        const t = n.u;
        let l = t.T?.Re;
        if (
          l &&
          !t.i &&
          (t.l & 2304) === 256 &&
          (t.m & 5) === 1 &&
          (resolveTx(l) === resolveTx(o._parent) || [...(t.T.se ?? [t])].every((e) => e.T.Ve))
        )
          list(t, (l = o));
        if (t.i === 1 && e.l & 32768) ((t.l |= CONFIG_VERDICT), (t.R &= ~REACTIVE_LANE_DIRTY));
        if (l?.P ? sameLane(l, o) : t.i) t.R |= REACTIVE_LANE_DIRTY;
      }
    }
    function queueEffectRun(e) {
      e.Ae = true;
      globalQueue.enqueue(e.i, (e.W ??= GlobalQueue.q.bind(null, e)));
    }
    function sameLane(e, o) {
      return e === o || (e.nn !== null && e.nn === o.nn);
    }
    function applyStaged(e) {
      return e.ue !== NOT_PENDING && ((e.le = e.ue), (e.ue = NOT_PENDING));
    }
    function commitPendingNode(e) {
      const o = e;
      if (!o.X) {
        e.l &= -385;
        applyStaged(e);
        return;
      }
      const n = e.ue === NOT_PENDING && (o.m & 1) !== 0;
      const t = e.l & CONFIG_STAGED_ERROR;
      if (!n && o.T) o.T.Te = null;
      e.l = n ? (e.l & -1048833) | CONFIG_INPUTS_PUBLISHED : e.l & -3147137;
      if (t) {
        const n = e.ue;
        e.ue = NOT_PENDING;
        e.ie = clock + 1;
        notifyStatus(o, 2, n);
      } else if (applyStaged(e)) {
        o.m &= -5;
        if (o.T != null) ((o.T.Ve = false), (o.T.je = NOT_PENDING));
        if (e.i && e.i !== 3) queueEffectRun(e);
      }
      o.Ie = false;
      o.R &= ~REACTIVE_MANUAL_WRITE;
      if (o.T?.U == null) trimStaleDeps(o);
      if (!(o.m & 1)) o.m &= -5;
      if (!n && o.T != null && (o.T.me !== null || o.T.Le !== null)) GlobalQueue.Ce(o, false, true);
    }
    function commitPendingNodes() {
      for (let e = 0; e < pendingNodes.length; e++) {
        const o = pendingNodes[e];
        if (!(o.l & 2304)) commitPendingNode(o);
      }
      pendingNodes.length = 0;
    }
    var globalQueue = new GlobalQueue();
    function flush(e) {
      if (actionDepth > 0) return e ? e() : void 0;
      if (e) {
        syncDepth++;
        try {
          return e();
        } finally {
          try {
            flush();
          } finally {
            syncDepth--;
          }
        }
      }
      if (globalQueue.Y) return;
      if (halted) return;
      while (scheduled) globalQueue.flush();
      rethrowCleanupError();
    }
    function runQueue(e, o) {
      for (let n = 0; n < e.length; n++) e[n](o);
    }

    function enqueueSub(e) {
      if (dirtyQueue.Fe > e.he) dirtyQueue.Fe = e.he;
      insertIntoHeap(e, dirtyQueue);
    }
    function actualInsertIntoHeap(e, t) {
      const E = (e._parent?.Qe ? e._parent.Ke?.he : e._parent?.he) ?? -1;
      if (E >= e.he) e.he = E + 1;
      const n = e.he;
      const I = t.et[n];
      if (I === void 0) t.et[n] = e;
      else {
        const t = I.We;
        t.ve = e;
        e.We = t;
        I.We = e;
      }
      if (n > t.Et) t.Et = n;
    }
    function insertIntoHeap(e, t) {
      let E = e.R;
      if (E & 12) return;
      if (E & 1) e.R = (E & -4) | 10;
      else {
        e.R = E | 8;
        if (t.p) markNode(e);
      }
      if (!(E & 16)) actualInsertIntoHeap(e, t);
    }
    function insertIntoHeapHeight(e, t) {
      let E = e.R;
      if (E & 28) return;
      e.R = E | 16;
      actualInsertIntoHeap(e, t);
    }
    function deleteFromHeap(e, t) {
      const E = e.R;
      if (!(E & 24)) return;
      e.R = E & -25;
      const n = e.he;
      if (e.We === e) t.et[n] = void 0;
      else {
        const E = e.ve;
        const I = t.et[n];
        const i = E ?? I;
        if (e === I) t.et[n] = E;
        else e.We.ve = E;
        i.We = e.We;
      }
      e.We = e;
      e.ve = void 0;
    }
    function markHeap(e) {
      if (e.p) return;
      e.p = true;
      for (let t = 0; t <= e.Et; t++) for (let E = e.et[t]; E !== void 0; E = E.ve) if (E.R & 8) markNode(E);
    }
    function markNode(e, t = 2) {
      const E = e.R;
      if ((E & 3) >= t) return;
      e.R = (E & -4) | t;
      for (let t = e.o; t !== null; t = t.t) markNode(t.u, 1);
    }
    function runHeap(e, t) {
      e.p = false;
      for (e.Fe = 0; e.Fe <= e.Et; e.Fe++) {
        let E = e.et[e.Fe];
        while (E !== void 0) {
          if (E.R & 8) t(E);
          else adjustHeight(E, e);
          E = e.et[e.Fe];
        }
      }
      e.Et = 0;
    }
    function adjustHeight(e, t) {
      deleteFromHeap(e, t);
      let E = e.he;
      for (let t = e.C; t; t = t.G) {
        const e = t.S;
        if (e.X && e.he >= E) E = e.he + 1;
      }
      if (e.he !== E) {
        e.he = E;
        for (let E = e.o; E !== null; E = E.t) insertIntoHeapHeight(E.u, t);
      }
    }

    var slotUnobservedHook;
    function setSlotUnobserved(e) {
      slotUnobservedHook = e;
    }
    function unlinkSubs(e) {
      const n = e.S;
      const l = e.G;
      const o = e.t;
      const s = e.en;
      if (o !== null) o.en = s;
      else n.Ze = s;
      if (s !== null) s.t = o;
      else {
        n.o = o;
        if (o === null) {
          if (n.l & 4096) slotUnobservedHook(n);
          else if (n.T?.Ye) runCleanup(n.T.Ye);
          const e = n;
          e.X &&
            e.l & 32 &&
            !(e.R & 32) &&
            !(e.m & 1) &&
            (deferredReleases$1 ? deferredReleases$1.push(e) : unobserved(e));
        }
      }
      return l;
    }
    function trimStaleDeps(e) {
      const n = e._;
      let l = n !== null ? n.G : e.C;
      if (l !== null) {
        do l = unlinkSubs(l);
        while (l !== null);
        if (n !== null) n.G = null;
        else e.C = null;
      }
    }
    function clearDeps(e) {
      if (e.C) {
        e._ = null;
        trimStaleDeps(e);
      }
    }

    var deferredReleases$1 = null;
    var deferReleases = (e) => (deferredReleases$1 = e);
    function unobserved(e) {
      deleteFromHeap(e, dirtyQueue);
      clearDeps(e);
      disposeChildren(e, true);
    }

    var dormantNodes = new NewSet();
    function sweepDormant() {
      if (dormantNodes.size === 0) return;
      for (const e of dormantNodes) if (!e.o && e.l & 32 && !(e.m & 1) && !(e.R & 96)) unobserved(e);
      dormantNodes.clear();
    }
    function link(e, n) {
      const l = n._;
      if (l !== null && l.S === e) return;
      let o = null;
      const s = n.R & 4;
      if (s) {
        o = l !== null ? l.G : n.C;
        if (o !== null && o.S === e) {
          o.Ne = n.de;
          n._ = o;
          return;
        }
      }
      const t = e.Ze;
      if (t !== null && t.u === n && (!s || t.Ne === n.de)) return;
      const r =
        (n._ =
        e.Ze =
          {
            S: e,
            u: n,
            G: o,
            en: t,
            t: null,
            Ne: n.de,
          });
      if (l !== null) l.G = r;
      else n.C = r;
      if (t !== null) t.t = r;
      else e.o = r;
      bumpNotifyEpoch();
    }

    function addPendingSource(e, n) {
      if (e.T?.se?.has(n)) return false;
      (ext(e).se ??= new NewSet()).add(n);
      return true;
    }
    function removePendingSource(e, n) {
      const t = e.T?.se;
      if (!t?.delete(n)) return false;
      if (!t.size) e.T.se = void 0;
      return true;
    }
    function clearInFlight(e) {
      if (e.T !== null) e.T.Ee = null;
    }
    function clearPendingSources(e) {
      if (e.T !== null) e.T.se = void 0;
    }
    function retryReaches(e, n) {
      for (let t = e.C; t; t = t.G) {
        const e = t.S;
        if (e === n || e.T?.se?.has(n)) return true;
      }
      return false;
    }

    function parkLoadingWindow(e, n) {
      ext(e).fe = true;
      if (n.source) addPendingSource(e, n.source);
      if (!(e.m & 2)) setPendingError(e, n.source, n);
    }
    function setPendingError(e, n, t) {
      if (!n) {
        if (e.T !== null) e.T.U = null;
        return;
      }
      const r = t instanceof NotReadyError && t.source === n ? t : e.T?.U;
      ext(e).U = r instanceof NotReadyError && r.source === n ? r : new NotReadyError(n);
    }
    function forEachDependent(e, n) {
      for (let t = e.o; t !== null; t = t.t) n(t.u, t);
    }

    function walkDependents(e, n) {
      const t = new NewSet();
      const visit = (e) => {
        const r = t.has(e);
        if (n(e, r) !== false && !r) {
          t.add(e);
          forEachDependent(e, visit);
        }
      };
      forEachDependent(e, visit);
    }
    function releaseIfSettledUnobserved(e) {
      if (e.X && e.l & 32 && !e.o && !(e.R & 32) && !(e.m & 1))
        e.R & 8 ? (e.R |= REACTIVE_RELEASE_AFTER) : unobserved(e);
    }
    function releaseSettledDependents(e) {
      let n;
      walkDependents(e, (e, t) => {
        if (!t && !e.o && e.l & 32) (n ??= []).push(e);
      });
      if (n) for (const e of n) releaseIfSettledUnobserved(e);
    }

    function stageError(e, n, t) {
      if (!(e.l & 256 || (t && e.R & 16384 && globalQueue.Y && !e.rr)) || passLane) return false;
      clearPendingSources(e);
      if (e.T) e.T.fe = false;
      if (!((e.m &= 6) & 2)) setPendingError(e);
      e.ue = n instanceof StatusError ? n : new StatusError(e, n);
      e.l |= 128 | CONFIG_STAGED_ERROR;
      settlePendingSource(e);
      schedule();
      return true;
    }
    function settleErroredDependents(e, n) {
      let t = false;
      walkDependents(e, (e, r) => {
        if (!r && e.T?.U === n) {
          enqueueSub(e);
          t = true;
        }
      });
      if (t) schedule();
    }
    function settlePendingSource(e, n = e) {
      removePendingSource(e, n);
      let t = false;
      let r;
      walkDependents(e, (o, s) => {
        if (s || (n !== e && retryReaches(o, n)) || !removePendingSource(o, n)) return false;
        o.ie = clock;
        const i = o.T?.se?.values().next().value;
        const f = o.m & 2;
        if (i) {
          if (!f) setPendingError(o, i);
        } else {
          o.m &= -2;
          if (!f) setPendingError(o);
          if (o.l & 256) joinFuture(txOf(o));
          if (o.T?.fe) {
            enqueueSub(o);
            t = true;
          } else if (storeParkHook) o.rr?.st();
          if (o.T !== null) o.T.fe = false;
          if (!o.o && o.l & 32) (r ??= []).push(o);
          stageMarkHook?.(o, e);
        }
      });
      if (r) for (const e of r) releaseIfSettledUnobserved(e);
      if (t) schedule();
    }
    function isThenable(e) {
      return e != null && typeof e === "object" && typeof e.then === "function";
    }
    function releaseFlightTeardown(e) {
      const n = e.T?.Se;
      if (n != null) {
        e.T.Se = null;
        n();
      }
    }
    function handleAsync(e, n, t, r) {
      let o = false;
      let s = false;
      if (typeof n === "object" && n !== null)
        untrack(() => {
          o = n[Symbol.asyncIterator];
          s = !o && isThenable(n);
        });
      if (!s && !o) {
        if (e.T !== null) {
          e.T.Ee = null;
          if (holdWorkHook) e.l &= ~CONFIG_ASYNC;
        }
        e.Ie = false;
        return n;
      }
      ext(e).Ee = n;
      if (holdWorkHook && !(e.R & 2097152)) e.l |= CONFIG_ASYNC;
      e.T.ce = question || 2147483647;
      e.T.se = void 0;
      let i;
      const handleError = (t) => {
        if (e.T?.Ee !== n) return;
        let o = t instanceof NotReadyError;
        if (o && e.Ie) {
          clearInFlight(e);
          parkLoadingWindow(e, t);
          e.ie = clock;
          return;
        }
        if (o || !stageError(e, t)) {
          notifyStatus(e, o ? 1 : 2, t);
          if (!o) disposeChildren(e, false, true);
        }
        if (o) settlePendingSource(e);
        e.ie = clock;
        if (!o) releaseSettledDependents(e);
        r?.(t, o);
      };
      const asyncWrite = (r, o) => {
        if (e.T?.Ee !== n) return;
        if (e.R & 2 && !(holdWorkHook && e.m & 4)) return;
        const s = holdWorkHook && pendingNodes.some((e) => e.ue !== NOT_PENDING);
        const i = e.m & 4;
        landStatus(e);
        if (t) {
          try {
            t(r);
          } catch (e) {
            handleError(e);
            return;
          }
          if (!(e.l & 256)) {
            e.T.Te = null;
            e.l &= ~CONFIG_INPUTS_PUBLISHED;
          }
          if (i) landStatus(e, true);
        } else setSignal(e, () => r);
        if (e.ue === NOT_PENDING) {
          e.Ie = false;
          trimStaleDeps(e);
        }
        settlePendingSource(e);
        schedule();
        if (o || !s) flush();
        o?.();
      };
      const settleAutodispose = () => {
        if (e.l & 32 && !e.o && !(e.m & 1)) {
          unobserved(e);
          return true;
        }
        return false;
      };
      const consumeIterator = (t, r) => {
        const o = t[Symbol.asyncIterator]();
        let s = false;
        let f = false;
        let u = !r;
        const close = () => {
          if (f) return;
          f = true;
          try {
            const e = o.return?.();
            if (isThenable(e)) e.then(void 0, () => {});
          } catch {}
        };
        cleanup(close, r);
        ext(e).Se = close;
        const iterateOrRelease = () => {
          try {
            if (!settleAutodispose()) iterate();
          } catch (e) {
            handleError(e);
          }
        };
        const iterate = () => {
          let t,
            r,
            l = false,
            a = false,
            E = true;
          const S = o.next();
          (isThenable(S) ? S : { then: (e) => void e(S) }).then(
            (r) => {
              if (E && u) {
                t = r;
                l = true;
                if (r.done) f = true;
              } else if (e.T?.Ee !== n) return;
              else if (!r.done) {
                s = true;
                asyncWrite(r.value, iterateOrRelease);
              } else {
                f = true;
                if (s) {
                  schedule();
                  flush();
                } else asyncWrite(void 0);
                settleAutodispose();
              }
            },
            (t) => {
              if (E && u) {
                r = t;
                a = true;
              } else if (e.T?.Ee === n) {
                f = true;
                handleError(t);
                settleAutodispose();
              }
            },
          );
          E = false;
          if (a) {
            f = true;
            handleError(r);
            if (u) throw r;
            return true;
          }
          if (l && !t.done) {
            i = t.value;
            s = true;
            return iterate();
          }
          return l && t.done;
        };
        const l = iterate();
        u = false;
        return s || l;
      };
      let f = null;
      const flattenIfIterable = (e, n) => {
        let t = false;
        if (typeof e === "object" && e !== null)
          untrack(() => {
            t = e[Symbol.asyncIterator];
          });
        if (!t) return false;
        i = void 0;
        const r = consumeIterator(e, n);
        if (!n) f = r;
        return true;
      };
      if (s) {
        let t = false,
          r = false,
          o,
          s = true;
        n.then(
          (r) => {
            if (s) {
              i = r;
              t = true;
            } else {
              try {
                if (e.T?.Ee === n && !(e.R & 64) && flattenIfIterable(r, e)) return;
                asyncWrite(r);
              } catch (e) {
                handleError(e);
              }
              settleAutodispose();
            }
          },
          (e) => {
            if (s) {
              o = e;
              r = true;
            } else {
              handleError(e);
              settleAutodispose();
            }
          },
        );
        s = false;
        if (r) {
          handleError(o);
          throw o;
        } else if (!t) f = false;
        else if (!flattenIfIterable(i)) e.Ie = false;
      }
      if (o) flattenIfIterable(n);
      if (f !== null) {
        if (!f) {
          if (e.Ie) return e.le;
          throw new NotReadyError(context);
        }
        e.Ie = false;
      }
      return i;
    }
    function clearStatus(e, n = false) {
      if (e.T?.se) clearPendingSources(e);
      if (e.T?.fe) e.T.fe = false;
      e.m = n ? 0 : e.m & 4;
      if (e.T?.U) setPendingError(e);
      const t = statusNotifierOf(e);
      if (t) t.call(e);
    }

    function landStatus(e, n = false) {
      const t = e.T?.se;
      if (t && (t.delete(e), t.size)) {
        e.T.fe = false;
        if (n) e.m = 1;
        setPendingError(e, t.values().next().value);
      } else clearStatus(e, n);
    }
    function notifyStatus(e, n, t) {
      if (n === 2 && !(t instanceof StatusError) && !(t instanceof NotReadyError)) t = new StatusError(e, t);
      const r = n === 1 && t instanceof NotReadyError && t.source;
      if (r) {
        if (e.m & 2) e.T.Te = e.T.U;
        addPendingSource(e, r);
      } else clearPendingSources(e);
      e.m = n | (n === 2 ? (e.m & 12 ? 8 : 0) : n === 1 && e.m & 8 ? 4 : e.m & 4);
      if (r) setPendingError(e, r, t);
      else ext(e).U = t;
      if (guessing && n === 1 && e.l & 8192) {
        if (passLane === null) joinFuture(e.R & 8192 ? null : txOf(e)._parent);
        return;
      }
      const o = statusNotifierOf(e);
      if (o) {
        o.call(e);
        return;
      }
      propagateStatus(e, n, t);
    }

    function propagateStatus(e, n, t) {
      const r = n === 1 && t instanceof NotReadyError && t.source;
      forEachDependent(e, (o, s) => {
        o.ie = clock;
        if (
          o.l & 16384 ||
          (holdWorkHook && (o.l & 32768 || (r && o.l & 2097152)) && !(r && holdWorkHook(o, e))) ||
          (n === 1 && s.Ne !== o.de)
        ) {
          if (n !== 1) removePendingSource(o, e);
          enqueueSub(o);
          schedule();
          return;
        }
        if (r && o.T?.se?.has(r)) {
          if (passLane === null && (o.l & 2304) === 256 && globalQueue.Y && !freshHook?.(o, r.ie === clock))
            joinFuture(txOf(o));
          return;
        }
        if (r || (n !== 1 && (o.T?.U !== t || o.T?.se))) {
          if (laneStageHook && passLane !== null) laneStageHook(o, passLane, true, e);
          else {
            queuePendingNode(o);
            if (n === 1 && (o.l & 2304) === 256 && !o.i) joinFuture(txOf(o));
          }
          notifyStatus(o, n, t);
          o.rr?.st(n, t);
        }
      });
    }

    GlobalQueue._e = (e) => {
      if (e.i === 3) {
        deleteFromHeap(e, dirtyQueue);
        e.Ae = true;
        globalQueue.enqueue(2, e.Z);
      } else if (e.R & 32 && !(e.R & 65536)) deferZombie(e);
      else if (laneStageHook && e.R & 32 && laneFrameMember(e)) {
        deleteFromHeap(e, dirtyQueue);
        e.R &= -65540;
      } else recompute(e);
    };

    function laneFrameMember(e) {
      let t = e._parent;
      while (t.R & 32) t = t._parent;
      return (t.l & 10240) === 2048 || (t.i && t.T?.Re?.P);
    }
    GlobalQueue.Ce = disposeChildren;
    var tracking = false;
    var context = null;
    var snapshotCaptureActive = false;

    var laneRoot;
    var snapshotSources = null;
    function ownerInSnapshotScope(e) {
      while (e) {
        if (e.Oe) return true;
        e = e._parent;
      }
      return false;
    }
    function recompute(e, t = false) {
      bumpNotifyEpoch();
      const n = e.i;
      let o;
      let E = NOT_PENDING;
      const s = passLane;
      const i = laneRoot;
      const l = laneStageHook && (laneRoot = t && (s || i));
      if (laneStageHook)
        setPassLane(
          (e.R & 65536 || (e.l & 10240) === 2048) && e.T?.Re?.P
            ? e.T.Re
            : t && s?._parent.Pe != s && creatorPass(context)?.R & 4
              ? s
              : null,
        );
      const r = e.l & CONFIG_STAGED_ERROR;
      if (!t) {
        deleteFromHeap(e, dirtyQueue);
        if (laneStageHook && !n && (e.m & 1 || (e.l & 536871168) === 536871168)) e.l &= ~CONFIG_VERDICT;
        if (e.T !== null) {
          const t = laneStageHook && e.T.He;
          if (t && t !== e.T.Ee) e.T.He = void 0;
          e.T.Ee = null;
          releaseFlightTeardown(e);
        }
        if (e.l & 256) {
          const t = txOf(e);
          if (t.P || e.l & 524288);
          else if (!(e.l & 8421376) || (observeFlightHook && !(e.l & (1 << 23)) && bornInto(e, t)))
            joinPassTx(t, freshHook?.(e, e.m & 4));
          else if (t !== flushTransaction && !(e.m & 4 || e.l & 1048576)) {
            if ((E = e.ue) !== NOT_PENDING) insertSubs(e);
            e.ue = NOT_PENDING;
            e.l &= -257;
          }
        }
        if (n === 3 || e.l & 128) {
          const t = deferredReleases$1;
          deferReleases((o = []));
          disposeChildren(e);
          deferReleases(t);
        } else if (e.pe !== null || e.ke !== null) parkChildren(e);
        if (e.l & 2097152) {
          e.ue = NOT_PENDING;
          e.l ^= CONFIG_STAGED_ERROR;
        }
      }
      const a = e.m & 4;
      const I = e.m & 2 && e.T?.U;
      const u = (e.m & 1) !== 0 && e.T?.se;
      const N = e.T?.se?.has(e);
      let T = false;
      const f =
        (e.R & 8192) !== 0 && !((e.m & 1 || (guessing && e.ue !== NOT_PENDING)) && e.T !== null && !e.T.Ve);
      const S = context;
      context = e;
      e._ = null;
      e.de++;
      const c = e.R & REACTIVE_RELEASE_AFTER;
      e.R = 4 | (e.R & (32 | REACTIVE_REASK));
      e.ie = clock;
      let A = e.ue !== NOT_PENDING ? e.ue : e.l & 2048 && e.T.P !== NOT_PENDING ? e.T.P : e.le;
      let R = e.he;
      let C = false;
      let O = false;
      let d = tracking;
      tracking = true;
      try {
        if (e.l & 64) {
          A = e.X(A);
          if (e.T !== null) e.T.Ee = null;
          e.Ie = false;
        } else {
          const t = e.T?.Ee;
          const n = e.X(A);
          const o = typeof n === "object" && n !== null;
          const E = e.T?.Ee !== t;
          A = E || !o ? n : handleAsync(e, n);
          if (!E && !o) {
            if (e.T !== null) {
              e.T.Ee = null;
              if (holdWorkHook) e.l &= ~CONFIG_ASYNC;
            }
            e.Ie = false;
          }
        }
        if (e.m !== 0 || e.T !== null) clearStatus(e, t);
      } catch (t) {
        const n = t instanceof NotReadyError;
        if (holdWorkHook && (!n || e.Ie)) e.l &= ~CONFIG_ASYNC;
        if (n && e.Ie) parkLoadingWindow(e, t);
        else {
          if (n || !(T = stageError(e, t, true))) {
            if (n) ext(e).fe = true;
            notifyStatus(e, n ? 1 : 2, t);
            if (n && N && !e.T?.Ee) settlePendingSource(e);
          }
          if ((n || T) && u) {
            for (const t of u)
              if (t !== e && !(e.T?.se?.has(t) && (t.m & 1 || retryReaches(e, t)))) settlePendingSource(e, t);
          }
        }
      } finally {
        tracking = d;
        if (laneStageHook) laneRoot = i;
        C = (e.R & REACTIVE_MISSED_WAKE) !== 0;
        O = !!(e.R & (l ? (s || n || !(e.m & 1) ? 128 | REACTIVE_STAGED_READ : 0) : 128));
        if (observeFlightHook)
          e.l =
            (e.l & 1073709055) |
            (e.R & REACTIVE_PROBED) |
            ((e.R & REACTIVE_WINDOW) << 9) |
            ((e.R & REACTIVE_AHEAD) << 11);
        e.R =
          (e.R &
            (96 |
              REACTIVE_FRAME_READ |
              REACTIVE_STAGED_READ |
              REACTIVE_LANE_READ |
              REACTIVE_SCREEN_READ |
              REACTIVE_PROBE_UNANSWERED)) |
          (t ? e.R & 256 : 0);
        context = S;
        if (o) for (const e of o) releaseIfSettledUnobserved(e);
        if (e.T !== null) e.T.Ve = f && (e.m & 1) !== 0;
      }
      if (e.R & 64) {
        clearDeps(e);
        clearInFlight(e);
        if (laneStageHook) setPassLane(s);
        return;
      }
      let D = !laneStageHook ? null : passLane;
      const p = !!e.T?.U || T;
      if (laneStageHook && D !== null) {
        if (laneStageHook(e, D, t, p)) setPassLane(D);
        else D = null;
      }
      if (!p) {
        const o = e.ue === NOT_PENDING;
        const E = !o ? e.ue : e.l & 2048 && e.T.P !== NOT_PENDING ? e.T.P : e.le;
        const s = (o && a && !n) || !!e.T?.Te || !!r || !isSame(e, E, A);
        if (n && s && !(e.R & 262144 && !e.Ae && Object.is(e.ge, A)) && o) {
          e.Ae = !e.T?.U;
          if (!t) globalQueue.enqueue(n, (e.W ??= GlobalQueue.q.bind(null, e)), D);
        }
        if (laneOutcomeHook && !t && D === null && e.l & 8192 && laneOutcomeHook(e, A, p));
        else if (p);
        else if (s) {
          if (D !== null) {
            if (n && e.ue === NOT_PENDING) e.le = A;
            else if (n || D.Ue) e.ue = A;
            else e.T.P = A;
          } else if (
            t
              ? !((flushTransaction !== null || passTx !== null) && (O || creatorPass(S)?.R & 128))
              : n && e.ue === NOT_PENDING
          )
            e.le = A;
          else {
            e.ue = A;
            if (I) e.T.Te = I;
            if (t) {
              holdNode(e, flushTransaction ?? passTx);
              e.m |= 4;
              freshHook?.(e, !l && flushTransaction);
            }
          }
          if (e.o !== null) D !== null ? laneDirty(e, D) : insertSubs(e);
        } else if (e.he != R) for (let t = e.o; t !== null; t = t.t) insertIntoHeapHeight(t.u, dirtyQueue);
        if (!s && !e.T?.U) {
          if (I) settleErroredDependents(e, I);
          if (u) {
            for (const t of u) if (t !== e) settlePendingSource(e, t);
          }
        }
        if (N && !(e.m & 5)) settlePendingSource(e);
      }
      if (t && D === null && O && e.m & 1) {
        const t = flushTransaction ?? passTx;
        t && !t.P && ((n && freshHook?.(e) === 2) || holdNode(e, t));
      }
      if (!e.T?.U && e.ue === NOT_PENDING && !(n && e.Ae)) {
        if (t || n === 3) trimStaleDeps(e);
        else heldTrim(e);
      }
      if (
        e.ue !== NOT_PENDING ||
        (e.T !== null && (e.T.me !== null || e.T.Le !== null)) ||
        ((e.m & 5) !== 0 && (!t || (e.m & 1) !== 0))
      ) {
        e.l |= 128;
        if (D === null) queuePendingNode(e);
      }
      if (laneStageHook) setPassLane(s);
      if (C) {
        enqueueSub(e);
        schedule();
      }
      if (keepReadersHook && E !== NOT_PENDING && Object.is(A, E)) keepReadersHook(e);
      if (c) releaseIfSettledUnobserved(e);
    }
    function updateIfNecessary(e) {
      if (e.R & 68) return;
      if (e.R & 1)
        for (let t = e.C; t; t = t.G) {
          const n = t.S;
          if (n.X) updateIfNecessary(n);
          if (e.R & 2) break;
        }
      if (e.R & 2 || (e.T?.U && e.ie < clock && !e.T?.Ee)) recompute(e);
      e.R =
        e.R &
        (376 |
          REACTIVE_MANUAL_WRITE |
          REACTIVE_FRAME_READ |
          REACTIVE_STAGED_READ |
          REACTIVE_LANE_READ |
          REACTIVE_SCREEN_READ |
          REACTIVE_PROBE_UNANSWERED);
    }
    function computed(e, t) {
      const n = t?.transparent ?? false;
      const o = t !== null && typeof t === "object" && "loadingValue" in t;
      const E = {
        id: inheritId(t, n, context),
        l:
          (n ? 4 : 0) |
          (t?.ownedWrite ? 1 : 0) |
          (!context || t?.lazy ? 32 : 0) |
          (t?.sync ? 64 : 0) |
          (t?.ae ? 2 : 0) |
          (t?.xe ?? 0) |
          (snapshotCaptureActive && ownerInSnapshotScope(context) ? 8 : 0),
        ye: t?.equals ?? isEqual,
        ke: null,
        A: context?.A ?? defaultContext,
        be: 0,
        X: e,
        le: o ? t.loadingValue : void 0,
        he: 0,
        ve: void 0,
        We: null,
        C: null,
        _: null,
        de: 0,
        o: null,
        Ze: null,
        _parent: context,
        Ge: null,
        Me: null,
        pe: null,
        R: t?.lazy ? 512 : 0,
        m: o ? 0 : 4,
        ie: clock,
        ue: NOT_PENDING,
        we: -1,
        Ie: o,
        T: null,
      };
      if (t?.unobserved) ext(E).Ye = t.unobserved;
      setupComputedNode(E, t);
      return E;
    }

    function ext(e) {
      return (e.T ??= {
        Ee: null,
        Se: null,
        U: void 0,
        fe: void 0,
        se: void 0,
        Ye: void 0,
        De: void 0,
        me: null,
        Le: null,
        Re: null,
        Ve: false,
        je: NOT_PENDING,
        Be: -1,
        ce: 0,
        P: NOT_PENDING,
        I: 0,
        Te: null,
      });
    }

    function joinPass(e, t) {
      e.R |= 128;
      if (t.m & 4 || e.i !== 1) joinPassTx(txOf(t), (!e.i && e.m & 4) || freshHook?.(e));
    }

    function frameRead(e, t) {
      const n = observeFlightHook && e.l & 32768;
      const o = laneStageHook && passLane !== null;
      if (
        !(n && holdStagingHook(e, t)) &&
        !((!o || (e.m & 4 && t.m & 1)) && !n && (!(e.l & (1 << 23)) || t.l & 1024))
      ) {
        const E = txOf(t);
        if (o && passLane.over && resolveTx(passLane.over) === E && !n) return false;
        if (!((!o && E === flushTransaction && !n) || bornInto(e, E))) {
          staleReader(e, E);
          if (o || n) laneServedHook(e, t);
          return true;
        }
      }
      joinPass(e, t);
      return false;
    }

    function bornInto(e, t) {
      return (e.m & 4 || e.l & 1048576) && e.l & 256 && txOf(e) === t;
    }

    function creatorPass(e) {
      return e !== null && e.Qe ? e.Ke : e;
    }

    function parkChildren(e) {
      markDisposal(e);
      const t = ext(e);
      t.Le = e.ke;
      t.me = e.pe;
      e.ke = null;
      e.pe = null;
      e.be = 0;
    }

    function createEffectNode(e, t, n, o, E) {
      const s = E?.transparent ?? false;
      const i = {
        id: inheritId(E, s, context),
        l:
          (o << 23) |
          (s ? 4 : 0) |
          (E?.ownedWrite ? 1 : 0) |
          (E?.sync ? 64 : 0) |
          (E?.xe ?? 0) |
          (snapshotCaptureActive && ownerInSnapshotScope(context) ? 8 : 0),
        ye: false,
        ke: null,
        A: context?.A ?? defaultContext,
        be: 0,
        X: e,
        le: void 0,
        he: 0,
        ve: void 0,
        We: null,
        C: null,
        _: null,
        de: 0,
        o: null,
        Ze: null,
        _parent: context,
        Ge: null,
        Me: null,
        pe: null,
        R: 512,
        m: 4,
        ie: clock,
        ue: NOT_PENDING,
        we: -1,
        Ie: false,
        Ae: false,
        ge: void 0,
        qe: t,
        Je: n,
        ze: void 0,
        i: o,
        T: null,
      };
      if (E?.unobserved) ext(i).Ye = E.unobserved;
      setupComputedNode(i, lazyOptions);
      return i;
    }

    var effectStatusNotify = null;
    function setEffectStatusNotify(e) {
      effectStatusNotify = e;
    }

    function statusNotifierOf(e) {
      return e.i ? effectStatusNotify : null;
    }
    var lazyOptions = { lazy: true };
    function setupComputedNode(e, t) {
      e.We = e;
      const n = context?.Qe ? context.Ke : context;
      if (context) linkChild(context, e);
      if (n) e.he = n.he + 1;
      wireExternalSourceHook?.(e);
      !t?.lazy && recompute(e, true);
      if (snapshotCaptureActive && !t?.lazy) {
        if (!(e.m & 1) && !(e.l & 2)) takeSnapshot(e, e.le);
      }
    }
    function signal(e, t) {
      const n = {
        ye: t?.equals ?? isEqual,
        l: (t?.ownedWrite ? 1 : 0) | (t?.ae ? 2 : 0),
        le: e,
        o: null,
        Ze: null,
        ie: clock,
        ue: NOT_PENDING,
        we: -1,
        T: null,
      };
      if (t?.unobserved) ext(n).Ye = t.unobserved;
      if (snapshotCaptureActive && !(n.l & 2)) takeSnapshot(n, e);
      return n;
    }
    function isEqual(e, t) {
      return e === t;
    }

    function slotSignal(e, t, n, o, E) {
      return {
        ye: t,
        l: 1 | CONFIG_SLOT_NODE,
        le: e,
        o: null,
        Ze: null,
        ie: clock,
        ue: NOT_PENDING,
        we: -1,
        T: null,
        O: n,
        Xe: o,
        acc: E,
        px: void 0,
        pxv: void 0,
      };
    }

    var verdict = null;

    function untrack(e, t) {
      const n = tracking;
      tracking = false;
      try {
        if (externalUntrackHook) return externalUntrackHook(e);
        return e();
      } finally {
        tracking = n;
      }
    }

    function prepareComputed(e, t) {
      if (e.R & 512) {
        e.R &= -513;
        recompute(e, true);
      } else if (e.R & 64) {
        if (e.l & 32) {
          const t = e._parent;
          if (t !== null) {
            if (t.R & 64) {
              e.l &= -33;
              return;
            }
            if (!(e.R & 32)) linkChild(t, e);
          }
          recompute(e, true);
        }
      }
    }

    function readerSeesCommitted(e, t) {
      return !t || e.ue === NOT_PENDING || t.l & 16;
    }

    var unflushedStaged = false;
    function markUnflushedStaged() {
      unflushedStaged = true;
    }

    function unflushedValue(e) {
      if (globalQueue.Y || e.ue === NOT_PENDING || e.l & 4194304) return NOT_PENDING;
      if (e.l & 256) return e.T.Be === clock ? e.T.je : NOT_PENDING;
      return e.le;
    }

    function stashFlushed(e) {
      const t = e.T;
      if (t.Be !== clock) {
        t.je = e.ue;
        t.Be = clock;
        unflushedStaged = true;
      }
    }
    var promotedWrites = [];

    function markLateLinker(e) {
      e.R |= REACTIVE_MISSED_WAKE;
      return true;
    }
    function resyncUnflushedCompanions() {
      unflushedStaged = false;
      if (promotedWrites.length !== 0) {
        for (const e of promotedWrites) e.l &= ~CONFIG_PROMOTED;
        promotedWrites.length = 0;
      }
    }

    function pullComputed(e, t) {
      if (e.he >= dirtyQueue.Fe) {
        markNode(t);
        markHeap(dirtyQueue);
        updateIfNecessary(e);
      } else if (t.l & 65536) updateIfNecessary(e);
      const n = e.he;
      if (n >= t.he && e._parent !== t) t.he = n + 1;
    }

    function servesStaged(e, t, n) {
      return (
        passLane === null &&
        e.m & n.m & 4 &&
        t.ue !== NOT_PENDING &&
        !(t.l & 2097408) &&
        !e.i &&
        (e.R & 4096 ||
          (e.ue === NOT_PENDING &&
            e.T?.$e !== clock &&
            (!(e.m & 1) || e.T?.se?.delete(n.T.U.source)) &&
            ((ext(e).$e = clock), (e.R |= 4096))))
      );
    }
    function read(e) {
      let t = context;
      if (t?.Qe) t = t.Ke;
      const n = e;
      const o = e;
      if (verdict !== null) return verdict(e, t);
      if (typeof n.X === "function") prepareComputed(e);
      if (
        !n.X &&
        e.T?.De === void 0 &&
        !snapshotCaptureActive &&
        (!unflushedStaged || e.ue === NOT_PENDING) &&
        !(e.l & 2048) &&
        true
      ) {
        if (t) {
          if (tracking) link(e, t);
          if (e.l & 256 && !(t.l & 16)) {
            if (frameRead(t, e)) return e.le;
          }
        }
        if (!t || e.ue === NOT_PENDING || t.l & 16) return e.le;
        if (
          (e.ue === e.le && Object.is(e.ue, e.le)) ||
          (((observeFlightHook && t.l & 32768) || (laneStageHook && passLane?.folded)) && stagedScreen(t, e))
        )
          return e.le;
        stagedRead(t);
        return e.ue;
      }
      let E = false;
      if (t) {
        if (tracking) {
          link(e, t);
          if (o.X) {
            pullComputed(o, t);
            if (
              observeFlightHook &&
              t.i === 1 &&
              o.l & 32768 &&
              !(o.m & 5) &&
              (t.m & 4 ? t.l & 256 || flushTransaction : t.l & 1048576)
            )
              t.R |= REACTIVE_AHEAD;
            if (observeFlightHook && !t.i)
              t.R |= o.l & CONFIG_VERDICT & (o.m & 1 && (t.l & 128 || t.m & 4) ? t.l : -1);
          }
        }
        if (e.l & 256 && !(e.l & 2048) && !(t.l & 16)) {
          if (o.m & 4) joinPass(t, e);
          else E = frameRead(t, e);
        }
      }
      if (laneReadHook && e.l & 2048) {
        const n = laneReadHook(t, e);
        if (n !== NOT_PENDING) return n;
      }
      if (snapshotCaptureActive && t && t.l & 8) {
        const n = e.T?.De;
        if (n !== void 0 && !(o.m & 2)) {
          const o = n === NO_SNAPSHOT ? void 0 : n;
          if ((e.ue !== NOT_PENDING ? e.ue : e.le) !== o) t.R |= 256;
          return o;
        }
      }
      if (laneStageHook && o.m & 1 && !E && !(e.l & 2048) && !(o.m & 4)) {
        if (t !== null && t.l & 32768) E = observeFlightHook(t, o);
        else if (passLane !== null && !(t?.m & 4)) E = true;
      }
      if (o.m & 1 && !E) {
        if (t) {
          if (!(t.l & 16) || o.m & 4) {
            if (observeFlightHook && servesStaged(t, e, o)) return e.ue;
            if (!tracking && e !== t) link(e, t);
            throw o.T?.U;
          }
        } else if (o.m & 4) throw o.T?.U;
      }
      if (o.X && o.m & 2) {
        if (tracking && o.ie < clock) {
          recompute(o);
          return read(e);
        }
        if (!E && e.l & 2097152) serve(e, t);
        throw o.T?.U;
      }
      if (E || !t) throwShown(e);
      const s = serve(e, E ? null : t);
      if (!t && typeof n.X === "function" && e.l & 32 && !(o.m & 1) && !e.o) {
        dormantNodes.add(e);
        schedule();
      }
      return s;
    }

    function throwShown(e) {
      if (e.T?.Te) throw e.T.Te;
    }

    function serve(e, t) {
      if (e.ue !== NOT_PENDING && e.m & 4 && (!t || t.l & 16)) throw new NotReadyError(null);
      const n = t && unflushedStaged ? unflushedValue(e) : NOT_PENDING;
      if (n !== NOT_PENDING) {
        markLateLinker(t);
        return n;
      }
      if (
        readerSeesCommitted(e, t) ||
        (observeFlightHook && t.l & 32768 && !(e.m & 4) && stagedScreen(t, e) && !throwShown(e))
      )
        return e.le;
      stagedRead(t, e);
      if (e.l & 2097152) throw e.ue;
      return e.ue;
    }

    function stagedRead(e, t) {
      if (!(t?.m & 4)) {
        e.R |= REACTIVE_STAGED_READ;
        if (laneSeamsHook && (passLane !== null || (e.i && e.l & 32768))) stagedReaders.push(e);
      }
    }

    function stagedScreen(e, t) {
      if (
        flushTransaction === null ||
        bornInto(e, flushTransaction) ||
        (t?.l & 2304) === 256 ||
        (observeFlightHook && holdStagingHook(e, t))
      )
        return false;
      if (
        observeFlightHook &&
        flushTransaction === latestOpened &&
        passLane === null &&
        e.l & 32768 &&
        !(e.m & 4)
      )
        return !stagedReaders.push(e);
      staleReader(e, flushTransaction);
      return true;
    }

    function notePromotedWrite(e) {
      if (globalQueue.Y || e.l & 4194304) return;
      e.l |= CONFIG_PROMOTED;
      promotedWrites.push(e);
    }

    function captureWriteSnapshot(e, t) {
      if (e.l & 2 || e.X !== void 0 || e.T?.De !== void 0) return;
      takeSnapshot(e, t);
    }
    function takeSnapshot(e, t) {
      ext(e).De = t === void 0 ? NO_SNAPSHOT : t;
      e.l |= 512;
      snapshotSources.add(e);
    }

    var writeHook = null;

    function isSame(e, t, n) {
      if (e.ye === isEqual) return t === n;
      try {
        return e.ye && e.ye(t, n);
      } catch (t) {
        if (!(t instanceof NotReadyError)) return (notifyStatus(e, 2, t), true);
      }
    }
    function setSignal(e, t) {
      if (writeHook !== null) writeHook(e);
      const n = e.ue === NOT_PENDING ? e.le : e.ue;
      if (typeof t === "function") t = t(n);
      if (laneWriteHook && e.l & 2048) return laneWriteHook(e, t);
      if (e.l & 256) joinFuture(txOf(e));
      const o = observeFlightHook ? e.ye !== isEqual : null;
      if (!(!!(e.m & 4) || !!e.T?.Te || (o === false ? n !== t : !isSame(e, n, t)))) return t;
      if (snapshotCaptureActive) captureWriteSnapshot(e, n);
      const s = e.ue !== NOT_PENDING;
      if (!s) queuePendingNode(e);
      else if (e.l & 256 && !globalQueue.Y) stashFlushed(e);
      e.ue = o && s && !(e.m & 4 || e.T?.Te) && isSame(e, e.le, t) ? e.le : t;
      if (context !== null) notePromotedWrite(e);
      if (e.X !== void 0) e.ie = clock;
      if (s && e.we === notifyEpoch) return t;
      insertSubs(e);
      schedule();
      return t;
    }

    function setMemo(e, t) {
      const n = e.l & 256 && !(e.R & 1024) && txOf(e) !== flushTransaction;
      if (n && typeof t === "function") {
        const n = t(e.le);
        t = () => n;
      }
      if (e.m & 2) {
        e.T.Te = e.T.U;
        notifyStatus(e, 0);
      }
      t = setSignal(e, t);
      e.l &= ~CONFIG_STAGED_ERROR;
      if (n) {
        e.R = (e.R & -2) | 2;
        insertIntoHeap(e, dirtyQueue);
        schedule();
      } else if (e.ue !== NOT_PENDING) e.R |= REACTIVE_MANUAL_WRITE;
      return t;
    }

    function runWithOwner(e, t) {
      const n = context;
      const o = tracking;
      context = e;
      tracking = false;
      try {
        return t();
      } finally {
        context = n;
        tracking = o;
      }
    }
    function staleValues(e, t = true) {
      try {
        return e();
      } finally {
      }
    }

    var signalHook = null;

    function effect$1(e, t, E, f) {
      const o = createEffectNode(e, t, E, !!f?.user ? 2 : 1, f);
      recompute(o, true);
      f?.defer
        ? applyStaged(o)
        : o.ue === NOT_PENDING &&
          (o.T?.Re?.P || o.i === 2 || f?.schedule
            ? globalQueue.enqueue(o.i, runEffect.bind(null, o), o.T?.Re)
            : runEffect(o, 0));
    }
    function notifyEffectStatus() {
      const e = this.m;
      const t = this.T?.U;
      if (e & 2) {
        globalQueue.notify(this, 1, 0);
        if (this.i === 2) {
          if (this.m & 2) queueEffectRun(this);
          return;
        }
        escalate(this, unwrapStatusError(t));
      } else if (this.i === 1) globalQueue.notify(this, 3, e, t);
    }

    function escalate(e, t, E) {
      if (!globalQueue.notify(e, 2, 2)) {
        haltReactivity(t);
        throw t;
      }
    }
    function runEffect(e, t) {
      if (!e.Ae || e.R & 64) return;
      if (t && heldRunHook?.(e)) return;
      if (t && attachHook?.(e)) return;
      if (e.m & 2 && e.i === 2) {
        const t = unwrapStatusError(e.T?.U);
        e.ge = e.le;
        e.Ae = false;
        try {
          e.Je
            ? e.Je(t, () => {
                const t = e.ze;
                e.ze = void 0;
                t?.();
              })
            : console.error(t);
        } catch (t) {
          escalate(e, t);
        }
        return;
      }
      const E = e.T?.U == null;
      const f = e.ze;
      e.ze = void 0;
      try {
        f?.();
        e.ze = e.qe(e.le, e.ge);
      } catch (t) {
        ext(e).U = new StatusError(e, t);
        e.m |= 2;
        escalate(e, t);
      } finally {
        e.ge = e.le;
        e.Ae = false;
        if (E) trimStaleDeps(e);
      }
    }
    GlobalQueue.q = runEffect;

    function trackedEffect(e, t) {
      let E = false,
        f;
      const run = () => {
        if (!u.Ae || u.R & 64) return;
        if (heldRunHook?.(u)) return;
        const e = notifyEpoch;
        E = false;
        try {
          u.Ae = false;
          recompute(u);
        } finally {
        }
        for (let t = u.C; t !== null; t = t.G) {
          const o = t.S;
          if (o.ue !== NOT_PENDING && !(o.l & 2048) && (o.ue !== o.le || !Object.is(o.ue, o.le))) {
            if (o.l & 256) {
              if (!E) {
                E = true;
                txOf(o).rn[1].push(
                  (f ||= () => {
                    if (E) {
                      u.Ae = true;
                      run();
                    }
                  }),
                );
              }
            } else if (o.we <= e || o.X) {
              enqueueSub(u);
              schedule();
              break;
            }
          }
        }
      };
      const u = computed(
        () => {
          const t = u.ze;
          u.ze = void 0;
          t?.();
          const E = staleValues(e);
          u.ze = E;
        },
        {
          ...t,
          lazy: true,
        },
      );
      u.ze = void 0;
      u.l = (u.l & -33) | 16;
      u.Ae = true;
      u.i = 3;
      u.Z = run;
      enqueueSub(u);
      schedule();
    }
    setEffectStatusNotify(notifyEffectStatus);

    var $TRACK = Symbol(0);
    var $TARGET = Symbol(0);
    var $PROXY = Symbol(0);
    var $RECORD = Symbol(0);
    var rawValues = new WeakSet();
    var rawValuesUsed = false;
    function isRawValue(e) {
      return rawValuesUsed && rawValues.has(e);
    }

    function markRawOne(e) {
      if (isWrappable(e)) {
        if (e[$TARGET] !== void 0) return;
        rawValuesUsed = true;
        rawValues.add(e);
      }
    }
    function markRawIngest(e) {
      if (Array.isArray(e)) for (let r = 0, a = e.length; r < a; r++) markRawOne(e[r]);
      else for (const r in e) markRawOne(e[r]);
    }
    var OBJECT_PROTO = Object.prototype;
    var wrappableProtos = new WeakMap();
    function isWrappable(e) {
      if (e == null || typeof e !== "object" || Object.isFrozen(e)) return false;
      const r = Object.getPrototypeOf(e);
      if (r === OBJECT_PROTO || r === null) return true;
      if (Array.isArray(e)) return true;
      let a = wrappableProtos.get(r);
      if (a === void 0) {
        a =
          Object.prototype.toString.call(e) === "[object Object]" &&
          (typeof Node === "undefined" || !(e instanceof Node));
        wrappableProtos.set(r, a);
      }
      return a;
    }
    var writeOverride = false;
    function setWriteOverride(e) {
      writeOverride = e;
    }

    var shallowView = null;
    function installShallowView(e) {
      shallowView = e;
    }

    function onCleanup(e) {
      return cleanup(e);
    }
    function accessor(e) {
      const t = read.bind(null, e);
      t[$REFRESH] = e;
      return t;
    }
    function createSignal$1(e, t) {
      if (typeof e === "function") {
        const r = computed(e, t);
        r.l &= -33;
        return [accessor(r), setMemo.bind(null, r)];
      }
      const r = signal(e, t);
      if (signalHook !== null) signalHook(r);
      return [accessor(r), setSignal.bind(null, r)];
    }
    function createMemo$1(e, t) {
      return accessor(computed(e, t));
    }

    function createEffect$1(e, t, r) {
      effect$1(e, t.effect || t, t.error, {
        user: true,
        ...r,
      });
    }

    function createRenderEffect$1(e, t, r) {
      effect$1(e, t, void 0, r);
    }

    function onSettled(e) {
      const t = getOwner();
      t && !(t.l & 16)
        ? trackedEffect(() => untrack(e), void 0)
        : globalQueue.enqueue(2, function fire() {
            if (dirtyQueue.Et >= dirtyQueue.Fe) return globalQueue.enqueue(2, fire);
            e();
          });
    }

    function mapArray(t, e, i) {
      const s = typeof i?.keyed === "function" ? i.keyed : void 0;
      const n = e.length > 1;
      const r = e;
      const o = {
        H: createOwner(),
        it: 0,
        st: t,
        ot: [],
        ft: r,
        ht: [],
        ln: [],
        Xe: s,
        ct: s || i?.keyed === false ? [] : void 0,
        lt: n && i?.keyed !== false ? [] : void 0,
        ut: i?.keyed === false,
        L: i?.fallback,
      };
      const f = computed(updateKeyedMap.bind(o), void 0);
      f.l &= -33;
      return accessor(f);
    }
    var pureOptions = { ownedWrite: true };
    function trySmallMove(t, e, i, s) {
      const n = t.ot;
      const r = t.it - 1;
      const o = [];
      const f = [];
      const h = [];
      let c = 256;
      let a = s;
      let l = s;
      let u = false;
      while (a <= r && l <= i - 1) {
        const t = n[a];
        const s = e[l];
        if (t === s) {
          if (!u) {
            h.push(a, l, 0);
            u = true;
          }
          h[h.length - 1]++;
          a++;
          l++;
          continue;
        }
        u = false;
        let w = -1;
        let d = Math.min(32 - o.length, r - a, c);
        for (let t = 1; t <= d; t++)
          if (n[a + t] === s) {
            w = t;
            break;
          }
        c -= w === -1 ? d : w;
        let p = -1;
        d = Math.min(32 - f.length, i - 1 - l, c);
        for (let i = 1; i <= d; i++)
          if (e[l + i] === t) {
            p = i;
            break;
          }
        c -= p === -1 ? d : p;
        if (w !== -1 && (p === -1 || w <= p)) {
          while (w-- > 0) o.push(a++);
          continue;
        }
        if (p !== -1) {
          while (p-- > 0) f.push(l++);
          continue;
        }
        if (c <= 0 || o.length === 32 || f.length === 32) return false;
        o.push(a++);
        f.push(l++);
      }
      for (; a <= r; a++) {
        if (o.length === 32) return false;
        o.push(a);
      }
      for (; l <= i - 1; l++) {
        if (f.length === 32) return false;
        f.push(l);
      }
      return commitSmallMove(t, e, i, o, f, h);
    }

    function commitSmallMove(t, e, i, s, n, r) {
      const o = t.ot;
      let f;
      let h;
      let c;
      if (n.length !== 0) {
        c = new Array(s.length);
        for (h = 0; h < n.length; h++) {
          let t = -1;
          for (f = 0; f < s.length; f++)
            if (!c[f] && o[s[f]] === e[n[h]]) {
              t = f;
              break;
            }
          if (t === -1) return false;
          c[t] = true;
          n[h] = (n[h] << 6) | t;
        }
      }
      if (s.length !== 0 || n.length !== 0) {
        const t = new Set();
        for (f = 0; f < s.length; f++) t.add(o[s[f]]);
        for (h = 0; h < n.length; h++) t.add(e[n[h] >> 6]);
        for (let e = 0; e < r.length; e += 3) {
          const i = r[e];
          for (let s = 0, n = r[e + 2]; s < n; s++) if (t.has(o[i + s])) return false;
        }
      }
      const a = t.ht;
      const l = t.ln;
      const u = a.slice(0, i);
      const w = l.slice(0, i);
      for (let t = 0; t < r.length; t += 3) {
        const e = r[t];
        const i = r[t + 1];
        if (e !== i)
          for (let s = 0; s < r[t + 2]; s++) {
            u[i + s] = a[e + s];
            w[i + s] = l[e + s];
          }
      }
      for (h = 0; h < n.length; h++) {
        const t = n[h] >> 6;
        const e = s[n[h] & 63];
        u[t] = a[e];
        w[t] = l[e];
      }
      t.ht = u;
      t.ln = w;
      t.it = i;
      t.ot = e.slice(0);
      for (f = 0; f < s.length; f++) if (c === void 0 || !c[f]) l[s[f]].dispose();
      return true;
    }

    function stageRemoval(t, e, i, s, n, r, o, f, h) {
      const c = t.Xe;
      const a = t.ot;
      const l = t.ln;
      const u = [];
      let w = i;
      for (let d = i; d <= n; w++, d++) {
        const n = c ? c(e[d]) : e[d];
        while (w <= s && (c ? c(a[w]) : a[w]) !== n) u.push(l[w++]);
        if (w > s) {
          o.fill(void 0);
          return null;
        }
        r[d] = t.ht[w];
        o[d - i] = l[w];
        if (f) f[d - i] = t.ct[w];
        if (h) h[d - i] = t.lt[w];
      }
      for (; w <= s; w++) u.push(l[w]);
      return u;
    }

    function commitWindow(t, e, i, s, n, r, o, f, h) {
      const c = t.ln;
      const a = t.ct;
      const l = t.lt;
      const u = t.it;
      const w = i - u;
      let d, p;
      if (w > 0) {
        c.length = i;
        if (a) a.length = i;
        if (l) l.length = i;
        for (d = u - 1, p = i - 1; d > n; d--, p--) {
          c[p] = c[d];
          if (a) a[p] = a[d];
          if (l) l[p] = l[d];
        }
      } else if (w < 0) {
        for (d = n + 1, p = r + 1; d < u; d++, p++) {
          c[p] = c[d];
          if (a) a[p] = a[d];
          if (l) l[p] = l[d];
        }
        c.length = i;
        if (a) a.length = i;
        if (l) l.length = i;
      }
      for (p = s; p <= r; p++) {
        c[p] = o[p - s];
        if (a) writeRow((a[p] = f[p - s]), e[p]);
        if (l) setSignal((l[p] = h[p - s]), p);
      }
      for (p = r + 1; p < i; p++) {
        if (a) writeRow(a[p], e[p]);
        if (l && w !== 0) setSignal(l[p], p);
      }
    }
    var writeRow = (t, e) => (t.le === e && t.ue === NOT_PENDING) || setSignal(t, e);
    function updateKeyedMap() {
      this.H.Ke = getOwner();
      let t = this.st() || [];
      t[$TRACK];
      t = shallowView?.(t[$TARGET]) ?? t;
      const e = t.length;
      runWithOwner(this.H, () => {
        let i,
          s,
          n,
          r,
          o,
          f = this.ct
            ? this.ut
              ? () => {
                  r[n] = signal(t[s], pureOptions);
                  return this.ft(accessor(r[n]), s);
                }
              : () => {
                  r[n] = signal(t[s], pureOptions);
                  o && (o[n] = signal(s, pureOptions));
                  return this.ft(accessor(r[n]), o ? accessor(o[n]) : void 0);
                }
            : this.lt
              ? () => {
                  const e = t[s];
                  o[n] = signal(s, pureOptions);
                  return this.ft(e, accessor(o[n]));
                }
              : () => {
                  const e = t[s];
                  return this.ft(e);
                };
        if (e === 0) {
          if (this.it !== 0) {
            this.H.dispose(false);
            this.ln = [];
            this.ot = [];
            this.ht = [];
            this.it = 0;
            this.ct && (this.ct = []);
            this.lt && (this.lt = []);
          }
          if (this.L && !this.ht.length) {
            this.ln[0]?.dispose();
            this.ht[0] = runWithOwner((this.ln[0] = createOwner()), this.L);
          }
        } else if (this.it === 0) {
          const h = new Array(e);
          const c = new Array(e);
          r = this.ct && new Array(e);
          o = this.lt && new Array(e);
          try {
            for (s = 0; s < e; s++) {
              n = s;
              h[s] = runWithOwner((c[s] = createOwner()), f);
            }
          } catch (t) {
            for (i = 0; i <= s; i++) c[i]?.dispose();
            throw t;
          }
          if (this.ln[0]) this.ln[0].dispose();
          this.ht = h;
          this.ln = c;
          r && (this.ct = r);
          o && (this.lt = o);
          this.ot = t.slice(0);
          this.it = e;
        } else {
          let h, c, a, l, u, w, d, p, m;
          for (
            h = 0, c = Math.min(this.it, e);
            h < c && (this.ot[h] === t[h] || (this.ct && compare(this.Xe, this.ot[h], t[h])));
            h++
          )
            if (this.ct) writeRow(this.ct[h], t[h]);
          for (
            c = this.it - 1, a = e - 1;
            c >= h && a >= h && (this.ot[c] === t[a] || (this.ct && compare(this.Xe, this.ot[c], t[a])));
            c--, a--
          );
          if (h === e && this.it === e) {
            this.ot = t.slice(0);
            return;
          }
          if (e <= this.it && c - h > 64 && this.ct === void 0 && this.lt === void 0) {
            const i = h + ((a - h) >> 1);
            const s = t[i];
            const n = Math.min(c, i + 32);
            let r = Math.max(h, i - 32);
            while (r <= n && this.ot[r] !== s) r++;
            if (r <= n && trySmallMove(this, t, e, h)) return;
          }
          const y = e - this.it;
          const A = a - h + 1;
          const g = new Array(e);
          const S = new Array(A);
          r = this.ct ? new Array(A) : void 0;
          o = this.lt ? new Array(A) : void 0;
          const M = y < 0 ? stageRemoval(this, t, h, c, a, g, S, r, o) : null;
          if (M !== null) {
            if (M.length !== 0) p = M;
          } else {
            w = new Map();
            d = new Array(A);
            for (s = a; s >= h; s--) {
              l = t[s];
              u = this.Xe ? this.Xe(l) : l;
              i = w.get(u);
              d[s - h] = i === void 0 ? -1 : i;
              w.set(u, s);
            }
            for (i = h; i <= c; i++) {
              l = this.ot[i];
              u = this.Xe ? this.Xe(l) : l;
              s = w.get(u);
              if (s !== void 0 && s !== -1) {
                g[s] = this.ht[i];
                S[s - h] = this.ln[i];
                r && (r[s - h] = this.ct[i]);
                o && (o[s - h] = this.lt[i]);
                s = d[s - h];
                w.set(u, s);
              } else (p ??= []).push(this.ln[i]);
            }
            try {
              for (s = h; s <= a; s++) {
                if (S[s - h] !== void 0) continue;
                (m ??= []).push((S[s - h] = createOwner()));
                n = s - h;
                g[s] = runWithOwner(S[s - h], f);
              }
            } catch (t) {
              if (m) for (i = 0; i < m.length; i++) m[i].dispose();
              throw t;
            }
          }
          for (i = 0; i < h; i++) g[i] = this.ht[i];
          for (s = a + 1; s < e; s++) g[s] = this.ht[s - y];
          commitWindow(this, t, e, h, c, a, S, r, o);
          this.ht = g;
          this.it = e;
          this.ot = t.slice(0);
          if (p) for (i = 0; i < p.length; i++) p[i].dispose();
        }
      });
      return this.ht;
    }
    function compare(t, e, i) {
      return t ? t(e) === t(i) : true;
    }

    var $OWNER = Symbol(0);

    var storeLookup = new WeakMap();
    function setLookup(o, e) {
      (e.rr?.map ?? storeLookup).set(o, e);
    }
    function isOwned(o) {
      return o[$OWNER] !== void 0;
    }

    function lookupTarget(o, e) {
      const n = o[$OWNER];
      return n !== void 0 && n.rr === e ? n : (e?.map ?? storeLookup).get(o);
    }

    function markDescendants(o) {
      let e = o;
      while (e && !e.d) {
        e.d = true;
        e = e.u;
      }
    }

    var optHooks = null;
    var affectsHooks = null;

    var $DEEP = Symbol(0);

    function TargetShape(e, t, n, r) {
      this.v = e;
      this.ch = e[$TARGET] !== void 0;
      this.pb = null;
      this.n = null;
      this.h = null;
      this.k = null;
      this.dk = null;
      this.u = t;
      this.pk = n;
      this.px = null;
      this.d = false;
      this.a = false;
      this.sc = 0;
      this.kc = 0;
      this.nc = 0;
      this.rr = r;
      this.s = false;
      this.ovl = false;
      this.del = null;
      this.wk = null;
    }
    function createTarget(e, t, n, r = t?.rr ?? null) {
      const o = new TargetShape(e, t, n, r);
      o.px = new Proxy(Array.isArray(e) ? [] : {}, o);
      setLookup(e, o);
      return o;
    }
    function wrap(e, t = null, n = null, r = t?.rr ?? null) {
      if (rawValuesUsed && isRawValue(e)) return e;
      const o = lookupTarget(e, r);
      if (o !== void 0) return o.px;
      const i = e[$TARGET];
      if (i?.px === e) {
        if (r === null || i.rr === r) return e;
        return createTarget(e, t, n, r).px;
      }
      return createTarget(e, t, n, r).px;
    }

    function unwrapValue(e) {
      if (e == null || typeof e !== "object") return e;
      const t = e[$TARGET];
      if (t !== void 0 && (t.px === e || lookupTarget(e, t.rr) === t) && t.v !== void 0) {
        if (t.ovl) materializePB(t);
        return t.pb ?? t.v;
      }
      return e;
    }
    var slotNodeEquals = function (e, t) {
      return isEqual(e, t) || sameLogicalSlot(this.O, e, t);
    };
    function sameKey(e, t) {
      return e === t || (e !== e && t !== t);
    }

    var LaneView = class {
      constructor(e, t, n = null) {
        _defineProperty(this, "rows", void 0);
        _defineProperty(this, "base", void 0);
        _defineProperty(this, "removed", void 0);
        this.rows = e;
        this.base = t;
        this.removed = n;
      }
    };

    function asBacking(e) {
      return e instanceof LaneView ? e.base : e;
    }

    var containerEquals = function (e, t) {
      return e === t || !!optHooks?.arrangement(this.O, e, t);
    };
    function sameLogicalSlot(e, t, n) {
      if (t === null || typeof t !== "object" || n === null || typeof n !== "object") return false;
      const r = lookupTarget(t, e.rr);
      return r !== void 0 && r === lookupTarget(n, e.rr);
    }

    var deferredReleases = new Set();
    function releaseSlot(e) {
      const t = e.O;
      const n = e.Xe;
      if (n === $TRACK) {
        if (t.k === e) t.k = null;
      } else if (n === $DEEP) {
        if (t.dk === e) t.dk = null;
      } else if (t.n?.[n] === e) {
        delete t.n[n];
        t.nc--;
      } else if (t.h?.[n] === e) delete t.h[n];
      if (
        t.rr !== null &&
        t.nc === 0 &&
        t.k === null &&
        t.dk === null &&
        (t.h === null || Reflect.ownKeys(t.h).length === 0)
      )
        t.rr.live.delete(t);
    }
    function noteNode(e, t, n) {
      if (e.rr !== null) e.rr.live.add(e);
      markDescendants(e);
      if (affectsHooks !== null) affectsHooks.ro(e, t, n);
    }
    var slotKept = (e) => e.ue !== NOT_PENDING || e.l & 2048 || e.O.k?.l & 256;
    setSlotUnobserved((e) => {
      if (slotKept(e)) deferredReleases.add(e);
      else releaseSlot(e);
    });

    function bornStaged(e, t, n, r) {
      if (t.ye && t.ye(t.le, n)) return;
      queuePendingNode(t);
      t.ue = n;
      const o = e.k;
      if (o === null) return;
      if (laneStageHook && (o.l & 10240) === 2048) holdWithDerive(e, t, txOf(o));
      else if (o.l & 256 && heldKeyChanged(e, r)) {
        const e = txOf(o);
        if (!(o.l & 2048) || e.folded) holdNode(t, resolveTx(e._parent ?? e));
      }
      if (o.l & 4194304) notePromotedWrite(t);
    }
    function getNode(e, t, n = -1) {
      const r = (e.n ??= Object.create(null));
      let o = r[t];
      if (o === void 0) {
        const i = e.pb;
        const l = (o = slotSignal(
          committed(e)[t],
          slotNodeEquals,
          e,
          t,
          n === -1 ? isOwnAccessor(i ?? e.v, t) : n === 1,
        ));
        if (i !== null && !l.acc) bornStaged(e, l, e.del?.has(t) ? void 0 : i[t], t);
        r[t] = o;
        e.nc++;
        noteNode(e, l, t);
      }
      return o;
    }
    function getHasNode(e, t) {
      const n = (e.h ??= Object.create(null));
      let r = n[t];
      if (r === void 0) {
        const o = (r = slotSignal(t in committed(e), isEqual, e, t, false));
        const i = e.pb;
        if (i !== null) bornStaged(e, o, t in i && !e.del?.has(t), t);
        n[t] = r;
        noteNode(e, o, t);
      }
      return r;
    }

    function getContainerNode(e) {
      let t = e.k;
      if (t === null) {
        t = e.k = slotSignal(e.v, containerEquals, e, $TRACK, false);
        noteNode(e, t, $TRACK);
        if (e.pb !== null && !directCommit) {
          t.le = preBatch(e);
          t.ue = e.pb;
          queuePendingNode(t);
        }
      }
      return t;
    }

    function stageOn(e, t) {
      if (e.k === null && passLane === null && (context === null || globalQueue.Y) && !deriveHolds(e)) return;
      const n = getContainerNode(e);
      if (n.ue === NOT_PENDING) queuePendingNode(n);
      n.ue = t;
      if (context !== null) notePromotedWrite(n);
      if (e.rr !== null && !userWrite) holdWithDerive(e, n);
    }

    function deriveHolds(e) {
      const t = e.rr?.node;
      return t != null && !userWrite && (t.l & 256) !== 0;
    }
    var storePark = (e) => {
      for (let t = 0; t < foldList.length; t++) {
        const n = foldList[t];
        if (n.k === null && n.pb !== null) holdNode(getContainerNode(n), e);
      }
      optHooks?.park(e);
    };
    function bumpDeep(e) {
      if (e.dk !== null) setSignal(e.dk, 1);
    }

    function notifyContainer(e, t) {
      if (e.l & 2048) setSignal(e, t);
      else {
        if (e.l & 256) joinFuture(txOf(e));
        if (snapshotCaptureActive) captureWriteSnapshot(e, e.le);
        insertSubs(e);
        schedule();
      }
    }
    var hasOwn = Object.prototype.hasOwnProperty;
    var protoOf = Object.getPrototypeOf;
    var setProto = Object.setPrototypeOf;
    var lookupGetter = Object.prototype.__lookupGetter__;
    var lookupSetter = Object.prototype.__lookupSetter__;
    var propertyIsEnumerable = Object.prototype.propertyIsEnumerable;
    function isOwnAccessor(e, t) {
      return hasOwn.call(e, t) && (lookupGetter.call(e, t) !== void 0 || lookupSetter.call(e, t) !== void 0);
    }

    function cloneRaw(e, t) {
      t.sc || scanAccessorsOnce(t);
      if (t.sc === 2) {
        const n = { ...e };
        n[$OWNER] = t;
        return n;
      }
      let n;
      if (!t.a && t.kc <= e.length + 1 && protoOf(e) === Array.prototype) n = e.slice();
      else {
        const r = Object.getOwnPropertyDescriptors(e);
        for (const n of Reflect.ownKeys(r)) {
          const o = r[n];
          if (n === "length" && Array.isArray(e)) continue;
          o.configurable = true;
          if (!o.get && !o.set) o.writable = true;
          else t.a = true;
        }
        n = Object.defineProperties(
          Array.isArray(e) ? setProto([], protoOf(e)) : Object.create(protoOf(e)),
          r,
        );
      }
      n[$OWNER] = t;
      return n;
    }
    function wideClone(e, t) {
      const n = Object.create(null);
      for (const t of Reflect.ownKeys(e)) n[t] = e[t];
      setProto(n, Object.prototype);
      n[$OWNER] = t;
      return n;
    }
    function copyOwn(e, t, n) {
      const r = Object.getOwnPropertyDescriptor(t, n);
      if (r.get || r.set || !r.enumerable || !r.writable || !r.configurable) Object.defineProperty(e, n, r);
      else e[n] = r.value;
    }
    function scanAccessorsOnce(e) {
      const t = e.v;
      const n = Reflect.ownKeys(t);
      let r = protoOf(t) === Object.prototype;
      for (const o of n) {
        if (isOwnAccessor(t, o)) {
          e.a = true;
          r = false;
          break;
        }
        if (r && !propertyIsEnumerable.call(t, o)) r = false;
      }
      e.sc = r ? 2 : 1;
      e.kc = n.length;
      return !e.a;
    }
    var OVERLAY_MIN_KEYS = 32;
    var OVERLAY_REBUILD_MAX_KEYS = 1024;
    var OVERLAY_REBUILD_MIN_ADDS = 16;
    var WK_ALL = new Set();
    var plainProto = (e) => {
      const t = protoOf(e);
      return t === Object.prototype || t === Array.prototype || t === null;
    };

    function overlayRebuilds(e, t) {
      if (e.kc > OVERLAY_REBUILD_MAX_KEYS) return false;
      if (e.del?.size) return true;
      const n = e.wk;
      if (n !== null && n !== WK_ALL && n.u === void 0 && n.size <= OVERLAY_REBUILD_MIN_ADDS) return false;
      const r = e.v;
      let o = 0;
      for (const e of Reflect.ownKeys(t))
        if (!hasOwn.call(r, e) && ++o > OVERLAY_REBUILD_MIN_ADDS) return true;
      return false;
    }
    function materializePB(e) {
      const t = e.pb;
      if (!e.ovl) return t;
      const n = overlayOnto(e, e.sc === 2 ? wideClone(e.v, e) : cloneRaw(e.v, e), t);
      e.pb = n;
      if (e.k?.ue === t) e.k.ue = n;
      return n;
    }

    function ensurePB(e) {
      let t = e.pb;
      if (optHooks && userWrite && e.rr?.opt === true && !pendingNotify.has(e))
        return (e.pb = optHooks.draft(e));
      if (t !== null && !isOwned(t)) {
        t = e.pb = cloneRaw(t, e);
        const n = e.k;
        if (n !== null && !(n.l & 256)) n.ue = t;
      } else if (t === null) {
        const n = e.v;
        if (!directCommit) queueFold(e);
        if (
          !e.ch &&
          !Array.isArray(n) &&
          (e.sc !== 0 ? !e.a : scanAccessorsOnce(e)) &&
          e.kc > OVERLAY_MIN_KEYS &&
          isOwned(n)
        ) {
          t = e.pb = Object.create(n);
          e.ovl = true;
        } else t = e.pb = cloneRaw(n, e);
        if (!directCommit) stageOn(e, t);
      }
      return t;
    }

    function privatizeCommitted(e) {
      if (isOwned(e.v)) return;
      const t = e.v;
      e.v = cloneRaw(t, e);
      e.ch = false;
      if (e.u) {
        privatizeCommitted(e.u);
        const n = e.u.v;
        const r = parentSlotKey(e, t);
        if (n[r] === t) n[r] = e.v;
      }
    }

    function parentSlotKey(e, t) {
      const n = e.pk;
      const r = e.u.v;
      if (r[n] === t || r[n] === e.v || !Array.isArray(r)) return n;
      const o = r.indexOf(t);
      if (o === -1) return n;
      e.pk = o;
      return o;
    }

    function flattenOverlay(e, t) {
      privatizeCommitted(e);
      overlayOnto(e, e.v, t);
    }

    function overlayOnto(e, t, n) {
      for (const r of Reflect.ownKeys(n)) e.sc === 2 ? (t[r] = n[r]) : copyOwn(t, n, r);
      if (e.del !== null) {
        for (const n of e.del) delete t[n];
        e.kc -= e.del.size;
        e.del = null;
      }
      e.ovl = false;
      return t;
    }

    function adoptPB(e, t, n = true) {
      if (!directCommit) queueFold(e);
      let r;
      if (e.pb !== null) {
        if (e.ovl) materializePB(e);
        r = e.pb;
      } else r = e.v;
      if (directCommit) {
        e.pb = null;
        if (e.k !== null) e.k.le = t;
      } else {
        e.pb = t;
        stageOn(e, t);
      }
      e.v = t;
      e.ch = t[$TARGET] !== void 0;
      e.ovl = false;
      e.del = null;
      e.sc = 0;
      e.a = false;
      e.wk = null;
      if (t[$OWNER]?.rr === e.rr) t[$OWNER] = e;
      else setLookup(t, e);
      if (n && r !== t) notifyFold(e, r, t);
    }

    var foldList = [];
    var foldOlds = [];
    var foldSpare = [];
    var foldOldsSpare = [];
    var foldIndex = null;
    function queueFold(e) {
      if (e.pb !== null) return;
      schedule();
      if (foldIndex !== null) foldIndex.set(e, foldList.length);
      foldList.push(e);
      foldOlds.push(e.v);
    }
    function preBatch(e) {
      if (foldIndex === null) {
        foldIndex = new Map();
        for (let e = 0; e < foldList.length; e++) foldIndex.set(foldList[e], e);
      }
      const t = foldIndex.get(e);
      return t === void 0 ? e.v : foldOlds[t];
    }

    function drainFolds() {
      if (foldList.length !== 0) {
        const e = foldList;
        const t = foldOlds;
        foldList = foldSpare;
        foldOlds = foldOldsSpare;
        foldSpare = e;
        foldOldsSpare = t;
        foldIndex = null;
        for (let n = 0; n < e.length; n++) {
          const r = e[n];
          if (r.pb === null) continue;
          const o = r.k;
          if (o !== null && o.ue !== NOT_PENDING) {
            foldList.push(r);
            foldOlds.push(t[n]);
          } else foldTarget(r, t[n]);
        }
        e.length = 0;
        t.length = 0;
      }
      if (deferredReleases.size !== 0) {
        for (const e of deferredReleases)
          if (e.o === null && !slotKept(e)) {
            deferredReleases.delete(e);
            releaseSlot(e);
          }
      }
    }

    GlobalQueue.k = (e) => {
      return (e.O?.rr?.node?.m & 1) !== 0;
    };

    GlobalQueue.an = (e) => {
      const t = e.O;
      if (t.ch) {
        const n = e.Xe;
        const r = t.v;
        if (t.h?.[n] === e) e.le = untrack(() => n in r);
        else if (t.n?.[n] === e) e.le = untrack(() => unwrapValue(r[n]));
      }
      return e.le;
    };
    installStoreHooks(storePark, () => {
      drainFolds();
      optHooks?.sweep();
    });

    GlobalQueue.so = getNode;
    GlobalQueue.fo = isWrappable;

    var directCommit = false;
    function runDirect(e) {
      const t = directCommit;
      directCommit = true;
      try {
        e();
      } finally {
        directCommit = t;
      }
    }
    function foldTarget(e, t) {
      {
        const n = e.k;
        const r = e.pb;
        if (r !== null) {
          if (r === e.v);
          else if (e.ovl && (e.v !== t || (!overlayRebuilds(e, r) && n?.T?.De !== t))) flattenOverlay(e, r);
          else if (e.v !== t) {
            privatizeCommitted(e);
            const n = e.v;
            const o = e.wk;
            if (o !== null && o !== WK_ALL)
              for (let e = o; e !== void 0; e = e.u)
                for (const t of e)
                  if (hasOwn.call(r, t)) copyOwn(n, r, t);
                  else delete n[t];
            else {
              for (const e of Reflect.ownKeys(r)) if (e !== $OWNER) copyOwn(n, r, e);
              for (const e of Reflect.ownKeys(t)) if (e !== $OWNER && !hasOwn.call(r, e)) delete n[e];
            }
          } else {
            e.v = e.ovl ? materializePB(e) : r;
            e.ch = e.v[$TARGET] !== void 0;
          }
          e.pb = null;
          e.wk = null;
        }
        if (n !== null) {
          if (n.o === null) e.k = null;
          else if (n.le instanceof LaneView) n.le.base = e.v;
          else n.le = e.v;
        }
        if (e.v !== t && e.u) {
          const n = parentSlotKey(e, t);
          if (e.u.v[n] === t) {
            privatizeCommitted(e.u);
            e.u.v[n] = e.v;
          }
        }
      }
    }

    var heldDerivationHit = false;

    var userWrite = false;

    function userWriting() {
      return userWrite;
    }
    function heldDerivation(e, t, n) {
      if (e.rr === null || !userWrite) return false;
      if (t !== void 0) return (t.l & 262400) === 256 && txOf(t) !== flushTransaction;
      const r = e.k;
      return r !== null && (r.l & 256) !== 0 && txOf(r) !== flushTransaction && heldKeyChanged(e, n);
    }

    function notifyWrites(e) {
      let t = e.pb;
      if (t === null) return;
      if (optHooks && e.rr?.opt === true) {
        if (userWrite) {
          e.pb = null;
          e.wk = null;
          e.pb = optHooks.writes(e, t);
          return;
        }
        optHooks.pair(e, t);
      }
      const n = e.v;
      const r = e.n;
      const o = e.wk;
      const i = o === WK_ALL || e.a === true || !plainProto(e.ovl ? e.v : t) ? null : o;
      if (e.rr !== null && !heldDerivationHit && i !== null) {
        for (const t of i)
          if (heldDerivation(e, r?.[t], t)) {
            heldDerivationHit = true;
            break;
          }
      }
      if (r !== null) {
        const o = i ?? Reflect.ownKeys(r);
        for (const i of o) {
          const o = r[i];
          if (o === void 0) continue;
          let l = false;
          if (o.acc === true || ((l = hasOwn.call(t, i)) && lookupGetter.call(t, i) !== void 0)) {
            o.acc = isOwnAccessor(t, i);
            const e = Object.getOwnPropertyDescriptor(n, i);
            const r = Object.getOwnPropertyDescriptor(t, i);
            if (!r || r.get || r.set) {
              if (e?.get !== r?.get || e?.set !== r?.set || e?.value !== r?.value) setSignal(o, () => FORCE);
              continue;
            }
            if (e?.get || e?.set || !isEqual(e?.value, r.value)) setSignal(o, () => r.value);
            continue;
          }
          const s = l || !(e.del?.has(i) || i === "__proto__") ? t[i] : void 0;
          setSignal(o, () => s);
          if (e.rr !== null) {
            if (!userWrite) {
              o.l &= ~CONFIG_MANUAL_WRITE;
              holdWithDerive(e, o);
            } else o.l |= CONFIG_MANUAL_WRITE;
          }
        }
      }
      const l = e.h;
      if (l !== null) {
        const n = i ?? Reflect.ownKeys(l);
        for (const r of n) {
          const n = l[r];
          if (n !== void 0) {
            setSignal(n, r in t && !e.del?.has(r));
            if (e.rr !== null && !userWrite) holdWithDerive(e, n);
          }
        }
      }
      if (e.dk !== null) {
        if (e.del?.size) bumpDeep(e);
        else
          for (const r of i ?? Reflect.ownKeys(t)) {
            if (r === $OWNER) continue;
            const o = t[r];
            const i = n[r];
            if (o !== null && typeof o === "object" ? !targetsEqual(i, o) : !isEqual(i, o)) {
              bumpDeep(e);
              break;
            }
          }
      }
      const s = e.k;
      if (s !== null && (s.o !== null || s.l & 2048)) {
        let r;
        if (e.ovl) {
          r = !!e.del?.size;
          if (!r) {
            for (const e of Reflect.ownKeys(t))
              if (!hasOwn.call(n, e)) {
                r = true;
                break;
              }
          }
        } else
          r = Array.isArray(t) && Array.isArray(n) ? arrayStructureChanged(n, t) : membershipChanged(n, t);
        if (r) notifyContainer(s, t);
      }
    }
    var FORCE = Symbol();
    function targetsEqual(e, t) {
      if (e === null || typeof e !== "object" || t === null || typeof t !== "object") return false;
      const n = lookupTarget(e, null);
      return n !== void 0 && n === lookupTarget(t, null);
    }
    function arrayStructureChanged(e, t) {
      if (e.length !== t.length) return true;
      for (let n = 0; n < t.length; n++) {
        const r = e[n];
        const o = t[n];
        if (!isEqual(r, o) && !targetsEqual(r, o)) return true;
      }
      return false;
    }
    function membershipChanged(e, t) {
      const n = Reflect.ownKeys(t);
      if (Reflect.ownKeys(e).length - +isOwned(e) !== n.length - +isOwned(t)) return true;
      for (const t of n) if (t !== $OWNER && !(t in e)) return true;
      return false;
    }

    function leafSet(e, t) {
      setSignal(e, t);
      if (passLane !== null && !userWrite && e.O.rr !== null) holdWithDerive(e.O, e);
    }
    function notifyKeyDiff(e, t, n, r, o = true) {
      if (e.acc === true || (o && hasOwn.call(r, t) && lookupGetter.call(r, t) !== void 0)) {
        e.acc = isOwnAccessor(r, t);
        const o = Object.getOwnPropertyDescriptor(n, t);
        const i = Object.getOwnPropertyDescriptor(r, t);
        if (!i || i.get || i.set) {
          if (o?.get !== i?.get || o?.set !== i?.set || o?.value !== i?.value) leafSet(e, () => FORCE);
          return;
        }
        const l = o?.value;
        const s = i?.value;
        if (o?.get || o?.set || (!isEqual(l, s) && !targetsEqual(l, s)))
          leafSet(e, typeof s === "function" ? () => s : s);
      } else {
        const o = n[t];
        const i = r[t];
        if (n[$TARGET] || (!isEqual(o, i) && !targetsEqual(o, i)))
          leafSet(e, typeof i === "function" ? () => i : i);
      }
    }
    function hasAccessorFlag(e) {
      return e.acc === true;
    }
    function notifyKeyValue(e, t, n, r, o, i) {
      if (e.acc === true) {
        notifyKeyDiff(e, t, o, i, false);
        return;
      }
      if (!isEqual(n, r) && !targetsEqual(n, r)) leafSet(e, typeof r === "function" ? () => r : r);
    }

    function notifyFoldTail(e, t, n) {
      const r = e.h;
      const o = t[$TARGET];
      if (r !== null) {
        for (const e of Reflect.ownKeys(r)) if (o || e in t !== e in n) leafSet(r[e], e in n);
      }
      const i = e.k;
      if (i !== null && (i.o !== null || i.l & 2048)) {
        if (
          o ||
          (Array.isArray(n) && Array.isArray(t) ? arrayStructureChanged(t, n) : membershipChanged(t, n))
        )
          notifyContainer(i, n);
      }
    }

    function notifyFold(e, t, n) {
      if (e.dk !== null && t !== n) bumpDeep(e);
      const r = e.n;
      if (r !== null) for (const e of Reflect.ownKeys(r)) notifyKeyDiff(r[e], e, t, n);
      notifyFoldTail(e, t, n);
    }
    var writing = 0;

    var writeScopes = null;
    var pendingNotify = new Set();
    function scopeKey(e) {
      if (e.rr !== null) return e.rr;
      let t = e;
      while (t.u !== null) t = t.u;
      return t;
    }
    function inDraft(e) {
      return writeScopes !== null && writeScopes.has(scopeKey(e));
    }

    function serveShallow(e, t, n) {
      if (n !== null && typeof n === "object" && n[$TARGET] !== void 0) return draftServe(e, wrap(n, e, t));
      return n;
    }
    function draftServe(e, t) {
      if (writeScopes !== null && inDraft(e)) {
        const e = t?.[$TARGET];
        if (e?.v !== void 0) writeScopes.add(scopeKey(e));
      }
      return t;
    }

    function committed(e) {
      const t = e.k;
      if (t !== null) return t.ue !== NOT_PENDING ? asBacking(t.le) : e.v;
      return e.pb !== null ? preBatch(e) : e.v;
    }

    function stagingReader() {
      let e = context;
      if (e === null) return null;
      if (e.Qe) e = e.Ke ?? null;
      return e === null || e.l & 16 ? null : e;
    }

    function readSource(e, t, n = false) {
      if (userWrite && e.rr?.opt === true && !pendingNotify.has(e) && inDraft(e)) {
        const t = ensurePB(e);
        pendingNotify.add(e);
        return t;
      }
      const r = e.pb;
      if (r === null) return e.v;
      if (inDraft(e) || writeOverride) {
        if (writeOverride && !userWrite) {
          const n = t !== void 0 ? e.n?.[t] : void 0;
          if (n !== void 0) {
            if ((n.l & 2304) === 256) joinPassTx(txOf(n));
          } else {
            const n = e.k;
            if (n !== null && (n.l & 2304) === 256 && (t === void 0 || heldKeyChanged(e, t)))
              joinPassTx(txOf(n));
          }
        }
        return r;
      }
      const o = e.k;
      if (t !== void 0) {
        if (e.n?.[t]?.l & 2048) return committed(e);
      }
      const i = o !== null && (o.l & 256) !== 0;
      if (i && t !== void 0 && !heldKeyChanged(e, t, n)) return r;
      const l = stagingReader();
      if (l === null) {
        if (getObserver() !== null) return r;
        if (familyAhead(e)) return r;
        if (verdict === null || (!i && t !== void 0 && !keyChanged(e, t, n)))
          return i ? asBacking(o.le) : e.v;
        return o === null ? committed(e) : asBacking(read(o));
      }
      if (!i) {
        if (l.R & 16384 && !(l.l & 32784)) return r;
        if (t !== void 0 && !keyChanged(e, t, n)) return committed(e);
        if (o === null) {
          if (l.l & 32768 && stagedScreen(l)) return committed(e);
          stagedRead(l);
          return r;
        }
      }
      return asBacking(untrack(() => read(o)));
    }

    function heldKeyChanged(e, t, n = true) {
      return changedBetween(e, e.k.le, e.k.ue, t, n) && !adoptChild(e, t);
    }

    var frameRaws = new WeakMap();
    function rawsOf(e) {
      let t = frameRaws.get(e);
      if (t === void 0) frameRaws.set(e, (t = new Set(Object.values(e))));
      return t;
    }

    function sameRow(e, t, n) {
      return (
        e !== null &&
        typeof e === "object" &&
        t !== null &&
        typeof t === "object" &&
        (n === null || sameKey(n(e), n(t)))
      );
    }

    function adoptChild(e, t) {
      const n = e.k;
      const r = asBacking(n.le);
      const o = r[t];
      const i = n.ue[t];
      const l = Array.isArray(r) ? e.rr?.key : null;
      if (
        e.s ||
        l === void 0 ||
        !sameRow(o, i, l) ||
        !isWrappable(o) ||
        !isWrappable(i) ||
        Array.isArray(o) !== Array.isArray(i) ||
        lookupTarget(o, e.rr) !== void 0 ||
        lookupTarget(i, e.rr) !== void 0 ||
        rawsOf(r).has(i) ||
        rawsOf(n.ue).has(o)
      )
        return false;
      const s = wrap(o, e, t)[$TARGET];
      if (s?.v !== o) return false;
      adoptPB(s, i, false);
      holdNode(getContainerNode(s), txOf(n));
      return true;
    }
    function familyAhead(e) {
      return e.rr !== null && context === null && !(e.k?.l & 256);
    }

    function keyChanged(e, t, n = true) {
      return changedBetween(e, committed(e), e.pb, t, n);
    }
    function changedBetween(e, t, n, r, o) {
      if (e.ch || n[$TARGET] !== void 0 || protoOf(n) !== protoOf(t) || !plainProto(t)) return true;
      if (e.del?.has(r)) return r in t;
      const i = hasOwn.call(n, r) || (e.ovl && hasOwn.call(e.v, r));
      if (i !== hasOwn.call(t, r)) return true;
      if (!i) return false;
      if (
        (o || e.a) &&
        (isOwnAccessor(t, r) ||
          isOwnAccessor(n, r) ||
          propertyIsEnumerable.call(t, r) !== propertyIsEnumerable.call(n, r))
      )
        return true;
      const l = n[r];
      const s = t[r];
      return !isEqual(s, l) && !sameLogicalSlot(e, s, l);
    }

    function nodeValue(e, t, n) {
      let r;
      if (e.ue !== NOT_PENDING && !(e.l & 256) && n.rr !== null && (context === null || n.rr.node?.m & 4)) {
        if (context !== null && tracking) link(e, context);
        r = e.ue;
      } else r = read(e);
      return r === FORCE ? t : r;
    }

    function serveDataKey(e, t, n, r, o, i = -1) {
      const l = e.ch && r === e.v;
      let s = n;
      if (!inDraft(e) && !writeOverride) {
        if (o === void 0 && getObserver() !== null) o = getNode(e, t, i);
        if (o !== void 0) {
          const t = nodeValue(o, n, e);
          if (l) {
            o.le = n;
            if (o.l & 2048) s = t;
          } else s = t;
        }
      }
      if (e.s) return serveShallow(e, t, s);
      if (e.ch && !l && s !== null && typeof s === "object" && s[$TARGET]?.px !== s)
        s = resolveChainedRaw(e, t, s);
      if (o !== void 0) {
        if (o.pxv === s && s !== void 0) return draftServe(e, o.px);
        if (!isWrappable(s)) return s;
        const n = wrap(s, e, t);
        o.px = n;
        o.pxv = s;
        return draftServe(e, n);
      }
      if (!isWrappable(s)) return s;
      return draftServe(e, wrap(s, e, t));
    }

    function linkedTo(e, t) {
      for (let n = t.o; n !== null; n = n.t) if (n.u === e) return true;
      return false;
    }

    function pullFamily(e) {
      const t = e.rr.node;
      if (t === null || writeOverride || inDraft(e)) return;
      if (t.m & 3 || t.l & 2097152) {
        if (verdict === null && t.m & 1 && optHooks?.stands(e)) return;
        const n = context;
        if (
          n !== null &&
          n.i === 1 &&
          t.m & 1 &&
          t.l & 256 &&
          flushTransaction !== txOf(t) &&
          !linkedTo(n, t)
        )
          return;
        if (n && t.l & 2097152) link(t, n);
        read(t);
      } else {
        untrack(() => read(t));
        if (observeFlightHook && t.l & 32768 && !(t.R & (1 << 21)) && tracking) {
          const n = e.rr;
          n.w = 0;
          for (let e = t.C; e; e = e.G) if (e.S.m & 1) ((n.w = 1), read(e.S));
        }
      }
    }

    function holdWithDerive(e, t, n = passLane) {
      const r = e.rr?.node;
      if (laneStageHook && n !== null && t.ue !== NOT_PENDING && !(t.l & 2048)) {
        list(t, n);
        t.T.P = t.ue;
        t.ue = NOT_PENDING;
        t.l |= CONFIG_OVERRIDE;
        return;
      }
      if (r !== void 0 && r !== null && r.l & 256 && t.ue !== NOT_PENDING && !(t.l & 2304)) {
        holdNode(t, txOf(r));
        t.T.Ve = r.T.Ve;
      }
    }

    function resolveChainedRaw(e, t, n) {
      const r = e.v[$TARGET];
      if (r.ch) {
        const e = resolveChainedRaw(r, t, n);
        return e === n ? n : wrap(e, r, t);
      }
      const o = lookupTarget(n, r.rr);
      if (o !== void 0) return o.px;
      if ((r.v[t] === n || r.pb?.[t] === n) && isWrappable(n)) return wrap(n, r, t);
      return n;
    }

    function enumerationSource(e) {
      if (!inDraft(e) && !writeOverride && getObserver() !== null) {
        const t = asBacking(read(getContainerNode(e)));
        return optHooks && e.rr?.opt === true ? optHooks.view(e, t) : t;
      }
      const t = readSource(e);
      return optHooks && optRead(e) ? optHooks.view(e, t) : t;
    }

    function optRead(e) {
      return e.rr?.opt === true && !inDraft(e) && !writeOverride;
    }
    var UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

    function touch(e, t) {
      let n = e.wk;
      if (!pendingNotify.has(e)) {
        pendingNotify.add(e);
        if (n !== null && n !== WK_ALL) {
          n = new Set();
          n.u = e.wk;
          e.wk = n;
        }
      }
      if (n !== WK_ALL) (e.wk ??= new Set()).add(t);
    }
    TargetShape.prototype = {
      get(e, t, n) {
        const r = this;
        if (typeof t !== "string") {
          if (t === $TARGET) return r;
          if (t === $PROXY) return n;
          if (t === $OWNER) return void 0;
          if (t === $RECORD) return void 0;
          if (t === $REFRESH) return r.rr?.node ?? void 0;
          if (t === $TRACK) {
            if (r.rr !== null) pullFamily(r);
            if (!inDraft(r) && getObserver() !== null) {
              read(getContainerNode(r));
              const e = readSource(r);
              if (e[$TARGET] !== void 0) e[$TRACK];
            }
            return;
          }
        }
        if (verdict !== null && affectsHooks !== null && getObserver() === null) affectsHooks.io(r, t);
        if (r.rr !== null) pullFamily(r);
        const o = r.n?.[t];
        if (writeScopes === null && !writeOverride) {
          const e = o;
          if (e !== void 0 && e.acc !== true && (!r.ch || e.l & 2048)) {
            const n = nodeValue(e, void 0, r);
            if (n === null || typeof n !== "object") return n;
            if (r.s) return serveShallow(r, t, n);
            if (e.pxv === n) return e.px;
            if (isWrappable(n)) {
              const o = wrap(n, r, t);
              e.px = o;
              e.pxv = n;
              return o;
            }
            return n;
          }
        }
        const i = readSource(r, t);
        if (i === r.pb && r.del?.has(t)) {
          if (!inDraft(r) && getObserver() !== null) read(getNode(r, t));
          return;
        }
        let l = -1;
        {
          let e;
          if (o !== void 0) e = o.acc === true;
          else if (!inDraft(r) && getObserver() !== null) {
            e = isOwnAccessor(i, t);
            if (i === (r.pb ?? r.v)) l = e ? 1 : 0;
          } else e = false;
          if (e) {
            if (!inDraft(r) && getObserver() !== null) read(o ?? getNode(r, t, l));
            const e = Reflect.get(i, t, n);
            if (r.s) return serveShallow(r, t, e);
            return isWrappable(e) ? draftServe(r, wrap(e, r, t)) : e;
          }
        }
        const s = r.ovl && i === r.pb;
        if (
          (t === "constructor" ? writeOverride || inDraft(r) : t === "__proto__" || t === "prototype") &&
          !hasOwn.call(i, t) &&
          !(s && hasOwn.call(r.v, t))
        )
          return void 0;
        let f = i[t];
        if (f === void 0 ? !hasOwn.call(i, t) && !(s && hasOwn.call(r.v, t)) : false) {
          f = Reflect.get(i, t, n);
          if (typeof f === "function") return f;
          if (r.ch && i === r.v) return serveDataKey(r, t, f, i, o, l);
          if (f === void 0 && !inDraft(r)) {
            if (getObserver() !== null) getNode(r, t, l);
            const e = r.n?.[t];
            if (e) {
              const n = nodeValue(e, void 0, r);
              if (r.s) return serveShallow(r, t, n);
              return isWrappable(n) ? draftServe(r, wrap(n, r, t)) : n;
            }
          }
          if (r.s) return serveShallow(r, t, f);
          return isWrappable(f) ? draftServe(r, wrap(f, r, t)) : f;
        }
        if (typeof f === "function" && !hasOwn.call(i, t) && !(s && hasOwn.call(r.v, t))) return f;
        return serveDataKey(r, t, f, i, o, l);
      },
      has(e, t) {
        const n = this;
        if (t === $TARGET || t === $PROXY || t === $TRACK) return true;
        if (t === $OWNER || t === $RECORD) return false;
        if (verdict !== null && affectsHooks !== null && getObserver() === null) affectsHooks.io(n, t);
        if (n.rr !== null) pullFamily(n);
        const r = readSource(n, t);
        if (!inDraft(n) && !writeOverride) {
          if (getObserver() !== null) {
            const e = getHasNode(n, t);
            const o = read(e);
            if (!n.ch || r !== n.v) return !!o;
            const i = t in r;
            e.le = i;
            if (e.l & 2048) return !!o;
            return i;
          } else if (optHooks && optRead(n)) {
            const e = optHooks.has(n, t);
            if (e !== void 0) return e;
          }
        }
        return t in r && !(r === n.pb && n.del?.has(t));
      },
      ownKeys() {
        const e = this;
        if (verdict !== null && affectsHooks !== null && getObserver() === null) affectsHooks.io(e, void 0);
        if (e.rr !== null) pullFamily(e);
        return visibleKeys(e, enumerationSource(e));
      },
      getOwnPropertyDescriptor(e, t) {
        const n = this;
        if (t === $OWNER || t === $RECORD) return void 0;
        const r = getObserver();
        if (verdict !== null && affectsHooks !== null && r === null) affectsHooks.io(n, t);
        if (n.rr !== null) pullFamily(n);
        const o = r !== null && !inDraft(n) && !writeOverride;
        const i = o && observerHoldsContainer(n, r);
        let l;
        if (i) l = enumerationSource(n);
        else if (o) {
          const e = getHasNode(n, t);
          const r = read(e);
          l = readSource(n, t, true);
          if (!r && (!n.ch || e.l & 2048 || !(t in l))) return void 0;
        } else l = readSource(n, t, true);
        let s;
        if (optHooks && !i && optRead(n)) {
          const e = optHooks.descriptor(n, t);
          if (e === null) return void 0;
          s = e;
        }
        s ??= visibleDescriptor(n, l, t);
        if (s === void 0) return void 0;
        if (!(t === "length" && Array.isArray(e))) s.configurable = true;
        return s;
      },
      set(e, t, n) {
        const r = this;
        const o = inDraft(r);
        if (!o && !writeOverride) return true;
        if (t === "__proto__") return true;
        const i = r.s ? n : unwrapValue(n);
        const l = ensurePB(r);
        if (userWrite && r.k?.l & 256) deferredReleases.add(getNode(r, t));
        if (Array.isArray(l)) {
          touch(r, t);
          if (t === "length") r.wk = WK_ALL;
          else touch(r, "length");
        } else {
          touch(r, t);
          if (!(t in l)) r.kc++;
        }
        const s = UNSAFE_KEYS.has(t);
        if (s || (r.ovl && r.sc !== 2 && !hasOwn.call(l, t)))
          Object.defineProperty(l, t, {
            value: i,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        else l[t] = i;
        r.del?.delete(t);
        if (s) return true;
        if (r.s && i !== null && typeof i === "object") markRawOne(i);
        if (!o) notifyWrites(r);
        return true;
      },
      defineProperty(e, t, n) {
        const r = this;
        const o = inDraft(r);
        if (!o && !writeOverride) return true;
        if (t === "__proto__") return true;
        if (n.get || n.set) r.a = true;
        if ("value" in n)
          n = {
            ...n,
            value: unwrapValue(n.value),
          };
        const i = ensurePB(r);
        if (r.a || !(n.enumerable && n.writable && n.configurable)) r.sc = 1;
        touch(r, t);
        Object.defineProperty(i, t, n);
        r.del?.delete(t);
        if (!o) notifyWrites(r);
        return true;
      },
      deleteProperty(e, t) {
        const n = this;
        const r = inDraft(n);
        if (!r && !writeOverride) return true;
        const o = ensurePB(n);
        touch(n, t);
        const i = n.ovl && hasOwn.call(n.v, t);
        if (hasOwn.call(o, t)) {
          delete o[t];
          i || n.kc--;
        }
        if (i) (n.del ??= new Set()).add(t);
        if (!r) notifyWrites(n);
        return true;
      },
      getPrototypeOf() {
        return protoOf(this.v);
      },
      preventExtensions: () => false,
      setPrototypeOf: () => false,
    };

    function observerHoldsContainer(e, t) {
      const n = e.k;
      if (n === null) return false;
      const r = n.Ze;
      return r !== null && r.u === t && (!(t.R & 4) || r.Ne === t.de);
    }
    function storeSetter(e, t, n = true) {
      if (writeHook !== null) writeHook(e);
      const r = e[$TARGET];
      const o = writeScopes;
      writeScopes = new Set();
      writeScopes.add(scopeKey(r));
      const i = userWrite;
      userWrite = n;
      if (writing === 0 && pendingNotify.size) pendingNotify.clear();
      writing++;
      let l;
      try {
        l = t(e);
      } finally {
        writing--;
        writeScopes = o;
        if (writing === 0 && pendingNotify.size) {
          const e = [...pendingNotify];
          pendingNotify.clear();
          for (const t of e) notifyWrites(t);
          if (directCommit) {
            for (const t of e) if (t.pb !== null) foldTarget(t, t.v);
          }
        }
        userWrite = i;
      }
      if (l !== void 0 && l !== e && isWrappable(l)) {
        if (optHooks && n && r.rr?.opt === true && !writeOverride) optHooks.writes(r, unwrapValue(l));
        else adoptPB(r, unwrapValue(l));
      }
      if (n && heldDerivationHit) {
        heldDerivationHit = false;
        const e = r.rr.node;
        if (!(e.R & 2)) {
          e.R = (e.R & -2) | 2;
          insertIntoHeap(e, dirtyQueue);
          schedule();
        }
      }
    }
    function createStore$1(e, t) {
      const n = t?.shallow === true;
      const r = wrap(e);
      if (signalHook !== null) signalHook(r[$TARGET]);
      if (n) {
        r[$TARGET].s = true;
        markRawIngest(e);
      }
      const setter = (e) => storeSetter(r, e);
      return [r, setter];
    }

    installShallowView((e) => {
      if (e?.s && !(e.ch || e.a || writeScopes || writeOverride || e.rr?.opt))
        return (e.rr && pullFamily(e), readSource(e));
    });
    function visibleKeys(e, t) {
      let n;
      if (e.ovl && t === e.pb) {
        n = Reflect.ownKeys(e.v);
        const r = e.del;
        if (r?.size) n = n.filter((e) => !r.has(e));
        for (const r of Reflect.ownKeys(t)) if (!hasOwn.call(e.v, r)) n.push(r);
      } else n = Reflect.ownKeys(t);
      for (let e = n.length - 1; e >= 0 && typeof n[e] === "symbol"; e--)
        if (n[e] === $OWNER) {
          n.splice(e, 1);
          break;
        }
      return n;
    }
    function visibleDescriptor(e, t, n) {
      let r = Object.getOwnPropertyDescriptor(t, n);
      if (e.ovl && t === e.pb) {
        if (e.del?.has(n)) return void 0;
        if (r === void 0) r = Object.getOwnPropertyDescriptor(e.v, n);
      }
      return r;
    }

    function reconcileState(e, n, t, o = false) {
      if (n == null) throw new Error("");
      const f = n[$TARGET];
      if (f?.px !== n) throw new Error("");
      const i = t === null ? null : typeof t === "string" ? (e) => e?.[t] : t;
      if (optHooks && userWriting() && f.rr?.opt === true) {
        optHooks.reconcile(n, unwrapValue(e), i);
        return;
      }
      if (o && e !== n && e?.[$TARGET] !== void 0) {
        if ((f.pb ?? f.v) === e) return;
        adoptPB(f, e);
        return;
      }
      const l = unwrapValue(e);
      if (i) {
        const e = f.pb ?? f.v;
        const n = i(e);
        if (n !== void 0 && !sameKey(i(l), n)) {
          if (!o) throw new Error("");
          if (isOwned(e)) delete e[$OWNER];
          else (f.rr?.map ?? storeLookup).delete(e);
          adoptPB(f, l);
          return;
        }
      }
      applyAdopt(f, l, i, o);
    }

    function applyAdopt(e, n, t, o = false) {
      const f = e.ovl ? materializePB(e) : (e.pb ?? e.v);
      if (n === f && !isOwned(f)) return;
      const i = optHooks && e.rr?.opt === true ? optHooks.view(e, f) : f;
      const l = Array.isArray(n);
      const r = e.s === true;
      adoptPB(e, n, false);
      if (r) markRawIngest(n);
      let u = e.dk === null;
      if (Array.isArray(i) !== l || f[$TARGET]) {
        notifyFold(e, f, n);
        return;
      }
      if (l) {
        const l = e.n;
        let s = 0;
        if (t && !r) {
          const r = i.length;
          const a = n.length;
          let c = 0;
          for (const d = Math.min(r, a); c < d; c++) {
            const r = n[c];
            const a = i[c];
            if (a !== r && !sameRow(a, r, t)) break;
            if (r !== null && typeof r === "object" && (a !== r || isOwned(r)))
              descend(unwrapValue(a), r, t, o, e, c);
            if (!u && !(r !== null && typeof r === "object" ? targetsEqual(a, r) : isEqual(a, r))) {
              bumpDeep(e);
              u = true;
            }
            if (l !== null) {
              const e = l[c];
              if (e !== void 0) {
                s++;
                notifyKeyValue(e, c, f[c], r, f, n);
              }
            }
          }
          if (!u && c < n.length) bumpDeep(e);
          const d = c;
          let p = null;
          for (; c < n.length; c++) {
            const r = n[c];
            if (r !== null && typeof r === "object") {
              const n = t(r);
              let f;
              if (n !== void 0) {
                if (p === null) {
                  p = new Map();
                  for (let e = d; e < i.length; e++) {
                    const n = unwrapValue(i[e]);
                    if (n !== null && typeof n === "object") {
                      const o = t(n);
                      if (o === void 0) continue;
                      const f = p.get(o);
                      if (f === void 0) p.set(o, e);
                      else if (Array.isArray(f)) f.push(e);
                      else p.set(o, [f, e]);
                    }
                  }
                }
                const e = p.get(n);
                if (e === void 0) f = void 0;
                else if (Array.isArray(e)) {
                  f = unwrapValue(i[e.shift()]);
                  if (e.length === 1) p.set(n, e[0]);
                } else {
                  f = unwrapValue(i[e]);
                  p.delete(n);
                }
              } else f = unwrapValue(i[c]);
              descend(f, r, t, o, e, c);
            }
            if (l !== null) {
              const e = l[c];
              if (e !== void 0) {
                s++;
                notifyKeyDiff(e, c, f, n, false);
              }
            }
          }
        } else {
          const a = Math.min(i.length, n.length);
          const c = n.length;
          for (let d = 0; d < c; d++) {
            const c = n[d];
            if (!r && d < a && c !== null && typeof c === "object") descend(unwrapValue(i[d]), c, t, o, e, d);
            if (!u && !(c !== null && typeof c === "object" ? targetsEqual(i[d], c) : isEqual(i[d], c))) {
              bumpDeep(e);
              u = true;
            }
            if (l !== null) {
              const e = l[d];
              if (e !== void 0) {
                s++;
                notifyKeyDiff(e, d, f, n, false);
              }
            }
          }
        }
        if (l !== null && s < e.nc)
          for (const e of Reflect.ownKeys(l)) {
            const t = typeof e === "string" ? +e : NaN;
            if (!(t >= 0 && t < n.length)) notifyKeyDiff(l[e], e, f, n, false);
          }
        notifyFoldTail(e, f, n);
        return;
      }
      const s = e.n;
      let a = 0;
      for (const l in n) {
        const c = n[l];
        let d = f[l];
        if (optHooks && d === c && i !== f) d = i[l];
        const p = c !== null && typeof c === "object";
        if (d === c && (!p || !isOwned(c)) && (s === null || s[l] === void 0 || !hasAccessorFlag(s[l]))) {
          if (s?.[l] !== void 0) a++;
          continue;
        }
        if (p && !r) descend(unwrapValue(i[l]), c, t, o, e, l);
        if (!u && !(p ? targetsEqual(d, c) : isEqual(d, c))) {
          bumpDeep(e);
          u = true;
        }
        if (s !== null) {
          const e = s[l];
          if (e !== void 0) {
            a++;
            notifyKeyValue(e, l, d, c, f, n);
          }
        }
      }
      const c = Object.getOwnPropertySymbols(n);
      for (let i = 0; i < c.length; i++) {
        const l = c[i];
        if (l === $OWNER) continue;
        const u = n[l];
        if (!r && u !== null && typeof u === "object") descend(unwrapValue(f[l]), u, t, o, e, l);
        if (s !== null) {
          const e = s[l];
          if (e !== void 0) {
            a++;
            notifyKeyValue(e, l, f[l], u, f, n);
          }
        }
      }
      if (s !== null && a < e.nc) {
        for (const e of Reflect.ownKeys(s))
          if (!hasOwnP.call(n, e))
            notifyKeyDiff(s[e], e, f, e === "__proto__" ? Object.create(null) : n, false);
      }
      notifyFoldTail(e, f, n);
    }
    var hasOwnP = Object.prototype.hasOwnProperty;

    function descend(e, n, t, o, f, i) {
      if (e === null || typeof e !== "object") return;
      const l = f.rr;
      n = unwrapValue(n);
      let r = lookupTarget(e, l);
      const u = lookupTarget(n, l);
      if (r !== void 0 && r.pk !== i) {
        if (r.pk != i && f.v[r.pk] === r.v) r = void 0;
        else if (r.u === f) r.pk = i;
      }
      if (u !== void 0 && u !== r) {
        if (u.v === n) {
          if (u.u === f) u.pk = i;
          return;
        }
        (l?.map ?? storeLookup).delete(n);
      }
      if (r === void 0) return;
      if (!isWrappable(n)) return;
      if (rawValuesUsed && isRawValue(n)) return;
      if (Array.isArray(e) !== Array.isArray(n)) return;
      if (typeof i !== "number" && t) {
        const o = t(e);
        const f = t(n);
        if (o !== void 0 && f !== void 0 && !sameKey(o, f)) return;
      }
      if (!o && t !== null && !r.d) return;
      applyAdopt(r, n, t, o);
    }

    function wrapDraft(e, t, r, o, n, i) {
      const mutate = (e) => {
        if (!t()) return true;
        setWriteOverride(true);
        const o = question;
        if (i !== void 0) setQuestion(i());
        try {
          r ? r(e) : e();
        } finally {
          setWriteOverride(false);
          setQuestion(o);
        }
        if (n) n();
        return true;
      };
      const read = (e) => {
        setWriteOverride(true);
        try {
          return e();
        } finally {
          setWriteOverride(false);
        }
      };
      const c = new Proxy(Array.isArray(e) ? [] : {}, {
        get(s, c) {
          const l = read(() => e[c]);
          return !o && typeof l === "object" && l !== null && c !== $TARGET
            ? wrapDraft(l, t, r, false, n, i)
            : l;
        },
        has: (t, r) => read(() => r in e),
        set: (t, r, o) =>
          mutate(() => {
            e[r] = o;
          }),
        deleteProperty: (t, r) =>
          mutate(() => {
            delete e[r];
          }),
        ownKeys: () => read(() => Reflect.ownKeys(e)),
        getPrototypeOf: () => protoOf(e),
        getOwnPropertyDescriptor(t, r) {
          const o = read(() => Reflect.getOwnPropertyDescriptor(e, r));
          if (o) o.configurable = true;
          return o;
        },
        defineProperty: (t, r, o) =>
          mutate(() => {
            Reflect.defineProperty(e, r, o);
          }),
      });
      const l = e[$TARGET];
      if (l !== void 0) setLookup(c, l);
      return c;
    }
    function cloneState(e, t) {
      return t ? (Array.isArray(e) ? e.slice() : { ...e }) : JSON.parse(JSON.stringify(e));
    }

    function wakeFamily(e) {
      const t = e.node;
      const r = new NotReadyError(t);
      e.Tt = true;
      const o = optHooks?.ask(e);
      forEachFamilyNode(e, (e) => {
        if (e.o === null || o?.(e)) return;
        addPendingSource(e, t);
        propagateStatus(e, 1, r);
      });
    }

    function errorFamily(e, t) {
      forEachFamilyNode(e, (e) => {
        if (e.o === null) return;
        forEachDependent(e, (e) => {
          (e.m & 2 && e.T.U === t) || enqueueSub(e);
        });
      });
      schedule();
    }

    function settleFamily(e) {
      if (!e.Tt) return;
      e.Tt = false;
      const t = e.node;
      forEachFamilyNode(e, (e) => {
        if (e.o !== null) settlePendingSource(e, t);
      });
      insertSubs(t);
    }

    function familyStatus(e, t) {
      if (e & 1) wakeFamily(this);
      else if (!e) settleFamily(this);
      else if (e & 2) errorFamily(this, t);
    }
    function forEachFamilyNode(e, t) {
      for (const r of e.live) {
        const e = r.n;
        if (e !== null) for (const r of Reflect.ownKeys(e)) t(e[r]);
        const o = r.h;
        if (o !== null) for (const e of Reflect.ownKeys(o)) t(o[e]);
        if (r.k !== null) t(r.k);
        if (r.dk !== null) t(r.dk);
      }
    }

    function runProjectionComputed(e, t, r, o, n) {
      const i = getOwner();
      const s = e[$TARGET];
      const c = s.rr;
      const l = (c.run = (c.run || 0) + 1);
      if (observeFlightHook && (c.Tt || c.w)) ((c.w = 0), (i.l &= ~CONFIG_VERDICT));
      let u;
      const a = i.Ie ? cloneState(s.v, s.s) : null;
      const asking = () => question || (i.T !== null && i.T.Ee !== null ? i.T.ce : 0);
      const f = wrapDraft(
        e,
        () => c.run === l && !isDisposed(i),
        n,
        s.s,
        () => {
          if (!(i.m & 1) && !i.Ie) schedule();
        },
        asking,
      );
      const d = l === 1;
      const pass = () =>
        storeSetter(
          f,
          (n) => {
            u = t(a ?? n);
            const commit = (t, l = 1) => {
              if (a && (t === void 0 || t === a)) t = cloneState(a, s.s);
              if (t !== n && t !== void 0) {
                const write = () => {
                  const o = question;
                  setQuestion(asking());
                  try {
                    storeSetter(e, (e) => reconcileState(t, e, r, true), false);
                  } finally {
                    setQuestion(o);
                  }
                };
                o ? o(write, t) : write();
              }
              if (!d || !(i.m & 4)) settleFamily(c);
              if (l) insertSubs(i);
            };
            const l = handleAsync(i, u, commit, (e, t) => {
              if (d && i.m & 4) return;
              if (t) wakeFamily(c);
              else errorFamily(c, e);
            });
            if (!i.Ie) commit(l, i.m & 3);
          },
          false,
        );
      try {
        d ? runDirect(pass) : pass();
      } catch (e) {
        if (!d) e instanceof NotReadyError ? wakeFamily(c) : errorFamily(c, e);
        throw e;
      }
      if (i.m & 1 && i.T.Ee !== null && !i.Ie && !d) wakeFamily(c);
      return i;
    }

    function createProjectionInternal(e, t, r, o) {
      t ||= {};
      const n = r?.key === void 0 ? "id" : r.key;
      const i = {
        map: new WeakMap(),
        node: null,
        live: new Set(),
        st: familyStatus,
        It: !!r?.shallow,
        opt: o,
        key: typeof n === "function" ? n : n === null ? null : (e) => (isWrappable(e) ? e[n] : void 0),
      };
      const s = wrap(t, null, null, i);
      if (i.It) {
        s[$TARGET].s = true;
        markRawIngest(t);
      }
      let c;
      if (r?.seedLoadingValue) c = { loadingValue: void 0 };
      if (e) {
        const t = computed(() => {
          if (!i.node) i.node = getOwner();
          runProjectionComputed(s, e, n);
        }, c);
        t.l &= -33;
        i.node = t;
        t.rr = i;
      }
      return s;
    }
    function createStoreDerived(e, t, r) {
      const o = createProjectionInternal(e, t, r);
      return [o, (e) => storeSetter(o, e)];
    }

    function createStore$2(e, r, t) {
      if (typeof e === "function") return createStoreDerived(e, r, t);
      return createStore$1(e, r);
    }

    function flatten(r, t) {
      if (typeof r === "function" && !r.length) {
        if (t?.doNotUnwrap) return r;
        do r = r();
        while (typeof r === "function" && !r.length);
      }
      if (t?.skipNonRendered && (r == null || r === true || r === false || r === "")) return;
      if (Array.isArray(r)) {
        let e = [];
        if (flattenArray(r, e, t))
          return () => {
            let r = [];
            flattenArray(e, r, {
              ...t,
              doNotUnwrap: false,
            });
            return r;
          };
        return e;
      }
      return r;
    }
    function flattenArray(r, t = [], e) {
      let o = null;
      let f = false;
      for (let n = 0; n < r.length; n++)
        try {
          let o = r[n];
          if (typeof o === "function" && !o.length) {
            if (e?.doNotUnwrap) {
              t.push(o);
              f = true;
              continue;
            }
            do o = o();
            while (typeof o === "function" && !o.length);
          }
          if (Array.isArray(o)) f = flattenArray(o, t, e) || f;
          else if (e?.skipNonRendered && (o == null || o === true || o === false || o === "")) {
          } else t.push(o);
        } catch (r) {
          if (!(r instanceof NotReadyError)) throw r;
          o = r;
        }
      if (o) throw o;
      return f;
    }

    var IS_DEV = false;
    var sharedConfig$1 = {
      hydrating: false,
      registry: void 0,
      done: false,
    };
    var _createRoot;
    var _createMemo;
    var _createSignal;
    var _createRenderEffect;
    var _createEffect;
    var _hydrateStoreLike;
    var createMemo = (...args) => {
      return (_createMemo || createMemo$1)(...args);
    };
    var createSignal = (...args) => {
      return (_createSignal || createSignal$1)(...args);
    };
    var createStore = (...args) => {
      return typeof args[0] === "function" && sharedConfig$1.hydrating
        ? _hydrateStoreLike(createStore$2, args[0], args[1] ?? {}, args[2])
        : createStore$2(...args);
    };
    var createRoot = (...args) => (_createRoot || createRoot$1)(...args);
    var createRenderEffect = (...args) => (_createRenderEffect || createRenderEffect$1)(...args);
    var createEffect = (...args) => (_createEffect || createEffect$1)(...args);
    function createComponent(Comp, props, name, loc) {
      return untrack(() => Comp(props || {}));
    }
    var narrowedError = (name) => {
      throw `Stale read from <${name}>.`;
    };
    function For(props) {
      const options =
        "fallback" in props
          ? {
              keyed: props.keyed,
              fallback: () => props.fallback,
            }
          : { keyed: props.keyed };
      const owner = getOwner();
      let mapped;
      const create = () => runWithOwner(owner, () => mapArray(() => props.each, props.children, options));
      if (sharedConfig$1.hydrating) mapped = create();
      const list = () => (mapped ?? (mapped = create()))();
      return list;
    }
    function Show(props) {
      const keyed = props.keyed;
      const conditionValue = createMemo$1(() => props.when, void 0);
      const condition = keyed
        ? conditionValue
        : createMemo$1(conditionValue, {
            equals: (a, b) => !a === !b,
            sync: true,
          });
      return createMemo$1(
        () => {
          const c = condition();
          if (c) {
            const child = props.children;
            return typeof child === "function" && child.length > 0
              ? keyed
                ? untrack(() => child(c), IS_DEV)
                : untrack(
                    () =>
                      child(() => {
                        condition() || narrowedError("Show");
                        return conditionValue();
                      }),
                    IS_DEV,
                  )
              : child;
          }
          return props.fallback;
        },
        { sync: true },
      );
    }

    var sharedConfig = sharedConfig$1;

    var $$SLOT = Symbol("slot");
    var $$HOST = Symbol("host");
    var transparentOptions = {
      transparent: true,
      sync: true,
    };
    var syncOptions = { sync: true };
    function effect(fn, effectFn, options) {
      createRenderEffect(
        fn,
        effectFn,
        options
          ? {
              sync: true,
              ...options,
              transparent: !options.scope,
            }
          : transparentOptions,
      );
    }
    function memo(fn) {
      return createMemo(() => fn(), syncOptions);
    }
    function reconcileArrays(parentNode, a, b, marker) {
      let active = parentNode.moveBefore && parentNode.isConnected && document.activeElement;
      if (active === document.body) active = null;
      const slot = marker || parentNode;
      const insert = (n, ref) => {
        active && n.isConnected && n.contains(active)
          ? parentNode.moveBefore(n, ref)
          : parentNode.insertBefore(n, ref);
        if (marker || n[$$SLOT]) n[$$SLOT] = slot;
      };
      if (!a.length) {
        for (const n of b) insert(n, marker);
        return;
      }
      const isLive = (n) => {
        if (!n) return false;
        const tag = n[$$SLOT];
        return n.parentNode === parentNode && (!tag || tag === slot);
      };
      let bLength = b.length,
        aEnd = a.length,
        bEnd = bLength,
        aStart = 0,
        bStart = 0,
        tail = a[aEnd - 1],
        after = isLive(tail) ? tail.nextSibling : marker || null,
        map = null,
        anchor,
        anchorTag;
      while (aStart < aEnd || bStart < bEnd) {
        if (a[aStart] === b[bStart]) {
          aStart++;
          bStart++;
          continue;
        }
        while (aEnd > aStart && bEnd > bStart && a[aEnd - 1] === b[bEnd - 1]) {
          aEnd--;
          bEnd--;
        }
        if (aEnd === aStart) {
          let k = bEnd;
          while (k < bLength && !isLive(b[k])) k++;
          const node = k < bLength ? b[k] : after;
          while (bStart < bEnd) insert(b[bStart++], node);
        } else if (bEnd === bStart)
          while (aStart < aEnd) {
            const n = a[aStart++];
            if ((!map || !map.has(n)) && isLive(n)) n.remove();
          }
        else if (
          (anchor = a[aStart]) === b[bEnd - 1] &&
          b[bStart] === a[aEnd - 1] &&
          anchor.parentNode === parentNode &&
          (!(anchorTag = anchor[$$SLOT]) || anchorTag === slot)
        )
          do {
            insert(a[--aEnd], anchor);
            bStart++;
            if (aStart >= aEnd - 1 || bStart >= bEnd) break;
          } while (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]);
        else {
          if (!isLive(a[aStart])) {
            aStart++;
            continue;
          }
          if (!map) {
            map = new Map();
            let i = bStart;
            while (i < bEnd) map.set(b[i], i++);
          }
          const index = map.get(a[aStart]);
          if (index != null) {
            if (bStart < index && index < bEnd) {
              let i = aStart,
                sequence = 1,
                t;
              while (++i < aEnd && i < bEnd) {
                if ((t = map.get(a[i])) == null || t !== index + sequence) break;
                sequence++;
              }
              if (sequence > index - bStart) {
                const node = a[aStart];
                while (bStart < index) insert(b[bStart++], node);
              } else {
                const newNode = b[bStart++],
                  node = a[aStart++];
                active && parentNode.contains(active)
                  ? insert(newNode, node)
                  : parentNode.replaceChild(newNode, node);
                if (marker || newNode[$$SLOT]) newNode[$$SLOT] = slot;
              }
            } else aStart++;
          } else a[aStart++].remove();
        }
      }
    }
    var EVENT_KEY = "_$$";
    var $$EVENT_OWNER = "_$SOLID_EVENT_OWNER";
    var $$EVENT_TUPLE = Symbol();
    var INNER_OWNED = {};
    var delegatedEvents = new Set();
    var delegatedContainers = new Map();
    function render(code, element, init, options = {}) {
      let disposer;
      registerDelegatedRoot(element);
      try {
        createRoot(
          (dispose) => {
            disposer = dispose;
            if (options.onError) getOwner()[ROOT_ERROR_HOOK] = options.onError;
            const tree = code();
            if (element === document)
              effect(
                () => flatten(tree),
                () => {},
              );
            else
              insert(element, () => tree, element.firstChild ? null : void 0, init, {
                ...options.insertOptions,
                schedule: true,
              });
          },
          { id: options.renderId },
        );
        flush();
      } catch (err) {
        if (disposer) disposer();
        unregisterDelegatedRoot(element);
        throw err;
      }
      return () => {
        disposer();
        unregisterDelegatedRoot(element);
        element.textContent = "";
      };
    }
    function delegateEvents(eventNames) {
      for (const name of eventNames)
        if (!delegatedEvents.has(name)) {
          delegatedEvents.add(name);
          delegatedContainers.forEach((state, container) => attachDelegatedEvent(name, container, state));
        }
    }
    function registerDelegatedRoot(root) {
      const state = registerDelegatedContainer(root, root);
      if (state) state.roots = (state.roots || 0) + 1;
    }
    function unregisterDelegatedRoot(root) {
      const state = delegatedContainers.get(root);
      if (state) state.roots > 1 ? state.roots-- : delete state.roots;
      unregisterDelegatedContainer(root, root);
    }
    function registerDelegatedContainer(container, owner = container) {
      if (!container || !owner) return;
      let state = delegatedContainers.get(container);
      if (!state)
        delegatedContainers.set(
          container,
          (state = {
            owners: new Map(),
            handlers: new Map(),
          }),
        );
      state.owners.set(owner, (state.owners.get(owner) || 0) + 1);
      delegatedEvents.forEach((name) => attachDelegatedEvent(name, container, state));
      return state;
    }
    function unregisterDelegatedContainer(container, owner = container) {
      const state = delegatedContainers.get(container);
      if (!state) return;
      const count = state.owners.get(owner);
      if (count > 1) state.owners.set(owner, count - 1);
      else state.owners.delete(owner);
      if (state.owners.size) return;
      state.handlers.forEach((handler, name) => container.removeEventListener(name, handler));
      delegatedContainers.delete(container);
    }
    function attachDelegatedEvent(name, container, state) {
      if (state.handlers.has(name)) return;
      const handler = (e) => eventHandler(e, container, state);
      state.handlers.set(name, handler);
      container.addEventListener(name, handler);
    }
    var parentOf = (node) => node._$host || node.parentNode || node.host;
    function findOwner(target, state) {
      let node = target;
      let distance = 0;
      while (node) {
        if (state.owners.has(node))
          return {
            owner: node,
            distance,
          };
        distance++;
        node = parentOf(node);
      }
    }
    var claimHandlers = null;
    var claimAttributeSets = [];
    function runClaimHandlers(handlers, node) {
      for (let i = 0; i < handlers.length; i++) handlers[i](node);
    }
    function reclaimAttribute(node, name) {
      if (
        claimHandlers !== null &&
        node._$claimed &&
        claimAttributeSets.some((set) => set.includes(name.slice(name.indexOf(":") + 1)))
      )
        runClaimHandlers(claimHandlers, node);
    }
    function setAttribute(node, name, value) {
      if (isHydrating(node)) return;
      const selectMultiple = name === "multiple" && node.localName === "select";
      if (value == null || value === false) node.removeAttribute(name);
      else {
        node.setAttribute(name, value === true ? "" : value);
        if (selectMultiple && !node._$multiple) {
          const options = node.options;
          for (let i = 0; i < options.length; i++) if (options[i].defaultSelected) options[i].selected = true;
        }
      }
      if (selectMultiple) node._$multiple = true;
      reclaimAttribute(node, name);
    }
    function className(node, value, prev) {
      if (typeof value === "number") value = "" + value;
      if (typeof prev === "number") prev = "" + prev;
      if (isHydrating(node)) {
        node._$classes = value && typeof value === "object" ? classListToObject(value) : void 0;
        return;
      }
      if (value == null || value === false) {
        if (prev || node._$classes) {
          node.removeAttribute("class");
          node._$classes = void 0;
        }
        return;
      }
      if (typeof value === "string") {
        node._$classes = void 0;
        value !== prev && node.setAttribute("class", value);
        return;
      }
      let applied;
      if (typeof prev === "string") {
        applied = {};
        node.removeAttribute("class");
      } else applied = node._$classes || classListToObject(prev || {});
      value = classListToObject(value);
      const classKeys = Object.keys(value);
      const prevKeys = Object.keys(applied);
      let i, len;
      for (i = 0, len = prevKeys.length; i < len; i++) {
        const key = prevKeys[i];
        if (!key || key === "undefined" || value[key]) continue;
        node.classList.remove(key);
      }
      for (i = 0, len = classKeys.length; i < len; i++) {
        const key = classKeys[i],
          classValue = !!value[key];
        if (!key || key === "undefined" || applied[key] === classValue || !classValue) continue;
        node.classList.add(key);
      }
      node._$classes = value;
    }
    function addEvent(node, name, handler, delegate) {
      if (delegate) {
        const key = EVENT_KEY + name;
        let data;
        if (Array.isArray(handler)) {
          data = handler[1];
          node[key] = handler[0];
        } else node[key] = handler;
        node[`${key}Data`] = data;
        return;
      }
      if (Array.isArray(handler)) {
        const handlerFn = handler[0];
        const listener = (e) => handlerFn.call(node, handler[1], e);
        listener[$$EVENT_TUPLE] = handler;
        node.addEventListener(name, listener);
        return listener;
      }
      node.addEventListener(name, handler, typeof handler !== "function" && handler);
      return handler;
    }
    function readShallow(value) {
      if (value === null || typeof value !== "object") return value;
      if (Array.isArray(value)) return value.map(readShallow);
      if (value[$PROXY] !== value) return value;
      const keys = Reflect.ownKeys(value);
      const out = {};
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (typeof k === "string") out[k] = value[k];
      }
      return out;
    }
    function setStyleProperty(node, name, value) {
      if (isHydrating(node)) return;
      value != null ? node.style.setProperty(name, value) : node.style.removeProperty(name);
    }
    function applyRef(r, element) {
      Array.isArray(r) ? r.flat(Infinity).forEach((f) => f && f(element)) : r(element);
    }
    function ref(fn, element) {
      const resolved = untrack(fn);
      runWithOwner(null, () => applyRef(resolved, element));
    }
    var SCOPE_OPTIONS = { scope: true };
    var hydrationRt = null;
    function insert(parent, accessor, marker, initial, options) {
      const multi = marker !== void 0;
      const host = options && options.host;
      if (multi && !initial) initial = [];
      if (hydrationRt !== null) initial = hydrationRt.claimInitial(parent, multi, initial);
      if (typeof accessor !== "function") {
        accessor = normalize(accessor, initial, multi, true);
        if (typeof accessor !== "function") {
          insertExpression(parent, accessor, initial, marker);
          host && tagHost(accessor, host);
          return;
        }
      }
      if (multi && initial.length === 0) {
        const placeholder = document.createTextNode("");
        parent.insertBefore(placeholder, marker);
        initial = [placeholder];
      }
      let current = initial;
      let ran = false;
      effect(
        () => {
          if (hydrationRt !== null) current = hydrationRt.reclaimRegion(current, parent, marker);
          const value = normalize(accessor(), current, multi, true);
          const again = ran;
          ran = true;
          if (typeof value !== "function") return value;
          effect(
            () => (
              hydrationRt !== null && (current = hydrationRt.reclaimRegion(current, parent, marker)),
              normalize(value, current, multi)
            ),
            (inner) => {
              current = insertExpression(parent, inner, current, marker);
              host && tagHost(current, host);
            },
            again && !(options && options.schedule)
              ? {
                  ...options,
                  schedule: true,
                }
              : options,
          );
          return INNER_OWNED;
        },
        (value) => {
          if (value === INNER_OWNED) return;
          current = insertExpression(parent, value, current, marker);
          host && tagHost(current, host);
        },
        accessor.$s
          ? options
            ? {
                ...options,
                scope: true,
              }
            : SCOPE_OPTIONS
          : options,
      );
    }
    function isHydrating(node) {
      if (!sharedConfig.hydrating) return false;
      if (sharedConfig.isClaiming && !sharedConfig.isClaiming()) return false;
      if (!node || node.isConnected) return true;
      return serverComponentClaims !== null && serverComponentClaims.claimed(node);
    }
    var serverComponentClaims = null;
    function classListToObject(classList) {
      if (Array.isArray(classList)) {
        const result = {};
        flattenClassList(classList, result);
        classList = result;
      }
      if (classList && typeof classList === "object") {
        const result = {},
          keys = Object.keys(classList);
        for (let i = 0, len = keys.length; i < len; i++) {
          const key = keys[i];
          if (!classList[key]) continue;
          const classNames = key.trim().split(/\s+/);
          for (let j = 0, nameLen = classNames.length; j < nameLen; j++)
            classNames[j] && (result[classNames[j]] = true);
        }
        return result;
      }
      return classList;
    }
    function flattenClassList(list, result) {
      for (let i = 0, len = list.length; i < len; i++) {
        const item = list[i];
        if (Array.isArray(item)) flattenClassList(item, result);
        else if (typeof item === "object" && item != null) Object.assign(result, item);
        else if (typeof item !== "boolean" && (item || item === 0)) result[item] = true;
      }
    }
    function eventHandler(e, container, state) {
      if (hydrationRt !== null && hydrationRt.dedupEvent(e)) return;
      const prev = e[$$EVENT_OWNER];
      let resumeNode;
      if (prev) {
        if (prev === true || prev === container || !container.contains(prev)) return;
        resumeNode = prev;
      }
      const owner =
        state.owners.size === 1 && state.owners.has(container)
          ? container
          : findOwner(e.target, state)?.owner;
      if (!owner) return;
      if (owner === resumeNode) return;
      e[$$EVENT_OWNER] = owner;
      let node = resumeNode || e.target;
      const key = EVENT_KEY + e.type;
      const retarget = (value) =>
        Object.defineProperty(e, "target", {
          configurable: true,
          value,
        });
      const handleNode = () => {
        const handler = node[key];
        if (handler && !node.disabled) {
          const data = node[`${key}Data`];
          data !== void 0
            ? handler.call(node, data, e)
            : typeof handler === "function"
              ? handler.call(node, e)
              : handler.handleEvent(e);
          if (e.cancelBubble) return;
        }
        node.host &&
          typeof node.host !== "string" &&
          !node.host._$host &&
          node.contains(e.target) &&
          retarget(node.host);
        return true;
      };
      const atOwner = () => node === owner || node.parentNode === owner;
      const walkUpTree = () => {
        while (node && handleNode() && !atOwner()) node = parentOf(node);
      };
      Object.defineProperty(e, "currentTarget", {
        configurable: true,
        get() {
          return node || owner;
        },
      });
      if (resumeNode) {
        if (resumeNode === e.target) node = parentOf(resumeNode);
        if (node && node !== owner) walkUpTree();
      } else if (e.composedPath) {
        const path = e.composedPath();
        if (path.length) {
          retarget(path[0]);
          for (let i = 0; i < path.length; i++) {
            node = path[i];
            if (!handleNode()) break;
            if (node._$host) {
              node = node._$host;
              walkUpTree();
              break;
            }
            if (atOwner()) break;
          }
        } else walkUpTree();
      } else walkUpTree();
      delete e.target;
      delete e.currentTarget;
    }
    function insertExpression(parent, value, current, marker) {
      if (hydrationRt !== null && isHydrating(parent)) {
        if (value && value !== current) {
          const arr = Array.isArray(value);
          for (const n of arr ? value : [value])
            if (n && n.nodeType) {
              if (!isHydrating(n)) return current;
            } else if (arr && (typeof n === "string" || typeof n === "number")) return current;
        }
        return value;
      }
      if (value === current) return value;
      if (hydrationRt !== null && sharedConfig.hydrating && value && value.length !== 0) {
        const tracked = [].concat(current ?? []);
        if (
          [].concat(value).every((n) => (n === tracked[0] && tracked.shift(), n?.parentNode === parent)) &&
          !tracked.length
        )
          return value;
      }
      const t = typeof value,
        multi = marker !== void 0;
      if (t === "string" || t === "number") {
        const tc = typeof current;
        if (tc === "string" || tc === "number") parent.firstChild.data = value;
        else if (ownsAllChildren(parent, current)) parent.textContent = value;
        else {
          removeOwnedChildren(parent, current);
          parent.insertBefore(document.createTextNode(value), parent.firstChild);
        }
      } else if (value === void 0) cleanChildren(parent, current, marker);
      else if (value.nodeType) {
        if (Array.isArray(current)) cleanChildren(parent, current, multi ? marker : null, value);
        else if (current != null && current.nodeType)
          current.parentNode === parent ? parent.replaceChild(value, current) : parent.appendChild(value);
        else if (current != null && parent.firstChild) parent.replaceChild(value, parent.firstChild);
        else parent.appendChild(value);
        if (marker || value[$$SLOT]) value[$$SLOT] = marker || parent;
      } else if (Array.isArray(value)) {
        const currentArray = Array.isArray(current);
        for (let i = 0, len = value.length; i < len; i++) {
          const item = value[i],
            t = typeof item;
          if (t === "string" || t === "number") {
            const prev = currentArray ? current[i] : void 0;
            if (prev && prev.nodeType === 3) {
              if (prev.data !== "" + item) prev.data = item;
              value[i] = prev;
            } else value[i] = document.createTextNode(item);
          }
        }
        if (value.length === 0) cleanChildren(parent, current, marker);
        else if (currentArray) reconcileArrays(parent, current, value, marker);
        else {
          if (current != null) cleanChildren(parent, current);
          reconcileArrays(parent, [], value);
        }
      }
      return value;
    }
    function normalize(value, current, multi, doNotUnwrap) {
      value = flatten(value, {
        skipNonRendered: true,
        doNotUnwrap,
      });
      if (doNotUnwrap && typeof value === "function") return value;
      if (multi && !Array.isArray(value)) value = [value != null ? value : ""];
      if (hydrationRt !== null && sharedConfig.hydrating && Array.isArray(value))
        for (let i = 0, len = value.length; i < len; i++) {
          const item = value[i],
            prev = current && current[i],
            t = typeof item;
          if ((t === "string" || t === "number") && prev && prev.nodeType === 3 && isHydrating(prev))
            value[i] = prev;
        }
      return value;
    }
    function tagHost(value, host) {
      if (Array.isArray(value)) for (let i = 0, len = value.length; i < len; i++) tagHost(value[i], host);
      else if (value && value.nodeType && value[$$HOST] !== host) {
        value[$$HOST] = host;
        Object.defineProperty(value, "_$host", {
          get: host,
          configurable: true,
        });
      }
    }
    function ownsAllChildren(parent, current) {
      if (current == null) return true;
      if (Array.isArray(current))
        return current.length
          ? parent.firstChild === current[0] && parent.lastChild === current[current.length - 1]
          : parent.firstChild === null;
      if (current === "") return parent.firstChild === null;
      if (current.nodeType) return parent.firstChild === current && parent.lastChild === current;
      const first = parent.firstChild;
      return first !== null && first.nodeType === 3 && parent.lastChild === first;
    }
    function removeOwnedChildren(parent, current) {
      if (Array.isArray(current))
        for (let i = 0; i < current.length; i++) {
          const el = current[i];
          if (el.parentNode === parent) el.remove();
        }
      else if (current.nodeType) {
        if (current.parentNode === parent) current.remove();
      } else {
        const first = parent.firstChild;
        if (first && first.nodeType === 3) first.remove();
      }
    }
    function cleanChildren(parent, current, marker, replacement) {
      if (marker === void 0) {
        if (ownsAllChildren(parent, current)) return (parent.textContent = "");
        return removeOwnedChildren(parent, current);
      }
      if (current.length) {
        let inserted = false;
        for (let i = current.length - 1; i >= 0; i--) {
          const el = current[i];
          if (replacement !== el) {
            const tag = el[$$SLOT];
            const owns = el.parentNode === parent && (!tag || tag === (marker || parent));
            if (replacement && !inserted && !i)
              owns ? parent.replaceChild(replacement, el) : parent.insertBefore(replacement, marker);
            else if (owns) el.remove();
          } else inserted = true;
        }
      } else if (replacement) parent.insertBefore(replacement, marker);
      if (replacement && (marker || replacement[$$SLOT])) replacement[$$SLOT] = marker || parent;
    }

    var css$3 =
      ':root,:host{--rodx-ds-control-touch:44px!important;--rodx-ds-color-white:#fff!important;--rodx-ds-color-black:#000!important;--rodx-ds-font-sans:-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif!important;--rodx-ds-font-mono:ui-monospace, SFMono-Regular, Menlo, monospace!important;--rodx-ds-color-accent:#1d9bf0!important;--rodx-ds-color-text:var(--rx-text,#e7e9ea)!important;--rodx-ds-color-surface:var(--rx-surface,#15202b)!important;--rodx-ds-color-muted:#71767b!important;--rodx-ds-color-border:#71767b55!important;--rodx-ds-color-hover:#71767b22!important;--rodx-ds-color-accent-soft:#1d9bf01f!important;--rodx-ds-radius-round:999px!important;--rodx-ds-radius-full:50%!important;--rodx-ds-control-size:32px!important;--rodx-ds-font-weight-semibold:600!important;--rodx-ds-font-weight-bold:700!important;--rodx-ds-layer-floating:1400!important;--rodx-ds-layer-overlay:2147480000!important;--rodx-ds-border-width:1px!important;--rodx-ds-space-1:1px!important;--rodx-ds-space-2:2px!important;--rodx-ds-space-4:4px!important;--rodx-ds-space-6:6px!important;--rodx-ds-space-8:8px!important;--rodx-ds-space-12:12px!important;--rodx-ds-space-16:16px!important;--rodx-ds-space-20:20px!important;--rodx-ds-space-24:24px!important;--rodx-ds-space-32:32px!important;--rodx-ds-space-40:40px!important;--rodx-ds-space-48:48px!important;--rodx-ds-text-11:11px!important;--rodx-ds-text-12:12px!important;--rodx-ds-text-13:13px!important;--rodx-ds-text-14:14px!important;--rodx-ds-text-16:16px!important;--rodx-ds-text-18:18px!important;--rodx-ds-text-20:20px!important;--rodx-ds-text-24:24px!important;--rodx-ds-radius-4:4px!important;--rodx-ds-radius-8:8px!important;--rodx-ds-radius-12:12px!important;--rodx-ds-radius-16:16px!important;--rodx-ds-radius-20:20px!important;--rodx-ds-radius-24:24px!important;--rodx-ds-font-ui:TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif!important;--rodx-ds-header-height:60px!important;--rodx-ds-glass-surface:#181c2252!important;--rodx-ds-glass-border:#ffffff38!important;--rodx-ds-glass-blur:blur(20px) saturate(1.8)!important;--rodx-ds-glass-shadow:inset 0 1px 0 #ffffff45, 0 3px 14px #0003!important;--rodx-ds-control-height:40px!important;--rodx-ds-social-telegram-bg:#229ed92b!important;--rodx-ds-social-whatsapp-bg:#25d3662b!important;--rodx-ds-social-instagram-bg:#e1306c26!important;--rodx-ds-icon-size-small:15px!important;--rodx-ds-color-accent-selected:#1d9bf033!important;--rodx-ds-color-text-secondary:#979ba5!important}:host{font:var(--rodx-ds-text-14) var(--rodx-ds-font-ui)!important}:host *,[class^=rx-]{box-sizing:border-box!important}:host button{cursor:pointer!important;font-family:inherit!important}html,html.rodx_rodx-snap-enabled_-UB6ca,body{scroll-snap-type:none!important}@media (prefers-reduced-motion:reduce){html{scroll-snap-type:none!important}}.rodx_rx-repl-host_-UB6ca{all:initial!important;z-index:2147483647!important;width:0!important;height:0!important;position:fixed!important;top:0!important;left:0!important}.rodx_rx-feed-filter-host_-UB6ca{min-width:0!important;font:var(--rodx-ds-text-12) Arial!important;color:inherit!important;display:block!important}button{border-radius:var(--rodx-ds-radius-12)!important;color:inherit!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-12)!important;max-width:100%!important;font:inherit!important;cursor:pointer!important;background:0 0!important;border:1px solid #71767b44!important}.rodx_rx-chrome-context_-UB6ca{white-space:nowrap!important;text-overflow:ellipsis!important;opacity:.75!important;pointer-events:none!important;font:10px Arial!important;display:block!important;position:absolute!important;top:1px!important;left:6px!important;right:6px!important;overflow:hidden!important}.rodx_rx-tweets-clone_-UB6ca{width:18px!important;height:18px!important;fill:var(--rodx-ds-color-accent)!important}.rodx_rx-tweets-toggle_-UB6ca{width:auto!important;max-width:max-content!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-8)!important;margin:var(--rodx-ds-space-2) 0!important;align-self:flex-start!important;display:inline-flex!important}.rodx_rx-list-shortcut-tab_-UB6ca{gap:var(--rodx-ds-space-1)!important;flex-direction:column!important;flex:0 0 var(--rodx-ds-control-touch)!important;width:var(--rodx-ds-control-touch)!important;min-height:var(--rodx-ds-control-touch)!important;color:inherit!important;cursor:pointer!important;touch-action:manipulation!important;background:0 0!important;border:0!important;justify-content:center!important;align-items:center!important;padding:0!important;font:10px Arial!important;display:flex!important}.rodx_rx-list-shortcut-floating_-UB6ca{left:12px!important;bottom:calc(66px + env(safe-area-inset-bottom,0px))!important;z-index:var(--rodx-ds-layer-floating)!important;gap:var(--rodx-ds-space-1)!important;border-radius:var(--rodx-ds-radius-full)!important;background:var(--rodx-bar-bg,Canvas)!important;width:42px!important;height:42px!important;color:var(--rodx-bar-fg,CanvasText)!important;cursor:pointer!important;touch-action:manipulation!important;border:1px solid #71767b66!important;flex-direction:column!important;justify-content:center!important;align-items:center!important;font:10px Arial!important;display:flex!important;position:fixed!important}.rodx_rx-access-profileHost_-UB6ca{min-width:0!important;max-width:100%!important;margin:var(--rodx-ds-space-4) 0!important;display:block!important;position:relative!important}.rodx_rx-profile-add-to-list_-UB6ca{font:500 var(--rodx-ds-text-13) var(--rodx-ds-font-ui)!important;min-height:var(--rodx-ds-control-height)!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-12)!important;border-radius:var(--rodx-ds-radius-16)!important;color:inherit!important;cursor:pointer!important;touch-action:manipulation!important;background:0 0!important;border:1px solid #71767b66!important}.rodx_rx-list-shortcut_-UB6ca{min-height:var(--rodx-ds-control-height)!important;min-width:86px!important;padding:var(--rodx-ds-space-6) var(--rodx-ds-space-8)!important;border-radius:var(--rodx-ds-radius-24)!important;color:var(--rodx-ds-color-white)!important;font:600 var(--rodx-ds-text-12) -apple-system, system-ui!important;white-space:nowrap!important;touch-action:manipulation!important;z-index:1!important;background:#23272d!important;border:1px solid #52606f!important;flex:none!important;position:relative!important}.rodx_rx-list-shortcut-profile_-UB6ca{margin:var(--rodx-ds-space-4) 0 0 var(--rodx-ds-space-48)!important;align-self:flex-start!important}.rodx_rx-profile-host_-UB6ca{width:100%!important;min-height:var(--rodx-ds-control-touch)!important;clear:both!important;color:inherit!important;flex:0 0 100%!important;display:block!important;position:relative!important}.rodx_rx-quick-picker-search-field_-UB6ca{padding:var(--rodx-ds-space-12) var(--rodx-ds-space-12)!important}.rodx_rx-quick-picker-list-icon_-UB6ca{font-size:var(--rodx-ds-text-16)!important}.rodx_rx-quick-picker-empty-state_-UB6ca{padding:var(--rodx-ds-space-16)!important;color:#aaa!important;font-size:var(--rodx-ds-text-13)!important}.rodx_rx-render-grp_-UB6ca{margin-top:var(--rodx-ds-space-8)!important}.rodx_rx-render-input_-UB6ca{display:none!important}.rodx_rx-render-listToolbar_-UB6ca{gap:var(--rodx-ds-space-8)!important;padding:var(--rodx-ds-space-6) var(--rodx-ds-space-8)!important;box-sizing:border-box!important;flex-wrap:wrap!important;max-width:100%!important;display:flex!important}.rodx_rx-timeline-grp_-UB6ca{margin-top:var(--rodx-ds-space-8)!important}.rodx_rx-player-skin_-UB6ca{width:100%!important;display:block!important}.rodx_rx-player-root_-UB6ca{z-index:20!important;pointer-events:auto!important;width:100%!important;min-width:0!important;display:block!important;position:relative!important}.rodx_rx-player-video_-UB6ca{object-fit:contain!important;width:100%!important;height:100%!important;position:relative!important}.rodx_rx-seek-preview-decoder_-UB6ca{opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;position:fixed!important;top:0!important;left:-10000px!important}.rodx_rx-anchors-host_-UB6ca{z-index:auto!important;box-sizing:border-box!important;width:100%!important;min-width:0!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-8)!important;flex:none!important;display:block!important;position:relative!important}.rodx_rx-history-options_-UB6ca{gap:var(--rodx-ds-space-8)!important;padding:var(--rodx-ds-space-8) var(--rodx-ds-space-12)!important;display:flex!important}.rodx_rx-list-typeahead-host_-UB6ca{z-index:2147483645!important;left:var(--rodx-anchor-left)!important;top:var(--rodx-anchor-top)!important;width:var(--rodx-anchor-width)!important;position:fixed!important}.rodx_rx-relay-banner_-UB6ca{margin-bottom:var(--rodx-ds-space-6)!important}.rodx_rx-relay-details_-UB6ca{margin-top:var(--rodx-ds-space-6)!important}.rodx_rx-relay-summary_-UB6ca{cursor:pointer!important}.rodx_rx-relay-section_-UB6ca{margin-top:var(--rodx-ds-space-4)!important}.rodx_rx-relay-row_-UB6ca{justify-content:flex-end!important}.rodx_rx-publisher-row_-UB6ca{gap:var(--rodx-ds-space-8)!important;flex-wrap:wrap!important}.rodx_rx-publisher-fieldset_-UB6ca{gap:var(--rodx-ds-space-12)!important;padding:var(--rodx-ds-space-12)!important;border:1px solid var(--rodx-ds-color-border)!important;border-radius:var(--rodx-ds-radius-12)!important;display:grid!important}.rodx_rx-repost-share-mode-field_-UB6ca{gap:var(--rodx-ds-space-4)!important;display:grid!important}.rodx_rx-repost-queue-button_-UB6ca{width:100%!important}.rodx_rx-repost-destination-field_-UB6ca{gap:var(--rodx-ds-space-4)!important;display:grid!important}.rodx_rx-repost-preview-button_-UB6ca{width:100%!important}.rodx_rx-publisher-muted_-UB6ca{font-size:var(--rodx-ds-text-12)!important}.rodx_rx-publisher-details_-UB6ca{font-size:var(--rodx-ds-text-12)!important;opacity:.85!important;line-height:1.45!important}.rodx_rx-publisher-panel_-UB6ca{gap:var(--rodx-ds-space-12)!important;padding:var(--rodx-ds-space-4) 0 var(--rodx-ds-space-8)!important;min-width:0!important;display:grid!important}.rodx_rx-repost-caption-field_-UB6ca{gap:var(--rodx-ds-space-8)!important;display:grid!important}.rodx_rx-dock-host_-UB6ca{z-index:1!important;contain:layout style!important;min-width:0!important;max-width:100%!important;display:block!important;position:relative!important}.rodx_rx-clipboard-textarea_-UB6ca{position:fixed!important;left:-9999px!important}.rodx_rx-quick-actions-floating_-UB6ca{z-index:var(--rodx-ds-layer-floating)!important;-webkit-user-select:none!important;user-select:none!important;left:var(--rodx-anchor-left)!important;top:var(--rodx-anchor-top)!important;width:var(--rodx-anchor-width)!important;height:var(--rodx-anchor-height)!important;border-radius:var(--rodx-ds-radius-full)!important;background:var(--rodx-ds-color-surface)!important;color:var(--rodx-ds-color-text)!important;font:var(--rodx-ds-text-24) Arial, sans-serif!important;touch-action:none!important;cursor:pointer!important;border:1px solid #71767b66!important;position:fixed!important}.rodx_rx-quick-actions-listInfo_-UB6ca{gap:var(--rodx-ds-space-8)!important;font:var(--rodx-ds-text-12) Arial!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-8)!important;flex-wrap:wrap!important;align-items:center!important;display:flex!important}.rodx_rx-quick-actions-b_-UB6ca{font:var(--rodx-ds-text-12) Arial!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-8)!important;border:1px solid var(--rodx-ds-color-border)!important;border-radius:var(--rodx-ds-radius-12)!important;color:inherit!important;background:0 0!important}.rodx_rx-root-host_-UB6ca{z-index:2147483000!important;pointer-events:none!important;width:0!important;height:0!important;position:fixed!important;top:0!important;left:0!important}.rodx_rx-search-workbench-row_-UB6ca{justify-content:space-between!important}.rodx_rx-search-workbench-row-margin-top_-UB6ca{margin-top:var(--rodx-ds-space-8)!important}.rodx_rx-search-workbench-rodx-selection-list_-UB6ca{margin:var(--rodx-ds-space-8) 0 var(--rodx-ds-space-16)!important}.rodx_rx-search-workbench-row-align-items_-UB6ca{align-items:center!important}.rodx_rx-search-workbench-muted_-UB6ca{font-size:var(--rodx-ds-text-12)!important}.rodx_rx-search-workbench-row-flex-wrap-gap_-UB6ca{gap:var(--rodx-ds-space-8)!important;flex-wrap:wrap!important}.rodx_rx-search-workbench-chip_-UB6ca{align-items:center!important;gap:var(--rodx-ds-space-4)!important;max-width:100%!important;display:inline-flex!important}.rodx_rx-search-workbench-row-margin-top-margin-top-11px_-UB6ca{margin-top:var(--rodx-ds-space-12)!important}.rodx_rx-search-workbench-ctrl_-UB6ca{flex:1!important;min-width:135px!important}.rodx_rx-search-workbench-builder-buttons_-UB6ca{margin-top:var(--rodx-ds-space-8)!important}.rodx_rx-search-workbench-hero-sub_-UB6ca{margin-bottom:0!important}.rodx_rx-search-workbench-builder-buttons-margin-bottom_-UB6ca{margin-bottom:var(--rodx-ds-space-12)!important}.rodx_rx-search-workbench-btn_-UB6ca{width:100%!important}.rodx_rx-search-workbench-btn-margin-top_-UB6ca{margin-top:var(--rodx-ds-space-16)!important}.rodx_rx-search-workbench-row-margin-bottom_-UB6ca{margin-bottom:var(--rodx-ds-space-16)!important}.rodx_rx-search-workbench-ctrl-flex_-UB6ca{flex:1!important}.rodx_rx-search-workbench-rootHost_-UB6ca{pointer-events:auto!important;width:100%!important;min-width:0!important;display:block!important;position:relative!important}:is(#rodx_rodx-hidden-override_-UB6ca,[hidden]){display:none!important}.rodx_small_-UB6ca,.rodx_muted_-UB6ca{color:var(--rodx-ds-color-text-secondary)!important;font-size:var(--rodx-ds-text-12)!important}.rodx_rx-timeline-sentinel_-UB6ca{height:3px!important}.rodx_backdrop_-UB6ca{z-index:2147483600!important;background:#0009!important;justify-content:center!important;align-items:end!important;display:flex!important;position:fixed!important;inset:0!important}.rodx_sheet_-UB6ca{box-sizing:border-box!important;width:min(100%,640px)!important;max-height:90dvh!important;padding:16px 18px max(16px, env(safe-area-inset-bottom))!important;color:#f4f4f5!important;background:#202124!important;border-radius:18px 18px 0 0!important;font:14px system-ui,sans-serif!important;overflow:auto!important}.rodx_sheet_-UB6ca:focus{outline:none!important}.rodx_sheet_-UB6ca header{justify-content:space-between!important;align-items:center!important;gap:12px!important;display:flex!important}.rodx_sheet_-UB6ca h2{margin:0!important;font-size:18px!important}.rodx_sheet_-UB6ca header button{color:inherit!important;font:inherit!important;background:#303134!important;border:1px solid #555!important;border-radius:8px!important;padding:6px 12px!important}';
    var Dialog_module_css_default = {
      "rx-search-workbench-row-margin-top": "rodx_rx-search-workbench-row-margin-top_-UB6ca",
      "rx-search-workbench-btn": "rodx_rx-search-workbench-btn_-UB6ca",
      "rx-relay-banner": "rodx_rx-relay-banner_-UB6ca",
      "rx-search-workbench-rootHost": "rodx_rx-search-workbench-rootHost_-UB6ca",
      "rx-seek-preview-decoder": "rodx_rx-seek-preview-decoder_-UB6ca",
      "rx-render-grp": "rodx_rx-render-grp_-UB6ca",
      "rx-publisher-row": "rodx_rx-publisher-row_-UB6ca",
      "rx-quick-picker-empty-state": "rodx_rx-quick-picker-empty-state_-UB6ca",
      "rx-quick-picker-search-field": "rodx_rx-quick-picker-search-field_-UB6ca",
      "rx-relay-details": "rodx_rx-relay-details_-UB6ca",
      "rx-relay-summary": "rodx_rx-relay-summary_-UB6ca",
      "rx-tweets-clone": "rodx_rx-tweets-clone_-UB6ca",
      "rx-search-workbench-chip": "rodx_rx-search-workbench-chip_-UB6ca",
      "rx-publisher-panel": "rodx_rx-publisher-panel_-UB6ca",
      "rx-player-root": "rodx_rx-player-root_-UB6ca",
      "rx-quick-picker-list-icon": "rodx_rx-quick-picker-list-icon_-UB6ca",
      "rx-clipboard-textarea": "rodx_rx-clipboard-textarea_-UB6ca",
      "rx-search-workbench-row": "rodx_rx-search-workbench-row_-UB6ca",
      "rx-quick-actions-listInfo": "rodx_rx-quick-actions-listInfo_-UB6ca",
      "rx-search-workbench-ctrl-flex": "rodx_rx-search-workbench-ctrl-flex_-UB6ca",
      muted: "rodx_muted_-UB6ca",
      "rx-search-workbench-btn-margin-top": "rodx_rx-search-workbench-btn-margin-top_-UB6ca",
      "rx-access-profileHost": "rodx_rx-access-profileHost_-UB6ca",
      "rx-publisher-muted": "rodx_rx-publisher-muted_-UB6ca",
      small: "rodx_small_-UB6ca",
      "rx-chrome-context": "rodx_rx-chrome-context_-UB6ca",
      "rx-timeline-sentinel": "rodx_rx-timeline-sentinel_-UB6ca",
      sheet: "rodx_sheet_-UB6ca",
      "rodx-hidden-override": "rodx_rodx-hidden-override_-UB6ca",
      "rx-quick-actions-b": "rodx_rx-quick-actions-b_-UB6ca",
      "rx-repl-host": "rodx_rx-repl-host_-UB6ca",
      "rx-list-shortcut-tab": "rodx_rx-list-shortcut-tab_-UB6ca",
      "rx-timeline-grp": "rodx_rx-timeline-grp_-UB6ca",
      "rx-list-shortcut-floating": "rodx_rx-list-shortcut-floating_-UB6ca",
      "rx-search-workbench-muted": "rodx_rx-search-workbench-muted_-UB6ca",
      "rx-search-workbench-hero-sub": "rodx_rx-search-workbench-hero-sub_-UB6ca",
      "rx-player-skin": "rodx_rx-player-skin_-UB6ca",
      "rx-search-workbench-builder-buttons": "rodx_rx-search-workbench-builder-buttons_-UB6ca",
      "rx-list-shortcut-profile": "rodx_rx-list-shortcut-profile_-UB6ca",
      "rx-root-host": "rodx_rx-root-host_-UB6ca",
      "rx-profile-add-to-list": "rodx_rx-profile-add-to-list_-UB6ca",
      "rx-profile-host": "rodx_rx-profile-host_-UB6ca",
      "rx-repost-share-mode-field": "rodx_rx-repost-share-mode-field_-UB6ca",
      "rx-player-video": "rodx_rx-player-video_-UB6ca",
      "rx-search-workbench-rodx-selection-list": "rodx_rx-search-workbench-rodx-selection-list_-UB6ca",
      "rx-render-listToolbar": "rodx_rx-render-listToolbar_-UB6ca",
      "rx-tweets-toggle": "rodx_rx-tweets-toggle_-UB6ca",
      "rodx-snap-enabled": "rodx_rodx-snap-enabled_-UB6ca",
      "rx-list-typeahead-host": "rodx_rx-list-typeahead-host_-UB6ca",
      "rx-relay-row": "rodx_rx-relay-row_-UB6ca",
      "rx-quick-actions-floating": "rodx_rx-quick-actions-floating_-UB6ca",
      "rx-search-workbench-row-align-items": "rodx_rx-search-workbench-row-align-items_-UB6ca",
      "rx-search-workbench-row-margin-top-margin-top-11px":
        "rodx_rx-search-workbench-row-margin-top-margin-top-11px_-UB6ca",
      "rx-render-input": "rodx_rx-render-input_-UB6ca",
      "rx-repost-caption-field": "rodx_rx-repost-caption-field_-UB6ca",
      "rx-publisher-fieldset": "rodx_rx-publisher-fieldset_-UB6ca",
      backdrop: "rodx_backdrop_-UB6ca",
      "rx-search-workbench-builder-buttons-margin-bottom":
        "rodx_rx-search-workbench-builder-buttons-margin-bottom_-UB6ca",
      "rx-anchors-host": "rodx_rx-anchors-host_-UB6ca",
      "rx-search-workbench-row-margin-bottom": "rodx_rx-search-workbench-row-margin-bottom_-UB6ca",
      "rx-list-shortcut": "rodx_rx-list-shortcut_-UB6ca",
      "rx-feed-filter-host": "rodx_rx-feed-filter-host_-UB6ca",
      "rx-dock-host": "rodx_rx-dock-host_-UB6ca",
      "rx-relay-section": "rodx_rx-relay-section_-UB6ca",
      "rx-publisher-details": "rodx_rx-publisher-details_-UB6ca",
      "rx-search-workbench-ctrl": "rodx_rx-search-workbench-ctrl_-UB6ca",
      "rx-repost-destination-field": "rodx_rx-repost-destination-field_-UB6ca",
      "rx-repost-queue-button": "rodx_rx-repost-queue-button_-UB6ca",
      "rx-repost-preview-button": "rodx_rx-repost-preview-button_-UB6ca",
      "rx-search-workbench-row-flex-wrap-gap": "rodx_rx-search-workbench-row-flex-wrap-gap_-UB6ca",
      "rx-history-options": "rodx_rx-history-options_-UB6ca",
    };

    var _tmpl$$4 = (() => {
      let cached;
      return () => {
        if (!cached) cached = document.createElementNS("http://www.w3.org/1999/xhtml", "style");
        return cached.cloneNode(true);
      };
    })();
    var _tmpl$2$3 = (() => {
      let cached;
      return () => {
        if (!cached) {
          const node0 = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
          const node1 = document.createElementNS("http://www.w3.org/1999/xhtml", "section");
          node1.setAttribute("role", "dialog");
          node1.setAttribute("aria-modal", "true");
          node1.setAttribute("tabindex", "-1");
          const node2 = document.createElementNS("http://www.w3.org/1999/xhtml", "header");
          const node3 = document.createElementNS("http://www.w3.org/1999/xhtml", "h2");
          node2.appendChild(node3);
          const node4 = document.createElementNS("http://www.w3.org/1999/xhtml", "button");
          node4.setAttribute("type", "button");
          node4.setAttribute("aria-label", "Fechar");
          const node5 = document.createTextNode("×");
          node4.appendChild(node5);
          node2.appendChild(node4);
          node1.appendChild(node2);
          node0.appendChild(node1);
          cached = node0;
        }
        return cached.cloneNode(true);
      };
    })();
    function Dialog(props) {
      let dialog;
      onSettled(() => {
        const previous = document.activeElement;
        dialog.focus();
        return () => previous?.isConnected && previous.focus();
      });
      const key = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          props.close();
          return;
        }
        if (event.key !== "Tab") return;
        const items = [
          ...dialog.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex="0"]',
          ),
        ];
        if (!items.length) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        const current = dialog.getRootNode().activeElement;
        if (event.shiftKey && current === items[0]) {
          event.preventDefault();
          items.at(-1).focus();
        } else if (!event.shiftKey && current === items.at(-1)) {
          event.preventDefault();
          items[0].focus();
        }
      };
      return [
        (() => {
          var _el$ = _tmpl$$4();
          insert(_el$, css$3);
          return _el$;
        })(),
        (() => {
          var _el$2 = _tmpl$2$3();
          var _el$3 = _el$2.firstChild;
          var _el$5 = _el$3.firstChild.firstChild;
          var _el$6 = _el$5.nextSibling;
          addEvent(_el$2, "click", props.close, true);
          _el$3._$$click = (event) => event.stopPropagation();
          _el$3._$$keydown = key;
          var _ref$ = dialog;
          typeof _ref$ === "function" || Array.isArray(_ref$)
            ? ref(() => {
                return _ref$;
              }, _el$3)
            : (dialog = _el$3);
          insert(_el$5, () => {
            return props.title;
          });
          addEvent(_el$6, "click", props.close, true);
          insert(
            _el$3,
            () => {
              return props.children;
            },
            null,
          );
          effect(
            () => {
              return {
                e: readShallow(Dialog_module_css_default.backdrop),
                t: readShallow(Dialog_module_css_default.sheet),
                a: props.title,
              };
            },
            ({ e, t, a }, _p$) => {
              className(_el$2, e, _p$?.e);
              className(_el$3, t, _p$?.t);
              a !== _p$?.a && setAttribute(_el$3, "aria-label", a);
            },
          );
          return _el$2;
        })(),
      ];
    }
    delegateEvents(["click", "keydown"]);

    var css$2 =
      ':root,:host{--rodx-ds-control-touch:44px!important;--rodx-ds-color-white:#fff!important;--rodx-ds-color-black:#000!important;--rodx-ds-font-sans:-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif!important;--rodx-ds-font-mono:ui-monospace, SFMono-Regular, Menlo, monospace!important;--rodx-ds-color-accent:#1d9bf0!important;--rodx-ds-color-text:var(--rx-text,#e7e9ea)!important;--rodx-ds-color-surface:var(--rx-surface,#15202b)!important;--rodx-ds-color-muted:#71767b!important;--rodx-ds-color-border:#71767b55!important;--rodx-ds-color-hover:#71767b22!important;--rodx-ds-color-accent-soft:#1d9bf01f!important;--rodx-ds-radius-round:999px!important;--rodx-ds-radius-full:50%!important;--rodx-ds-control-size:32px!important;--rodx-ds-font-weight-semibold:600!important;--rodx-ds-font-weight-bold:700!important;--rodx-ds-layer-floating:1400!important;--rodx-ds-layer-overlay:2147480000!important;--rodx-ds-border-width:1px!important;--rodx-ds-space-1:1px!important;--rodx-ds-space-2:2px!important;--rodx-ds-space-4:4px!important;--rodx-ds-space-6:6px!important;--rodx-ds-space-8:8px!important;--rodx-ds-space-12:12px!important;--rodx-ds-space-16:16px!important;--rodx-ds-space-20:20px!important;--rodx-ds-space-24:24px!important;--rodx-ds-space-32:32px!important;--rodx-ds-space-40:40px!important;--rodx-ds-space-48:48px!important;--rodx-ds-text-11:11px!important;--rodx-ds-text-12:12px!important;--rodx-ds-text-13:13px!important;--rodx-ds-text-14:14px!important;--rodx-ds-text-16:16px!important;--rodx-ds-text-18:18px!important;--rodx-ds-text-20:20px!important;--rodx-ds-text-24:24px!important;--rodx-ds-radius-4:4px!important;--rodx-ds-radius-8:8px!important;--rodx-ds-radius-12:12px!important;--rodx-ds-radius-16:16px!important;--rodx-ds-radius-20:20px!important;--rodx-ds-radius-24:24px!important;--rodx-ds-font-ui:TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif!important;--rodx-ds-header-height:60px!important;--rodx-ds-glass-surface:#181c2252!important;--rodx-ds-glass-border:#ffffff38!important;--rodx-ds-glass-blur:blur(20px) saturate(1.8)!important;--rodx-ds-glass-shadow:inset 0 1px 0 #ffffff45, 0 3px 14px #0003!important;--rodx-ds-control-height:40px!important;--rodx-ds-social-telegram-bg:#229ed92b!important;--rodx-ds-social-whatsapp-bg:#25d3662b!important;--rodx-ds-social-instagram-bg:#e1306c26!important;--rodx-ds-icon-size-small:15px!important;--rodx-ds-color-accent-selected:#1d9bf033!important;--rodx-ds-color-text-secondary:#979ba5!important}:host{font:var(--rodx-ds-text-14) var(--rodx-ds-font-ui)!important}:host *,[class^=rx-]{box-sizing:border-box!important}:host button{cursor:pointer!important;font-family:inherit!important}html,html.rodx_rodx-snap-enabled_c021QG,body{scroll-snap-type:none!important}@media (prefers-reduced-motion:reduce){html{scroll-snap-type:none!important}}.rodx_rx-repl-host_c021QG{all:initial!important;z-index:2147483647!important;width:0!important;height:0!important;position:fixed!important;top:0!important;left:0!important}.rodx_rx-feed-filter-host_c021QG{min-width:0!important;font:var(--rodx-ds-text-12) Arial!important;color:inherit!important;display:block!important}button{border-radius:var(--rodx-ds-radius-12)!important;color:inherit!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-12)!important;max-width:100%!important;font:inherit!important;cursor:pointer!important;background:0 0!important;border:1px solid #71767b44!important}.rodx_rx-chrome-context_c021QG{white-space:nowrap!important;text-overflow:ellipsis!important;opacity:.75!important;pointer-events:none!important;font:10px Arial!important;display:block!important;position:absolute!important;top:1px!important;left:6px!important;right:6px!important;overflow:hidden!important}.rodx_rx-tweets-clone_c021QG{width:18px!important;height:18px!important;fill:var(--rodx-ds-color-accent)!important}.rodx_rx-tweets-toggle_c021QG{width:auto!important;max-width:max-content!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-8)!important;margin:var(--rodx-ds-space-2) 0!important;align-self:flex-start!important;display:inline-flex!important}.rodx_rx-list-shortcut-tab_c021QG{gap:var(--rodx-ds-space-1)!important;flex-direction:column!important;flex:0 0 var(--rodx-ds-control-touch)!important;width:var(--rodx-ds-control-touch)!important;min-height:var(--rodx-ds-control-touch)!important;color:inherit!important;cursor:pointer!important;touch-action:manipulation!important;background:0 0!important;border:0!important;justify-content:center!important;align-items:center!important;padding:0!important;font:10px Arial!important;display:flex!important}.rodx_rx-list-shortcut-floating_c021QG{left:12px!important;bottom:calc(66px + env(safe-area-inset-bottom,0px))!important;z-index:var(--rodx-ds-layer-floating)!important;gap:var(--rodx-ds-space-1)!important;border-radius:var(--rodx-ds-radius-full)!important;background:var(--rodx-bar-bg,Canvas)!important;width:42px!important;height:42px!important;color:var(--rodx-bar-fg,CanvasText)!important;cursor:pointer!important;touch-action:manipulation!important;border:1px solid #71767b66!important;flex-direction:column!important;justify-content:center!important;align-items:center!important;font:10px Arial!important;display:flex!important;position:fixed!important}.rodx_rx-access-profileHost_c021QG{min-width:0!important;max-width:100%!important;margin:var(--rodx-ds-space-4) 0!important;display:block!important;position:relative!important}.rodx_rx-profile-add-to-list_c021QG{font:500 var(--rodx-ds-text-13) var(--rodx-ds-font-ui)!important;min-height:var(--rodx-ds-control-height)!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-12)!important;border-radius:var(--rodx-ds-radius-16)!important;color:inherit!important;cursor:pointer!important;touch-action:manipulation!important;background:0 0!important;border:1px solid #71767b66!important}.rodx_rx-list-shortcut_c021QG{min-height:var(--rodx-ds-control-height)!important;min-width:86px!important;padding:var(--rodx-ds-space-6) var(--rodx-ds-space-8)!important;border-radius:var(--rodx-ds-radius-24)!important;color:var(--rodx-ds-color-white)!important;font:600 var(--rodx-ds-text-12) -apple-system, system-ui!important;white-space:nowrap!important;touch-action:manipulation!important;z-index:1!important;background:#23272d!important;border:1px solid #52606f!important;flex:none!important;position:relative!important}.rodx_rx-list-shortcut-profile_c021QG{margin:var(--rodx-ds-space-4) 0 0 var(--rodx-ds-space-48)!important;align-self:flex-start!important}.rodx_rx-profile-host_c021QG{width:100%!important;min-height:var(--rodx-ds-control-touch)!important;clear:both!important;color:inherit!important;flex:0 0 100%!important;display:block!important;position:relative!important}.rodx_rx-quick-picker-search-field_c021QG{padding:var(--rodx-ds-space-12) var(--rodx-ds-space-12)!important}.rodx_rx-quick-picker-list-icon_c021QG{font-size:var(--rodx-ds-text-16)!important}.rodx_rx-quick-picker-empty-state_c021QG{padding:var(--rodx-ds-space-16)!important;color:#aaa!important;font-size:var(--rodx-ds-text-13)!important}.rodx_rx-render-grp_c021QG{margin-top:var(--rodx-ds-space-8)!important}.rodx_rx-render-input_c021QG{display:none!important}.rodx_rx-render-listToolbar_c021QG{gap:var(--rodx-ds-space-8)!important;padding:var(--rodx-ds-space-6) var(--rodx-ds-space-8)!important;box-sizing:border-box!important;flex-wrap:wrap!important;max-width:100%!important;display:flex!important}.rodx_rx-timeline-grp_c021QG{margin-top:var(--rodx-ds-space-8)!important}.rodx_rx-player-skin_c021QG{width:100%!important;display:block!important}.rodx_rx-player-root_c021QG{z-index:20!important;pointer-events:auto!important;width:100%!important;min-width:0!important;display:block!important;position:relative!important}.rodx_rx-player-video_c021QG{object-fit:contain!important;width:100%!important;height:100%!important;position:relative!important}.rodx_rx-seek-preview-decoder_c021QG{opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;position:fixed!important;top:0!important;left:-10000px!important}.rodx_rx-anchors-host_c021QG{z-index:auto!important;box-sizing:border-box!important;width:100%!important;min-width:0!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-8)!important;flex:none!important;display:block!important;position:relative!important}.rodx_rx-history-options_c021QG{gap:var(--rodx-ds-space-8)!important;padding:var(--rodx-ds-space-8) var(--rodx-ds-space-12)!important;display:flex!important}.rodx_rx-list-typeahead-host_c021QG{z-index:2147483645!important;left:var(--rodx-anchor-left)!important;top:var(--rodx-anchor-top)!important;width:var(--rodx-anchor-width)!important;position:fixed!important}.rodx_rx-relay-banner_c021QG{margin-bottom:var(--rodx-ds-space-6)!important}.rodx_rx-relay-details_c021QG{margin-top:var(--rodx-ds-space-6)!important}.rodx_rx-relay-summary_c021QG{cursor:pointer!important}.rodx_rx-relay-section_c021QG{margin-top:var(--rodx-ds-space-4)!important}.rodx_rx-relay-row_c021QG{justify-content:flex-end!important}.rodx_rx-publisher-row_c021QG{gap:var(--rodx-ds-space-8)!important;flex-wrap:wrap!important}.rodx_rx-publisher-fieldset_c021QG{gap:var(--rodx-ds-space-12)!important;padding:var(--rodx-ds-space-12)!important;border:1px solid var(--rodx-ds-color-border)!important;border-radius:var(--rodx-ds-radius-12)!important;display:grid!important}.rodx_rx-repost-share-mode-field_c021QG{gap:var(--rodx-ds-space-4)!important;display:grid!important}.rodx_rx-repost-queue-button_c021QG{width:100%!important}.rodx_rx-repost-destination-field_c021QG{gap:var(--rodx-ds-space-4)!important;display:grid!important}.rodx_rx-repost-preview-button_c021QG{width:100%!important}.rodx_rx-publisher-muted_c021QG{font-size:var(--rodx-ds-text-12)!important}.rodx_rx-publisher-details_c021QG{font-size:var(--rodx-ds-text-12)!important;opacity:.85!important;line-height:1.45!important}.rodx_rx-publisher-panel_c021QG{gap:var(--rodx-ds-space-12)!important;padding:var(--rodx-ds-space-4) 0 var(--rodx-ds-space-8)!important;min-width:0!important;display:grid!important}.rodx_rx-repost-caption-field_c021QG{gap:var(--rodx-ds-space-8)!important;display:grid!important}.rodx_rx-dock-host_c021QG{z-index:1!important;contain:layout style!important;min-width:0!important;max-width:100%!important;display:block!important;position:relative!important}.rodx_rx-clipboard-textarea_c021QG{position:fixed!important;left:-9999px!important}.rodx_rx-quick-actions-floating_c021QG{z-index:var(--rodx-ds-layer-floating)!important;-webkit-user-select:none!important;user-select:none!important;left:var(--rodx-anchor-left)!important;top:var(--rodx-anchor-top)!important;width:var(--rodx-anchor-width)!important;height:var(--rodx-anchor-height)!important;border-radius:var(--rodx-ds-radius-full)!important;background:var(--rodx-ds-color-surface)!important;color:var(--rodx-ds-color-text)!important;font:var(--rodx-ds-text-24) Arial, sans-serif!important;touch-action:none!important;cursor:pointer!important;border:1px solid #71767b66!important;position:fixed!important}.rodx_rx-quick-actions-listInfo_c021QG{gap:var(--rodx-ds-space-8)!important;font:var(--rodx-ds-text-12) Arial!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-8)!important;flex-wrap:wrap!important;align-items:center!important;display:flex!important}.rodx_rx-quick-actions-b_c021QG{font:var(--rodx-ds-text-12) Arial!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-8)!important;border:1px solid var(--rodx-ds-color-border)!important;border-radius:var(--rodx-ds-radius-12)!important;color:inherit!important;background:0 0!important}.rodx_rx-root-host_c021QG{z-index:2147483000!important;pointer-events:none!important;width:0!important;height:0!important;position:fixed!important;top:0!important;left:0!important}.rodx_rx-search-workbench-row_c021QG{justify-content:space-between!important}.rodx_rx-search-workbench-row-margin-top_c021QG{margin-top:var(--rodx-ds-space-8)!important}.rodx_rx-search-workbench-rodx-selection-list_c021QG{margin:var(--rodx-ds-space-8) 0 var(--rodx-ds-space-16)!important}.rodx_rx-search-workbench-row-align-items_c021QG{align-items:center!important}.rodx_rx-search-workbench-muted_c021QG{font-size:var(--rodx-ds-text-12)!important}.rodx_rx-search-workbench-row-flex-wrap-gap_c021QG{gap:var(--rodx-ds-space-8)!important;flex-wrap:wrap!important}.rodx_rx-search-workbench-chip_c021QG{align-items:center!important;gap:var(--rodx-ds-space-4)!important;max-width:100%!important;display:inline-flex!important}.rodx_rx-search-workbench-row-margin-top-margin-top-11px_c021QG{margin-top:var(--rodx-ds-space-12)!important}.rodx_rx-search-workbench-ctrl_c021QG{flex:1!important;min-width:135px!important}.rodx_rx-search-workbench-builder-buttons_c021QG{margin-top:var(--rodx-ds-space-8)!important}.rodx_rx-search-workbench-hero-sub_c021QG{margin-bottom:0!important}.rodx_rx-search-workbench-builder-buttons-margin-bottom_c021QG{margin-bottom:var(--rodx-ds-space-12)!important}.rodx_rx-search-workbench-btn_c021QG{width:100%!important}.rodx_rx-search-workbench-btn-margin-top_c021QG{margin-top:var(--rodx-ds-space-16)!important}.rodx_rx-search-workbench-row-margin-bottom_c021QG{margin-bottom:var(--rodx-ds-space-16)!important}.rodx_rx-search-workbench-ctrl-flex_c021QG{flex:1!important}.rodx_rx-search-workbench-rootHost_c021QG{pointer-events:auto!important;width:100%!important;min-width:0!important;display:block!important;position:relative!important}:is(#rodx_rodx-hidden-override_c021QG,[hidden]){display:none!important}.rodx_small_c021QG,.rodx_muted_c021QG{color:var(--rodx-ds-color-text-secondary)!important;font-size:var(--rodx-ds-text-12)!important}.rodx_rx-timeline-sentinel_c021QG{height:3px!important}.rodx_panel_c021QG{min-width:0!important;color:inherit!important;gap:12px!important;padding:12px!important;font:14px system-ui,sans-serif!important;display:grid!important}.rodx_panel_c021QG label{gap:6px!important;display:grid!important}.rodx_panel_c021QG input:not([type=checkbox]){box-sizing:border-box!important;width:100%!important;min-width:0!important;color:inherit!important;font:inherit!important;background:#202124!important;border:1px solid #555!important;border-radius:8px!important;padding:10px!important;font-size:16px!important}.rodx_panel_c021QG .rodx_toggle_c021QG{align-items:center!important;gap:8px!important;display:flex!important}.rodx_panel_c021QG button{color:inherit!important;font:inherit!important;background:#303134!important;border:1px solid #555!important;border-radius:8px!important;padding:10px!important}.rodx_panel_c021QG p{margin:0!important;line-height:1.5!important}.rodx_bookmark_c021QG{color:inherit!important;cursor:pointer!important;touch-action:manipulation!important;background:0 0!important;border:0!important;justify-content:center!important;align-items:center!important;padding:8px!important;display:flex!important}.rodx_actions_c021QG{justify-content:flex-end!important;gap:10px!important;padding:12px!important;display:flex!important}.rodx_actions_c021QG button{color:inherit!important;background:#303134!important;border:1px solid #666!important;border-radius:8px!important;padding:10px!important}';
    var Settings_module_css_default = {
      "rx-timeline-grp": "rodx_rx-timeline-grp_c021QG",
      "rx-player-video": "rodx_rx-player-video_c021QG",
      "rx-access-profileHost": "rodx_rx-access-profileHost_c021QG",
      "rx-chrome-context": "rodx_rx-chrome-context_c021QG",
      "rx-list-shortcut": "rodx_rx-list-shortcut_c021QG",
      "rx-search-workbench-row": "rodx_rx-search-workbench-row_c021QG",
      "rx-search-workbench-muted": "rodx_rx-search-workbench-muted_c021QG",
      "rx-repost-preview-button": "rodx_rx-repost-preview-button_c021QG",
      "rx-search-workbench-chip": "rodx_rx-search-workbench-chip_c021QG",
      "rx-search-workbench-row-margin-bottom": "rodx_rx-search-workbench-row-margin-bottom_c021QG",
      "rx-search-workbench-hero-sub": "rodx_rx-search-workbench-hero-sub_c021QG",
      "rx-list-shortcut-floating": "rodx_rx-list-shortcut-floating_c021QG",
      "rx-search-workbench-ctrl-flex": "rodx_rx-search-workbench-ctrl-flex_c021QG",
      "rx-tweets-clone": "rodx_rx-tweets-clone_c021QG",
      "rx-search-workbench-row-margin-top": "rodx_rx-search-workbench-row-margin-top_c021QG",
      "rx-quick-picker-list-icon": "rodx_rx-quick-picker-list-icon_c021QG",
      "rx-render-listToolbar": "rodx_rx-render-listToolbar_c021QG",
      toggle: "rodx_toggle_c021QG",
      "rx-quick-picker-empty-state": "rodx_rx-quick-picker-empty-state_c021QG",
      "rx-player-skin": "rodx_rx-player-skin_c021QG",
      "rx-search-workbench-row-align-items": "rodx_rx-search-workbench-row-align-items_c021QG",
      "rx-repost-queue-button": "rodx_rx-repost-queue-button_c021QG",
      "rx-clipboard-textarea": "rodx_rx-clipboard-textarea_c021QG",
      "rx-history-options": "rodx_rx-history-options_c021QG",
      "rx-search-workbench-row-flex-wrap-gap": "rodx_rx-search-workbench-row-flex-wrap-gap_c021QG",
      "rx-quick-picker-search-field": "rodx_rx-quick-picker-search-field_c021QG",
      "rx-render-grp": "rodx_rx-render-grp_c021QG",
      "rx-search-workbench-row-margin-top-margin-top-11px":
        "rodx_rx-search-workbench-row-margin-top-margin-top-11px_c021QG",
      "rx-anchors-host": "rodx_rx-anchors-host_c021QG",
      "rodx-snap-enabled": "rodx_rodx-snap-enabled_c021QG",
      "rx-root-host": "rodx_rx-root-host_c021QG",
      "rx-publisher-row": "rodx_rx-publisher-row_c021QG",
      small: "rodx_small_c021QG",
      "rx-relay-details": "rodx_rx-relay-details_c021QG",
      "rx-quick-actions-listInfo": "rodx_rx-quick-actions-listInfo_c021QG",
      "rx-relay-summary": "rodx_rx-relay-summary_c021QG",
      "rx-repl-host": "rodx_rx-repl-host_c021QG",
      "rx-profile-add-to-list": "rodx_rx-profile-add-to-list_c021QG",
      "rx-list-shortcut-tab": "rodx_rx-list-shortcut-tab_c021QG",
      "rx-quick-actions-floating": "rodx_rx-quick-actions-floating_c021QG",
      "rx-publisher-panel": "rodx_rx-publisher-panel_c021QG",
      "rx-list-shortcut-profile": "rodx_rx-list-shortcut-profile_c021QG",
      panel: "rodx_panel_c021QG",
      "rx-search-workbench-btn": "rodx_rx-search-workbench-btn_c021QG",
      bookmark: "rodx_bookmark_c021QG",
      "rx-relay-section": "rodx_rx-relay-section_c021QG",
      "rx-timeline-sentinel": "rodx_rx-timeline-sentinel_c021QG",
      "rx-quick-actions-b": "rodx_rx-quick-actions-b_c021QG",
      "rx-dock-host": "rodx_rx-dock-host_c021QG",
      "rx-search-workbench-builder-buttons-margin-bottom":
        "rodx_rx-search-workbench-builder-buttons-margin-bottom_c021QG",
      "rodx-hidden-override": "rodx_rodx-hidden-override_c021QG",
      "rx-player-root": "rodx_rx-player-root_c021QG",
      "rx-search-workbench-rodx-selection-list": "rodx_rx-search-workbench-rodx-selection-list_c021QG",
      "rx-publisher-fieldset": "rodx_rx-publisher-fieldset_c021QG",
      "rx-profile-host": "rodx_rx-profile-host_c021QG",
      "rx-seek-preview-decoder": "rodx_rx-seek-preview-decoder_c021QG",
      "rx-repost-destination-field": "rodx_rx-repost-destination-field_c021QG",
      "rx-relay-row": "rodx_rx-relay-row_c021QG",
      "rx-search-workbench-builder-buttons": "rodx_rx-search-workbench-builder-buttons_c021QG",
      "rx-search-workbench-rootHost": "rodx_rx-search-workbench-rootHost_c021QG",
      "rx-tweets-toggle": "rodx_rx-tweets-toggle_c021QG",
      muted: "rodx_muted_c021QG",
      "rx-feed-filter-host": "rodx_rx-feed-filter-host_c021QG",
      "rx-render-input": "rodx_rx-render-input_c021QG",
      "rx-list-typeahead-host": "rodx_rx-list-typeahead-host_c021QG",
      "rx-publisher-details": "rodx_rx-publisher-details_c021QG",
      "rx-repost-caption-field": "rodx_rx-repost-caption-field_c021QG",
      "rx-publisher-muted": "rodx_rx-publisher-muted_c021QG",
      actions: "rodx_actions_c021QG",
      "rx-repost-share-mode-field": "rodx_rx-repost-share-mode-field_c021QG",
      "rx-search-workbench-ctrl": "rodx_rx-search-workbench-ctrl_c021QG",
      "rx-relay-banner": "rodx_rx-relay-banner_c021QG",
      "rx-search-workbench-btn-margin-top": "rodx_rx-search-workbench-btn-margin-top_c021QG",
    };

    var _tmpl$$3 = (() => {
      let cached;
      return () => {
        if (!cached) {
          const node0 = document.createElementNS("http://www.w3.org/1999/xhtml", "section");
          const node1 = document.createElementNS("http://www.w3.org/1999/xhtml", "style");
          const node2 = document.createTextNode("");
          node1.appendChild(node2);
          node0.appendChild(node1);
          const node3 = document.createElementNS("http://www.w3.org/1999/xhtml", "p");
          const node4 = document.createTextNode(
            "Sincronize as coleções escolhidas com o Relay, sem reenviar itens confirmados.",
          );
          node3.appendChild(node4);
          node0.appendChild(node3);
          const node5 = document.createElementNS("http://www.w3.org/1999/xhtml", "p");
          node5.setAttribute("role", "status");
          node0.appendChild(node5);
          const node6 = document.createElementNS("http://www.w3.org/1999/xhtml", "button");
          node6.setAttribute("type", "button");
          const node7 = document.createTextNode("⚙ Configurações de salvos");
          node6.appendChild(node7);
          node0.appendChild(node6);
          cached = node0;
        }
        return cached.cloneNode(true);
      };
    })();
    var _tmpl$2$2 = (() => {
      let cached;
      return () => {
        if (!cached) {
          const node0 = document.createElementNS("http://www.w3.org/1999/xhtml", "section");
          const node1 = document.createElementNS("http://www.w3.org/1999/xhtml", "style");
          const node2 = document.createTextNode("");
          node1.appendChild(node2);
          node0.appendChild(node1);
          const node3 = document.createElementNS("http://www.w3.org/1999/xhtml", "label");
          const node4 = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
          node4.setAttribute("type", "checkbox");
          node3.appendChild(node4);
          const node5 = document.createTextNode(" Sincronização automática");
          node3.appendChild(node5);
          node0.appendChild(node3);
          const node6 = document.createElementNS("http://www.w3.org/1999/xhtml", "label");
          const node7 = document.createTextNode("IDs das coleções (separados por vírgula)");
          node6.appendChild(node7);
          const node8 = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
          node6.appendChild(node8);
          node0.appendChild(node6);
          const node9 = document.createElementNS("http://www.w3.org/1999/xhtml", "label");
          const node10 = document.createTextNode("Token do Relay ");
          node9.appendChild(node10);
          const node11 = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
          node11.setAttribute("type", "password");
          node11.setAttribute("autocomplete", "off");
          node9.appendChild(node11);
          node0.appendChild(node9);
          const node12 = document.createElementNS("http://www.w3.org/1999/xhtml", "label");
          const node13 = document.createTextNode("Canais Telegram ");
          node12.appendChild(node13);
          const node14 = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
          node12.appendChild(node14);
          node0.appendChild(node12);
          const node15 = document.createElementNS("http://www.w3.org/1999/xhtml", "label");
          const node16 = document.createTextNode("Delay (ms)");
          node15.appendChild(node16);
          const node17 = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
          node17.setAttribute("type", "number");
          node17.setAttribute("min", "0");
          node15.appendChild(node17);
          node0.appendChild(node15);
          const node18 = document.createElementNS("http://www.w3.org/1999/xhtml", "label");
          const node19 = document.createTextNode("Jitter (ms)");
          node18.appendChild(node19);
          const node20 = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
          node20.setAttribute("type", "number");
          node20.setAttribute("min", "0");
          node18.appendChild(node20);
          node0.appendChild(node18);
          const node21 = document.createElementNS("http://www.w3.org/1999/xhtml", "label");
          const node22 = document.createTextNode("Itens por lote");
          node21.appendChild(node22);
          const node23 = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
          node23.setAttribute("type", "number");
          node23.setAttribute("min", "1");
          node21.appendChild(node23);
          node0.appendChild(node21);
          const node24 = document.createElementNS("http://www.w3.org/1999/xhtml", "label");
          const node25 = document.createTextNode("Limite por execução");
          node24.appendChild(node25);
          const node26 = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
          node26.setAttribute("type", "number");
          node26.setAttribute("min", "1");
          node24.appendChild(node26);
          node0.appendChild(node24);
          const node27 = document.createElementNS("http://www.w3.org/1999/xhtml", "p");
          const node28 = document.createTextNode(
            "Somente as coleções escolhidas serão sincronizadas. Nenhuma coleção informada mantém o envio desativado.",
          );
          node27.appendChild(node28);
          node0.appendChild(node27);
          cached = node0;
        }
        return cached.cloneNode(true);
      };
    })();
    var _tmpl$3 = (() => {
      let cached;
      return () => {
        if (!cached) {
          const node0 = document.createElementNS("http://www.w3.org/1999/xhtml", "form");
          const node1 = document.createElementNS("http://www.w3.org/1999/xhtml", "p");
          node1.setAttribute("role", "status");
          node0.appendChild(node1);
          const node2 = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
          const node3 = document.createElementNS("http://www.w3.org/1999/xhtml", "button");
          node3.setAttribute("type", "submit");
          const node4 = document.createTextNode("Salvar");
          node3.appendChild(node4);
          node2.appendChild(node3);
          const node5 = document.createElementNS("http://www.w3.org/1999/xhtml", "button");
          node5.setAttribute("type", "button");
          const node6 = document.createTextNode("Cancelar");
          node5.appendChild(node6);
          node2.appendChild(node5);
          node0.appendChild(node2);
          cached = node0;
        }
        return cached.cloneNode(true);
      };
    })();
    function SavedPanel(props) {
      var _el$ = _tmpl$$3();
      var _el$2 = _el$.firstChild;
      var _el$4 = _el$2.nextSibling.nextSibling;
      var _el$5 = _el$4.nextSibling;
      insert(_el$2, css$2);
      insert(
        _el$4,
        (() => {
          var _c$ = memo(() => {
            return !!props.running;
          });
          return () => {
            return _c$() ? "Sincronizando…" : props.error || "Pronto";
          };
        })(),
      );
      addEvent(_el$5, "click", props.onOpen, true);
      effect(
        () => readShallow(Settings_module_css_default.panel),
        (_v$, _$p) => {
          className(_el$, _v$, _$p);
        },
      );
      return _el$;
    }
    function SavedSettings(props) {
      const [form, setForm] = createStore({ ...props.settings });
      const update = (patch) => {
        setForm((draft) => {
          Object.assign(draft, patch);
          props.onChange({
            ...draft,
            collectionIds: [...draft.collectionIds],
            channels: [...draft.channels],
          });
        });
      };
      const ids = (raw) => [
        ...new Set(
          raw
            .split(/[,;\s]+/)
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      ];
      var _el$6 = _tmpl$2$2();
      var _el$7 = _el$6.firstChild;
      var _el$8 = _el$7.nextSibling;
      var _el$9 = _el$8.firstChild;
      var _el$10 = _el$8.nextSibling;
      var _el$12 = _el$10.firstChild.nextSibling;
      var _el$13 = _el$10.nextSibling;
      var _el$15 = _el$13.firstChild.nextSibling;
      var _el$16 = _el$13.nextSibling;
      var _el$18 = _el$16.firstChild.nextSibling;
      var _el$19 = _el$16.nextSibling;
      var _el$21 = _el$19.firstChild.nextSibling;
      var _el$22 = _el$19.nextSibling;
      var _el$24 = _el$22.firstChild.nextSibling;
      var _el$25 = _el$22.nextSibling;
      var _el$27 = _el$25.firstChild.nextSibling;
      var _el$30 = _el$25.nextSibling.firstChild.nextSibling;
      insert(_el$7, css$2);
      _el$9.addEventListener("change", (event) => update({ enabled: event.currentTarget.checked }));
      _el$12.addEventListener("change", (event) => update({ collectionIds: ids(event.currentTarget.value) }));
      _el$15._$$input = (event) => update({ token: event.currentTarget.value });
      _el$18.addEventListener("change", (event) => update({ channels: ids(event.currentTarget.value) }));
      _el$21._$$input = (event) => update({ delayMs: Math.max(0, event.currentTarget.valueAsNumber || 0) });
      _el$24._$$input = (event) => update({ jitterMs: Math.max(0, event.currentTarget.valueAsNumber || 0) });
      _el$27._$$input = (event) => update({ batchSize: Math.max(1, event.currentTarget.valueAsNumber || 1) });
      _el$30._$$input = (event) =>
        update({ maxItemsPerSession: Math.max(1, event.currentTarget.valueAsNumber || 1) });
      effect(
        () => {
          return {
            e: readShallow(Settings_module_css_default.panel),
            t: readShallow(Settings_module_css_default.toggle),
            a: form.enabled,
            o: form.collectionIds.join(", "),
            i: form.token,
            n: form.channels.join(", "),
            s: form.delayMs,
            h: form.jitterMs,
            r: form.batchSize,
            d: form.maxItemsPerSession,
          };
        },
        ({ e, t, a, o, i, n, s, h, r, d }, _p$) => {
          className(_el$6, e, _p$?.e);
          className(_el$8, t, _p$?.t);
          _el$9.checked = a;
          _el$12.value = o ?? "";
          _el$15.value = i ?? "";
          _el$18.value = n ?? "";
          _el$21.value = s ?? "";
          _el$24.value = h ?? "";
          _el$27.value = r ?? "";
          _el$30.value = d ?? "";
        },
      );
      return _el$6;
    }
    function SettingsDialog(props) {
      const [dialog, setDialog] = createStore({
        busy: false,
        error: props.error,
      });
      let draft = { ...props.settings };
      return createComponent(Dialog, {
        title: "Instagram · Coleções salvas",
        get close() {
          return props.close;
        },
        get children() {
          var _el$31 = _tmpl$3();
          var _el$32 = _el$31.firstChild;
          var _el$33 = _el$32.nextSibling;
          var _el$34 = _el$33.firstChild;
          var _el$35 = _el$34.nextSibling;
          _el$31.addEventListener("submit", (event) => {
            event.preventDefault();
            if (dialog.busy) return;
            setDialog((value) => {
              value.busy = true;
              value.error = "";
            });
            props
              .save(draft)
              .catch((error) =>
                setDialog((value) => {
                  value.error = error.message;
                }),
              )
              .finally(() =>
                setDialog((value) => {
                  value.busy = false;
                }),
              );
          });
          insert(
            _el$31,
            createComponent(SavedSettings, {
              get settings() {
                return props.settings;
              },
              onChange: (next) => {
                draft = next;
              },
            }),
            _el$32,
          );
          insert(_el$32, () => {
            return dialog.error;
          });
          addEvent(_el$35, "click", props.close, true);
          effect(
            () => {
              return {
                e: readShallow(Settings_module_css_default.actions),
                t: dialog.busy,
              };
            },
            ({ e, t }, _p$) => {
              className(_el$33, e, _p$?.e);
              t !== _p$?.t && setAttribute(_el$34, "disabled", t);
            },
          );
          return _el$31;
        },
      });
    }
    delegateEvents(["click", "input"]);

    function mountPoint(target, component, options = {}) {
      const host = document.createElement(options.tag || "div");
      host.dataset.solidMount = "";
      if (options.id) host.id = options.id;
      target.insertBefore(host, options.before || null);
      let dispose;
      try {
        dispose = render(component, options.shadow ? host.attachShadow({ mode: "open" }) : host);
        flush();
      } catch (error) {
        host.remove();
        throw error;
      }
      let closed = false;
      return {
        host,
        dispose() {
          if (closed) return;
          closed = true;
          dispose();
          host.remove();
        },
      };
    }

    var _tmpl$$2 = (() => {
      let cached;
      return () => {
        if (!cached) {
          const node0 = document.createElementNS("http://www.w3.org/1999/xhtml", "button");
          node0.setAttribute("id", "rod-instagram-reel-bookmark");
          node0.setAttribute("type", "button");
          const node1 = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          node1.setAttribute("aria-hidden", "true");
          node1.setAttribute("width", "24");
          node1.setAttribute("height", "24");
          node1.setAttribute("viewBox", "0 0 24 24");
          node1.setAttribute("fill", "currentColor");
          const node2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
          node1.appendChild(node2);
          node0.appendChild(node1);
          cached = node0;
        }
        return cached.cloneNode(true);
      };
    })();
    var LABELS = /^(save|salvar|guardar|unsave|remover dos salvos|remove from saved)$/i;
    var SAVED = /unsave|remover dos salvos|remove from saved/i;
    function reelIsOpen() {
      return /^\/reel\/[A-Za-z0-9_-]+\/?$/.test(location.pathname);
    }
    function nativeSave() {
      for (const node of document.querySelectorAll("[aria-label]")) {
        if (node.closest("[data-solid-mount]") || !LABELS.test(node.getAttribute("aria-label")?.trim() || ""))
          continue;
        const control = node.closest('button, [role="button"]');
        if (control) return control;
      }
      return null;
    }
    function findActions() {
      for (const node of document.querySelectorAll(
        'svg[aria-label="More options"], svg[aria-label="Mais opções"], svg[aria-label="Share Post"], svg[aria-label="Compartilhar publicação"], svg[aria-label="Like"], svg[aria-label="Curtir"]',
      )) {
        const parent = node.closest('button, [role="button"]')?.parentElement;
        if (parent && !parent.closest("[data-solid-mount]")) return parent;
      }
      return null;
    }
    function ReelBookmark(props) {
      var _el$ = _tmpl$$2();
      var _el$3 = _el$.firstChild.firstChild;
      _el$._$$click = (event) => {
        event.preventDefault();
        event.stopPropagation();
        props.activate();
      };
      effect(
        () => {
          return {
            e: readShallow(Settings_module_css_default.bookmark),
            t: props.saved ? "Remover dos salvos" : "Salvar",
            a: props.saved ? "Remover dos salvos" : "Salvar",
            o: props.saved
              ? "M20 21.5a.5.5 0 0 1-.315-.112L12 15.322l-7.685 6.066A.5.5 0 0 1 3.5 21V3A1.5 1.5 0 0 1 5 1.5h14A1.5 1.5 0 0 1 20.5 3v18a.5.5 0 0 1-.5.5Z"
              : "M19 1.5H5A1.5 1.5 0 0 0 3.5 3v18a.5.5 0 0 0 .815.388L12 15.322l7.685 6.066A.5.5 0 0 0 20.5 21V3A1.5 1.5 0 0 0 19 1.5Zm0 17.435-6.69-5.28a.5.5 0 0 0-.62 0L5 18.935V3h14Z",
          };
        },
        ({ e, t, a, o }, _p$) => {
          className(_el$, e, _p$?.e);
          t !== _p$?.t && setAttribute(_el$, "aria-label", t);
          a !== _p$?.a && setAttribute(_el$, "title", a);
          o !== _p$?.o && setAttribute(_el$3, "d", o);
        },
      );
      return _el$;
    }
    function mountReelBookmark(signal, pageStyle) {
      pageStyle(css$2);
      const [state, setState] = createStore({ saved: false });
      let mount;
      const activate = () => {
        if (reelIsOpen()) {
          nativeSave()?.click();
          queueMicrotask(refresh);
        }
      };
      function refresh() {
        const target = reelIsOpen() ? findActions() : null,
          source = nativeSave();
        if (!target || !source) {
          mount?.dispose();
          mount = void 0;
          return;
        }
        const saved = SAVED.test(
          source.getAttribute("aria-label") ||
            source.querySelector("[aria-label]")?.getAttribute("aria-label") ||
            "",
        );
        if (saved !== state.saved)
          setState((draft) => {
            draft.saved = saved;
          });
        if (mount?.host.parentElement !== target) {
          mount?.dispose();
          mount = mountPoint(
            target,
            () =>
              createComponent(ReelBookmark, {
                get saved() {
                  return state.saved;
                },
                activate,
              }),
            { tag: "span" },
          );
        }
      }
      const observer = new MutationObserver((records) => {
        if (
          records.some(
            (record) =>
              !(record.target instanceof Element ? record.target : record.target.parentElement)?.closest(
                "[data-solid-mount]",
              ),
          )
        )
          refresh();
      });
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["aria-label"],
      });
      const interval = setInterval(refresh, 1200);
      signal.addEventListener(
        "abort",
        () => {
          observer.disconnect();
          clearInterval(interval);
          mount?.dispose();
        },
        { once: true },
      );
      refresh();
    }
    delegateEvents(["click"]);

    var css$1 =
      ':root,:host{--rodx-ds-control-touch:44px!important;--rodx-ds-color-white:#fff!important;--rodx-ds-color-black:#000!important;--rodx-ds-font-sans:-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif!important;--rodx-ds-font-mono:ui-monospace, SFMono-Regular, Menlo, monospace!important;--rodx-ds-color-accent:#1d9bf0!important;--rodx-ds-color-text:var(--rx-text,#e7e9ea)!important;--rodx-ds-color-surface:var(--rx-surface,#15202b)!important;--rodx-ds-color-muted:#71767b!important;--rodx-ds-color-border:#71767b55!important;--rodx-ds-color-hover:#71767b22!important;--rodx-ds-color-accent-soft:#1d9bf01f!important;--rodx-ds-radius-round:999px!important;--rodx-ds-radius-full:50%!important;--rodx-ds-control-size:32px!important;--rodx-ds-font-weight-semibold:600!important;--rodx-ds-font-weight-bold:700!important;--rodx-ds-layer-floating:1400!important;--rodx-ds-layer-overlay:2147480000!important;--rodx-ds-border-width:1px!important;--rodx-ds-space-1:1px!important;--rodx-ds-space-2:2px!important;--rodx-ds-space-4:4px!important;--rodx-ds-space-6:6px!important;--rodx-ds-space-8:8px!important;--rodx-ds-space-12:12px!important;--rodx-ds-space-16:16px!important;--rodx-ds-space-20:20px!important;--rodx-ds-space-24:24px!important;--rodx-ds-space-32:32px!important;--rodx-ds-space-40:40px!important;--rodx-ds-space-48:48px!important;--rodx-ds-text-11:11px!important;--rodx-ds-text-12:12px!important;--rodx-ds-text-13:13px!important;--rodx-ds-text-14:14px!important;--rodx-ds-text-16:16px!important;--rodx-ds-text-18:18px!important;--rodx-ds-text-20:20px!important;--rodx-ds-text-24:24px!important;--rodx-ds-radius-4:4px!important;--rodx-ds-radius-8:8px!important;--rodx-ds-radius-12:12px!important;--rodx-ds-radius-16:16px!important;--rodx-ds-radius-20:20px!important;--rodx-ds-radius-24:24px!important;--rodx-ds-font-ui:TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif!important;--rodx-ds-header-height:60px!important;--rodx-ds-glass-surface:#181c2252!important;--rodx-ds-glass-border:#ffffff38!important;--rodx-ds-glass-blur:blur(20px) saturate(1.8)!important;--rodx-ds-glass-shadow:inset 0 1px 0 #ffffff45, 0 3px 14px #0003!important;--rodx-ds-control-height:40px!important;--rodx-ds-social-telegram-bg:#229ed92b!important;--rodx-ds-social-whatsapp-bg:#25d3662b!important;--rodx-ds-social-instagram-bg:#e1306c26!important;--rodx-ds-icon-size-small:15px!important;--rodx-ds-color-accent-selected:#1d9bf033!important;--rodx-ds-color-text-secondary:#979ba5!important}:host{font:var(--rodx-ds-text-14) var(--rodx-ds-font-ui)!important}:host *,[class^=rx-]{box-sizing:border-box!important}:host button{cursor:pointer!important;font-family:inherit!important}html,html.rodx_rodx-snap-enabled_f-PBWW,body{scroll-snap-type:none!important}@media (prefers-reduced-motion:reduce){html{scroll-snap-type:none!important}}.rodx_rx-repl-host_f-PBWW{all:initial!important;z-index:2147483647!important;width:0!important;height:0!important;position:fixed!important;top:0!important;left:0!important}.rodx_rx-feed-filter-host_f-PBWW{min-width:0!important;font:var(--rodx-ds-text-12) Arial!important;color:inherit!important;display:block!important}button{border-radius:var(--rodx-ds-radius-12)!important;color:inherit!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-12)!important;max-width:100%!important;font:inherit!important;cursor:pointer!important;background:0 0!important;border:1px solid #71767b44!important}.rodx_rx-chrome-context_f-PBWW{white-space:nowrap!important;text-overflow:ellipsis!important;opacity:.75!important;pointer-events:none!important;font:10px Arial!important;display:block!important;position:absolute!important;top:1px!important;left:6px!important;right:6px!important;overflow:hidden!important}.rodx_rx-tweets-clone_f-PBWW{width:18px!important;height:18px!important;fill:var(--rodx-ds-color-accent)!important}.rodx_rx-tweets-toggle_f-PBWW{width:auto!important;max-width:max-content!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-8)!important;margin:var(--rodx-ds-space-2) 0!important;align-self:flex-start!important;display:inline-flex!important}.rodx_rx-list-shortcut-tab_f-PBWW{gap:var(--rodx-ds-space-1)!important;flex-direction:column!important;flex:0 0 var(--rodx-ds-control-touch)!important;width:var(--rodx-ds-control-touch)!important;min-height:var(--rodx-ds-control-touch)!important;color:inherit!important;cursor:pointer!important;touch-action:manipulation!important;background:0 0!important;border:0!important;justify-content:center!important;align-items:center!important;padding:0!important;font:10px Arial!important;display:flex!important}.rodx_rx-list-shortcut-floating_f-PBWW{left:12px!important;bottom:calc(66px + env(safe-area-inset-bottom,0px))!important;z-index:var(--rodx-ds-layer-floating)!important;gap:var(--rodx-ds-space-1)!important;border-radius:var(--rodx-ds-radius-full)!important;background:var(--rodx-bar-bg,Canvas)!important;width:42px!important;height:42px!important;color:var(--rodx-bar-fg,CanvasText)!important;cursor:pointer!important;touch-action:manipulation!important;border:1px solid #71767b66!important;flex-direction:column!important;justify-content:center!important;align-items:center!important;font:10px Arial!important;display:flex!important;position:fixed!important}.rodx_rx-access-profileHost_f-PBWW{min-width:0!important;max-width:100%!important;margin:var(--rodx-ds-space-4) 0!important;display:block!important;position:relative!important}.rodx_rx-profile-add-to-list_f-PBWW{font:500 var(--rodx-ds-text-13) var(--rodx-ds-font-ui)!important;min-height:var(--rodx-ds-control-height)!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-12)!important;border-radius:var(--rodx-ds-radius-16)!important;color:inherit!important;cursor:pointer!important;touch-action:manipulation!important;background:0 0!important;border:1px solid #71767b66!important}.rodx_rx-list-shortcut_f-PBWW{min-height:var(--rodx-ds-control-height)!important;min-width:86px!important;padding:var(--rodx-ds-space-6) var(--rodx-ds-space-8)!important;border-radius:var(--rodx-ds-radius-24)!important;color:var(--rodx-ds-color-white)!important;font:600 var(--rodx-ds-text-12) -apple-system, system-ui!important;white-space:nowrap!important;touch-action:manipulation!important;z-index:1!important;background:#23272d!important;border:1px solid #52606f!important;flex:none!important;position:relative!important}.rodx_rx-list-shortcut-profile_f-PBWW{margin:var(--rodx-ds-space-4) 0 0 var(--rodx-ds-space-48)!important;align-self:flex-start!important}.rodx_rx-profile-host_f-PBWW{width:100%!important;min-height:var(--rodx-ds-control-touch)!important;clear:both!important;color:inherit!important;flex:0 0 100%!important;display:block!important;position:relative!important}.rodx_rx-quick-picker-search-field_f-PBWW{padding:var(--rodx-ds-space-12) var(--rodx-ds-space-12)!important}.rodx_rx-quick-picker-list-icon_f-PBWW{font-size:var(--rodx-ds-text-16)!important}.rodx_rx-quick-picker-empty-state_f-PBWW{padding:var(--rodx-ds-space-16)!important;color:#aaa!important;font-size:var(--rodx-ds-text-13)!important}.rodx_rx-render-grp_f-PBWW{margin-top:var(--rodx-ds-space-8)!important}.rodx_rx-render-input_f-PBWW{display:none!important}.rodx_rx-render-listToolbar_f-PBWW{gap:var(--rodx-ds-space-8)!important;padding:var(--rodx-ds-space-6) var(--rodx-ds-space-8)!important;box-sizing:border-box!important;flex-wrap:wrap!important;max-width:100%!important;display:flex!important}.rodx_rx-timeline-grp_f-PBWW{margin-top:var(--rodx-ds-space-8)!important}.rodx_rx-player-skin_f-PBWW{width:100%!important;display:block!important}.rodx_rx-player-root_f-PBWW{z-index:20!important;pointer-events:auto!important;width:100%!important;min-width:0!important;display:block!important;position:relative!important}.rodx_rx-player-video_f-PBWW{object-fit:contain!important;width:100%!important;height:100%!important;position:relative!important}.rodx_rx-seek-preview-decoder_f-PBWW{opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;position:fixed!important;top:0!important;left:-10000px!important}.rodx_rx-anchors-host_f-PBWW{z-index:auto!important;box-sizing:border-box!important;width:100%!important;min-width:0!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-8)!important;flex:none!important;display:block!important;position:relative!important}.rodx_rx-history-options_f-PBWW{gap:var(--rodx-ds-space-8)!important;padding:var(--rodx-ds-space-8) var(--rodx-ds-space-12)!important;display:flex!important}.rodx_rx-list-typeahead-host_f-PBWW{z-index:2147483645!important;left:var(--rodx-anchor-left)!important;top:var(--rodx-anchor-top)!important;width:var(--rodx-anchor-width)!important;position:fixed!important}.rodx_rx-relay-banner_f-PBWW{margin-bottom:var(--rodx-ds-space-6)!important}.rodx_rx-relay-details_f-PBWW{margin-top:var(--rodx-ds-space-6)!important}.rodx_rx-relay-summary_f-PBWW{cursor:pointer!important}.rodx_rx-relay-section_f-PBWW{margin-top:var(--rodx-ds-space-4)!important}.rodx_rx-relay-row_f-PBWW{justify-content:flex-end!important}.rodx_rx-publisher-row_f-PBWW{gap:var(--rodx-ds-space-8)!important;flex-wrap:wrap!important}.rodx_rx-publisher-fieldset_f-PBWW{gap:var(--rodx-ds-space-12)!important;padding:var(--rodx-ds-space-12)!important;border:1px solid var(--rodx-ds-color-border)!important;border-radius:var(--rodx-ds-radius-12)!important;display:grid!important}.rodx_rx-repost-share-mode-field_f-PBWW{gap:var(--rodx-ds-space-4)!important;display:grid!important}.rodx_rx-repost-queue-button_f-PBWW{width:100%!important}.rodx_rx-repost-destination-field_f-PBWW{gap:var(--rodx-ds-space-4)!important;display:grid!important}.rodx_rx-repost-preview-button_f-PBWW{width:100%!important}.rodx_rx-publisher-muted_f-PBWW{font-size:var(--rodx-ds-text-12)!important}.rodx_rx-publisher-details_f-PBWW{font-size:var(--rodx-ds-text-12)!important;opacity:.85!important;line-height:1.45!important}.rodx_rx-publisher-panel_f-PBWW{gap:var(--rodx-ds-space-12)!important;padding:var(--rodx-ds-space-4) 0 var(--rodx-ds-space-8)!important;min-width:0!important;display:grid!important}.rodx_rx-repost-caption-field_f-PBWW{gap:var(--rodx-ds-space-8)!important;display:grid!important}.rodx_rx-dock-host_f-PBWW{z-index:1!important;contain:layout style!important;min-width:0!important;max-width:100%!important;display:block!important;position:relative!important}.rodx_rx-clipboard-textarea_f-PBWW{position:fixed!important;left:-9999px!important}.rodx_rx-quick-actions-floating_f-PBWW{z-index:var(--rodx-ds-layer-floating)!important;-webkit-user-select:none!important;user-select:none!important;left:var(--rodx-anchor-left)!important;top:var(--rodx-anchor-top)!important;width:var(--rodx-anchor-width)!important;height:var(--rodx-anchor-height)!important;border-radius:var(--rodx-ds-radius-full)!important;background:var(--rodx-ds-color-surface)!important;color:var(--rodx-ds-color-text)!important;font:var(--rodx-ds-text-24) Arial, sans-serif!important;touch-action:none!important;cursor:pointer!important;border:1px solid #71767b66!important;position:fixed!important}.rodx_rx-quick-actions-listInfo_f-PBWW{gap:var(--rodx-ds-space-8)!important;font:var(--rodx-ds-text-12) Arial!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-8)!important;flex-wrap:wrap!important;align-items:center!important;display:flex!important}.rodx_rx-quick-actions-b_f-PBWW{font:var(--rodx-ds-text-12) Arial!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-8)!important;border:1px solid var(--rodx-ds-color-border)!important;border-radius:var(--rodx-ds-radius-12)!important;color:inherit!important;background:0 0!important}.rodx_rx-root-host_f-PBWW{z-index:2147483000!important;pointer-events:none!important;width:0!important;height:0!important;position:fixed!important;top:0!important;left:0!important}.rodx_rx-search-workbench-row_f-PBWW{justify-content:space-between!important}.rodx_rx-search-workbench-row-margin-top_f-PBWW{margin-top:var(--rodx-ds-space-8)!important}.rodx_rx-search-workbench-rodx-selection-list_f-PBWW{margin:var(--rodx-ds-space-8) 0 var(--rodx-ds-space-16)!important}.rodx_rx-search-workbench-row-align-items_f-PBWW{align-items:center!important}.rodx_rx-search-workbench-muted_f-PBWW{font-size:var(--rodx-ds-text-12)!important}.rodx_rx-search-workbench-row-flex-wrap-gap_f-PBWW{gap:var(--rodx-ds-space-8)!important;flex-wrap:wrap!important}.rodx_rx-search-workbench-chip_f-PBWW{align-items:center!important;gap:var(--rodx-ds-space-4)!important;max-width:100%!important;display:inline-flex!important}.rodx_rx-search-workbench-row-margin-top-margin-top-11px_f-PBWW{margin-top:var(--rodx-ds-space-12)!important}.rodx_rx-search-workbench-ctrl_f-PBWW{flex:1!important;min-width:135px!important}.rodx_rx-search-workbench-builder-buttons_f-PBWW{margin-top:var(--rodx-ds-space-8)!important}.rodx_rx-search-workbench-hero-sub_f-PBWW{margin-bottom:0!important}.rodx_rx-search-workbench-builder-buttons-margin-bottom_f-PBWW{margin-bottom:var(--rodx-ds-space-12)!important}.rodx_rx-search-workbench-btn_f-PBWW{width:100%!important}.rodx_rx-search-workbench-btn-margin-top_f-PBWW{margin-top:var(--rodx-ds-space-16)!important}.rodx_rx-search-workbench-row-margin-bottom_f-PBWW{margin-bottom:var(--rodx-ds-space-16)!important}.rodx_rx-search-workbench-ctrl-flex_f-PBWW{flex:1!important}.rodx_rx-search-workbench-rootHost_f-PBWW{pointer-events:auto!important;width:100%!important;min-width:0!important;display:block!important;position:relative!important}:is(#rodx_rodx-hidden-override_f-PBWW,[hidden]){display:none!important}.rodx_small_f-PBWW,.rodx_muted_f-PBWW{color:var(--rodx-ds-color-text-secondary)!important;font-size:var(--rodx-ds-text-12)!important}.rodx_rx-timeline-sentinel_f-PBWW{height:3px!important}.rodx_panel_f-PBWW{color:inherit!important;min-width:0!important}.rodx_tabs_f-PBWW{gap:2px!important;width:100%!important;min-width:0!important;padding:8px 0 12px!important;display:flex!important}.rodx_tabs_f-PBWW button{text-overflow:ellipsis!important;white-space:nowrap!important;color:#ddd!important;min-width:0!important;padding:9px var(--tab-pad)!important;font:inherit!important;font-size:var(--tab-font)!important;background:#262626!important;border:1px solid #525252!important;border-radius:7px!important;flex:1 1 0!important;overflow:hidden!important}.rodx_tabs_f-PBWW button[aria-selected=true]{color:#fff!important;background:#525252!important;border-color:#a8a8a8!important}.rodx_tabs_f-PBWW button:focus-visible{outline-offset:2px!important;outline:2px solid #bbb!important}.rodx_content_f-PBWW{min-height:110px!important;padding:8px 0!important}';
    var Panel_module_css_default = {
      "rx-relay-banner": "rodx_rx-relay-banner_f-PBWW",
      "rx-publisher-fieldset": "rodx_rx-publisher-fieldset_f-PBWW",
      "rx-root-host": "rodx_rx-root-host_f-PBWW",
      "rx-tweets-clone": "rodx_rx-tweets-clone_f-PBWW",
      "rx-access-profileHost": "rodx_rx-access-profileHost_f-PBWW",
      content: "rodx_content_f-PBWW",
      "rx-repost-queue-button": "rodx_rx-repost-queue-button_f-PBWW",
      "rx-list-shortcut-profile": "rodx_rx-list-shortcut-profile_f-PBWW",
      "rx-publisher-details": "rodx_rx-publisher-details_f-PBWW",
      "rx-timeline-grp": "rodx_rx-timeline-grp_f-PBWW",
      "rx-search-workbench-muted": "rodx_rx-search-workbench-muted_f-PBWW",
      "rx-relay-section": "rodx_rx-relay-section_f-PBWW",
      "rx-publisher-row": "rodx_rx-publisher-row_f-PBWW",
      "rodx-hidden-override": "rodx_rodx-hidden-override_f-PBWW",
      tabs: "rodx_tabs_f-PBWW",
      "rx-relay-details": "rodx_rx-relay-details_f-PBWW",
      "rx-search-workbench-row-align-items": "rodx_rx-search-workbench-row-align-items_f-PBWW",
      "rx-render-grp": "rodx_rx-render-grp_f-PBWW",
      "rx-list-shortcut": "rodx_rx-list-shortcut_f-PBWW",
      "rx-quick-actions-floating": "rodx_rx-quick-actions-floating_f-PBWW",
      "rx-search-workbench-ctrl-flex": "rodx_rx-search-workbench-ctrl-flex_f-PBWW",
      "rx-history-options": "rodx_rx-history-options_f-PBWW",
      "rx-quick-picker-search-field": "rodx_rx-quick-picker-search-field_f-PBWW",
      small: "rodx_small_f-PBWW",
      "rx-search-workbench-row": "rodx_rx-search-workbench-row_f-PBWW",
      "rodx-snap-enabled": "rodx_rodx-snap-enabled_f-PBWW",
      "rx-profile-host": "rodx_rx-profile-host_f-PBWW",
      "rx-quick-actions-listInfo": "rodx_rx-quick-actions-listInfo_f-PBWW",
      "rx-profile-add-to-list": "rodx_rx-profile-add-to-list_f-PBWW",
      "rx-quick-picker-list-icon": "rodx_rx-quick-picker-list-icon_f-PBWW",
      "rx-player-video": "rodx_rx-player-video_f-PBWW",
      "rx-quick-actions-b": "rodx_rx-quick-actions-b_f-PBWW",
      "rx-timeline-sentinel": "rodx_rx-timeline-sentinel_f-PBWW",
      "rx-render-listToolbar": "rodx_rx-render-listToolbar_f-PBWW",
      "rx-search-workbench-btn-margin-top": "rodx_rx-search-workbench-btn-margin-top_f-PBWW",
      "rx-relay-row": "rodx_rx-relay-row_f-PBWW",
      "rx-search-workbench-row-flex-wrap-gap": "rodx_rx-search-workbench-row-flex-wrap-gap_f-PBWW",
      "rx-search-workbench-btn": "rodx_rx-search-workbench-btn_f-PBWW",
      "rx-quick-picker-empty-state": "rodx_rx-quick-picker-empty-state_f-PBWW",
      "rx-repl-host": "rodx_rx-repl-host_f-PBWW",
      "rx-player-root": "rodx_rx-player-root_f-PBWW",
      "rx-search-workbench-builder-buttons-margin-bottom":
        "rodx_rx-search-workbench-builder-buttons-margin-bottom_f-PBWW",
      "rx-search-workbench-ctrl": "rodx_rx-search-workbench-ctrl_f-PBWW",
      "rx-search-workbench-row-margin-bottom": "rodx_rx-search-workbench-row-margin-bottom_f-PBWW",
      "rx-dock-host": "rodx_rx-dock-host_f-PBWW",
      "rx-chrome-context": "rodx_rx-chrome-context_f-PBWW",
      "rx-relay-summary": "rodx_rx-relay-summary_f-PBWW",
      "rx-repost-destination-field": "rodx_rx-repost-destination-field_f-PBWW",
      "rx-tweets-toggle": "rodx_rx-tweets-toggle_f-PBWW",
      "rx-search-workbench-row-margin-top": "rodx_rx-search-workbench-row-margin-top_f-PBWW",
      "rx-search-workbench-rootHost": "rodx_rx-search-workbench-rootHost_f-PBWW",
      "rx-repost-share-mode-field": "rodx_rx-repost-share-mode-field_f-PBWW",
      "rx-render-input": "rodx_rx-render-input_f-PBWW",
      "rx-anchors-host": "rodx_rx-anchors-host_f-PBWW",
      "rx-search-workbench-hero-sub": "rodx_rx-search-workbench-hero-sub_f-PBWW",
      panel: "rodx_panel_f-PBWW",
      "rx-search-workbench-chip": "rodx_rx-search-workbench-chip_f-PBWW",
      "rx-repost-caption-field": "rodx_rx-repost-caption-field_f-PBWW",
      "rx-publisher-muted": "rodx_rx-publisher-muted_f-PBWW",
      "rx-search-workbench-builder-buttons": "rodx_rx-search-workbench-builder-buttons_f-PBWW",
      "rx-search-workbench-rodx-selection-list": "rodx_rx-search-workbench-rodx-selection-list_f-PBWW",
      "rx-search-workbench-row-margin-top-margin-top-11px":
        "rodx_rx-search-workbench-row-margin-top-margin-top-11px_f-PBWW",
      "rx-feed-filter-host": "rodx_rx-feed-filter-host_f-PBWW",
      "rx-repost-preview-button": "rodx_rx-repost-preview-button_f-PBWW",
      "rx-seek-preview-decoder": "rodx_rx-seek-preview-decoder_f-PBWW",
      "rx-clipboard-textarea": "rodx_rx-clipboard-textarea_f-PBWW",
      "rx-publisher-panel": "rodx_rx-publisher-panel_f-PBWW",
      "rx-list-shortcut-tab": "rodx_rx-list-shortcut-tab_f-PBWW",
      "rx-list-shortcut-floating": "rodx_rx-list-shortcut-floating_f-PBWW",
      muted: "rodx_muted_f-PBWW",
      "rx-player-skin": "rodx_rx-player-skin_f-PBWW",
      "rx-list-typeahead-host": "rodx_rx-list-typeahead-host_f-PBWW",
    };

    var _tmpl$$1 = (() => {
      let cached;
      return () => {
        if (!cached) {
          const node0 = document.createElementNS("http://www.w3.org/1999/xhtml", "section");
          const node1 = document.createElementNS("http://www.w3.org/1999/xhtml", "style");
          const node2 = document.createTextNode("");
          node1.appendChild(node2);
          node0.appendChild(node1);
          const node3 = document.createElementNS("http://www.w3.org/1999/xhtml", "nav");
          node3.setAttribute("role", "tablist");
          node3.setAttribute("aria-label", "Ferramentas");
          node0.appendChild(node3);
          const node4 = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
          node4.setAttribute("id", "rod-actions-content");
          node4.setAttribute("role", "tabpanel");
          node0.appendChild(node4);
          cached = node0;
        }
        return cached.cloneNode(true);
      };
    })();
    var _tmpl$2$1 = (() => {
      let cached;
      return () => {
        if (!cached) {
          const node0 = document.createElementNS("http://www.w3.org/1999/xhtml", "button");
          node0.setAttribute("type", "button");
          node0.setAttribute("role", "tab");
          node0.setAttribute("aria-controls", "rod-actions-content");
          cached = node0;
        }
        return cached.cloneNode(true);
      };
    })();
    function ActionsPanel(props) {
      const tabs = () => props.entries;
      const [active, setActive] = createSignal(props.initial);
      const [width, setWidth] = createSignal(360);
      let nav;
      createEffect(
        () => props.entries,
        (next) => {
          if (!next.some((tab) => tab.key === active())) setActive(next[0]?.key || "");
        },
      );
      const slot = () => width() / Math.max(1, tabs().length);
      const attachNav = (element) => {
        nav = element;
        const resize = new ResizeObserver(() => setWidth(nav.getBoundingClientRect().width));
        resize.observe(nav);
        onCleanup(() => resize.disconnect());
      };
      const chooseNext = (event) => {
        const current = tabs().findIndex((tab) => tab.key === active());
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs().length - 1
              : event.key === "ArrowRight"
                ? (current + 1) % tabs().length
                : event.key === "ArrowLeft"
                  ? (current - 1 + tabs().length) % tabs().length
                  : -1;
        if (next < 0) return;
        event.preventDefault();
        setActive(tabs()[next].key);
        nav.querySelectorAll("button")[next]?.focus();
      };
      var _el$ = _tmpl$$1();
      var _el$2 = _el$.firstChild;
      var _el$3 = _el$2.nextSibling;
      var _el$4 = _el$3.nextSibling;
      insert(_el$2, css$1);
      _el$3._$$keydown = chooseNext;
      ref(() => {
        return attachNav;
      }, _el$3);
      insert(
        _el$3,
        createComponent(For, {
          get each() {
            return tabs();
          },
          children: (tab) =>
            (() => {
              var _el$5 = _tmpl$2$1();
              _el$5._$$click = () => setActive(tab.key);
              insert(
                _el$5,
                (() => {
                  var _c$ = memo(() => {
                    return slot() < 70;
                  });
                  return () => {
                    return _c$() ? tab.icon || (tab.id === "saved" ? "▣" : "⚙") : tab.title;
                  };
                })(),
              );
              effect(
                () => {
                  return {
                    e: `rod-tab-${tab.key}`,
                    t: active() === tab.key ? "true" : "false",
                    a: active() === tab.key ? 0 : -1,
                    o: tab.label,
                    i: tab.label,
                  };
                },
                ({ e, t, a, o, i }, _p$) => {
                  e !== _p$?.e && setAttribute(_el$5, "id", e);
                  t !== _p$?.t && setAttribute(_el$5, "aria-selected", t);
                  a !== _p$?.a && setAttribute(_el$5, "tabindex", a);
                  o !== _p$?.o && setAttribute(_el$5, "title", o);
                  i !== _p$?.i && setAttribute(_el$5, "aria-label", i);
                },
              );
              return _el$5;
            })(),
        }),
      );
      insert(_el$4, () => {
        return tabs()
          .find((tab) => tab.key === active())
          ?.render();
      });
      effect(
        () => {
          return {
            e: readShallow(Panel_module_css_default.panel),
            t: readShallow(Panel_module_css_default.tabs),
            a: `${Math.max(10, Math.min(13, slot() / 7))}px`,
            o: `${Math.max(0, Math.min(8, slot() / 14))}px`,
            i: readShallow(Panel_module_css_default.content),
            n: `rod-tab-${active()}`,
          };
        },
        ({ e, t, a, o, i, n }, _p$) => {
          className(_el$, e, _p$?.e);
          className(_el$3, t, _p$?.t);
          a !== _p$?.a && setStyleProperty(_el$3, "--tab-font", a);
          o !== _p$?.o && setStyleProperty(_el$3, "--tab-pad", o);
          className(_el$4, i, _p$?.i);
          n !== _p$?.n && setAttribute(_el$4, "aria-labelledby", n);
        },
      );
      return _el$;
    }
    delegateEvents(["keydown", "click"]);

    var css =
      ':root,:host{--rodx-ds-control-touch:44px!important;--rodx-ds-color-white:#fff!important;--rodx-ds-color-black:#000!important;--rodx-ds-font-sans:-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif!important;--rodx-ds-font-mono:ui-monospace, SFMono-Regular, Menlo, monospace!important;--rodx-ds-color-accent:#1d9bf0!important;--rodx-ds-color-text:var(--rx-text,#e7e9ea)!important;--rodx-ds-color-surface:var(--rx-surface,#15202b)!important;--rodx-ds-color-muted:#71767b!important;--rodx-ds-color-border:#71767b55!important;--rodx-ds-color-hover:#71767b22!important;--rodx-ds-color-accent-soft:#1d9bf01f!important;--rodx-ds-radius-round:999px!important;--rodx-ds-radius-full:50%!important;--rodx-ds-control-size:32px!important;--rodx-ds-font-weight-semibold:600!important;--rodx-ds-font-weight-bold:700!important;--rodx-ds-layer-floating:1400!important;--rodx-ds-layer-overlay:2147480000!important;--rodx-ds-border-width:1px!important;--rodx-ds-space-1:1px!important;--rodx-ds-space-2:2px!important;--rodx-ds-space-4:4px!important;--rodx-ds-space-6:6px!important;--rodx-ds-space-8:8px!important;--rodx-ds-space-12:12px!important;--rodx-ds-space-16:16px!important;--rodx-ds-space-20:20px!important;--rodx-ds-space-24:24px!important;--rodx-ds-space-32:32px!important;--rodx-ds-space-40:40px!important;--rodx-ds-space-48:48px!important;--rodx-ds-text-11:11px!important;--rodx-ds-text-12:12px!important;--rodx-ds-text-13:13px!important;--rodx-ds-text-14:14px!important;--rodx-ds-text-16:16px!important;--rodx-ds-text-18:18px!important;--rodx-ds-text-20:20px!important;--rodx-ds-text-24:24px!important;--rodx-ds-radius-4:4px!important;--rodx-ds-radius-8:8px!important;--rodx-ds-radius-12:12px!important;--rodx-ds-radius-16:16px!important;--rodx-ds-radius-20:20px!important;--rodx-ds-radius-24:24px!important;--rodx-ds-font-ui:TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif!important;--rodx-ds-header-height:60px!important;--rodx-ds-glass-surface:#181c2252!important;--rodx-ds-glass-border:#ffffff38!important;--rodx-ds-glass-blur:blur(20px) saturate(1.8)!important;--rodx-ds-glass-shadow:inset 0 1px 0 #ffffff45, 0 3px 14px #0003!important;--rodx-ds-control-height:40px!important;--rodx-ds-social-telegram-bg:#229ed92b!important;--rodx-ds-social-whatsapp-bg:#25d3662b!important;--rodx-ds-social-instagram-bg:#e1306c26!important;--rodx-ds-icon-size-small:15px!important;--rodx-ds-color-accent-selected:#1d9bf033!important;--rodx-ds-color-text-secondary:#979ba5!important}:host{font:var(--rodx-ds-text-14) var(--rodx-ds-font-ui)!important}:host *,[class^=rx-]{box-sizing:border-box!important}:host button{cursor:pointer!important;font-family:inherit!important}html,html.rodx_rodx-snap-enabled_cw0Xua,body{scroll-snap-type:none!important}@media (prefers-reduced-motion:reduce){html{scroll-snap-type:none!important}}.rodx_rx-repl-host_cw0Xua{all:initial!important;z-index:2147483647!important;width:0!important;height:0!important;position:fixed!important;top:0!important;left:0!important}.rodx_rx-feed-filter-host_cw0Xua{min-width:0!important;font:var(--rodx-ds-text-12) Arial!important;color:inherit!important;display:block!important}button{border-radius:var(--rodx-ds-radius-12)!important;color:inherit!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-12)!important;max-width:100%!important;font:inherit!important;cursor:pointer!important;background:0 0!important;border:1px solid #71767b44!important}.rodx_rx-chrome-context_cw0Xua{white-space:nowrap!important;text-overflow:ellipsis!important;opacity:.75!important;pointer-events:none!important;font:10px Arial!important;display:block!important;position:absolute!important;top:1px!important;left:6px!important;right:6px!important;overflow:hidden!important}.rodx_rx-tweets-clone_cw0Xua{width:18px!important;height:18px!important;fill:var(--rodx-ds-color-accent)!important}.rodx_rx-tweets-toggle_cw0Xua{width:auto!important;max-width:max-content!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-8)!important;margin:var(--rodx-ds-space-2) 0!important;align-self:flex-start!important;display:inline-flex!important}.rodx_rx-list-shortcut-tab_cw0Xua{gap:var(--rodx-ds-space-1)!important;flex-direction:column!important;flex:0 0 var(--rodx-ds-control-touch)!important;width:var(--rodx-ds-control-touch)!important;min-height:var(--rodx-ds-control-touch)!important;color:inherit!important;cursor:pointer!important;touch-action:manipulation!important;background:0 0!important;border:0!important;justify-content:center!important;align-items:center!important;padding:0!important;font:10px Arial!important;display:flex!important}.rodx_rx-list-shortcut-floating_cw0Xua{left:12px!important;bottom:calc(66px + env(safe-area-inset-bottom,0px))!important;z-index:var(--rodx-ds-layer-floating)!important;gap:var(--rodx-ds-space-1)!important;border-radius:var(--rodx-ds-radius-full)!important;background:var(--rodx-bar-bg,Canvas)!important;width:42px!important;height:42px!important;color:var(--rodx-bar-fg,CanvasText)!important;cursor:pointer!important;touch-action:manipulation!important;border:1px solid #71767b66!important;flex-direction:column!important;justify-content:center!important;align-items:center!important;font:10px Arial!important;display:flex!important;position:fixed!important}.rodx_rx-access-profileHost_cw0Xua{min-width:0!important;max-width:100%!important;margin:var(--rodx-ds-space-4) 0!important;display:block!important;position:relative!important}.rodx_rx-profile-add-to-list_cw0Xua{font:500 var(--rodx-ds-text-13) var(--rodx-ds-font-ui)!important;min-height:var(--rodx-ds-control-height)!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-12)!important;border-radius:var(--rodx-ds-radius-16)!important;color:inherit!important;cursor:pointer!important;touch-action:manipulation!important;background:0 0!important;border:1px solid #71767b66!important}.rodx_rx-list-shortcut_cw0Xua{min-height:var(--rodx-ds-control-height)!important;min-width:86px!important;padding:var(--rodx-ds-space-6) var(--rodx-ds-space-8)!important;border-radius:var(--rodx-ds-radius-24)!important;color:var(--rodx-ds-color-white)!important;font:600 var(--rodx-ds-text-12) -apple-system, system-ui!important;white-space:nowrap!important;touch-action:manipulation!important;z-index:1!important;background:#23272d!important;border:1px solid #52606f!important;flex:none!important;position:relative!important}.rodx_rx-list-shortcut-profile_cw0Xua{margin:var(--rodx-ds-space-4) 0 0 var(--rodx-ds-space-48)!important;align-self:flex-start!important}.rodx_rx-profile-host_cw0Xua{width:100%!important;min-height:var(--rodx-ds-control-touch)!important;clear:both!important;color:inherit!important;flex:0 0 100%!important;display:block!important;position:relative!important}.rodx_rx-quick-picker-search-field_cw0Xua{padding:var(--rodx-ds-space-12) var(--rodx-ds-space-12)!important}.rodx_rx-quick-picker-list-icon_cw0Xua{font-size:var(--rodx-ds-text-16)!important}.rodx_rx-quick-picker-empty-state_cw0Xua{padding:var(--rodx-ds-space-16)!important;color:#aaa!important;font-size:var(--rodx-ds-text-13)!important}.rodx_rx-render-grp_cw0Xua{margin-top:var(--rodx-ds-space-8)!important}.rodx_rx-render-input_cw0Xua{display:none!important}.rodx_rx-render-listToolbar_cw0Xua{gap:var(--rodx-ds-space-8)!important;padding:var(--rodx-ds-space-6) var(--rodx-ds-space-8)!important;box-sizing:border-box!important;flex-wrap:wrap!important;max-width:100%!important;display:flex!important}.rodx_rx-timeline-grp_cw0Xua{margin-top:var(--rodx-ds-space-8)!important}.rodx_rx-player-skin_cw0Xua{width:100%!important;display:block!important}.rodx_rx-player-root_cw0Xua{z-index:20!important;pointer-events:auto!important;width:100%!important;min-width:0!important;display:block!important;position:relative!important}.rodx_rx-player-video_cw0Xua{object-fit:contain!important;width:100%!important;height:100%!important;position:relative!important}.rodx_rx-seek-preview-decoder_cw0Xua{opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;position:fixed!important;top:0!important;left:-10000px!important}.rodx_rx-anchors-host_cw0Xua{z-index:auto!important;box-sizing:border-box!important;width:100%!important;min-width:0!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-8)!important;flex:none!important;display:block!important;position:relative!important}.rodx_rx-history-options_cw0Xua{gap:var(--rodx-ds-space-8)!important;padding:var(--rodx-ds-space-8) var(--rodx-ds-space-12)!important;display:flex!important}.rodx_rx-list-typeahead-host_cw0Xua{z-index:2147483645!important;left:var(--rodx-anchor-left)!important;top:var(--rodx-anchor-top)!important;width:var(--rodx-anchor-width)!important;position:fixed!important}.rodx_rx-relay-banner_cw0Xua{margin-bottom:var(--rodx-ds-space-6)!important}.rodx_rx-relay-details_cw0Xua{margin-top:var(--rodx-ds-space-6)!important}.rodx_rx-relay-summary_cw0Xua{cursor:pointer!important}.rodx_rx-relay-section_cw0Xua{margin-top:var(--rodx-ds-space-4)!important}.rodx_rx-relay-row_cw0Xua{justify-content:flex-end!important}.rodx_rx-publisher-row_cw0Xua{gap:var(--rodx-ds-space-8)!important;flex-wrap:wrap!important}.rodx_rx-publisher-fieldset_cw0Xua{gap:var(--rodx-ds-space-12)!important;padding:var(--rodx-ds-space-12)!important;border:1px solid var(--rodx-ds-color-border)!important;border-radius:var(--rodx-ds-radius-12)!important;display:grid!important}.rodx_rx-repost-share-mode-field_cw0Xua{gap:var(--rodx-ds-space-4)!important;display:grid!important}.rodx_rx-repost-queue-button_cw0Xua{width:100%!important}.rodx_rx-repost-destination-field_cw0Xua{gap:var(--rodx-ds-space-4)!important;display:grid!important}.rodx_rx-repost-preview-button_cw0Xua{width:100%!important}.rodx_rx-publisher-muted_cw0Xua{font-size:var(--rodx-ds-text-12)!important}.rodx_rx-publisher-details_cw0Xua{font-size:var(--rodx-ds-text-12)!important;opacity:.85!important;line-height:1.45!important}.rodx_rx-publisher-panel_cw0Xua{gap:var(--rodx-ds-space-12)!important;padding:var(--rodx-ds-space-4) 0 var(--rodx-ds-space-8)!important;min-width:0!important;display:grid!important}.rodx_rx-repost-caption-field_cw0Xua{gap:var(--rodx-ds-space-8)!important;display:grid!important}.rodx_rx-dock-host_cw0Xua{z-index:1!important;contain:layout style!important;min-width:0!important;max-width:100%!important;display:block!important;position:relative!important}.rodx_rx-clipboard-textarea_cw0Xua{position:fixed!important;left:-9999px!important}.rodx_rx-quick-actions-floating_cw0Xua{z-index:var(--rodx-ds-layer-floating)!important;-webkit-user-select:none!important;user-select:none!important;left:var(--rodx-anchor-left)!important;top:var(--rodx-anchor-top)!important;width:var(--rodx-anchor-width)!important;height:var(--rodx-anchor-height)!important;border-radius:var(--rodx-ds-radius-full)!important;background:var(--rodx-ds-color-surface)!important;color:var(--rodx-ds-color-text)!important;font:var(--rodx-ds-text-24) Arial, sans-serif!important;touch-action:none!important;cursor:pointer!important;border:1px solid #71767b66!important;position:fixed!important}.rodx_rx-quick-actions-listInfo_cw0Xua{gap:var(--rodx-ds-space-8)!important;font:var(--rodx-ds-text-12) Arial!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-8)!important;flex-wrap:wrap!important;align-items:center!important;display:flex!important}.rodx_rx-quick-actions-b_cw0Xua{font:var(--rodx-ds-text-12) Arial!important;padding:var(--rodx-ds-space-4) var(--rodx-ds-space-8)!important;border:1px solid var(--rodx-ds-color-border)!important;border-radius:var(--rodx-ds-radius-12)!important;color:inherit!important;background:0 0!important}.rodx_rx-root-host_cw0Xua{z-index:2147483000!important;pointer-events:none!important;width:0!important;height:0!important;position:fixed!important;top:0!important;left:0!important}.rodx_rx-search-workbench-row_cw0Xua{justify-content:space-between!important}.rodx_rx-search-workbench-row-margin-top_cw0Xua{margin-top:var(--rodx-ds-space-8)!important}.rodx_rx-search-workbench-rodx-selection-list_cw0Xua{margin:var(--rodx-ds-space-8) 0 var(--rodx-ds-space-16)!important}.rodx_rx-search-workbench-row-align-items_cw0Xua{align-items:center!important}.rodx_rx-search-workbench-muted_cw0Xua{font-size:var(--rodx-ds-text-12)!important}.rodx_rx-search-workbench-row-flex-wrap-gap_cw0Xua{gap:var(--rodx-ds-space-8)!important;flex-wrap:wrap!important}.rodx_rx-search-workbench-chip_cw0Xua{align-items:center!important;gap:var(--rodx-ds-space-4)!important;max-width:100%!important;display:inline-flex!important}.rodx_rx-search-workbench-row-margin-top-margin-top-11px_cw0Xua{margin-top:var(--rodx-ds-space-12)!important}.rodx_rx-search-workbench-ctrl_cw0Xua{flex:1!important;min-width:135px!important}.rodx_rx-search-workbench-builder-buttons_cw0Xua{margin-top:var(--rodx-ds-space-8)!important}.rodx_rx-search-workbench-hero-sub_cw0Xua{margin-bottom:0!important}.rodx_rx-search-workbench-builder-buttons-margin-bottom_cw0Xua{margin-bottom:var(--rodx-ds-space-12)!important}.rodx_rx-search-workbench-btn_cw0Xua{width:100%!important}.rodx_rx-search-workbench-btn-margin-top_cw0Xua{margin-top:var(--rodx-ds-space-16)!important}.rodx_rx-search-workbench-row-margin-bottom_cw0Xua{margin-bottom:var(--rodx-ds-space-16)!important}.rodx_rx-search-workbench-ctrl-flex_cw0Xua{flex:1!important}.rodx_rx-search-workbench-rootHost_cw0Xua{pointer-events:auto!important;width:100%!important;min-width:0!important;display:block!important;position:relative!important}:is(#rodx_rodx-hidden-override_cw0Xua,[hidden]){display:none!important}.rodx_small_cw0Xua,.rodx_muted_cw0Xua{color:var(--rodx-ds-color-text-secondary)!important;font-size:var(--rodx-ds-text-12)!important}.rodx_rx-timeline-sentinel_cw0Xua{height:3px!important}.rodx_launcher_cw0Xua{right:max(12px, env(safe-area-inset-right))!important;bottom:calc(78px + env(safe-area-inset-bottom))!important;z-index:2147483000!important;color:#fff!important;background:#262626!important;border:1px solid #525252!important;border-radius:50%!important;width:36px!important;height:36px!important;font-size:18px!important;position:fixed!important}.rodx_launcher_cw0Xua[hidden]{display:none!important}';
    var Launcher_module_css_default = {
      "rx-search-workbench-row-margin-top": "rodx_rx-search-workbench-row-margin-top_cw0Xua",
      "rx-search-workbench-rodx-selection-list": "rodx_rx-search-workbench-rodx-selection-list_cw0Xua",
      "rx-search-workbench-chip": "rodx_rx-search-workbench-chip_cw0Xua",
      "rx-tweets-clone": "rodx_rx-tweets-clone_cw0Xua",
      "rx-render-listToolbar": "rodx_rx-render-listToolbar_cw0Xua",
      "rx-profile-host": "rodx_rx-profile-host_cw0Xua",
      "rx-timeline-sentinel": "rodx_rx-timeline-sentinel_cw0Xua",
      "rx-seek-preview-decoder": "rodx_rx-seek-preview-decoder_cw0Xua",
      "rx-repost-share-mode-field": "rodx_rx-repost-share-mode-field_cw0Xua",
      "rx-render-grp": "rodx_rx-render-grp_cw0Xua",
      "rx-search-workbench-row-align-items": "rodx_rx-search-workbench-row-align-items_cw0Xua",
      "rx-repost-queue-button": "rodx_rx-repost-queue-button_cw0Xua",
      "rx-list-shortcut": "rodx_rx-list-shortcut_cw0Xua",
      "rx-search-workbench-builder-buttons": "rodx_rx-search-workbench-builder-buttons_cw0Xua",
      "rx-search-workbench-hero-sub": "rodx_rx-search-workbench-hero-sub_cw0Xua",
      "rx-quick-actions-b": "rodx_rx-quick-actions-b_cw0Xua",
      "rx-history-options": "rodx_rx-history-options_cw0Xua",
      "rx-profile-add-to-list": "rodx_rx-profile-add-to-list_cw0Xua",
      "rx-repost-caption-field": "rodx_rx-repost-caption-field_cw0Xua",
      "rx-tweets-toggle": "rodx_rx-tweets-toggle_cw0Xua",
      "rx-player-skin": "rodx_rx-player-skin_cw0Xua",
      "rodx-snap-enabled": "rodx_rodx-snap-enabled_cw0Xua",
      "rx-list-typeahead-host": "rodx_rx-list-typeahead-host_cw0Xua",
      "rx-relay-details": "rodx_rx-relay-details_cw0Xua",
      "rx-quick-actions-listInfo": "rodx_rx-quick-actions-listInfo_cw0Xua",
      "rx-search-workbench-ctrl-flex": "rodx_rx-search-workbench-ctrl-flex_cw0Xua",
      "rx-repost-preview-button": "rodx_rx-repost-preview-button_cw0Xua",
      "rx-relay-summary": "rodx_rx-relay-summary_cw0Xua",
      "rx-quick-actions-floating": "rodx_rx-quick-actions-floating_cw0Xua",
      "rx-search-workbench-btn": "rodx_rx-search-workbench-btn_cw0Xua",
      "rx-publisher-panel": "rodx_rx-publisher-panel_cw0Xua",
      "rx-search-workbench-rootHost": "rodx_rx-search-workbench-rootHost_cw0Xua",
      "rx-search-workbench-builder-buttons-margin-bottom":
        "rodx_rx-search-workbench-builder-buttons-margin-bottom_cw0Xua",
      "rx-publisher-muted": "rodx_rx-publisher-muted_cw0Xua",
      "rx-dock-host": "rodx_rx-dock-host_cw0Xua",
      "rx-chrome-context": "rodx_rx-chrome-context_cw0Xua",
      "rx-render-input": "rodx_rx-render-input_cw0Xua",
      "rx-repost-destination-field": "rodx_rx-repost-destination-field_cw0Xua",
      launcher: "rodx_launcher_cw0Xua",
      "rx-feed-filter-host": "rodx_rx-feed-filter-host_cw0Xua",
      "rx-search-workbench-ctrl": "rodx_rx-search-workbench-ctrl_cw0Xua",
      "rx-anchors-host": "rodx_rx-anchors-host_cw0Xua",
      "rx-publisher-details": "rodx_rx-publisher-details_cw0Xua",
      "rx-relay-section": "rodx_rx-relay-section_cw0Xua",
      "rx-publisher-row": "rodx_rx-publisher-row_cw0Xua",
      "rx-list-shortcut-floating": "rodx_rx-list-shortcut-floating_cw0Xua",
      "rx-repl-host": "rodx_rx-repl-host_cw0Xua",
      "rodx-hidden-override": "rodx_rodx-hidden-override_cw0Xua",
      "rx-list-shortcut-profile": "rodx_rx-list-shortcut-profile_cw0Xua",
      "rx-publisher-fieldset": "rodx_rx-publisher-fieldset_cw0Xua",
      "rx-search-workbench-row-flex-wrap-gap": "rodx_rx-search-workbench-row-flex-wrap-gap_cw0Xua",
      "rx-list-shortcut-tab": "rodx_rx-list-shortcut-tab_cw0Xua",
      "rx-access-profileHost": "rodx_rx-access-profileHost_cw0Xua",
      "rx-search-workbench-muted": "rodx_rx-search-workbench-muted_cw0Xua",
      "rx-relay-banner": "rodx_rx-relay-banner_cw0Xua",
      "rx-search-workbench-row-margin-bottom": "rodx_rx-search-workbench-row-margin-bottom_cw0Xua",
      "rx-clipboard-textarea": "rodx_rx-clipboard-textarea_cw0Xua",
      muted: "rodx_muted_cw0Xua",
      "rx-root-host": "rodx_rx-root-host_cw0Xua",
      "rx-search-workbench-row": "rodx_rx-search-workbench-row_cw0Xua",
      "rx-player-video": "rodx_rx-player-video_cw0Xua",
      "rx-player-root": "rodx_rx-player-root_cw0Xua",
      "rx-quick-picker-empty-state": "rodx_rx-quick-picker-empty-state_cw0Xua",
      "rx-quick-picker-search-field": "rodx_rx-quick-picker-search-field_cw0Xua",
      "rx-timeline-grp": "rodx_rx-timeline-grp_cw0Xua",
      "rx-relay-row": "rodx_rx-relay-row_cw0Xua",
      "rx-search-workbench-row-margin-top-margin-top-11px":
        "rodx_rx-search-workbench-row-margin-top-margin-top-11px_cw0Xua",
      "rx-search-workbench-btn-margin-top": "rodx_rx-search-workbench-btn-margin-top_cw0Xua",
      small: "rodx_small_cw0Xua",
      "rx-quick-picker-list-icon": "rodx_rx-quick-picker-list-icon_cw0Xua",
    };

    var _tmpl$ = (() => {
      let cached;
      return () => {
        if (!cached) cached = document.createElementNS("http://www.w3.org/1999/xhtml", "style");
        return cached.cloneNode(true);
      };
    })();
    var _tmpl$2 = (() => {
      let cached;
      return () => {
        if (!cached) {
          const node0 = document.createElementNS("http://www.w3.org/1999/xhtml", "button");
          node0.setAttribute("type", "button");
          node0.setAttribute("title", "Rod Actions");
          node0.setAttribute("aria-label", "Abrir Rod Actions");
          const node1 = document.createTextNode("⚙");
          node0.appendChild(node1);
          cached = node0;
        }
        return cached.cloneNode(true);
      };
    })();
    function installRodActions(_menu) {
      if (window.__RodActions) return window.__RodActions;
      const [state, setState] = createStore({ modules: [] });
      const [open, setOpen] = createSignal(false),
        [initial, setInitial] = createSignal("");
      const registrations = new Map();
      const entries = () =>
        state.modules.flatMap((module) =>
          module.tabs.map((tab) => ({
            ...tab,
            key: `${module.id}:${tab.id}`,
            label: `${module.title} · ${tab.title}`,
          })),
        );
      const hub = {
        register(module) {
          if (!module.id || !module.tabs.length) throw Error("Rod Actions requires module id and tabs");
          const token = Symbol(module.id);
          registrations.set(module.id, token);
          setState((draft) => {
            draft.modules = draft.modules.filter((item) => item.id !== module.id);
            draft.modules.push(module);
          });
          return () => {
            if (registrations.get(module.id) !== token) return;
            registrations.delete(module.id);
            setState((draft) => {
              draft.modules = draft.modules.filter((item) => item.id !== module.id);
            });
            if (!state.modules.length) setOpen(false);
          };
        },
        open(tabId) {
          const tabs = entries();
          if (!tabs.length) return;
          setInitial(tabs.some((tab) => tab.key === tabId) ? tabId : tabs[0].key);
          setOpen(true);
        },
      };
      mountPoint(
        document.body || document.documentElement,
        () => [
          (() => {
            var _el$ = _tmpl$();
            insert(_el$, css);
            return _el$;
          })(),
          createComponent(Show, {
            get when() {
              return state.modules.length;
            },
            get children() {
              var _el$2 = _tmpl$2();
              _el$2._$$click = () => hub.open();
              effect(
                () => readShallow(Launcher_module_css_default.launcher),
                (_v$, _$p) => {
                  className(_el$2, _v$, _$p);
                },
              );
              return _el$2;
            },
          }),
          createComponent(Show, {
            get when() {
              return open();
            },
            get children() {
              return createComponent(Dialog, {
                title: "Rod Actions",
                close: () => setOpen(false),
                get children() {
                  return createComponent(ActionsPanel, {
                    get entries() {
                      return entries();
                    },
                    get initial() {
                      return initial();
                    },
                  });
                },
              });
            },
          }),
        ],
        {
          id: "rod-actions-hub",
          shadow: true,
        },
      );
      window.__RodActions = hub;
      return hub;
    }
    delegateEvents(["click"]);

    var COLLECTION_PATH = (id) => `/api/v1/feed/collection/${encodeURIComponent(id)}/posts/`;
    function reelPayload(raw) {
      const m = raw.media || raw;
      if (m.product_type !== "clips" || !m.code) return null;
      const variants = (m.video_versions || [])
        .filter((v) => /^https:\/\//.test(v.url || ""))
        .sort((a, b) => b.width * b.height - a.width * a.height);
      if (!variants.length) return null;
      const sourceUrl = `https://www.instagram.com/reel/${m.code}/`;
      return {
        provider: "instagram",
        mediaId: m.code,
        sourceUrl,
        pageUrl: sourceUrl,
        mediaUrl: variants[0].url,
        mediaType: "video",
        force: false,
        caption: [m.caption?.text, m.user?.username && `@${m.user.username}`, sourceUrl].filter(Boolean)
          .join(`

`),
        mediaVariants: variants.map((v) => ({
          mediaUrl: v.url,
          width: v.width,
          height: v.height,
        })),
        metadata: {
          instagramId: String(m.pk || m.id || ""),
          username: m.user?.username,
          originalCaption: m.caption?.text || "",
          width: variants[0].width,
          height: variants[0].height,
        },
      };
    }
    function classify(result, channels) {
      const c = result?.channels;
      const inserted = new Set(c?.inserted || []);
      const covered = new Set([
        ...inserted,
        ...(c?.covered || []),
        ...(c?.notSent || []).filter((v) => v.reason === "already_sent").map((v) => v.channelId),
      ]);
      return {
        complete: channels.every((c) => covered.has(c)),
        inserted: inserted.size > 0,
      };
    }
    function retryDelay(attempt, count, retryAfter, random = Math.random) {
      const seconds = Number(retryAfter);
      const date = Date.parse(retryAfter || "");
      const server =
        retryAfter && Number.isFinite(seconds)
          ? seconds * 1e3
          : Number.isFinite(date)
            ? Math.max(0, date - Date.now())
            : 0;
      return Math.max(server, Math.min(6e4, (900 + count * 120) * 2 ** attempt) + random() * 400);
    }
    async function syncSaved({
      fetchPage,
      sendBatch,
      load,
      save,
      channels,
      pause,
      signal,
      settings = {},
      onCursor,
    }) {
      const done = await load();
      const seen = new Set();
      let cursor = settings.cursor || "",
        count = 0,
        pages = 0;
      const limit = Math.max(1, Math.min(100, Number(settings.batchSize) || 5));
      const maxItems = Math.max(1, Math.min(1e4, Number(settings.maxItemsPerSession) || 100));
      const cursors = new Set();
      do {
        signal?.throwIfAborted();
        const page = await fetchPage(cursor);
        if (!Array.isArray(page.items) || page.status === "fail") throw Error("Resposta de salvos inválida");
        const items = page.items
          .map(reelPayload)
          .filter((item) => item !== null)
          .filter((item) => {
            if (seen.has(item.mediaId)) return false;
            seen.add(item.mediaId);
            return !done[item.mediaId];
          });
        for (let offset = 0; offset < items.length; offset += limit) {
          let pending = items.slice(offset, offset + limit);
          for (let attempt = 0; pending.length && attempt < 4; attempt++) {
            signal?.throwIfAborted();
            const response = await sendBatch(pending);
            if (!Array.isArray(response.results)) throw Error("Relay sem confirmação por item");
            const retry = [];
            for (let i = 0; i < pending.length; i++) {
              const result = response.results.find((r) => r.index === i);
              const status = classify(result, channels);
              if (status.complete) {
                done[pending[i].mediaId] = Date.now();
                if (status.inserted) count++;
                await save(done);
              } else if (result && (result.status === 429 || result.status >= 500)) retry.push(pending[i]);
              else throw Error("Entrega não confirmada; sincronização interrompida");
            }
            pending = retry;
            if (pending.length) await pause(retryDelay(attempt, pending.length));
          }
          if (pending.length) throw Error("Limite de tentativas do Relay");
          await pause(
            Math.max(0, Number(settings.delayMs) || 0) +
              Math.random() * Math.max(0, Number(settings.jitterMs) || 0),
          );
        }
        pages++;
        const next = page.next_max_id;
        if (!page.more_available) {
          await onCursor?.("");
          break;
        }
        if (!next || cursors.has(next)) throw Error("Cursor de salvos repetido ou ausente");
        cursors.add(next);
        cursor = next;
        await onCursor?.(cursor);
        if (seen.size >= maxItems) break;
        await pause(Math.min(8e3, 1e3 + pages * 100));
      } while (true);
      return count;
    }

    var DEFAULTS = {
      enabled: false,
      collectionIds: [],
      delayMs: 1500,
      jitterMs: 500,
      batchSize: 10,
      maxItemsPerSession: 100,
    };
    var RELAY = "https://xtelegram-cf.migos.club/batch";
    var instagram_saved_default = {
      init(ctx) {
        const abort = ctx.signal;
        ctx.ui.registerStyles(css$2);
        mountReelBookmark(abort, ctx.pageStyle);
        const unregisterActions = installRodActions(ctx.menu).register({
          id: "instagram-saved",
          title: "Instagram",
          tabs: [
            {
              id: "saved",
              title: "Salvos",
              render() {
                return createComponent(SavedPanel, {
                  onOpen: () => void settingsApi.open(),
                  get running() {
                    return runtime.running;
                  },
                  get error() {
                    return runtime.lastError;
                  },
                });
              },
            },
          ],
        });
        ctx.onDispose(unregisterActions);
        const [runtime, setRuntime] = createStore({
          running: false,
          lastRun: 0,
          lastError: "",
          open: false,
          form: {
            ...DEFAULTS,
            token: "",
            channels: [],
          },
        });
        ctx.ui.mountSolid(
          () =>
            createComponent(Show, {
              get when() {
                return runtime.open;
              },
              get children() {
                return createComponent(SettingsDialog, {
                  get settings() {
                    return runtime.form;
                  },
                  get error() {
                    return runtime.lastError;
                  },
                  close: () =>
                    setRuntime((draft) => {
                      draft.open = false;
                    }),
                  save: async (form) => {
                    const { token, channels, ...settings } = form;
                    await settingsApi.update(settings);
                    await set("config", {
                      token: token.trim(),
                      channels,
                    });
                    setRuntime((draft) => {
                      draft.open = false;
                    });
                    run(true);
                  },
                });
              },
            }),
          {
            styles: [css$2],
            id: "instagram-settings",
          },
        );
        const get = async (key, fallback) => ctx.storage.get(key, fallback);
        const set = async (key, value) => ctx.storage.set(key, value);
        const pause = (ms) =>
          new Promise((resolve, reject) => {
            abort.throwIfAborted();
            const cancelled = () => {
              clearTimeout(timer);
              reject(abort.reason);
            };
            const timer = setTimeout(() => {
              abort.removeEventListener("abort", cancelled);
              resolve();
            }, ms);
            abort.addEventListener("abort", cancelled, { once: true });
          });
        async function configure() {
          await settingsApi.open();
        }
        function relay(config, items) {
          return new Promise((resolve, reject) => {
            const request =
              typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : globalThis.GM?.xmlHttpRequest;
            if (!request) return reject(Error("GM_xmlhttpRequest indisponível"));
            const handle = request({
              method: "POST",
              url: RELAY,
              anonymous: true,
              timeout: 9e4,
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.token}`,
              },
              data: JSON.stringify({
                items,
                channels: config.channels,
                concurrency: 1,
                force: false,
              }),
              onload(response) {
                abort.removeEventListener("abort", cancel);
                try {
                  const data = JSON.parse(response.responseText);
                  if (Array.isArray(data.results)) return resolve(data);
                  const error = Error(`Relay HTTP ${response.status}`);
                  error.status = response.status;
                  error.retryAfter = response.responseHeaders?.match(/^retry-after:\s*(.+)$/im)?.[1]?.trim();
                  reject(error);
                } catch (error) {
                  reject(error);
                }
              },
              onerror: () => {
                abort.removeEventListener("abort", cancel);
                reject(Error("Falha de rede Relay"));
              },
              ontimeout: () => {
                abort.removeEventListener("abort", cancel);
                reject(Error("Timeout Relay; entrega incerta"));
              },
              onabort: () => reject(Error("Envio interrompido")),
            });
            function cancel() {
              handle?.abort();
            }
            abort.addEventListener("abort", cancel, { once: true });
          });
        }
        async function retry(operation, size) {
          for (let attempt = 0; ; attempt++) {
            abort.throwIfAborted();
            try {
              return await operation();
            } catch (caught) {
              const error = caught;
              if (attempt >= 3 || !(error.status === 429 || error.status >= 500)) throw error;
              await pause(retryDelay(attempt, size, error.retryAfter));
            }
          }
        }
        async function run(manual = false) {
          if (runtime.running || (!manual && (document.hidden || Date.now() - runtime.lastRun < 3e5))) return;
          const config = await get("config", null);
          const settings = {
            ...DEFAULTS,
            ...(await get("settings", {})),
          };
          if (!settings.enabled || !settings.collectionIds?.length) return;
          const account = document.cookie.match(/(?:^|;\s*)ds_user_id=([^;]+)/)?.[1];
          if (!config?.token || !account) return;
          setRuntime((draft) => {
            draft.running = true;
            draft.lastRun = Date.now();
          });
          try {
            if (!navigator.locks)
              throw Error("Web Locks indisponível; sincronização desativada para evitar concorrência");
            await navigator.locks.request(
              `instagram-saved:${account}`,
              { ifAvailable: true },
              async (lock) => {
                if (!lock) return;
                abort.throwIfAborted();
                let count = 0;
                for (const collectionId of settings.collectionIds) {
                  const stateKey = `delivered:${account}:${collectionId}:${[...config.channels].sort().join(",")}`;
                  const cursorKey = `cursor:${account}:${collectionId}`;
                  count += await syncSaved({
                    channels: config.channels,
                    signal: abort,
                    pause,
                    settings: {
                      ...settings,
                      cursor: await get(cursorKey, ""),
                    },
                    onCursor: (cursor) => set(cursorKey, cursor),
                    load: () => get(stateKey, {}),
                    save: (done) => set(stateKey, done),
                    sendBatch: (items) => retry(() => relay(config, items), items.length),
                    fetchPage: (cursor) =>
                      retry(async () => {
                        if (document.cookie.match(/(?:^|;\s*)ds_user_id=([^;]+)/)?.[1] !== account)
                          throw Error("Conta alterada");
                        const url = new URL(COLLECTION_PATH(collectionId), location.origin);
                        url.searchParams.set("count", "50");
                        if (cursor) url.searchParams.set("max_id", cursor);
                        const response = await fetch(url, {
                          credentials: "same-origin",
                          signal: abort,
                          headers: {
                            "X-IG-App-ID": "936619743392459",
                            "X-Requested-With": "XMLHttpRequest",
                            "X-CSRFToken": decodeURIComponent(
                              document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] || "",
                            ),
                          },
                        });
                        if (!response.ok) {
                          const error = Error(`Instagram HTTP ${response.status}`);
                          error.status = response.status;
                          error.retryAfter = response.headers.get("retry-after");
                          throw error;
                        }
                        return response.json();
                      }, 50),
                  });
                }
                await set("lastError", null);
                setRuntime((draft) => {
                  draft.lastError = "";
                });
                if (count > 0) ctx.toaster.success?.({ title: `${count} mídias enviadas` });
              },
            );
          } catch (caught) {
            const error = caught;
            if (!abort.aborted) {
              await set("lastError", {
                message: error.message,
                at: Date.now(),
              });
              setRuntime((draft) => {
                draft.lastError = error.message;
              });
            }
          } finally {
            setRuntime((draft) => {
              draft.running = false;
            });
          }
        }
        const settingsApi = {
          async get() {
            return {
              ...DEFAULTS,
              ...(await get("settings", {})),
            };
          },
          async update(patch) {
            const next = {
              ...(await this.get()),
              ...patch,
            };
            next.collectionIds = [
              ...new Set(
                (next.collectionIds || [])
                  .map(String)
                  .map((v) => v.trim())
                  .filter(Boolean),
              ),
            ];
            await set("settings", next);
            return next;
          },
          run: () => run(true),
          async open() {
            const settings = await this.get();
            const config = await get("config", {
              token: "",
              channels: [],
            });
            const error = await get("lastError", null);
            if (abort.aborted) return;
            setRuntime((draft) => {
              draft.form = {
                ...settings,
                ...config,
              };
              draft.lastError = error?.message || "";
              draft.open = true;
            });
          },
        };
        const page = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
        page.__XRodSettingsInstagram ||= { modules: {} };
        page.__XRodSettingsInstagram.modules.saved = settingsApi;
        const menus = [];
        if (typeof GM_registerMenuCommand === "function") {
          menus.push(GM_registerMenuCommand("Instagram salvos · Configurar Relay", configure));
          menus.push(
            GM_registerMenuCommand("Instagram salvos · Configurações", () => void settingsApi.open()),
          );
          menus.push(GM_registerMenuCommand("Instagram salvos · Sincronizar agora", () => void run(true)));
          menus.push(
            GM_registerMenuCommand("Instagram salvos · Diagnóstico", async () => {
              const error = await get("lastError", null);
              setRuntime((draft) => {
                draft.lastError = error?.message || "Nenhum erro registrado";
              });
              await settingsApi.open();
            }),
          );
        }
        const timer = setInterval(() => void run(), 6e4);
        ctx.listen(document, "visibilitychange", () => void run());
        ctx.onDispose(() => {
          clearInterval(timer);
          if (page.__XRodSettingsInstagram?.modules?.saved === settingsApi)
            delete page.__XRodSettingsInstagram.modules.saved;
          if (typeof GM_unregisterMenuCommand === "function")
            menus.forEach((id) => GM_unregisterMenuCommand(id));
        });
        run();
      },
    };

    function matchURL(pattern, value) {
      const url = new URL(value);
      if (pattern === "<all_urls>") return /^(https?|file):$/.test(url.protocol);
      const parts = /^(\*|https?|file):\/\/([^/]*)(\/.*)$/.exec(pattern);
      if (!parts) throw Error(`Invalid match pattern: ${pattern}`);
      const [, scheme, host, pathname] = parts;
      if (scheme === "*" ? !/^https?:$/.test(url.protocol) : url.protocol !== `${scheme}:`) return false;
      const hostname = url.hostname.toLowerCase();
      const expected = host.toLowerCase();
      if (
        host !== "*" &&
        !(expected.startsWith("*.")
          ? hostname === expected.slice(2) || hostname.endsWith(`.${expected.slice(2)}`)
          : hostname === expected)
      )
        return false;
      const expression = pathname
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      return new RegExp(`^${expression}$`).test(url.pathname + url.search);
    }
    function matchesRoute(definition, url) {
      return (
        definition.matches.some((pattern) => matchURL(pattern, url)) &&
        !(definition.exclude || []).some((pattern) => matchURL(pattern, url))
      );
    }

    (() => {
      "use strict";
      const MULTIPLIERS = {
        ms: 1,
        s: 1e3,
        m: 6e4,
        h: 36e5,
        d: 864e5,
        w: 6048e5,
      };
      function durationToMs(value) {
        if (value === void 0) return void 0;
        if (typeof value === "number") return Math.max(0, value);
        const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/.exec(value);
        if (!match) throw new TypeError(`Invalid duration: ${value}`);
        return Number(match[1]) * MULTIPLIERS[match[2]];
      }
      class StorageError extends Error {
        constructor(message, cause) {
          super(message);
          _defineProperty(this, "cause", void 0);
          _defineProperty(this, "name", "StorageError");
          this.cause = cause;
        }
      }
      class StorageUnavailableError extends StorageError {
        constructor(..._args) {
          super(..._args);
          _defineProperty(this, "name", "StorageUnavailableError");
        }
      }
      class StorageQuotaError extends StorageError {
        constructor(..._args2) {
          super(..._args2);
          _defineProperty(this, "name", "StorageQuotaError");
        }
      }
      class StorageSerializationError extends StorageError {
        constructor(..._args3) {
          super(..._args3);
          _defineProperty(this, "name", "StorageSerializationError");
        }
      }
      class StorageMigrationError extends StorageError {
        constructor(..._args4) {
          super(..._args4);
          _defineProperty(this, "name", "StorageMigrationError");
        }
      }
      class StorageValidationError extends StorageError {
        constructor(..._args5) {
          super(..._args5);
          _defineProperty(this, "name", "StorageValidationError");
        }
      }
      class StorageTransactionError extends StorageError {
        constructor(..._args6) {
          super(..._args6);
          _defineProperty(this, "name", "StorageTransactionError");
        }
      }
      function normalizeStorageError(error) {
        if (error instanceof StorageError) return error;
        if (
          error instanceof DOMException &&
          (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
        )
          return new StorageQuotaError(error.message, error);
        if (error instanceof Error) return new StorageError(error.message, error);
        return new StorageError(String(error), error);
      }
      const TYPE = "__rodStorageType";
      async function encodeSpecial(value) {
        if (typeof value === "bigint")
          return {
            [TYPE]: "BigInt",
            value: value.toString(),
          };
        if (typeof value === "number") {
          if (Number.isNaN(value)) return { [TYPE]: "NaN" };
          if (value === Infinity) return { [TYPE]: "Infinity" };
          if (value === -Infinity) return { [TYPE]: "-Infinity" };
        }
        if (value === void 0) return { [TYPE]: "Undefined" };
        if (value instanceof Date)
          return {
            [TYPE]: "Date",
            value: value.toISOString(),
          };
        if (value instanceof RegExp)
          return {
            [TYPE]: "RegExp",
            source: value.source,
            flags: value.flags,
          };
        if (value instanceof URL)
          return {
            [TYPE]: "URL",
            value: value.href,
          };
        if (value instanceof Map)
          return {
            [TYPE]: "Map",
            value: await Promise.all(
              [...value.entries()].map(async ([k, v]) => [await encodeSpecial(k), await encodeSpecial(v)]),
            ),
          };
        if (value instanceof Set)
          return {
            [TYPE]: "Set",
            value: await Promise.all([...value].map(encodeSpecial)),
          };
        if (value instanceof Error)
          return {
            [TYPE]: "Error",
            name: value.name,
            message: value.message,
            ...(value.stack === void 0 ? {} : { stack: value.stack }),
          };
        if (typeof Blob !== "undefined" && value instanceof Blob)
          return {
            [TYPE]: "Blob",
            mime: value.type,
            value: Array.from(new Uint8Array(await value.arrayBuffer())),
          };
        if (value instanceof ArrayBuffer)
          return {
            [TYPE]: "ArrayBuffer",
            value: Array.from(new Uint8Array(value)),
          };
        if (value instanceof DataView)
          return {
            [TYPE]: "DataView",
            value: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
          };
        if (ArrayBuffer.isView(value))
          return {
            [TYPE]: value.constructor.name,
            value: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
          };
        if (Array.isArray(value)) return Promise.all(value.map(encodeSpecial));
        if (value && typeof value === "object") {
          const out = {};
          for (const [k, v] of Object.entries(value)) out[k] = await encodeSpecial(v);
          return out;
        }
        return value;
      }
      function decodeSpecial(value) {
        if (Array.isArray(value)) return value.map(decodeSpecial);
        if (!value || typeof value !== "object") return value;
        const tagged = value;
        const tag = tagged[TYPE];
        if (typeof tag === "string")
          switch (tag) {
            case "Undefined":
              return;
            case "NaN":
              return NaN;
            case "Infinity":
              return Infinity;
            case "-Infinity":
              return -Infinity;
            case "BigInt":
              return BigInt(String(tagged.value));
            case "Date":
              return new Date(String(tagged.value));
            case "URL":
              return new URL(String(tagged.value));
            case "RegExp":
              return new RegExp(String(tagged.source), String(tagged.flags ?? ""));
            case "Map":
              return new Map(tagged.value.map(([k, v]) => [decodeSpecial(k), decodeSpecial(v)]));
            case "Set":
              return new Set(tagged.value.map(decodeSpecial));
            case "Error": {
              const error = new Error(String(tagged.message ?? ""));
              error.name = String(tagged.name ?? "Error");
              if (typeof tagged.stack === "string") error.stack = tagged.stack;
              return error;
            }
            case "Blob":
              return new Blob([new Uint8Array(tagged.value)], { type: String(tagged.mime ?? "") });
            case "ArrayBuffer":
              return new Uint8Array(tagged.value).buffer;
            case "DataView":
              return new DataView(new Uint8Array(tagged.value).buffer);
            default: {
              const ctor = globalThis[tag];
              if (typeof ctor === "function" && /Array$/.test(tag)) {
                const bytes = new Uint8Array(tagged.value);
                try {
                  return new ctor(bytes.buffer);
                } catch {
                  return bytes;
                }
              }
            }
          }
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = decodeSpecial(v);
        return out;
      }
      const structuredSerializer = {
        async encode(value) {
          try {
            return await encodeSpecial(value);
          } catch (error) {
            throw new StorageSerializationError("Failed to serialize value", error);
          }
        },
        async decode(value) {
          try {
            return decodeSpecial(value);
          } catch (error) {
            throw new StorageSerializationError("Failed to deserialize value", error);
          }
        },
      };
      function bytesToBase64(bytes) {
        let binary = "";
        const step = 32768;
        for (let i = 0; i < bytes.length; i += step)
          binary += String.fromCharCode(...bytes.subarray(i, i + step));
        return btoa(binary);
      }
      function base64ToBytes(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      }
      async function streamBytes(stream) {
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }
      function compressionTransform(format = "gzip") {
        return {
          name: `compression:${format}`,
          async write(value) {
            if (!("CompressionStream" in globalThis))
              throw new StorageUnavailableError("CompressionStream is unavailable");
            const json = JSON.stringify(value);
            return {
              __rodTransform: "compression",
              format,
              data: bytesToBase64(
                await streamBytes(new Blob([json]).stream().pipeThrough(new CompressionStream(format))),
              ),
            };
          },
          async read(value) {
            const payload = value;
            if (payload?.__rodTransform !== "compression" || !payload.data) return value;
            if (!("DecompressionStream" in globalThis))
              throw new StorageUnavailableError("DecompressionStream is unavailable");
            const input = new Blob([base64ToBytes(payload.data)])
              .stream()
              .pipeThrough(new DecompressionStream(payload.format ?? format));
            return JSON.parse(new TextDecoder().decode(await streamBytes(input)));
          },
        };
      }
      async function deriveKey(input, iterations, salt) {
        if (typeof CryptoKey !== "undefined" && input instanceof CryptoKey) return input;
        if (!crypto?.subtle) throw new StorageUnavailableError("Web Crypto is unavailable");
        const material = typeof input === "string" ? new TextEncoder().encode(input) : input;
        const base = await crypto.subtle.importKey("raw", material, "PBKDF2", false, ["deriveKey"]);
        return crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: new TextEncoder().encode(salt),
            iterations,
            hash: "SHA-256",
          },
          base,
          {
            name: "AES-GCM",
            length: 256,
          },
          false,
          ["encrypt", "decrypt"],
        );
      }
      function encryptionTransform(options) {
        const iterations = options.iterations ?? 15e4;
        const salt = options.salt ?? "RodStorage:v1";
        let keyPromise;
        const key = () => (keyPromise ??= deriveKey(options.key, iterations, salt));
        return {
          name: "encryption:aes-gcm",
          async write(value) {
            try {
              const iv = crypto.getRandomValues(new Uint8Array(12));
              const plaintext = new TextEncoder().encode(JSON.stringify(value));
              const encrypted = await crypto.subtle.encrypt(
                {
                  name: "AES-GCM",
                  iv,
                },
                await key(),
                plaintext,
              );
              return {
                __rodTransform: "aes-gcm",
                iv: bytesToBase64(iv),
                data: bytesToBase64(new Uint8Array(encrypted)),
              };
            } catch (error) {
              throw new StorageSerializationError("Encryption transform failed", error);
            }
          },
          async read(value) {
            const payload = value;
            if (payload?.__rodTransform !== "aes-gcm" || !payload.iv || !payload.data) return value;
            try {
              const decrypted = await crypto.subtle.decrypt(
                {
                  name: "AES-GCM",
                  iv: base64ToBytes(payload.iv),
                },
                await key(),
                base64ToBytes(payload.data),
              );
              return JSON.parse(new TextDecoder().decode(decrypted));
            } catch (error) {
              throw new StorageSerializationError("Decryption transform failed", error);
            }
          },
        };
      }
      class IndexedDBAdapter {
        constructor(databaseName = "rod-storage") {
          _defineProperty(this, "databaseName", void 0);
          _defineProperty(this, "name", "indexeddb");
          _defineProperty(this, "db", void 0);
          this.databaseName = databaseName;
        }
        async init() {
          if (!("indexedDB" in globalThis)) throw new StorageUnavailableError("IndexedDB is unavailable");
          this.db = await new Promise((resolve, reject) => {
            const req = indexedDB.open(this.databaseName, 1);
            req.onupgradeneeded = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains("records"))
                db.createObjectStore("records", { keyPath: "id" });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
            req.onblocked = () => reject(new StorageUnavailableError("IndexedDB upgrade was blocked"));
          });
        }
        store(mode) {
          if (!this.db) throw new StorageUnavailableError("IndexedDB adapter not initialized");
          return this.db.transaction("records", mode).objectStore("records");
        }
        request(request) {
          return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
          });
        }
        async get(key) {
          return (await this.request(this.store("readonly").get(key)))?.value;
        }
        async set(key, value) {
          await this.request(
            this.store("readwrite").put({
              id: key,
              value,
            }),
          );
        }
        async delete(key) {
          await this.request(this.store("readwrite").delete(key));
        }
        async has(key) {
          return (await this.request(this.store("readonly").count(key))) > 0;
        }
        async keys(prefix = "") {
          return (await this.request(this.store("readonly").getAllKeys()))
            .map(String)
            .filter((k) => k.startsWith(prefix));
        }
        async clear(prefix = "") {
          if (!prefix) {
            await this.request(this.store("readwrite").clear());
            return;
          }
          for (const key of await this.keys(prefix)) await this.delete(key);
        }
        async entries(prefix = "") {
          return (await this.request(this.store("readonly").getAll()))
            .filter((row) => row.id.startsWith(prefix))
            .map((row) => [row.id, row.value]);
        }
        async transaction(fn) {
          try {
            return await fn();
          } catch (error) {
            throw new StorageTransactionError("IndexedDB transaction failed", error);
          }
        }
        async estimate() {
          if (!navigator.storage?.estimate) return {};
          const estimate = await navigator.storage.estimate();
          return {
            ...(estimate.usage === void 0 ? {} : { usage: estimate.usage }),
            ...(estimate.quota === void 0 ? {} : { quota: estimate.quota }),
          };
        }
        close() {
          this.db?.close();
        }
      }
      class LocalStorageAdapter {
        constructor(prefix = "__rod_storage__:") {
          _defineProperty(this, "prefix", void 0);
          _defineProperty(this, "name", "localstorage");
          this.prefix = prefix;
        }
        key(key) {
          return `${this.prefix}${key}`;
        }
        async init() {
          try {
            const probe = this.key(`probe:${Math.random()}`);
            localStorage.setItem(probe, "1");
            localStorage.removeItem(probe);
          } catch (error) {
            throw new StorageUnavailableError("localStorage is unavailable", error);
          }
        }
        async get(key) {
          try {
            const raw = localStorage.getItem(this.key(key));
            return raw === null ? void 0 : JSON.parse(raw);
          } catch (error) {
            throw normalizeStorageError(error);
          }
        }
        async set(key, value) {
          try {
            localStorage.setItem(this.key(key), JSON.stringify(value));
          } catch (error) {
            throw normalizeStorageError(error);
          }
        }
        async delete(key) {
          localStorage.removeItem(this.key(key));
        }
        async has(key) {
          return localStorage.getItem(this.key(key)) !== null;
        }
        async keys(prefix = "") {
          const match = this.key(prefix);
          const out = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith(match)) out.push(k.slice(this.prefix.length));
          }
          return out;
        }
        async clear(prefix = "") {
          for (const key of await this.keys(prefix)) localStorage.removeItem(this.key(key));
        }
        async entries(prefix = "") {
          const out = [];
          for (const key of await this.keys(prefix)) out.push([key, await this.get(key)]);
          return out;
        }
      }
      class GMAdapter {
        constructor(api) {
          _defineProperty(this, "api", void 0);
          _defineProperty(this, "name", "gm");
          this.api = api;
        }
        async init() {
          if (!this.api.getValue || !this.api.setValue || !this.api.deleteValue || !this.api.listValues)
            throw new StorageUnavailableError("GM storage API is incomplete");
        }
        async get(key) {
          return this.api.getValue(key);
        }
        async set(key, value) {
          await this.api.setValue(key, value);
        }
        async delete(key) {
          await this.api.deleteValue(key);
        }
        async has(key) {
          return (await this.api.listValues()).includes(key);
        }
        async keys(prefix = "") {
          return (await this.api.listValues()).filter((k) => k.startsWith(prefix));
        }
        async clear(prefix = "") {
          for (const key of await this.keys(prefix)) await this.delete(key);
        }
        async entries(prefix = "") {
          const out = [];
          for (const key of await this.keys(prefix)) out.push([key, await this.get(key)]);
          return out;
        }
      }
      class MemoryAdapter {
        constructor() {
          _defineProperty(this, "name", "memory");
          _defineProperty(this, "map", new Map());
        }
        async init() {}
        async get(key) {
          return this.map.get(key);
        }
        async set(key, value) {
          this.map.set(key, value);
        }
        async delete(key) {
          this.map.delete(key);
        }
        async has(key) {
          return this.map.has(key);
        }
        async keys(prefix = "") {
          return [...this.map.keys()].filter((k) => k.startsWith(prefix));
        }
        async clear(prefix = "") {
          for (const key of await this.keys(prefix)) this.map.delete(key);
        }
        async entries(prefix = "") {
          return [...this.map.entries()].filter(([k]) => k.startsWith(prefix));
        }
        async transaction(fn) {
          return fn();
        }
      }
      class StorageSyncChannel {
        constructor(name, enabled) {
          _defineProperty(this, "name", void 0);
          _defineProperty(this, "channel", void 0);
          _defineProperty(this, "listeners", new Set());
          this.name = name;
          if (enabled && "BroadcastChannel" in globalThis) {
            this.channel = new BroadcastChannel(name);
            this.channel.onmessage = (event) => this.emitLocal(event.data);
          }
        }
        publish(event) {
          this.channel?.postMessage(event);
        }
        subscribe(listener) {
          this.listeners.add(listener);
          return () => this.listeners.delete(listener);
        }
        emitLocal(event) {
          for (const listener of this.listeners)
            listener({
              ...event,
              source: "external",
            });
        }
        close() {
          this.channel?.close();
          this.listeners.clear();
        }
      }
      const localLocks = new Map();
      async function withLock(name, fn) {
        const locks = typeof navigator !== "undefined" ? navigator.locks : void 0;
        if (locks?.request) return locks.request(name, { mode: "exclusive" }, fn);
        const previous = localLocks.get(name) ?? Promise.resolve();
        let release;
        const current = new Promise((resolve) => {
          release = resolve;
        });
        const chained = previous.then(() => current);
        localLocks.set(name, chained);
        await previous;
        try {
          return await fn();
        } finally {
          release();
          if (localLocks.get(name) === chained) localLocks.delete(name);
        }
      }
      class RodStore {
        constructor(storage, key, options = {}) {
          _defineProperty(this, "storage", void 0);
          _defineProperty(this, "key", void 0);
          _defineProperty(this, "options", void 0);
          this.storage = storage;
          this.key = key;
          this.options = options;
        }
        async get() {
          const value = await this.storage.get(this.key, this.options.transforms);
          if (value !== void 0) return this.validate(value);
          if (this.options.default !== void 0) {
            const resolved =
              typeof this.options.default === "function"
                ? await this.options.default()
                : this.options.default;
            await this.set(resolved);
            return resolved;
          }
          return value;
        }
        async set(value, options = {}) {
          this.validate(value);
          const ttl = options.ttl ?? this.options.ttl;
          return this.storage.set(this.key, value, ttl === void 0 ? {} : { ttl }, this.options.transforms);
        }
        async update(updater) {
          return this.storage.atomic(
            this.key,
            async (current) => {
              let base = current;
              if (base === void 0 && this.options.default !== void 0)
                base =
                  typeof this.options.default === "function"
                    ? await this.options.default()
                    : this.options.default;
              return updater(base);
            },
            {},
            this.options.transforms,
          );
        }
        async patch(patch) {
          return this.update((value) => ({
            ...value,
            ...patch,
          }));
        }
        async delete() {
          return this.storage.delete(this.key);
        }
        async reset() {
          if (this.options.default === void 0) return this.delete();
          const value =
            typeof this.options.default === "function" ? await this.options.default() : this.options.default;
          await this.storage.set(
            this.key,
            value,
            this.options.ttl === void 0 ? {} : { ttl: this.options.ttl },
            this.options.transforms,
            "reset",
          );
          return value;
        }
        subscribe(listener, immediate = false) {
          const unsubscribe = this.storage.subscribe(this.key, async (event) => {
            if (event.value !== void 0) listener(this.validate(event.value), event);
          });
          if (immediate)
            this.get().then((value) =>
              listener(value, {
                namespace: this.storage.namespaceName,
                key: this.key,
                operation: "set",
                value,
                source: "local",
                timestamp: Date.now(),
              }),
            );
          return unsubscribe;
        }
        select(selector, listener, options = {}) {
          const equals = options.equals ?? Object.is;
          let initialized = false;
          let previous;
          return this.subscribe((value) => {
            const next = selector(value);
            if (!initialized || !equals(previous, next)) {
              initialized = true;
              previous = next;
              listener(next, value);
            }
          }, options.immediate ?? false);
        }
        validate(value) {
          if (this.options.validate && !this.options.validate(value))
            throw new StorageValidationError(`Validation failed for store ${this.key}`);
          return value;
        }
      }
      const META_KEY = "__meta__";
      const INTERNAL_PREFIX = "__rod_internal__/";
      function estimateBytes(value) {
        try {
          return new Blob([JSON.stringify(value)]).size;
        } catch {
          return 0;
        }
      }
      class RodStorageInstance {
        constructor(options) {
          _defineProperty(this, "options", void 0);
          _defineProperty(this, "namespaceName", void 0);
          _defineProperty(this, "adapter", void 0);
          _defineProperty(this, "serializer", void 0);
          _defineProperty(this, "transforms", void 0);
          _defineProperty(this, "cache", new Map());
          _defineProperty(this, "cacheHits", 0);
          _defineProperty(this, "cacheMisses", 0);
          _defineProperty(this, "cacheEnabled", void 0);
          _defineProperty(this, "cacheMaxEntries", void 0);
          _defineProperty(this, "metadata", void 0);
          _defineProperty(this, "channel", void 0);
          _defineProperty(this, "listeners", new Map());
          _defineProperty(this, "cleanupTimer", void 0);
          _defineProperty(this, "readyPromise", void 0);
          this.options = options;
          if (!options.namespace?.trim()) throw new TypeError("RodStorage requires a non-empty namespace");
          this.namespaceName = options.namespace.trim();
          this.serializer = options.serializer ?? structuredSerializer;
          this.transforms = options.transforms ?? [];
          const cache =
            typeof options.cache === "object" ? options.cache : { enabled: options.cache ?? true };
          this.cacheEnabled = cache.enabled ?? true;
          this.cacheMaxEntries = cache.maxEntries ?? 500;
          this.channel = new StorageSyncChannel(`rod-storage:${this.namespaceName}`, options.sync ?? true);
          this.channel.subscribe((event) => {
            this.cache.delete(event.key);
            this.dispatch(event);
          });
          this.readyPromise = this.initialize();
        }
        ready() {
          return this.readyPromise;
        }
        get backend() {
          return { name: this.adapter?.name };
        }
        async initialize() {
          this.adapter = await this.selectAdapter();
          await this.initializeMetadataAndMigrate();
          await this.applyDefaults();
          if (this.options.cleanupIntervalMs && this.options.cleanupIntervalMs > 0)
            this.cleanupTimer = setInterval(() => void this.cleanup(), this.options.cleanupIntervalMs);
          return this;
        }
        candidateNames() {
          const backend = this.options.backend ?? "auto";
          const defaults = ["indexeddb", "gm", "localstorage", "memory"];
          if (backend === "auto") return defaults;
          if (typeof backend === "string") return [backend, ...defaults.filter((x) => x !== backend)];
          const preferred = backend.preferred ?? "indexeddb";
          return [preferred, ...(backend.fallbacks ?? defaults).filter((x) => x !== preferred)];
        }
        makeAdapter(name) {
          switch (name) {
            case "indexeddb":
              return new IndexedDBAdapter(this.options.databaseName ?? "rod-storage");
            case "localstorage":
              return new LocalStorageAdapter(this.options.localStoragePrefix ?? "__rod_storage__:");
            case "gm": {
              const globalGM = globalThis.GM;
              const legacy = globalThis;
              const api = this.options.gm ?? {
                getValue: globalGM?.getValue?.bind(globalGM) ?? legacy.GM_getValue,
                setValue: globalGM?.setValue?.bind(globalGM) ?? legacy.GM_setValue,
                deleteValue: globalGM?.deleteValue?.bind(globalGM) ?? legacy.GM_deleteValue,
                listValues: globalGM?.listValues?.bind(globalGM) ?? legacy.GM_listValues,
              };
              return new GMAdapter(api);
            }
            case "memory":
              return new MemoryAdapter();
          }
        }
        async selectAdapter() {
          const errors = [];
          for (const name of [...new Set(this.candidateNames())]) {
            const adapter = this.makeAdapter(name);
            try {
              await adapter.init();
              return adapter;
            } catch (error) {
              errors.push(error);
              this.options.onError?.(error);
            }
          }
          throw new StorageUnavailableError(
            `No storage backend available: ${errors.map(String).join(" | ")}`,
          );
        }
        physicalKey(key) {
          return `${this.namespaceName}/${key}`;
        }
        async readRaw(key) {
          return this.adapter.get(this.physicalKey(key));
        }
        async writeRaw(key, value) {
          await this.adapter.set(this.physicalKey(key), value);
        }
        async deleteRaw(key) {
          await this.adapter.delete(this.physicalKey(key));
        }
        async initializeMetadataAndMigrate() {
          const now = Date.now();
          const raw = await this.readRaw(META_KEY);
          this.metadata = raw ?? {
            format: "RodStorage",
            formatVersion: 1,
            schemaVersion: 0,
            createdAt: now,
            updatedAt: now,
            migrationHistory: [],
          };
          const target = Math.max(0, this.options.version ?? 1);
          if (this.metadata.schemaVersion > target)
            throw new StorageMigrationError(
              `Stored schema v${this.metadata.schemaVersion} is newer than requested v${target}`,
            );
          for (let version = this.metadata.schemaVersion + 1; version <= target; version++) {
            const migration = this.options.migrations?.[version];
            if (migration)
              try {
                await this.transaction(async () => migration(this.migrationContext(version - 1, version)));
              } catch (error) {
                this.metadata.lastMigrationError = error instanceof Error ? error.message : String(error);
                await this.writeRaw(META_KEY, this.metadata);
                throw new StorageMigrationError(`Migration to v${version} failed`, error);
              }
            this.metadata.schemaVersion = version;
            this.metadata.updatedAt = Date.now();
            if (!this.metadata.migrationHistory.includes(version))
              this.metadata.migrationHistory.push(version);
            delete this.metadata.lastMigrationError;
            await this.writeRaw(META_KEY, this.metadata);
          }
        }
        migrationContext(fromVersion, toVersion) {
          const rawGet = async (key) => {
            const raw = await this.readRaw(key);
            if (!raw) return void 0;
            if (raw.expiresAt !== void 0 && raw.expiresAt <= Date.now()) {
              await this.deleteRaw(key);
              return;
            }
            return this.decodeValue(key, raw.value);
          };
          const rawSet = async (key, value) => {
            const now = Date.now();
            const existing = await this.readRaw(key);
            await this.writeRaw(key, {
              value: await this.encodeValue(key, value),
              createdAt: existing?.createdAt ?? now,
              updatedAt: now,
            });
          };
          return {
            fromVersion,
            toVersion,
            get: rawGet,
            set: rawSet,
            delete: (key) => this.deleteRaw(key),
            has: async (key) => (await rawGet(key)) !== void 0,
            keys: async () => {
              const prefix = this.physicalKey("");
              return (await this.adapter.keys(prefix))
                .map((k) => k.slice(prefix.length))
                .filter((k) => k !== META_KEY && !k.startsWith(INTERNAL_PREFIX));
            },
          };
        }
        async applyDefaults() {
          const configured = this.options.defaults;
          if (!configured) return;
          const defaults = typeof configured === "function" ? await configured() : configured;
          const ctx = this.migrationContext(this.metadata.schemaVersion, this.metadata.schemaVersion);
          for (const [key, value] of Object.entries(defaults)) {
            const typedKey = key;
            if (!(await ctx.has(typedKey))) await ctx.set(typedKey, value);
          }
        }
        touchCache(key, value, expiresAt) {
          if (!this.cacheEnabled) return;
          this.cache.delete(key);
          this.cache.set(key, {
            value,
            ...(expiresAt === void 0 ? {} : { expiresAt }),
          });
          while (this.cache.size > this.cacheMaxEntries) this.cache.delete(this.cache.keys().next().value);
        }
        async encodeValue(key, value, transforms = []) {
          let current = await this.serializer.encode(value);
          for (const transform of [...this.transforms, ...transforms])
            current = await transform.write(current, {
              namespace: this.namespaceName,
              key,
            });
          return current;
        }
        async decodeValue(key, value, transforms = []) {
          let current = value;
          for (const transform of [...this.transforms, ...transforms].reverse())
            current = await transform.read(current, {
              namespace: this.namespaceName,
              key,
            });
          return this.serializer.decode(current);
        }
        async get(key, transforms = []) {
          await this.readyPromise;
          if (this.cacheEnabled && this.cache.has(key)) {
            const cached = this.cache.get(key);
            if (cached.expiresAt === void 0 || cached.expiresAt > Date.now()) {
              this.cacheHits++;
              return cached.value;
            }
            this.cache.delete(key);
          }
          this.cacheMisses++;
          const raw = await this.readRaw(key);
          if (!raw) return void 0;
          if (raw.expiresAt !== void 0 && raw.expiresAt <= Date.now()) {
            let previousValue;
            try {
              previousValue = await this.decodeValue(key, raw.value, transforms);
            } catch {}
            await this.deleteRaw(key);
            this.cache.delete(key);
            this.emit({
              namespace: this.namespaceName,
              key,
              operation: "expire",
              ...(previousValue === void 0 ? {} : { previousValue }),
              source: "local",
              timestamp: Date.now(),
            });
            return;
          }
          const value = await this.decodeValue(key, raw.value, transforms);
          this.touchCache(key, value, raw.expiresAt);
          return value;
        }
        async setUnlocked(key, value, options = {}, transforms = [], operation = "set", previousValue) {
          const now = Date.now();
          const existing = await this.readRaw(key);
          const ttlMs = durationToMs(options.ttl);
          const envelope = {
            value: await this.encodeValue(key, value, transforms),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            ...(ttlMs === void 0 ? {} : { expiresAt: now + ttlMs }),
          };
          try {
            await this.writeRaw(key, envelope);
          } catch (error) {
            throw normalizeStorageError(error);
          }
          this.metadata.updatedAt = now;
          await this.writeRaw(META_KEY, this.metadata);
          this.touchCache(key, value, envelope.expiresAt);
          this.emit({
            namespace: this.namespaceName,
            key,
            operation,
            ...(previousValue === void 0 ? {} : { previousValue }),
            value,
            source: "local",
            timestamp: now,
          });
          return value;
        }
        async set(key, value, options = {}, transforms = [], operation = "set") {
          await this.readyPromise;
          return withLock(`rod-storage:${this.namespaceName}:${key}`, async () => {
            const previousValue = await this.get(key, transforms);
            return this.setUnlocked(key, value, options, transforms, operation, previousValue);
          });
        }
        async update(key, updater, options = {}, transforms = []) {
          return this.atomic(key, updater, options, transforms);
        }
        async atomic(key, updater, options = {}, transforms = []) {
          await this.readyPromise;
          return withLock(`rod-storage:${this.namespaceName}:${key}`, async () => {
            const current = await this.get(key, transforms);
            const next = await updater(current);
            return this.setUnlocked(key, next, options, transforms, "update", current);
          });
        }
        async delete(key, operation = "delete") {
          await this.readyPromise;
          const previousValue = await this.get(key);
          await this.deleteRaw(key);
          this.cache.delete(key);
          this.emit({
            namespace: this.namespaceName,
            key,
            operation,
            previousValue,
            source: "local",
            timestamp: Date.now(),
          });
        }
        async has(key) {
          await this.readyPromise;
          const raw = await this.readRaw(key);
          if (!raw) return false;
          if (raw.expiresAt !== void 0 && raw.expiresAt <= Date.now()) {
            await this.deleteRaw(key);
            this.cache.delete(key);
            return false;
          }
          return true;
        }
        async keys() {
          await this.readyPromise;
          const prefix = this.physicalKey("");
          return (await this.adapter.keys(prefix))
            .map((k) => k.slice(prefix.length))
            .filter((k) => k !== META_KEY && !k.startsWith(INTERNAL_PREFIX));
        }
        async clear() {
          await this.readyPromise;
          const keys = await this.keys();
          for (const key of keys) await this.delete(key);
          this.emit({
            namespace: this.namespaceName,
            key: "*",
            operation: "clear",
            source: "local",
            timestamp: Date.now(),
          });
        }
        async cleanup() {
          await this.readyPromise;
          let removed = 0;
          for (const key of await this.keys()) {
            const raw = await this.readRaw(key);
            if (raw?.expiresAt !== void 0 && raw.expiresAt <= Date.now()) {
              await this.delete(key, "expire");
              removed++;
            }
          }
          return removed;
        }
        subscribe(key, listener) {
          const bucket = this.listeners.get(key) ?? new Set();
          bucket.add(listener);
          this.listeners.set(key, bucket);
          return () => bucket.delete(listener);
        }
        dispatch(event) {
          for (const listener of this.listeners.get(event.key) ?? []) listener(event);
          for (const listener of this.listeners.get("*") ?? []) listener(event);
        }
        emit(event) {
          this.dispatch(event);
          this.channel.publish(event);
        }
        async transaction(fn) {
          const prefix = this.physicalKey("");
          return withLock(`rod-storage:${this.namespaceName}:transaction`, async () => {
            const snapshot = await this.adapter.entries(prefix);
            try {
              return await fn();
            } catch (error) {
              try {
                await this.adapter.clear(prefix);
                for (const [key, value] of snapshot) await this.adapter.set(key, value);
                this.cache.clear();
              } catch (rollbackError) {
                this.options.onError?.(rollbackError);
              }
              throw error;
            }
          });
        }
        async lock(name, fn) {
          return withLock(`rod-storage:${this.namespaceName}:${name}`, fn);
        }
        store(key, options = {}) {
          return new RodStore(this, key, options);
        }
        namespace(child, options = {}) {
          return new RodStorageInstance({
            ...this.options,
            ...options,
            namespace: `${this.namespaceName}/${child}`,
          });
        }
        async export() {
          await this.readyPromise;
          const records = {};
          for (const key of await this.keys()) records[key] = await this.get(key);
          return {
            format: "RodStorage",
            formatVersion: 1,
            namespace: this.namespaceName,
            schemaVersion: this.metadata.schemaVersion,
            exportedAt: Date.now(),
            records,
          };
        }
        async import(payload, options = {}) {
          await this.readyPromise;
          if (payload.format !== "RodStorage" || payload.formatVersion !== 1)
            throw new TypeError("Invalid RodStorage export");
          const strategy = options.strategy ?? "merge";
          if (strategy === "overwrite") await this.clear();
          for (const [key, value] of Object.entries(payload.records)) {
            if (strategy === "skip-existing" && (await this.has(key))) continue;
            await this.set(key, value, {}, [], "import");
          }
        }
        async diagnostics() {
          await this.readyPromise;
          const exported = await this.export();
          const quota = await this.adapter.estimate?.();
          return {
            backend: this.adapter.name,
            namespace: this.namespaceName,
            schemaVersion: this.metadata.schemaVersion,
            entries: Object.keys(exported.records).length,
            estimatedBytes: estimateBytes(exported.records),
            cache: {
              enabled: this.cacheEnabled,
              size: this.cache.size,
              hits: this.cacheHits,
              misses: this.cacheMisses,
            },
            migrations: {
              applied: [...this.metadata.migrationHistory],
              ...(this.metadata.lastMigrationError ? { lastError: this.metadata.lastMigrationError } : {}),
            },
            ...(quota ? { quota } : {}),
          };
        }
        async healthcheck() {
          await this.readyPromise;
          const started = performance.now();
          const key = `${INTERNAL_PREFIX}health:${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
          try {
            const value = {
              ok: true,
              at: Date.now(),
            };
            await this.writeRaw(key, value);
            const read = await this.readRaw(key);
            await this.deleteRaw(key);
            if (JSON.stringify(read) !== JSON.stringify(value)) throw new Error("Healthcheck read mismatch");
            return {
              ok: true,
              backend: this.adapter.name,
              durationMs: performance.now() - started,
            };
          } catch (error) {
            return {
              ok: false,
              backend: this.adapter.name,
              durationMs: performance.now() - started,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }
        close() {
          if (this.cleanupTimer) clearInterval(this.cleanupTimer);
          this.channel.close();
          this.adapter?.close?.();
          this.cache.clear();
        }
      }
      const VERSION = "1.0.0";
      const Errors = Object.freeze({
        StorageError,
        StorageUnavailableError,
        StorageQuotaError,
        StorageSerializationError,
        StorageMigrationError,
        StorageValidationError,
        StorageTransactionError,
        normalizeStorageError,
      });
      const RodStorage = Object.freeze({
        version: VERSION,
        create(options) {
          return new RodStorageInstance(options);
        },
        serializer: structuredSerializer,
        errors: Errors,
        transforms: Object.freeze({
          compression: compressionTransform,
          encryption: encryptionTransform,
        }),
        noConflict: (() => {
          const previous = globalThis.RodStorage;
          return () => {
            if (globalThis.RodStorage === RodStorage) globalThis.RodStorage = previous;
            return RodStorage;
          };
        })(),
      });
      globalThis.RodStorage = RodStorage;
    })();

    (function Toaster(globalWindow) {
      "use strict";
      const VERSION = "4.0.0";
      const TOAST_GLOBAL = "RodToaster";
      const INSPECTOR_GLOBAL = "RodObjectInspector";
      const TOAST_HOST_ID = "__rod-super-toaster-host__";
      const STATE_SYMBOL = Symbol.for("rod.super-toaster.state");
      const OPTIONS_SYMBOL = Symbol("rod.super-toaster.options");
      const MAX_Z_INDEX = 2147483647;
      const TOAST_COLORS = {
        default: {
          bg: "rgba(9, 9, 11, 0.975)",
          border: "rgba(255, 255, 255, 0.12)",
          text: "rgba(244, 244, 245, 0.88)",
          accent: "rgba(244, 244, 245, 0.76)",
          icon: "circle",
        },
        error: {
          bg: "rgba(9, 9, 11, 0.975)",
          border: "rgba(255, 255, 255, 0.12)",
          text: "rgba(244, 244, 245, 0.88)",
          accent: "rgba(248, 113, 113, 0.96)",
          icon: "circle-x",
        },
        info: {
          bg: "rgba(9, 9, 11, 0.975)",
          border: "rgba(255, 255, 255, 0.12)",
          text: "rgba(244, 244, 245, 0.88)",
          accent: "rgba(147, 197, 253, 0.96)",
          icon: "info",
        },
        success: {
          bg: "rgba(9, 9, 11, 0.975)",
          border: "rgba(255, 255, 255, 0.12)",
          text: "rgba(244, 244, 245, 0.88)",
          accent: "rgba(74, 222, 128, 0.98)",
          icon: "check",
        },
        warning: {
          bg: "rgba(9, 9, 11, 0.975)",
          border: "rgba(255, 255, 255, 0.12)",
          text: "rgba(244, 244, 245, 0.88)",
          accent: "rgba(250, 204, 21, 0.96)",
          icon: "triangle-alert",
        },
        debug: {
          bg: "rgba(9, 9, 11, 0.975)",
          border: "rgba(255, 255, 255, 0.12)",
          text: "rgba(244, 244, 245, 0.88)",
          accent: "rgba(228, 228, 231, 0.76)",
          icon: "terminal",
        },
      };
      const SVG_ICONS = {
        circle: `
      <circle cx="12" cy="12" r="7.5"></circle>
    `,
        "circle-x": `
      <circle cx="12" cy="12" r="9"></circle>
      <path d="m9 9 6 6"></path>
      <path d="m15 9-6 6"></path>
    `,
        info: `
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M12 11v5"></path>
      <path d="M12 8h.01"></path>
    `,
        check: `
      <path
        class="rod-icon-check-path"
        d="m6.5 12.5 3.25 3.25L17.5 8"
      ></path>
    `,
        "triangle-alert": `
      <path d="M10.3 3.8 2.4 18a2 2 0 0 0 1.75 3h15.7a2 2 0 0 0 1.75-3L13.7 3.8a2 2 0 0 0-3.4 0Z"></path>
      <path d="M12 9v4"></path>
      <path d="M12 17h.01"></path>
    `,
        terminal: `
      <path d="m7 8 4 4-4 4"></path>
      <path d="M13 16h4"></path>
    `,
        x: `
      <path d="M6 6l12 12"></path>
      <path d="M18 6 6 18"></path>
    `,
        "chevron-down": `
      <path d="m6 9 6 6 6-6"></path>
    `,
        "chevrons-up": `
      <path d="m17 11-5-5-5 5"></path>
      <path d="m17 18-5-5-5 5"></path>
    `,
        "x-circle": `
      <circle cx="12" cy="12" r="9"></circle>
      <path d="m9 9 6 6"></path>
      <path d="m15 9-6 6"></path>
    `,
        "loader-circle": `
      <path d="M21 12a9 9 0 1 1-6.22-8.56"></path>
    `,
        download: `
      <path d="M12 3v12"></path>
      <path d="m7 10 5 5 5-5"></path>
      <path d="M5 21h14"></path>
    `,
        upload: `
      <path d="M12 21V9"></path>
      <path d="m7 14 5-5 5 5"></path>
      <path d="M5 3h14"></path>
    `,
        refresh: `
      <path d="M20 11a8 8 0 1 0 2 5"></path>
      <path d="M20 4v7h-7"></path>
    `,
        clock: `
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M12 7v5l3 2"></path>
    `,
        sparkles: `
      <path d="m12 3-1.1 2.9L8 7l2.9 1.1L12 11l1.1-2.9L16 7l-2.9-1.1Z"></path>
      <path d="m19 13-.7 1.8-1.8.7 1.8.7L19 18l.7-1.8 1.8-.7-1.8-.7Z"></path>
      <path d="m5 14-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8Z"></path>
    `,
        history: `
      <path d="M3 12a9 9 0 1 0 3-6.7"></path>
      <path d="M3 4v5h5"></path>
      <path d="M12 7v5l3 2"></path>
    `,
        send: `
      <path d="m22 2-7 20-4-9-9-4Z"></path>
      <path d="M22 2 11 13"></path>
    `,
        copy: `
      <rect x="9" y="9" width="11" height="11" rx="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    `,
        pause: `
      <path d="M9 5v14"></path>
      <path d="M15 5v14"></path>
    `,
        play: `
      <path d="m8 5 11 7-11 7Z"></path>
    `,
        square: `
      <rect x="5" y="5" width="14" height="14" rx="2"></rect>
    `,
        list: `
      <path d="M8 6h13"></path>
      <path d="M8 12h13"></path>
      <path d="M8 18h13"></path>
      <path d="M3 6h.01"></path>
      <path d="M3 12h.01"></path>
      <path d="M3 18h.01"></path>
    `,
        folder: `
      <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z"></path>
    `,
        eye: `
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    `,
        trash: `
      <path d="M3 6h18"></path>
      <path d="M8 6V4h8v2"></path>
      <path d="m19 6-1 15H6L5 6"></path>
      <path d="M10 11v5"></path>
      <path d="M14 11v5"></path>
    `,
        undo: `
      <path d="M9 7 4 12l5 5"></path>
      <path d="M20 17a7 7 0 0 0-7-7H4"></path>
    `,
        settings: `
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21H9.6v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H3V9.6h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V3h4v.09a1.7 1.7 0 0 0 1.1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.36.36.7.6 1 .27.3.63.5 1 .6h.09v4H21a1.7 1.7 0 0 0-1.6.4Z"></path>
    `,
      };
      function createSvgIcon(documentRef, name, size = 18) {
        const svg = documentRef.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", String(size));
        svg.setAttribute("height", String(size));
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        svg.innerHTML = SVG_ICONS[name] || SVG_ICONS.circle;
        return svg;
      }
      const DEFAULT_CONFIG = {
        duration: 15e3,
        debugDuration: 0,
        shouldDebug: true,
        downloadFallback: globalWindow.console?.debug || globalWindow.console?.log || null,
        maxToasts: 20,
        dedupe: true,
        dedupeWindow: 1e3,
        pauseOnInteraction: true,
        closeButton: true,
        position: "top-center",
        stacked: true,
        stackVisible: 3,
        stackMaxHeight: 560,
        stackViewportRatio: 0.62,
        stackToolbar: true,
        persistAcrossSpaNavigation: true,
        minimizeOnSpaNavigation: true,
        persistTasks: false,
        restoreTasksOnLoad: true,
        taskStorage: "sessionStorage",
        taskStorageKey: "__rod_super_toaster_tasks_v1__",
        maxPersistedTasks: 50,
        taskTerminalRetention: 864e5,
        successExitAnimation: true,
        successCollapseDuration: 360,
        successExitDuration: 220,
        loadingDuration: 0,
        loadingAnimation: "spinner",
        loadingIcon: "loader-circle",
        loadingSuccessDuration: 1400,
        loadingErrorDuration: 7e3,
        loadingInfoDuration: 4e3,
        loadingWarningDuration: 6e3,
        coalescePersistent: true,
        swipeToDismiss: true,
        swipeThreshold: 72,
        swipeVelocity: 0.45,
        objectInspectorSrc: null,
        objectInspectorLoadTimeout: 15e3,
        inspectDepth: 80,
        inspectItems: 1e3,
        previewItems: 30,
        showPrototype: false,
        showNonEnumerable: false,
        showObjectLength: false,
        virtualizeInspector: true,
        virtualizeAfter: 60,
        virtualRowHeight: 24,
        virtualOverscan: 8,
        virtualMaxHeight: 360,
        unmountInspectorOnCollapse: true,
        useShadowRoot: true,
        shadowRootMode: "closed",
        fallbackToLightDom: true,
      };
      const OPTION_KEYS = new Set([
        "duration",
        "type",
        "id",
        "dedupe",
        "dedupeWindow",
        "pauseOnInteraction",
        "closeButton",
        "role",
        "swipeToDismiss",
        "swipeThreshold",
        "swipeVelocity",
        "inspectDepth",
        "inspectItems",
        "previewItems",
        "showPrototype",
        "showNonEnumerable",
        "showObjectLength",
        "virtualizeInspector",
        "virtualizeAfter",
        "virtualRowHeight",
        "virtualOverscan",
        "virtualMaxHeight",
        "unmountInspectorOnCollapse",
        "loading",
        "loadingState",
        "title",
        "description",
        "icon",
        "animation",
        "progress",
        "progressLabel",
        "dismissible",
        "actions",
        "scope",
        "metadata",
        "details",
        "onDismiss",
      ]);
      function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
      }
      function safeCall(callback, fallback) {
        try {
          return callback();
        } catch {
          return fallback;
        }
      }
      function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
      }
      function safePrimitiveText(value, quoteStrings) {
        if (value === null) return "null";
        if (value === void 0) return "undefined";
        if (typeof value === "string") return quoteStrings ? JSON.stringify(value) : value;
        if (typeof value === "bigint") return `${value}n`;
        if (typeof value === "symbol") return safeCall(() => value.toString(), "Symbol(?)");
        if (typeof value === "function")
          return `ƒ ${safeCall(() => value.name || "anonymous", "anonymous")}()`;
        return String(value);
      }
      const LOADING_DESCRIPTOR_KEYS = new Set([
        "title",
        "description",
        "icon",
        "animation",
        "progress",
        "progressLabel",
        "duration",
        "id",
        "dedupe",
        "dedupeWindow",
        "pauseOnInteraction",
        "closeButton",
        "role",
        "swipeToDismiss",
        "swipeThreshold",
        "swipeVelocity",
        "scope",
        "metadata",
        "onDismiss",
      ]);
      function isPlainObject(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return false;
        const prototype = safeCall(() => Object.getPrototypeOf(value), null);
        return prototype === Object.prototype || prototype === null;
      }
      function isLoadingDescriptor(value) {
        if (!isPlainObject(value)) return false;
        return Reflect.ownKeys(value).some((key) => {
          return typeof key === "string" && LOADING_DESCRIPTOR_KEYS.has(key);
        });
      }
      function normalizeProgress(value) {
        if (value === null || value === void 0 || value === "") return null;
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return null;
        return clamp(numeric > 1 ? numeric / 100 : numeric, 0, 1);
      }
      function normalizeLoadingAnimation(value) {
        return new Set(["spinner", "pulse", "progress", "none"]).has(value) ? value : "spinner";
      }
      function parseLoadingInput(inputArgs, base = {}) {
        const args = [...inputArgs];
        const next = { ...base };
        if (!args.length) return next;
        const first = args.shift();
        if (isLoadingDescriptor(first)) Object.assign(next, first);
        else if (first !== void 0 && first !== null) next.title = String(first);
        if (args.length) {
          const second = args.shift();
          if (isLoadingDescriptor(second)) Object.assign(next, second);
          else if (second !== void 0 && second !== null) next.description = String(second);
        }
        if (args.length && isLoadingDescriptor(args[0])) Object.assign(next, args[0]);
        return next;
      }
      function getHighestAccessibleWindow(startWindow) {
        let currentWindow = startWindow;
        while (currentWindow.parent && currentWindow.parent !== currentWindow)
          try {
            const parentWindow = currentWindow.parent;
            parentWindow.document.documentElement;
            currentWindow = parentWindow;
          } catch {
            break;
          }
        return currentWindow;
      }
      function getExistingToaster(hostWindow) {
        return (
          safeCall(() => hostWindow[TOAST_GLOBAL], null) || safeCall(() => globalWindow[TOAST_GLOBAL], null)
        );
      }
      const initialHostWindow = getHighestAccessibleWindow(globalWindow);
      const existingToaster = getExistingToaster(initialHostWindow);
      if (existingToaster) {
        globalWindow[TOAST_GLOBAL] = existingToaster;
        globalWindow.toast = existingToaster;
        return;
      }
      const existingState = safeCall(() => initialHostWindow[STATE_SYMBOL], null);
      if (existingState?.api) {
        globalWindow[TOAST_GLOBAL] = existingState.api;
        globalWindow.toast = existingState.api;
        return;
      }
      const state = {
        version: VERSION,
        api: null,
        config: { ...DEFAULT_CONFIG },
        hostWindow: null,
        hostDocument: null,
        hostElement: null,
        shadowRoot: null,
        renderRoot: null,
        hostMode: null,
        container: null,
        toasts: [],
        recordsById: new Map(),
        dedupeRecords: new Map(),
        objectIds: new WeakMap(),
        nextObjectId: 1,
        stackExpanded: false,
        managerMinimized: false,
        managerNode: null,
        list: null,
        toolbar: null,
        stackCountNode: null,
        managerCountNode: null,
        listeners: new Map(),
        tasks: new Map(),
        groups: new Map(),
        restoredTasks: false,
        outsidePointerDownHandler: null,
        inspectorPromise: null,
        inspectorApi: null,
        inspectorRuntime: null,
        inspectorStyle: null,
        spaObserver: null,
        spaCleanup: null,
        hostRepairFrame: null,
      };
      try {
        Object.defineProperty(initialHostWindow, STATE_SYMBOL, {
          value: state,
          configurable: true,
        });
      } catch {}
      function getObjectId(value) {
        if (value === null || (typeof value !== "object" && typeof value !== "function")) return null;
        const knownId = state.objectIds.get(value);
        if (knownId) return knownId;
        const id = state.nextObjectId;
        state.nextObjectId += 1;
        state.objectIds.set(value, id);
        return id;
      }
      function getFallbackObjectPreview(value) {
        if (Array.isArray(value)) return `Array(${value.length})`;
        const tag = safeCall(() => Object.prototype.toString.call(value), "[object Object]");
        if (tag === "[object Map]") return `Map(${safeCall(() => value.size, "?")})`;
        if (tag === "[object Set]") return `Set(${safeCall(() => value.size, "?")})`;
        if (tag === "[object Date]") return safeCall(() => value.toISOString(), "Date");
        if (tag === "[object RegExp]") return safeCall(() => value.toString(), "RegExp");
        if (/Error\]$/.test(tag))
          return safeCall(() => `${value.name || "Error"}: ${value.message || ""}`, "Error");
        if (safeCall(() => value?.nodeType === 1 && typeof value?.tagName === "string", false))
          return `<${safeCall(() => value.tagName.toLowerCase(), "element")}${safeCall(() => (value.id ? `#${value.id}` : ""), "")}>`;
        return `${safeCall(() => value?.constructor?.name || "Object", "Object")} {…}`;
      }
      function createStyles(documentRef) {
        const style = documentRef.createElement("style");
        style.textContent = `
      :host {
        all: initial;
        contain: layout style;
        color-scheme: dark;
      }

      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }

      .rod-toast-stack {
        --rod-toast-stack-max-height: 560px;
        --rod-toast-stack-max-viewport: 62dvh;
        --rod-surface: rgba(9, 9, 11, 0.975);
        --rod-surface-raised: rgba(17, 17, 19, 0.985);
        --rod-border: rgba(255, 255, 255, 0.12);
        --rod-border-strong: rgba(255, 255, 255, 0.18);
        --rod-text: rgba(244, 244, 245, 0.88);
        --rod-text-strong: rgba(250, 250, 250, 0.96);
        --rod-muted: rgba(161, 161, 170, 0.78);
        --rod-hover: rgba(255, 255, 255, 0.07);
        position: fixed;
        z-index: ${MAX_Z_INDEX};
        isolation: isolate;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
        color: var(--rod-text);
        color-scheme: dark;
        font-family:
          ui-monospace,
          SFMono-Regular,
          Menlo,
          Monaco,
          Consolas,
          "Liberation Mono",
          "Courier New",
          monospace;
        font-size: var(--rod-toaster-font-size, 13px);
        font-weight: 400;
        line-height: var(--rod-toaster-line-height, 1.45);
      }

      .rod-toast-stack[data-position^="top"] {
        top: max(env(safe-area-inset-top, 0px), 16px);
        right: max(env(safe-area-inset-right, 0px), 16px);
        left: max(env(safe-area-inset-left, 0px), 16px);
      }

      .rod-toast-stack[data-position^="bottom"] {
        right: max(env(safe-area-inset-right, 0px), 16px);
        bottom: max(env(safe-area-inset-bottom, 0px), 16px);
        left: max(env(safe-area-inset-left, 0px), 16px);
        flex-direction: column-reverse;
      }


      .rod-toast-stack__manager {
        appearance: none;
        position: relative;
        display: none;
        place-items: center;
        align-self: center;
        width: 44px;
        min-width: 44px;
        height: 44px;
        padding: 0;
        border: 1px solid var(--rod-border);
        border-radius: 999px;
        outline: none;
        background: rgba(9, 9, 11, 0.985);
        color: rgba(244, 244, 245, 0.9);
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.045) inset,
          0 14px 34px rgba(0, 0, 0, 0.42);
        backdrop-filter: blur(18px) saturate(1.08);
        -webkit-backdrop-filter: blur(18px) saturate(1.08);
        pointer-events: auto;
        touch-action: manipulation;
        cursor: pointer;
        transition:
          transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
          background-color 180ms ease,
          border-color 180ms ease;
      }

      .rod-toast-stack__manager:hover,
      .rod-toast-stack__manager:focus-visible {
        border-color: var(--rod-border-strong);
        background: rgba(17, 17, 19, 0.99);
        transform: scale(1.04);
      }

      .rod-toast-stack__manager:focus-visible {
        outline: 1px solid rgba(255, 255, 255, 0.28);
        outline-offset: 2px;
      }

      .rod-toast-stack__manager svg {
        width: 19px;
        height: 19px;
        animation: rod-toast-spinner 850ms linear infinite;
      }

      .rod-toast-stack__manager-count {
        position: absolute;
        top: -5px;
        right: -5px;
        display: none;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border: 1px solid rgba(9, 9, 11, 0.98);
        border-radius: 999px;
        background: rgba(250, 250, 250, 0.98);
        color: rgba(9, 9, 11, 0.98);
        font: 700 9px/16px ui-sans-serif, system-ui, sans-serif;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }

      .rod-toast-stack__manager-count[data-visible="true"] {
        display: block;
      }

      .rod-toast-stack[data-manager-minimized="true"]
        .rod-toast-stack__manager {
        display: grid;
      }

      .rod-toast-stack[data-manager-minimized="true"]
        .rod-toast-stack__toolbar,
      .rod-toast-stack[data-manager-minimized="true"]
        .rod-toast-stack__list {
        display: none !important;
      }

      .rod-toast__minimize {
        appearance: none;
        display: none;
        place-items: center;
        width: 32px;
        min-width: 32px;
        height: 32px;
        padding: 0;
        border: 0;
        border-radius: 8px;
        outline: none;
        background: transparent;
        color: rgba(244, 244, 245, 0.62);
        touch-action: manipulation;
        cursor: pointer;
      }

      .rod-toast[data-loading="true"] .rod-toast__minimize {
        display: grid;
      }

      .rod-toast__minimize:hover,
      .rod-toast__minimize:focus-visible {
        background: var(--rod-hover);
        color: var(--rod-text-strong);
      }

      .rod-toast__minimize:focus-visible {
        outline: 1px solid rgba(255, 255, 255, 0.28);
        outline-offset: 1px;
      }

      .rod-toast__minimize svg {
        width: 16px;
        height: 16px;
      }

      .rod-toast-stack__toolbar {
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 42px;
        padding: 6px 7px 6px 13px;
        border: 1px solid var(--rod-border);
        border-radius: 12px;
        background: rgba(9, 9, 11, 0.94);
        color: var(--rod-text);
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.035) inset,
          0 12px 32px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(18px) saturate(1.08);
        -webkit-backdrop-filter: blur(18px) saturate(1.08);
        pointer-events: auto;
        user-select: none;
      }

      .rod-toast-stack[data-expanded="true"][data-has-many="true"]
        .rod-toast-stack__toolbar[data-enabled="true"] {
        display: flex;
      }

      .rod-toast-stack__toolbar-label {
        min-width: 0;
        overflow: hidden;
        color: var(--rod-muted);
        font: 600 11px/1.2 ui-sans-serif, system-ui, -apple-system, sans-serif;
        letter-spacing: 0.01em;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .rod-toast-stack__toolbar-actions {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 4px;
      }

      .rod-toast-stack__toolbar-button,
      .rod-toast__close,
      .rod-toast__expand {
        appearance: none;
        border: 0;
        outline: none;
        background: transparent;
        color: inherit;
        touch-action: manipulation;
        cursor: pointer;
      }

      .rod-toast-stack__toolbar-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 30px;
        padding: 0 9px;
        border-radius: 8px;
        color: rgba(244, 244, 245, 0.8);
        font: 600 11px/1 ui-sans-serif, system-ui, -apple-system, sans-serif;
      }

      .rod-toast-stack__toolbar-button svg {
        width: 14px;
        height: 14px;
      }

      .rod-toast-stack__toolbar-button:hover,
      .rod-toast-stack__toolbar-button:focus-visible,
      .rod-toast__close:hover,
      .rod-toast__close:focus-visible,
      .rod-toast__expand:hover,
      .rod-toast__expand:focus-visible {
        background: var(--rod-hover);
        color: var(--rod-text-strong);
      }

      .rod-toast-stack__toolbar-button:focus-visible,
      .rod-toast__close:focus-visible,
      .rod-toast__expand:focus-visible {
        outline: 1px solid rgba(255, 255, 255, 0.28);
        outline-offset: 1px;
      }

      .rod-toast-stack__list {
        position: relative;
        isolation: isolate;
        display: flex;
        flex-direction: column;
        gap: 9px;
        min-width: 0;
        overflow: visible;
        pointer-events: none;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
      }

      .rod-toast-stack[data-position^="bottom"] .rod-toast-stack__list {
        flex-direction: column-reverse;
      }

      .rod-toast-stack__list::before,
      .rod-toast-stack__list::after {
        content: "";
        position: absolute;
        inset: 0;
        border: 1px solid var(--rod-border);
        border-radius: 14px;
        background: var(--rod-surface);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
        opacity: 0;
        transform-origin: top center;
        pointer-events: none;
        transition:
          opacity 180ms ease,
          transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .rod-toast-stack__list::before {
        z-index: -1;
      }

      .rod-toast-stack__list::after {
        z-index: -2;
      }

      .rod-toast-stack[data-expanded="false"][data-stack-depth="2"]
        .rod-toast-stack__list::before,
      .rod-toast-stack[data-expanded="false"][data-stack-depth="3"]
        .rod-toast-stack__list::before {
        opacity: 1;
        transform: translateY(8px) scaleX(0.976);
      }

      .rod-toast-stack[data-expanded="false"][data-stack-depth="3"]
        .rod-toast-stack__list::after {
        opacity: 1;
        transform: translateY(15px) scaleX(0.948);
      }

      .rod-toast-stack[data-expanded="true"] .rod-toast-stack__list {
        max-height: min(
          var(--rod-toast-stack-max-height),
          var(--rod-toast-stack-max-viewport)
        );
        overflow-x: hidden;
        overflow-y: auto;
        padding: 2px;
        pointer-events: auto;
        -webkit-overflow-scrolling: touch;
        scroll-behavior: smooth;
        scroll-padding-block: 8px;
      }

      .rod-toast-stack[data-expanded="false"] .rod-toast-stack__list {
        overflow: visible;
      }

      .rod-toast-stack[data-expanded="false"] .rod-toast {
        display: none;
      }

      .rod-toast-stack[data-expanded="false"] .rod-toast[data-stack-index="0"] {
        display: grid;
      }

      .rod-toast {
        --rod-toast-bg: var(--rod-surface);
        --rod-toast-border: var(--rod-border);
        --rod-toast-text: var(--rod-text);
        --rod-toast-accent: rgba(244, 244, 245, 0.76);
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: flex-start;
        gap: 10px;
        width: 100%;
        min-width: 0;
        max-width: 100%;
        max-height: min(72dvh, 760px);
        overflow: auto;
        padding: 12px 11px 12px 13px;
        border: 1px solid var(--rod-toast-border);
        border-radius: var(--rod-toaster-border-radius, 12px);
        background: var(--rod-toast-bg);
        color: var(--rod-toast-text);
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.035) inset,
          0 14px 36px rgba(0, 0, 0, 0.34);
        opacity: 0;
        transform: translate3d(0, -8px, 0) scale(0.99);
        transition:
          opacity 180ms ease,
          transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
          border-color 180ms ease,
          background-color 180ms ease,
          width 320ms cubic-bezier(0.2, 0.9, 0.2, 1),
          min-width 320ms cubic-bezier(0.2, 0.9, 0.2, 1),
          height 320ms cubic-bezier(0.2, 0.9, 0.2, 1),
          padding 320ms cubic-bezier(0.2, 0.9, 0.2, 1),
          border-radius 320ms cubic-bezier(0.2, 0.9, 0.2, 1);
        pointer-events: auto;
        touch-action: none;
        user-select: text;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        will-change: transform, opacity;
      }

      .rod-toast[data-visible="true"] {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
      }

      .rod-toast[data-swiping="true"] {
        cursor: grabbing;
      }

      .rod-toast-stack[data-expanded="false"] .rod-toast[data-stack-index="0"] {
        cursor: grab;
      }

      .rod-toast-stack[data-expanded="true"][data-has-many="true"]
        .rod-toast[data-item-expanded="false"] {
        max-height: 52px;
        overflow: hidden;
        cursor: pointer;
      }

      .rod-toast-stack[data-expanded="true"][data-has-many="true"]
        .rod-toast[data-item-expanded="false"]
        .rod-toast__content {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .rod-toast-stack[data-expanded="true"][data-has-many="true"]
        .rod-toast[data-item-expanded="false"]
        .rod-toast__arg {
        display: inline;
      }

      .rod-toast-stack[data-expanded="true"][data-has-many="true"]
        .rod-toast[data-item-expanded="true"] {
        max-height: min(68dvh, 720px);
        overflow: auto;
        border-color: var(--rod-border-strong);
        background: var(--rod-surface-raised);
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.05) inset,
          0 16px 42px rgba(0, 0, 0, 0.4);
      }

      .rod-toast__icon {
        display: grid;
        place-items: center;
        width: 20px;
        min-width: 20px;
        height: 20px;
        margin-top: 1px;
        color: var(--rod-toast-accent);
        user-select: none;
        transition:
          color 180ms ease,
          transform 260ms cubic-bezier(0.2, 0.9, 0.2, 1);
      }

      .rod-toast__icon svg {
        width: 17px;
        height: 17px;
        overflow: visible;
      }

      .rod-toast__content {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 3px 7px;
        min-width: 0;
        color: inherit;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        user-select: text;
        transition:
          opacity 160ms ease,
          transform 220ms ease;
      }

      .rod-toast__arg {
        min-width: 0;
        max-width: 100%;
      }

      .rod-toast__actions {
        position: sticky;
        top: 0;
        display: flex;
        align-items: center;
        gap: 3px;
        margin: -4px -4px 0 0;
        transition:
          opacity 160ms ease,
          transform 220ms ease;
      }

      .rod-toast__count {
        display: none;
        min-width: 24px;
        height: 24px;
        padding: 0 7px;
        border: 1px solid var(--rod-border);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: rgba(244, 244, 245, 0.78);
        font: 650 10px/22px ui-sans-serif, system-ui, -apple-system, sans-serif;
        text-align: center;
        user-select: none;
      }

      .rod-toast__count[data-visible="true"] {
        display: block;
      }

      .rod-toast__close,
      .rod-toast__expand {
        display: grid;
        place-items: center;
        width: 32px;
        min-width: 32px;
        height: 32px;
        padding: 0;
        border-radius: 8px;
        color: rgba(244, 244, 245, 0.62);
      }

      .rod-toast__close svg,
      .rod-toast__expand svg {
        width: 16px;
        height: 16px;
      }

      .rod-toast__expand {
        display: none;
      }

      .rod-toast-stack[data-expanded="true"][data-has-many="true"]
        .rod-toast__expand {
        display: grid;
      }

      .rod-toast[data-item-expanded="true"] .rod-toast__expand svg {
        transform: rotate(180deg);
      }

      .rod-toast__expand svg {
        transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .rod-toast__inspector-placeholder {
        color: rgba(212, 212, 216, 0.78);
        font-style: italic;
      }

      .rod-token--null {
        color: rgba(216, 180, 254, 1);
      }

      .rod-token--undefined,
      .rod-token--meta {
        color: rgba(212, 212, 216, 0.82);
      }

      .rod-token--string {
        color: rgba(253, 186, 116, 1);
      }

      .rod-token--number {
        color: rgba(190, 242, 100, 1);
      }

      .rod-token--boolean {
        color: rgba(147, 197, 253, 1);
        font-weight: 600;
      }

      .rod-token--symbol {
        color: rgba(94, 234, 212, 1);
      }

      .rod-token--function {
        color: rgba(253, 224, 71, 1);
      }

      .rod-toast[data-loading="true"] {
        align-items: center;
      }

      .rod-toast[data-loading="true"] .rod-toast__icon {
        align-self: center;
      }

      .rod-toast[data-loading="true"][data-loading-icon="false"] {
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .rod-toast[data-loading="true"][data-loading-icon="false"]
        .rod-toast__icon {
        display: none;
      }

      .rod-toast[data-loading="true"][data-loading-content-empty="true"] {
        grid-template-columns: auto auto;
        justify-content: center;
        width: fit-content;
        min-width: 0;
        max-width: min(100%, 280px);
        margin-inline: auto;
        padding-left: 11px;
      }

      .rod-toast[data-loading="true"][data-loading-content-empty="true"]
        .rod-toast__content {
        display: none;
      }

      .rod-toast[data-loading="true"][data-loading-content-empty="true"]
        .rod-toast__actions {
        position: static;
        margin: 0;
      }


      .rod-toast[data-confirm="true"] {
        min-width: min(420px, calc(100vw - 32px));
        max-width: min(520px, calc(100vw - 32px));
        touch-action: pan-y;
      }

      .rod-toast[data-confirm="true"] .rod-toast__content {
        display: block;
        width: 100%;
      }

      .rod-toast[data-confirm="true"] .rod-toast__icon {
        align-self: flex-start;
        margin-top: 2px;
      }

      .rod-toast[data-confirm="true"] .rod-toast__minimize,
      .rod-toast[data-confirm="true"] .rod-toast__expand {
        display: none !important;
      }

      .rod-toast__confirm {
        display: grid;
        gap: 14px;
        width: 100%;
        min-width: 0;
      }

      .rod-toast__confirm-copy {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .rod-toast__confirm-title {
        min-width: 0;
        overflow-wrap: anywhere;
        color: rgba(250, 250, 250, 0.96);
        font: 620 13px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif;
        letter-spacing: -0.008em;
      }

      .rod-toast__confirm-description {
        min-width: 0;
        overflow-wrap: anywhere;
        color: rgba(161, 161, 170, 0.92);
        font: 400 12px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
      }

      .rod-toast__confirm-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
        width: 100%;
      }

      .rod-toast__confirm-button {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        min-height: 34px;
        padding: 0 12px;
        border: 1px solid transparent;
        border-radius: 8px;
        outline: none;
        color: rgba(244, 244, 245, 0.9);
        background: transparent;
        font: 600 11px/1 ui-sans-serif, system-ui, -apple-system, sans-serif;
        touch-action: manipulation;
        cursor: pointer;
        transition:
          background-color 160ms ease,
          border-color 160ms ease,
          color 160ms ease,
          transform 160ms ease,
          opacity 160ms ease;
      }

      .rod-toast__confirm-button:hover:not(:disabled),
      .rod-toast__confirm-button:focus-visible:not(:disabled) {
        transform: translateY(-1px);
      }

      .rod-toast__confirm-button:focus-visible {
        outline: 1px solid rgba(255, 255, 255, 0.32);
        outline-offset: 2px;
      }

      .rod-toast__confirm-button:disabled {
        cursor: wait;
        opacity: 0.56;
        transform: none;
      }

      .rod-toast__confirm-button svg {
        width: 15px;
        height: 15px;
        flex: 0 0 auto;
      }

      .rod-toast__confirm-button[data-busy="true"] svg {
        animation: rod-toast-spinner 850ms linear infinite;
      }

      .rod-toast__confirm-button[data-variant="primary"] {
        border-color: rgba(250, 250, 250, 0.96);
        background: rgba(250, 250, 250, 0.96);
        color: rgba(9, 9, 11, 0.98);
      }

      .rod-toast__confirm-button[data-variant="primary"]:hover:not(:disabled),
      .rod-toast__confirm-button[data-variant="primary"]:focus-visible:not(:disabled) {
        border-color: rgba(255, 255, 255, 1);
        background: rgba(255, 255, 255, 1);
      }

      .rod-toast__confirm-button[data-variant="secondary"] {
        border-color: var(--rod-border);
        background: rgba(255, 255, 255, 0.055);
        color: rgba(244, 244, 245, 0.86);
      }

      .rod-toast__confirm-button[data-variant="secondary"]:hover:not(:disabled),
      .rod-toast__confirm-button[data-variant="secondary"]:focus-visible:not(:disabled) {
        border-color: var(--rod-border-strong);
        background: rgba(255, 255, 255, 0.085);
      }

      .rod-toast__confirm-button[data-variant="danger"] {
        border-color: rgba(248, 113, 113, 0.3);
        background: rgba(127, 29, 29, 0.22);
        color: rgba(252, 165, 165, 0.98);
      }

      .rod-toast__confirm-button[data-variant="danger"]:hover:not(:disabled),
      .rod-toast__confirm-button[data-variant="danger"]:focus-visible:not(:disabled) {
        border-color: rgba(248, 113, 113, 0.46);
        background: rgba(127, 29, 29, 0.32);
      }

      .rod-toast__confirm-button[data-variant="ghost"] {
        color: rgba(212, 212, 216, 0.8);
      }

      .rod-toast__confirm-button[data-variant="ghost"]:hover:not(:disabled),
      .rod-toast__confirm-button[data-variant="ghost"]:focus-visible:not(:disabled) {
        background: var(--rod-hover);
        color: var(--rod-text-strong);
      }

      @media (max-width: 520px) {
        .rod-toast__confirm-actions {
          display: grid;
          grid-template-columns: 1fr;
        }

        .rod-toast__confirm-button {
          width: 100%;
        }
      }


      .rod-toast[data-rich="true"],
      .rod-toast[data-interactive="true"] {
        min-width: min(420px, calc(100vw - 32px));
        max-width: min(560px, calc(100vw - 32px));
        touch-action: pan-y;
      }

      .rod-toast[data-rich="true"] .rod-toast__content,
      .rod-toast[data-interactive="true"] .rod-toast__content {
        display: block;
        width: 100%;
      }

      .rod-toast[data-rich="true"] .rod-toast__minimize,
      .rod-toast[data-interactive="true"] .rod-toast__minimize,
      .rod-toast[data-rich="true"] .rod-toast__expand,
      .rod-toast[data-interactive="true"] .rod-toast__expand {
        display: none !important;
      }

      .rod-toast__rich,
      .rod-toast__interactive {
        display: grid;
        gap: 12px;
        width: 100%;
        min-width: 0;
      }

      .rod-toast__rich-copy,
      .rod-toast__interactive-copy {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .rod-toast__rich-title,
      .rod-toast__interactive-title {
        min-width: 0;
        overflow-wrap: anywhere;
        color: rgba(250, 250, 250, 0.96);
        font: 620 13px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif;
        letter-spacing: -0.008em;
      }

      .rod-toast__rich-description,
      .rod-toast__interactive-description {
        min-width: 0;
        overflow-wrap: anywhere;
        color: rgba(161, 161, 170, 0.92);
        font: 400 12px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
      }

      .rod-toast__details {
        overflow: hidden;
        border: 1px solid var(--rod-border);
        border-radius: 9px;
        background: rgba(255, 255, 255, 0.035);
      }

      .rod-toast__details summary {
        display: flex;
        align-items: center;
        gap: 7px;
        min-height: 34px;
        padding: 0 10px;
        color: rgba(212, 212, 216, 0.84);
        font: 600 11px/1 ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
        user-select: none;
      }

      .rod-toast__details summary::marker {
        color: rgba(161, 161, 170, 0.7);
      }

      .rod-toast__details-body {
        max-height: 280px;
        overflow: auto;
        padding: 10px;
        border-top: 1px solid var(--rod-border);
        color: rgba(228, 228, 231, 0.86);
        font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        scrollbar-width: thin;
      }

      .rod-toast__action-bar,
      .rod-toast__task-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 7px;
        width: 100%;
      }

      .rod-toast__task-actions {
        margin-top: 7px;
      }

      .rod-toast__action-button,
      .rod-toast__task-button {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 32px;
        padding: 0 10px;
        border: 1px solid var(--rod-border);
        border-radius: 8px;
        outline: none;
        background: rgba(255, 255, 255, 0.045);
        color: rgba(244, 244, 245, 0.86);
        font: 600 10px/1 ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
        touch-action: manipulation;
      }

      .rod-toast__action-button:hover:not(:disabled),
      .rod-toast__task-button:hover:not(:disabled),
      .rod-toast__action-button:focus-visible:not(:disabled),
      .rod-toast__task-button:focus-visible:not(:disabled) {
        border-color: var(--rod-border-strong);
        background: rgba(255, 255, 255, 0.08);
      }

      .rod-toast__action-button:focus-visible,
      .rod-toast__task-button:focus-visible {
        outline: 1px solid rgba(255, 255, 255, 0.3);
        outline-offset: 2px;
      }

      .rod-toast__action-button:disabled,
      .rod-toast__task-button:disabled {
        opacity: 0.5;
        cursor: wait;
      }

      .rod-toast__action-button svg,
      .rod-toast__task-button svg {
        width: 14px;
        height: 14px;
      }

      .rod-toast__action-button[data-busy="true"] svg,
      .rod-toast__task-button[data-busy="true"] svg {
        animation: rod-toast-spinner 850ms linear infinite;
      }

      .rod-toast__action-button[data-variant="primary"] {
        border-color: rgba(250, 250, 250, 0.96);
        background: rgba(250, 250, 250, 0.96);
        color: rgba(9, 9, 11, 0.98);
      }

      .rod-toast__action-button[data-variant="danger"] {
        border-color: rgba(248, 113, 113, 0.3);
        background: rgba(127, 29, 29, 0.22);
        color: rgba(252, 165, 165, 0.98);
      }

      .rod-toast__action-button[data-variant="ghost"] {
        border-color: transparent;
        background: transparent;
        color: rgba(212, 212, 216, 0.78);
      }

      .rod-toast__field {
        display: grid;
        gap: 6px;
        min-width: 0;
      }

      .rod-toast__field-label {
        color: rgba(212, 212, 216, 0.84);
        font: 600 10px/1.2 ui-sans-serif, system-ui, sans-serif;
      }

      .rod-toast__input,
      .rod-toast__select,
      .rod-toast__textarea {
        appearance: none;
        width: 100%;
        min-width: 0;
        min-height: 36px;
        padding: 8px 10px;
        border: 1px solid var(--rod-border);
        border-radius: 8px;
        outline: none;
        background: rgba(255, 255, 255, 0.045);
        color: rgba(250, 250, 250, 0.94);
        font: 12px/1.45 ui-sans-serif, system-ui, -apple-system, sans-serif;
      }

      .rod-toast__textarea {
        min-height: 92px;
        resize: vertical;
      }

      .rod-toast__input:focus,
      .rod-toast__select:focus,
      .rod-toast__textarea:focus {
        border-color: rgba(147, 197, 253, 0.62);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
      }

      .rod-toast__checkboxes {
        display: grid;
        gap: 7px;
      }

      .rod-toast__checkbox {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        color: rgba(212, 212, 216, 0.88);
        font: 11px/1.45 ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
      }

      .rod-toast__checkbox input {
        width: 15px;
        height: 15px;
        margin: 1px 0 0;
        accent-color: rgba(250, 250, 250, 0.96);
      }

      .rod-toast__validation {
        display: none;
        padding: 7px 9px;
        border: 1px solid rgba(248, 113, 113, 0.24);
        border-radius: 8px;
        background: rgba(127, 29, 29, 0.16);
        color: rgba(252, 165, 165, 0.96);
        font: 500 10px/1.45 ui-sans-serif, system-ui, sans-serif;
      }

      .rod-toast__validation[data-visible="true"] {
        display: block;
      }

      .rod-toast__countdown {
        display: none;
        gap: 5px;
        color: rgba(161, 161, 170, 0.82);
        font: 500 10px/1.2 ui-sans-serif, system-ui, sans-serif;
        font-variant-numeric: tabular-nums;
      }

      .rod-toast__countdown[data-visible="true"] {
        display: grid;
      }

      .rod-toast__countdown-track {
        position: relative;
        height: 3px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
      }

      .rod-toast__countdown-bar {
        position: absolute;
        inset: 0 auto 0 0;
        width: var(--rod-countdown-progress, 100%);
        border-radius: inherit;
        background: rgba(244, 244, 245, 0.62);
        transition: width 250ms linear;
      }

      .rod-toast__task-status {
        color: rgba(161, 161, 170, 0.76);
        font: 600 9px/1 ui-sans-serif, system-ui, sans-serif;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      @media (max-width: 520px) {
        .rod-toast__action-bar,
        .rod-toast__task-actions {
          display: grid;
          grid-template-columns: 1fr;
        }

        .rod-toast__action-button,
        .rod-toast__task-button {
          width: 100%;
        }
      }

      .rod-toast__loading-copy {
        display: grid;
        gap: 3px;
        min-width: 0;
        width: 100%;
      }

      .rod-toast__loading-title {
        min-width: 0;
        overflow-wrap: anywhere;
        color: rgba(250, 250, 250, 0.94);
        font: 600 13px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif;
        letter-spacing: -0.006em;
      }

      .rod-toast__loading-description {
        min-width: 0;
        overflow-wrap: anywhere;
        color: rgba(161, 161, 170, 0.9);
        font: 400 12px/1.45 ui-sans-serif, system-ui, -apple-system, sans-serif;
      }

      .rod-toast__progress {
        display: grid;
        gap: 5px;
        width: 100%;
        margin-top: 5px;
      }

      .rod-toast__progress-meta {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        min-height: 14px;
        color: rgba(161, 161, 170, 0.78);
        font: 500 10px/1 ui-sans-serif, system-ui, -apple-system, sans-serif;
        font-variant-numeric: tabular-nums;
      }

      .rod-toast__progress-track {
        position: relative;
        width: 100%;
        height: 3px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
      }

      .rod-toast__progress-bar {
        position: absolute;
        inset: 0 auto 0 0;
        width: var(--rod-loading-progress, 0%);
        border-radius: inherit;
        background: rgba(244, 244, 245, 0.78);
        transform-origin: left center;
        transition: width 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .rod-toast[data-loading-animation="progress"]
        .rod-toast__progress {
        display: grid;
      }

      .rod-toast:not([data-loading-animation="progress"])
        .rod-toast__progress {
        display: none;
      }

      .rod-toast[data-loading-indeterminate="true"]
        .rod-toast__progress-bar {
        width: 38%;
        animation:
          rod-toast-progress-indeterminate
          1.1s
          cubic-bezier(0.4, 0, 0.2, 1)
          infinite;
      }

      .rod-toast[data-loading-state="loading"]
        [data-loading-spinner="true"] {
        animation: rod-toast-spinner 850ms linear infinite;
      }

      .rod-toast[data-loading-state="loading"]
        [data-loading-pulse="true"] {
        animation:
          rod-toast-pulse
          1.35s
          cubic-bezier(0.4, 0, 0.6, 1)
          infinite;
      }

      .rod-toast[data-loading-state="loading"]
        [data-loading-pulse="true"]::after {
        content: "";
        position: absolute;
        width: 28px;
        height: 28px;
        border: 1px solid currentColor;
        border-radius: 999px;
        opacity: 0;
        animation:
          rod-toast-pulse-ring
          1.35s
          cubic-bezier(0.4, 0, 0.6, 1)
          infinite;
        pointer-events: none;
      }

      @keyframes rod-toast-spinner {
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes rod-toast-pulse {
        0%,
        100% {
          opacity: 0.55;
          transform: scale(0.92);
        }

        50% {
          opacity: 1;
          transform: scale(1.08);
        }
      }

      @keyframes rod-toast-pulse-ring {
        0% {
          opacity: 0.35;
          transform: scale(0.55);
        }

        75%,
        100% {
          opacity: 0;
          transform: scale(1.35);
        }
      }

      @keyframes rod-toast-progress-indeterminate {
        0% {
          left: -42%;
        }

        50% {
          left: 42%;
        }

        100% {
          left: 104%;
        }
      }

      .rod-toast[data-completing="true"] {
        align-self: center;
        justify-self: center;
        grid-template-columns: 1fr;
        gap: 0;
        width: 46px;
        min-width: 46px;
        max-width: 46px;
        height: 46px;
        min-height: 46px;
        max-height: 46px;
        padding: 0;
        overflow: hidden;
        border-color: rgba(74, 222, 128, 0.32);
        border-radius: 999px;
        background: rgba(9, 9, 11, 0.99);
        box-shadow:
          0 0 0 1px rgba(74, 222, 128, 0.06) inset,
          0 14px 36px rgba(0, 0, 0, 0.4);
        cursor: default;
      }

      .rod-toast[data-completing="true"] .rod-toast__content,
      .rod-toast[data-completing="true"] .rod-toast__actions {
        position: absolute;
        opacity: 0;
        transform: scale(0.92);
        pointer-events: none;
      }

      .rod-toast[data-completing="true"] .rod-toast__icon {
        justify-self: center;
        width: 46px;
        min-width: 46px;
        height: 46px;
        margin: 0;
        color: rgba(74, 222, 128, 1);
        transform: scale(1.12);
      }

      .rod-toast[data-completing="true"] .rod-toast__icon svg {
        width: 23px;
        height: 23px;
      }

      .rod-toast[data-completing="true"] .rod-icon-check-path {
        stroke-dasharray: 24;
        stroke-dashoffset: 24;
        animation: rod-toast-check-draw 280ms 100ms ease-out forwards;
      }

      .rod-toast[data-success-exit="true"] {
        opacity: 0;
        transform: translate3d(0, -18px, 0) scale(0.86);
      }

      @keyframes rod-toast-check-draw {
        to {
          stroke-dashoffset: 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .rod-toast,
        .rod-toast__content,
        .rod-toast__actions,
        .rod-toast__icon,
        .rod-toast__expand svg,
        .rod-toast-stack__list::before,
        .rod-toast-stack__list::after {
          transition-duration: 1ms !important;
          animation-duration: 1ms !important;
        }
      }
    `;
        return style;
      }
      function resolveObjectInspectorSrc() {
        if (typeof state.config.objectInspectorSrc === "string") {
          const configured = state.config.objectInspectorSrc.trim();
          if (configured) return configured;
        }
        const explicitGlobal = safeCall(() => globalWindow.ROD_OBJECT_INSPECTOR_SRC, null);
        if (typeof explicitGlobal === "string" && explicitGlobal.trim()) return explicitGlobal.trim();
        const documents = [
          safeCall(() => state.hostDocument, null),
          safeCall(() => globalWindow.document, null),
        ].filter(Boolean);
        for (const documentRef of documents) {
          const currentScript = safeCall(() => documentRef.currentScript, null);
          const scripts = safeCall(() => Array.from(documentRef.scripts || []), []);
          const candidates = currentScript ? [currentScript, ...scripts.reverse()] : scripts.reverse();
          for (const script of candidates) {
            const src = safeCall(() => script.src, "");
            if (!src || !/toaster(?:\.min)?\.js(?:[?#].*)?$/i.test(src)) continue;
            return src.replace(/toaster(?:\.min)?\.js([?#].*)?$/i, "object-inspector.js$1");
          }
        }
        return "object-inspector.js";
      }
      function getObjectInspectorApi() {
        const candidates = [state.hostWindow, initialHostWindow, globalWindow];
        for (const candidate of candidates) {
          const api = safeCall(() => candidate?.[INSPECTOR_GLOBAL], null);
          if (api?.create && api?.createStyle) return api;
        }
        return null;
      }
      function installInspectorStyle(api) {
        if (!state.renderRoot || !state.hostDocument) return;
        if (state.inspectorStyle?.isConnected) return;
        const style = api.createStyle(state.hostDocument);
        state.renderRoot.appendChild(style);
        state.inspectorStyle = style;
      }
      function buildInspectorOptions(options = state.config) {
        return {
          inspectDepth: options.inspectDepth,
          inspectItems: options.inspectItems,
          previewItems: options.previewItems,
          showPrototype: options.showPrototype,
          showNonEnumerable: options.showNonEnumerable,
          showObjectLength: options.showObjectLength,
          virtualize: options.virtualizeInspector,
          virtualizeAfter: options.virtualizeAfter,
          virtualRowHeight: options.virtualRowHeight,
          virtualOverscan: options.virtualOverscan,
          virtualMaxHeight: options.virtualMaxHeight,
          unmountOnCollapse: options.unmountInspectorOnCollapse,
        };
      }
      function ensureInspectorRuntime(api) {
        installInspectorStyle(api);
        if (state.inspectorRuntime) return state.inspectorRuntime;
        state.inspectorRuntime = api.create({
          window: state.hostWindow || initialHostWindow,
          document: state.hostDocument || initialHostWindow.document,
          maxZIndex: MAX_Z_INDEX,
          options: buildInspectorOptions(),
          getHost() {
            return {
              window: state.hostWindow || initialHostWindow,
              document: state.hostDocument || initialHostWindow.document,
            };
          },
        });
        return state.inspectorRuntime;
      }
      function loadObjectInspector() {
        const existing = getObjectInspectorApi();
        if (existing) {
          state.inspectorApi = existing;
          ensureInspectorRuntime(existing);
          return Promise.resolve(existing);
        }
        if (state.inspectorPromise) return state.inspectorPromise;
        const hostWindow = state.hostWindow || initialHostWindow;
        const hostDocument = safeCall(() => hostWindow.document, null);
        if (!hostDocument) return Promise.reject(new Error("Object Inspector host document unavailable"));
        const src = resolveObjectInspectorSrc();
        const existingScript = safeCall(
          () =>
            Array.from(hostDocument.scripts || []).find(
              (candidate) => candidate.dataset?.rodObjectInspectorSrc === src,
            ) || null,
          null,
        );
        const script = existingScript || hostDocument.createElement("script");
        state.inspectorPromise = new Promise((resolve, reject) => {
          let settled = false;
          const timeout = hostWindow.setTimeout(() => {
            if (settled) return;
            settled = true;
            state.inspectorPromise = null;
            reject(new Error(`Timed out loading ${INSPECTOR_GLOBAL} from ${src}`));
          }, state.config.objectInspectorLoadTimeout);
          function cleanupListeners() {
            script.removeEventListener("load", handleLoad);
            script.removeEventListener("error", handleError);
          }
          function finish(api) {
            if (settled) return;
            settled = true;
            hostWindow.clearTimeout(timeout);
            cleanupListeners();
            state.inspectorApi = api;
            ensureInspectorRuntime(api);
            resolve(api);
          }
          function handleLoad() {
            const api = getObjectInspectorApi();
            if (!api) {
              handleError();
              return;
            }
            finish(api);
          }
          function handleError() {
            if (settled) return;
            settled = true;
            hostWindow.clearTimeout(timeout);
            cleanupListeners();
            state.inspectorPromise = null;
            reject(new Error(`Failed to load ${INSPECTOR_GLOBAL} from ${src}`));
          }
          script.addEventListener("load", handleLoad);
          script.addEventListener("error", handleError);
          if (!existingScript) {
            script.src = src;
            script.async = true;
            script.dataset.rodObjectInspectorSrc = src;
            (hostDocument.head || hostDocument.documentElement).appendChild(script);
          } else {
            const api = getObjectInspectorApi();
            if (api) finish(api);
          }
        });
        return state.inspectorPromise;
      }
      function emitEvent(eventName, payload = {}) {
        const event = {
          event: eventName,
          timestamp: Date.now(),
          ...payload,
        };
        const listeners = [...(state.listeners.get(eventName) || []), ...(state.listeners.get("*") || [])];
        for (const listener of listeners) safeCall(() => listener(event), void 0);
        return event;
      }
      function addEventListenerInternal(eventName, listener) {
        if (typeof listener !== "function") return () => {};
        const name = String(eventName || "*");
        const bucket = state.listeners.get(name) || new Set();
        bucket.add(listener);
        state.listeners.set(name, bucket);
        return () => {
          bucket.delete(listener);
          if (!bucket.size) state.listeners.delete(name);
        };
      }
      function getActiveToastRecords() {
        return state.toasts.filter((record) => !record.removed);
      }
      function hasActiveLoadingRecords() {
        return getActiveToastRecords().some((record) => {
          return record.options.loading && record.options.loadingState === "loading";
        });
      }
      function setManagerMinimized(minimized) {
        const activeRecords = getActiveToastRecords();
        state.managerMinimized = Boolean(minimized) && activeRecords.length > 0;
        syncStackLayout();
        if (!state.managerMinimized && activeRecords.length > 1) setStackExpanded(true);
        return state.managerMinimized;
      }
      function syncStackLayout() {
        if (!state.container) return;
        const newestFirst = [...getActiveToastRecords()].reverse();
        for (let index = 0; index < newestFirst.length; index += 1) {
          const record = newestFirst[index];
          record.node.dataset.stackIndex = String(index);
          if (!record.node.dataset.itemExpanded) record.node.dataset.itemExpanded = "false";
        }
        const count = newestFirst.length;
        if (count === 0) state.managerMinimized = false;
        if (count <= 1) state.stackExpanded = false;
        const stackVisible = Math.min(3, Math.max(1, Number(state.config.stackVisible) || 1));
        const stackDepth = Math.min(count, stackVisible);
        const effectiveExpanded = !state.config.stacked || state.stackExpanded || count <= 1;
        const viewportRatio = clamp(
          Number(state.config.stackViewportRatio) || DEFAULT_CONFIG.stackViewportRatio,
          0.2,
          0.8,
        );
        state.container.dataset.stacked = String(Boolean(state.config.stacked));
        state.container.dataset.managerMinimized = String(Boolean(state.managerMinimized));
        state.container.dataset.expanded = String(effectiveExpanded);
        state.container.dataset.stackDepth = String(stackDepth);
        state.container.dataset.count = String(count);
        state.container.dataset.hasMany = String(count > 1);
        state.container.style.setProperty(
          "--rod-toast-stack-max-height",
          `${Math.max(180, Number(state.config.stackMaxHeight) || DEFAULT_CONFIG.stackMaxHeight)}px`,
        );
        state.container.style.setProperty(
          "--rod-toast-stack-max-viewport",
          `${Math.round(viewportRatio * 100)}dvh`,
        );
        if (state.toolbar) state.toolbar.dataset.enabled = String(Boolean(state.config.stackToolbar));
        if (state.stackCountNode) {
          const taskCount = newestFirst.filter((record) => {
            return Boolean(record.options.metadata?.taskId);
          }).length;
          state.stackCountNode.textContent = taskCount
            ? `${taskCount} ${taskCount === 1 ? "task" : "tasks"} · ${count} ${count === 1 ? "toast" : "toasts"}`
            : `${count} ${count === 1 ? "toast" : "toasts"}`;
        }
        if (state.managerCountNode) {
          const visibleCount =
            newestFirst.filter((record) => {
              return Boolean(record.options.metadata?.taskId);
            }).length || count;
          state.managerCountNode.textContent = String(visibleCount);
          state.managerCountNode.dataset.visible = String(visibleCount > 1);
        }
        if (state.managerNode) {
          const taskCount = newestFirst.filter((record) => {
            return Boolean(record.options.metadata?.taskId);
          }).length;
          state.managerNode.title = taskCount
            ? `Restore ${taskCount} active ${taskCount === 1 ? "task" : "tasks"}`
            : "Restore active toasts";
        }
      }
      function setStackExpanded(expanded) {
        const activeRecords = getActiveToastRecords();
        if (!state.config.stacked || activeRecords.length <= 1) {
          state.stackExpanded = false;
          for (const record of activeRecords) record.node.dataset.itemExpanded = "false";
          syncStackLayout();
          return;
        }
        state.stackExpanded = Boolean(expanded);
        if (state.stackExpanded) {
          if (!activeRecords.some((record) => record.node.dataset.itemExpanded === "true")) {
            const newest = [...activeRecords].sort((left, right) => right.createdAt - left.createdAt)[0];
            if (newest) setExpandedToast(newest, true);
          }
        } else for (const record of activeRecords) record.node.dataset.itemExpanded = "false";
        syncStackLayout();
      }
      const INTERACTIVE_SELECTOR =
        "button, a, summary, details, input, textarea, select, option, [contenteditable='true'], [role='button']";
      function eventHasInteractiveTarget(event) {
        return (typeof event.composedPath === "function" ? event.composedPath() : [event.target]).some(
          (candidate) => {
            return Boolean(
              candidate && typeof candidate.matches === "function" && candidate.matches(INTERACTIVE_SELECTOR),
            );
          },
        );
      }
      function getToastRecordByNode(node) {
        return (
          state.toasts.find((record) => {
            return !record.removed && record.node === node;
          }) || null
        );
      }
      function setExpandedToast(record, expanded) {
        if (!record || record.removed) return;
        for (const candidate of getActiveToastRecords())
          candidate.node.dataset.itemExpanded = String(candidate === record ? Boolean(expanded) : false);
        if (expanded)
          safeCall(
            () =>
              record.node.scrollIntoView({
                block: "nearest",
                inline: "nearest",
                behavior: "smooth",
              }),
            void 0,
          );
      }
      function toggleExpandedToast(record) {
        if (!record || record.removed) return;
        setExpandedToast(record, record.node.dataset.itemExpanded !== "true");
      }
      function handleStackClick(event) {
        if (!state.config.stacked || eventHasInteractiveTarget(event)) return;
        const toastNode =
          typeof event.target?.closest === "function" ? event.target.closest(".rod-toast") : null;
        if (!toastNode || toastNode.dataset.suppressStackClick === "true") return;
        const record = getToastRecordByNode(toastNode);
        if (!record) return;
        if (!state.stackExpanded) {
          if (getActiveToastRecords().length <= 1 || toastNode.dataset.stackIndex !== "0") return;
          setStackExpanded(true);
          setExpandedToast(record, true);
          return;
        }
        toggleExpandedToast(record);
      }
      function removeHostInteractionListeners() {
        if (state.hostDocument && state.outsidePointerDownHandler)
          state.hostDocument.removeEventListener("pointerdown", state.outsidePointerDownHandler, true);
        state.outsidePointerDownHandler = null;
      }
      function scheduleHostRepair() {
        if (!state.config.persistAcrossSpaNavigation || state.hostRepairFrame !== null) return;
        const hostWindow = state.hostWindow || initialHostWindow;
        const requestFrame =
          typeof hostWindow.requestAnimationFrame === "function"
            ? hostWindow.requestAnimationFrame.bind(hostWindow)
            : (callback) => hostWindow.setTimeout(callback, 0);
        state.hostRepairFrame = requestFrame(() => {
          state.hostRepairFrame = null;
          if (!getActiveToastRecords().length) return;
          ensureHost();
        });
      }
      function installSpaPersistence(hostWindow, hostDocument) {
        if (!state.config.persistAcrossSpaNavigation || state.spaCleanup) return;
        const callbacks = [];
        const navigationHandler = () => {
          if (state.config.minimizeOnSpaNavigation && hasActiveLoadingRecords()) setManagerMinimized(true);
          scheduleHostRepair();
        };
        hostWindow.addEventListener("popstate", navigationHandler);
        hostWindow.addEventListener("hashchange", navigationHandler);
        hostWindow.addEventListener("rod:toaster:navigation", navigationHandler);
        callbacks.push(() => {
          hostWindow.removeEventListener("popstate", navigationHandler);
          hostWindow.removeEventListener("hashchange", navigationHandler);
          hostWindow.removeEventListener("rod:toaster:navigation", navigationHandler);
        });
        const historyPatchSymbol = Symbol.for("rod.super-toaster.history-navigation-patch");
        if (!safeCall(() => hostWindow[historyPatchSymbol], false)) {
          const history = hostWindow.history;
          if (history) {
            for (const methodName of ["pushState", "replaceState"]) {
              const original = history[methodName];
              if (typeof original !== "function") continue;
              history[methodName] = function patchedHistoryMethod(...args) {
                const result = Reflect.apply(original, this, args);
                safeCall(
                  () => hostWindow.dispatchEvent(new hostWindow.CustomEvent("rod:toaster:navigation")),
                  void 0,
                );
                return result;
              };
            }
            safeCall(
              () =>
                Object.defineProperty(hostWindow, historyPatchSymbol, {
                  value: true,
                  configurable: true,
                }),
              void 0,
            );
          }
        }
        if (typeof hostWindow.MutationObserver === "function" && hostDocument.documentElement) {
          state.spaObserver = new hostWindow.MutationObserver(() => {
            if (getActiveToastRecords().length && state.hostElement && !state.hostElement.isConnected)
              scheduleHostRepair();
          });
          state.spaObserver.observe(hostDocument.documentElement, { childList: true });
          callbacks.push(() => {
            state.spaObserver?.disconnect();
            state.spaObserver = null;
          });
        }
        state.spaCleanup = () => {
          for (const callback of callbacks) safeCall(callback, void 0);
          state.spaCleanup = null;
        };
      }
      function destroyHost() {
        removeHostInteractionListeners();
        state.inspectorRuntime?.clearHighlight?.();
        if (state.hostElement?.isConnected) state.hostElement.remove();
        state.hostElement = null;
        state.shadowRoot = null;
        state.renderRoot = null;
        state.hostMode = null;
        state.container = null;
        state.managerNode = null;
        state.managerCountNode = null;
        state.list = null;
        state.toolbar = null;
        state.stackCountNode = null;
        state.inspectorRuntime = null;
        state.inspectorStyle = null;
        state.stackExpanded = false;
        state.managerMinimized = false;
      }
      function ensureHost() {
        const hostWindow = getHighestAccessibleWindow(globalWindow);
        const hostDocument = safeCall(() => hostWindow.document, null);
        if (!hostDocument) return null;
        if (
          state.hostElement?.isConnected &&
          state.hostDocument === hostDocument &&
          state.container &&
          state.list
        )
          return {
            window: state.hostWindow,
            document: state.hostDocument,
            container: state.container,
            list: state.list,
          };
        const parent = hostDocument.documentElement || hostDocument.body;
        if (!parent) return null;
        if (
          state.hostElement &&
          !state.hostElement.isConnected &&
          state.hostDocument === hostDocument &&
          state.container &&
          state.list
        ) {
          parent.appendChild(state.hostElement);
          installSpaPersistence(hostWindow, hostDocument);
          syncStackLayout();
          return {
            window: state.hostWindow,
            document: state.hostDocument,
            container: state.container,
            list: state.list,
          };
        }
        if (state.hostElement?.isConnected) destroyHost();
        else removeHostInteractionListeners();
        const hostElement = hostDocument.createElement("div");
        hostElement.id = TOAST_HOST_ID;
        hostElement.setAttribute("aria-live", "polite");
        hostElement.style.setProperty("all", "initial", "important");
        hostElement.style.setProperty("position", "fixed", "important");
        hostElement.style.setProperty("inset", "0", "important");
        hostElement.style.setProperty("width", "0", "important");
        hostElement.style.setProperty("height", "0", "important");
        hostElement.style.setProperty("z-index", String(MAX_Z_INDEX), "important");
        hostElement.style.setProperty("pointer-events", "none", "important");
        let shadowRoot = null;
        let renderRoot = null;
        let hostMode = "light-dom";
        if (state.config.useShadowRoot) {
          shadowRoot = safeCall(() => hostElement.attachShadow({ mode: state.config.shadowRootMode }), null);
          if (shadowRoot) {
            renderRoot = shadowRoot;
            hostMode = "shadow";
          } else if (!state.config.fallbackToLightDom) return null;
        }
        if (!renderRoot) {
          renderRoot = hostElement;
          hostMode = "light-dom";
          hostElement.setAttribute("data-rod-toaster-fallback", "light-dom");
        }
        hostElement.setAttribute("data-rod-toaster-host-mode", hostMode);
        const container = hostDocument.createElement("div");
        const managerButton = hostDocument.createElement("button");
        const managerCount = hostDocument.createElement("span");
        const toolbar = hostDocument.createElement("div");
        const toolbarLabel = hostDocument.createElement("div");
        const toolbarActions = hostDocument.createElement("div");
        const minimizeButton = hostDocument.createElement("button");
        const collapseButton = hostDocument.createElement("button");
        const clearButton = hostDocument.createElement("button");
        const list = hostDocument.createElement("div");
        container.className = "rod-toast-stack";
        container.dataset.position = state.config.position;
        container.dataset.expanded = "true";
        container.dataset.stackDepth = "0";
        container.dataset.managerMinimized = String(Boolean(state.managerMinimized));
        managerButton.type = "button";
        managerButton.className = "rod-toast-stack__manager";
        managerButton.appendChild(createSvgIcon(hostDocument, "loader-circle", 19));
        managerCount.className = "rod-toast-stack__manager-count";
        managerCount.textContent = "0";
        managerCount.dataset.visible = "false";
        managerButton.appendChild(managerCount);
        managerButton.setAttribute("aria-label", "Restore active toast tasks");
        managerButton.title = "Restore active tasks";
        managerButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          setManagerMinimized(false);
        });
        toolbar.className = "rod-toast-stack__toolbar";
        toolbar.dataset.enabled = String(Boolean(state.config.stackToolbar));
        toolbarLabel.className = "rod-toast-stack__toolbar-label";
        toolbarLabel.textContent = "0 toasts";
        toolbarActions.className = "rod-toast-stack__toolbar-actions";
        minimizeButton.type = "button";
        minimizeButton.className = "rod-toast-stack__toolbar-button";
        minimizeButton.appendChild(createSvgIcon(hostDocument, "chevron-down", 14));
        minimizeButton.appendChild(
          Object.assign(hostDocument.createElement("span"), { textContent: "Minimize" }),
        );
        minimizeButton.setAttribute("aria-label", "Minimize active toast tasks");
        collapseButton.type = "button";
        collapseButton.className = "rod-toast-stack__toolbar-button";
        collapseButton.appendChild(createSvgIcon(hostDocument, "chevrons-up", 14));
        collapseButton.appendChild(
          Object.assign(hostDocument.createElement("span"), { textContent: "Collapse" }),
        );
        collapseButton.setAttribute("aria-label", "Collapse toast stack");
        clearButton.type = "button";
        clearButton.className = "rod-toast-stack__toolbar-button";
        clearButton.appendChild(createSvgIcon(hostDocument, "x-circle", 14));
        clearButton.appendChild(
          Object.assign(hostDocument.createElement("span"), { textContent: "Close all" }),
        );
        clearButton.setAttribute("aria-label", "Dismiss all toasts");
        list.className = "rod-toast-stack__list";
        minimizeButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          setManagerMinimized(true);
        });
        collapseButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          setStackExpanded(false);
        });
        clearButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const records = [...getActiveToastRecords()].reverse();
          for (let index = 0; index < records.length; index += 1)
            hostWindow.setTimeout(() => {
              records[index]?.dismiss(false, null, "dismissAll");
            }, index * 28);
        });
        toolbarActions.appendChild(minimizeButton);
        toolbarActions.appendChild(collapseButton);
        toolbarActions.appendChild(clearButton);
        toolbar.appendChild(toolbarLabel);
        toolbar.appendChild(toolbarActions);
        container.appendChild(managerButton);
        container.appendChild(toolbar);
        container.appendChild(list);
        renderRoot.appendChild(createStyles(hostDocument));
        renderRoot.appendChild(container);
        parent.appendChild(hostElement);
        state.hostWindow = hostWindow;
        state.hostDocument = hostDocument;
        state.hostElement = hostElement;
        state.shadowRoot = shadowRoot;
        state.renderRoot = renderRoot;
        state.hostMode = hostMode;
        state.container = container;
        state.managerNode = managerButton;
        state.managerCountNode = managerCount;
        state.list = list;
        state.toolbar = toolbar;
        state.stackCountNode = toolbarLabel;
        installSpaPersistence(hostWindow, hostDocument);
        const existingRecords = [...getActiveToastRecords()].sort(
          (left, right) => right.createdAt - left.createdAt,
        );
        for (const record of existingRecords)
          if (record.node && !record.node.isConnected) list.appendChild(record.node);
        const inspectorApi = getObjectInspectorApi();
        if (inspectorApi) {
          state.inspectorApi = inspectorApi;
          ensureInspectorRuntime(inspectorApi);
        }
        container.addEventListener("click", handleStackClick);
        container.addEventListener(
          "keydown",
          (event) => {
            if (event.key !== "Escape" || !state.stackExpanded) return;
            event.preventDefault();
            event.stopPropagation();
            setStackExpanded(false);
          },
          true,
        );
        state.outsidePointerDownHandler = (event) => {
          if (!state.stackExpanded) return;
          if ((typeof event.composedPath === "function" ? event.composedPath() : []).includes(hostElement))
            return;
          setStackExpanded(false);
        };
        hostDocument.addEventListener("pointerdown", state.outsidePointerDownHandler, true);
        syncStackLayout();
        return {
          window: hostWindow,
          document: hostDocument,
          container,
          list,
        };
      }
      function createTextNode(documentRef, text, className) {
        const node = documentRef.createElement("span");
        node.textContent = text;
        if (className) node.className = className;
        return node;
      }
      function renderPrimitive(value, documentRef, options = {}) {
        let className = "";
        if (value === null) className = "rod-token--null";
        else if (value === void 0) className = "rod-token--undefined";
        else if (typeof value === "string") className = "rod-token--string";
        else if (typeof value === "number" || typeof value === "bigint") className = "rod-token--number";
        else if (typeof value === "boolean") className = "rod-token--boolean";
        else if (typeof value === "symbol") className = "rod-token--symbol";
        else if (typeof value === "function") className = "rod-token--function";
        return createTextNode(
          documentRef,
          safePrimitiveText(value, options.quoteStrings !== false),
          className,
        );
      }
      function renderToastValue(value, documentRef, options) {
        if (value === null || typeof value !== "object")
          return renderPrimitive(value, documentRef, { quoteStrings: false });
        const api = getObjectInspectorApi();
        if (api) {
          state.inspectorApi = api;
          return ensureInspectorRuntime(api).render(value, documentRef, {
            depth: 0,
            ancestors: new Set(),
            quoteStrings: false,
            options: buildInspectorOptions(options),
          });
        }
        const placeholder = documentRef.createElement("span");
        placeholder.className = "rod-toast__inspector-placeholder";
        placeholder.textContent = getFallbackObjectPreview(value);
        loadObjectInspector()
          .then((loadedApi) => {
            if (!placeholder.isConnected) return;
            const inspectorNode = ensureInspectorRuntime(loadedApi).render(value, documentRef, {
              depth: 0,
              ancestors: new Set(),
              quoteStrings: false,
              options: buildInspectorOptions(options),
            });
            placeholder.replaceWith(inspectorNode);
          })
          .catch((error) => {
            if (!placeholder.isConnected) return;
            placeholder.textContent = `${getFallbackObjectPreview(value)} [inspector unavailable]`;
            safeCall(() => console.warn(error), void 0);
          });
        return placeholder;
      }
      function isOptionsCandidate(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return false;
        if (value[OPTIONS_SYMBOL]) return true;
        return Reflect.ownKeys(value).some((key) => typeof key === "string" && OPTION_KEYS.has(key));
      }
      function parseArguments(inputArgs, forcedType) {
        const args = [...inputArgs];
        let options = {};
        if (args.length > 1 && isOptionsCandidate(args[args.length - 1])) {
          options = { ...args.pop() };
          delete options[OPTIONS_SYMBOL];
        }
        if (!args.length) args.push("");
        if (forcedType) options.type = forcedType;
        return {
          args,
          options,
        };
      }
      function normalizeToastOptions(options) {
        const type = hasOwn(TOAST_COLORS, options.type) ? options.type : "default";
        const loading = Boolean(options.loading);
        const defaultDuration = loading
          ? state.config.loadingDuration
          : type === "debug"
            ? state.config.debugDuration
            : state.config.duration;
        const loadingAnimation = normalizeLoadingAnimation(
          options.animation ?? options.loadingAnimation ?? state.config.loadingAnimation,
        );
        const progress = normalizeProgress(options.progress);
        const icon =
          options.icon === false || options.icon === null
            ? false
            : options.icon || (loading ? state.config.loadingIcon : TOAST_COLORS[type].icon);
        return {
          type,
          id: options.id == null ? null : String(options.id),
          duration: Number.isFinite(options.duration) ? Number(options.duration) : defaultDuration,
          dedupe: options.dedupe ?? state.config.dedupe,
          dedupeWindow: Number.isFinite(options.dedupeWindow)
            ? Number(options.dedupeWindow)
            : state.config.dedupeWindow,
          pauseOnInteraction: options.pauseOnInteraction ?? state.config.pauseOnInteraction,
          dismissible: options.dismissible !== false,
          closeButton: options.dismissible !== false && (options.closeButton ?? state.config.closeButton),
          role: options.role || (type === "error" ? "alert" : "status"),
          swipeToDismiss:
            options.dismissible !== false && (options.swipeToDismiss ?? state.config.swipeToDismiss),
          swipeThreshold: Number.isFinite(options.swipeThreshold)
            ? Math.max(24, Number(options.swipeThreshold))
            : state.config.swipeThreshold,
          swipeVelocity: Number.isFinite(options.swipeVelocity)
            ? Math.max(0.05, Number(options.swipeVelocity))
            : state.config.swipeVelocity,
          inspectDepth: Number.isFinite(options.inspectDepth)
            ? Math.max(0, Number(options.inspectDepth))
            : state.config.inspectDepth,
          inspectItems: Number.isFinite(options.inspectItems)
            ? Math.max(0, Number(options.inspectItems))
            : state.config.inspectItems,
          previewItems: Number.isFinite(options.previewItems)
            ? Math.max(0, Number(options.previewItems))
            : state.config.previewItems,
          showPrototype: options.showPrototype ?? state.config.showPrototype,
          showNonEnumerable: options.showNonEnumerable ?? state.config.showNonEnumerable,
          showObjectLength: options.showObjectLength ?? state.config.showObjectLength,
          virtualizeInspector: options.virtualizeInspector ?? state.config.virtualizeInspector,
          virtualizeAfter: Number.isFinite(options.virtualizeAfter)
            ? Math.max(1, Number(options.virtualizeAfter))
            : state.config.virtualizeAfter,
          virtualRowHeight: Number.isFinite(options.virtualRowHeight)
            ? Math.max(16, Number(options.virtualRowHeight))
            : state.config.virtualRowHeight,
          virtualOverscan: Number.isFinite(options.virtualOverscan)
            ? Math.max(1, Number(options.virtualOverscan))
            : state.config.virtualOverscan,
          virtualMaxHeight: Number.isFinite(options.virtualMaxHeight)
            ? Math.max(120, Number(options.virtualMaxHeight))
            : state.config.virtualMaxHeight,
          unmountInspectorOnCollapse:
            options.unmountInspectorOnCollapse ?? state.config.unmountInspectorOnCollapse,
          loading,
          loadingState: options.loadingState === "settled" ? "settled" : "loading",
          title: options.title === void 0 || options.title === null ? "" : String(options.title),
          description:
            options.description === void 0 || options.description === null ? "" : String(options.description),
          icon,
          animation: loadingAnimation,
          progress,
          progressLabel:
            options.progressLabel === void 0 || options.progressLabel === null
              ? null
              : String(options.progressLabel),
          scope: options.scope === void 0 || options.scope === null ? null : String(options.scope),
          metadata: options.metadata && typeof options.metadata === "object" ? options.metadata : null,
          onDismiss: typeof options.onDismiss === "function" ? options.onDismiss : null,
        };
      }
      function shouldRenderDebug(args) {
        const setting = state.config.shouldDebug;
        if (typeof setting === "function")
          return safeCall(() => Boolean(Reflect.apply(setting, void 0, args)), false);
        return Boolean(setting);
      }
      function runDownloadFallback(args) {
        const fallback = state.config.downloadFallback;
        if (typeof fallback !== "function") return null;
        return safeCall(() => Reflect.apply(fallback, globalWindow.console || null, args), null);
      }
      function createDedupeKey(args, options) {
        if (options.id) return `id:${options.id}`;
        const signatures = args.map((value) => {
          if (value === null) return "null";
          if (typeof value === "object" || typeof value === "function") return `ref:${getObjectId(value)}`;
          return `${typeof value}:${safePrimitiveText(value, false)}`;
        });
        return `${options.scope || "global"}|${options.type}|${signatures.join("|")}`;
      }
      function removeRecord(record) {
        const index = state.toasts.indexOf(record);
        if (index >= 0) state.toasts.splice(index, 1);
        if (record.options.id && state.recordsById.get(record.options.id) === record)
          state.recordsById.delete(record.options.id);
        if (record.dedupeKey && state.dedupeRecords.get(record.dedupeKey) === record)
          state.dedupeRecords.delete(record.dedupeKey);
      }
      function enforceToastLimit() {
        while (state.toasts.length >= state.config.maxToasts) {
          const oldest = state.toasts[0];
          if (!oldest) break;
          oldest.dismiss(true, null, "limit");
        }
      }
      function createCloseButton(documentRef, dismiss) {
        const button = documentRef.createElement("button");
        button.type = "button";
        button.className = "rod-toast__close";
        button.appendChild(createSvgIcon(documentRef, "x", 16));
        button.setAttribute("aria-label", "Close toast");
        button.title = "Close";
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        });
        return button;
      }
      function createMinimizeButton(documentRef) {
        const button = documentRef.createElement("button");
        button.type = "button";
        button.className = "rod-toast__minimize";
        button.appendChild(createSvgIcon(documentRef, "chevron-down", 16));
        button.setAttribute("aria-label", "Minimize active toast tasks");
        button.title = "Minimize";
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          setManagerMinimized(true);
        });
        return button;
      }
      function createExpandButton(documentRef, record) {
        const button = documentRef.createElement("button");
        button.type = "button";
        button.className = "rod-toast__expand";
        button.appendChild(createSvgIcon(documentRef, "chevron-down", 16));
        button.setAttribute("aria-label", "Expand toast");
        button.title = "Expand or collapse";
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleExpandedToast(record);
        });
        return button;
      }
      function isSwipeBlockedEvent(event) {
        return eventHasInteractiveTarget(event);
      }
      function installSwipeToDismiss(record, host) {
        const node = record.node;
        let active = false;
        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let lastX = 0;
        let lastY = 0;
        let lastTime = 0;
        let velocityX = 0;
        let velocityY = 0;
        let startScrollTop = 0;
        let scrollOwner = node;
        let mode = "pending";
        let moved = false;
        function resetVisualState() {
          node.dataset.swiping = "false";
          node.style.removeProperty("transition");
          node.style.removeProperty("transform");
          node.style.removeProperty("opacity");
        }
        function snapBack() {
          node.dataset.swiping = "false";
          node.style.transition = "transform 220ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease";
          node.style.transform = "translate3d(0, 0, 0) scale(1)";
          node.style.opacity = "1";
          host.window.setTimeout(() => {
            if (!record.removed) resetVisualState();
          }, 240);
        }
        function suppressNextStackClick() {
          node.dataset.suppressStackClick = "true";
          host.window.setTimeout(() => {
            if (node.isConnected) delete node.dataset.suppressStackClick;
          }, 350);
        }
        function finish(event, cancelled) {
          if (!active || event.pointerId !== pointerId) return;
          active = false;
          safeCall(() => node.releasePointerCapture(pointerId), void 0);
          const dx = event.clientX - startX;
          const dy = event.clientY - startY;
          const distance = Math.hypot(dx, dy);
          const speed = Math.hypot(velocityX, velocityY);
          const threshold = record.options.swipeThreshold;
          const velocityThreshold = record.options.swipeVelocity;
          const shouldDismiss =
            !cancelled &&
            mode === "swipe" &&
            (distance >= threshold || (distance >= 24 && speed >= velocityThreshold));
          if (moved) suppressNextStackClick();
          if (shouldDismiss) {
            record.dismiss(
              false,
              {
                dx,
                dy,
                velocityX,
                velocityY,
              },
              "swipe",
            );
            return;
          }
          if (mode === "swipe") snapBack();
          else resetVisualState();
        }
        node.addEventListener("pointerdown", (event) => {
          if (
            !record.options.swipeToDismiss ||
            record.removed ||
            event.isPrimary === false ||
            event.button > 0 ||
            isSwipeBlockedEvent(event)
          )
            return;
          active = true;
          pointerId = event.pointerId;
          startX = event.clientX;
          startY = event.clientY;
          lastX = event.clientX;
          lastY = event.clientY;
          lastTime = event.timeStamp || performance.now();
          velocityX = 0;
          velocityY = 0;
          scrollOwner = state.stackExpanded && host.list ? host.list : node;
          startScrollTop = scrollOwner.scrollTop;
          mode = "pending";
          moved = false;
          node.dataset.swiping = "true";
          node.style.transition = "none";
          safeCall(() => node.setPointerCapture(pointerId), void 0);
        });
        node.addEventListener("pointermove", (event) => {
          if (!active || event.pointerId !== pointerId || record.removed) return;
          const dx = event.clientX - startX;
          const dy = event.clientY - startY;
          const distance = Math.hypot(dx, dy);
          const now = event.timeStamp || performance.now();
          const elapsed = Math.max(1, now - lastTime);
          velocityX = (event.clientX - lastX) / elapsed;
          velocityY = (event.clientY - lastY) / elapsed;
          lastX = event.clientX;
          lastY = event.clientY;
          lastTime = now;
          if (distance < 5) return;
          if (mode === "pending") {
            const maxScrollTop = Math.max(0, scrollOwner.scrollHeight - scrollOwner.clientHeight);
            const verticalDominant = Math.abs(dy) > Math.abs(dx) * 1.25;
            mode =
              maxScrollTop > 1 &&
              verticalDominant &&
              ((dy > 0 && startScrollTop > 0) || (dy < 0 && startScrollTop < maxScrollTop))
                ? "scroll"
                : "swipe";
          }
          if (mode === "scroll") {
            const maxScrollTop = Math.max(0, scrollOwner.scrollHeight - scrollOwner.clientHeight);
            scrollOwner.scrollTop = clamp(startScrollTop - dy, 0, maxScrollTop);
            return;
          }
          event.preventDefault();
          moved = moved || distance > 8;
          const threshold = record.options.swipeThreshold;
          const opacity = 1 - Math.min(0.78, distance / Math.max(threshold * 2.25, 1));
          const rotation = clamp(dx / 28, -7, 7);
          node.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${rotation}deg)`;
          node.style.opacity = String(opacity);
        });
        node.addEventListener("pointerup", (event) => finish(event, false));
        node.addEventListener("pointercancel", (event) => finish(event, true));
        node.addEventListener("lostpointercapture", (event) => {
          if (active && event.pointerId === pointerId) finish(event, true);
        });
      }
      function setToastIcon(node, documentRef, iconValue, fallbackName) {
        node.replaceChildren();
        if (iconValue === false || iconValue === null) return false;
        if (iconValue && typeof iconValue === "object" && typeof iconValue.cloneNode === "function") {
          node.appendChild(iconValue.cloneNode(true));
          return true;
        }
        const iconName = typeof iconValue === "string" && SVG_ICONS[iconValue] ? iconValue : fallbackName;
        node.appendChild(createSvgIcon(documentRef, iconName || "loader-circle", 17));
        return true;
      }
      function createToastRecord(args, rawOptions) {
        const host = ensureHost();
        if (!host) {
          safeCall(() => console.log(`[${rawOptions.type || "toast"}]`, ...args), void 0);
          return null;
        }
        enforceToastLimit();
        const options = normalizeToastOptions(rawOptions);
        const palette = TOAST_COLORS[options.type];
        const node = host.document.createElement("div");
        const icon = host.document.createElement("div");
        const content = host.document.createElement("div");
        const actions = host.document.createElement("div");
        const count = host.document.createElement("div");
        const loadingCopy = host.document.createElement("div");
        const loadingTitle = host.document.createElement("div");
        const loadingDescription = host.document.createElement("div");
        const progress = host.document.createElement("div");
        const progressMeta = host.document.createElement("div");
        const progressTrack = host.document.createElement("div");
        const progressBar = host.document.createElement("div");
        node.className = "rod-toast";
        node.setAttribute("role", options.role);
        node.style.setProperty("--rod-toast-bg", palette.bg);
        node.style.setProperty("--rod-toast-border", palette.border);
        node.style.setProperty("--rod-toast-text", palette.text);
        node.style.setProperty("--rod-toast-accent", palette.accent);
        icon.className = "rod-toast__icon";
        setToastIcon(icon, host.document, options.icon, palette.icon);
        icon.setAttribute("aria-hidden", "true");
        content.className = "rod-toast__content";
        actions.className = "rod-toast__actions";
        count.className = "rod-toast__count";
        count.textContent = "1";
        count.dataset.visible = "false";
        loadingCopy.className = "rod-toast__loading-copy";
        loadingTitle.className = "rod-toast__loading-title";
        loadingDescription.className = "rod-toast__loading-description";
        progress.className = "rod-toast__progress";
        progressMeta.className = "rod-toast__progress-meta";
        progressTrack.className = "rod-toast__progress-track";
        progressBar.className = "rod-toast__progress-bar";
        progressTrack.appendChild(progressBar);
        progress.appendChild(progressMeta);
        progress.appendChild(progressTrack);
        loadingCopy.appendChild(loadingTitle);
        loadingCopy.appendChild(loadingDescription);
        loadingCopy.appendChild(progress);
        node.dataset.itemExpanded = "false";
        node.dataset.completing = "false";
        node.dataset.successExit = "false";
        actions.appendChild(count);
        node.appendChild(icon);
        node.appendChild(content);
        node.appendChild(actions);
        let removed = false;
        let removalTimer = null;
        let timerStartedAt = 0;
        let remainingDuration = options.duration;
        let paused = false;
        let duplicateCount = 1;
        let completing = false;
        let dismissReason = "programmatic";
        const renderLoading = (nextOptions = options) => {
          const hasTitle = Boolean(nextOptions.title);
          const hasDescription = Boolean(nextOptions.description);
          const hasProgress = nextOptions.animation === "progress";
          const contentEmpty = !hasTitle && !hasDescription && !hasProgress;
          const hasIcon = setToastIcon(
            icon,
            host.document,
            nextOptions.icon,
            nextOptions.loadingState === "settled"
              ? TOAST_COLORS[nextOptions.type].icon
              : state.config.loadingIcon,
          );
          node.dataset.loading = "true";
          node.dataset.loadingState = nextOptions.loadingState;
          node.dataset.loadingAnimation = nextOptions.animation;
          node.dataset.loadingIcon = String(hasIcon);
          node.dataset.loadingContentEmpty = String(contentEmpty);
          node.dataset.loadingIndeterminate = String(hasProgress && nextOptions.progress === null);
          icon.dataset.loadingSpinner = String(
            nextOptions.loadingState === "loading" && nextOptions.animation === "spinner",
          );
          icon.dataset.loadingPulse = String(
            nextOptions.loadingState === "loading" && nextOptions.animation === "pulse",
          );
          loadingTitle.textContent = nextOptions.title;
          loadingTitle.hidden = !hasTitle;
          loadingDescription.textContent = nextOptions.description;
          loadingDescription.hidden = !hasDescription;
          const normalizedProgress = nextOptions.progress;
          const progressPercent = normalizedProgress === null ? 0 : Math.round(normalizedProgress * 100);
          node.style.setProperty("--rod-loading-progress", `${progressPercent}%`);
          if (nextOptions.progressLabel !== null) progressMeta.textContent = nextOptions.progressLabel;
          else if (normalizedProgress !== null) progressMeta.textContent = `${progressPercent}%`;
          else progressMeta.textContent = "";
          progressMeta.hidden = !progressMeta.textContent || nextOptions.animation !== "progress";
          content.replaceChildren(loadingCopy);
        };
        const renderArgs = (nextArgs, nextOptions = options) => {
          if (nextOptions.loading) {
            renderLoading(nextOptions);
            return;
          }
          node.dataset.loading = "false";
          node.dataset.loadingState = "";
          node.dataset.loadingAnimation = "";
          node.dataset.loadingIcon = "true";
          node.dataset.loadingContentEmpty = "false";
          node.dataset.loadingIndeterminate = "false";
          icon.dataset.loadingSpinner = "false";
          icon.dataset.loadingPulse = "false";
          setToastIcon(icon, host.document, nextOptions.icon, TOAST_COLORS[nextOptions.type].icon);
          content.replaceChildren();
          for (const value of nextArgs) {
            const wrapper = host.document.createElement("span");
            wrapper.className = "rod-toast__arg";
            wrapper.appendChild(renderToastValue(value, host.document, nextOptions));
            content.appendChild(wrapper);
          }
        };
        const clearTimer = () => {
          if (removalTimer !== null) {
            host.window.clearTimeout(removalTimer);
            removalTimer = null;
          }
        };
        const cleanup = (reason = dismissReason) => {
          if (removed) return;
          removed = true;
          dismissReason = reason || dismissReason || "programmatic";
          clearTimer();
          const dismissEvent = {
            reason: dismissReason,
            record,
            controller,
            scope: options.scope,
          };
          safeCall(() => options.onDismiss?.(dismissEvent), void 0);
          removeRecord(record);
          node.remove();
          emitEvent("dismiss", dismissEvent);
          syncStackLayout();
          if (!host.list.children.length) destroyHost();
        };
        const playSuccessExit = () => {
          if (completing || removed || !node.isConnected) return;
          completing = true;
          clearTimer();
          setToastIcon(icon, host.document, "check", "check");
          node.dataset.swiping = "false";
          (typeof host.window.requestAnimationFrame === "function"
            ? host.window.requestAnimationFrame.bind(host.window)
            : (callback) => host.window.setTimeout(callback, 0))(() => {
            if (!node.isConnected) {
              cleanup();
              return;
            }
            node.dataset.completing = "true";
            host.window.setTimeout(
              () => {
                if (!node.isConnected) {
                  cleanup();
                  return;
                }
                node.dataset.successExit = "true";
                host.window.setTimeout(
                  cleanup,
                  Math.max(80, Number(state.config.successExitDuration) || 220),
                );
              },
              Math.max(120, Number(state.config.successCollapseDuration) || 360),
            );
          });
        };
        const dismiss = (immediate = false, swipe = null, reason = "programmatic") => {
          dismissReason = reason || "programmatic";
          if (removed || !node.isConnected) {
            cleanup(dismissReason);
            return;
          }
          clearTimer();
          if (immediate) {
            cleanup();
            return;
          }
          if (!swipe && options.type === "success" && state.config.successExitAnimation) {
            playSuccessExit();
            return;
          }
          if (swipe) {
            const rawX = Number(swipe.dx) || Number(swipe.velocityX) || 0;
            const rawY = Number(swipe.dy) || Number(swipe.velocityY) || 0;
            const length = Math.hypot(rawX, rawY) || 1;
            const viewportDistance =
              Math.hypot(host.window.innerWidth || 1e3, host.window.innerHeight || 1e3) * 1.2;
            const targetX = (rawX / length) * viewportDistance;
            const targetY = (rawY / length) * viewportDistance;
            const rotation = clamp(targetX / 90, -16, 16);
            node.dataset.swiping = "false";
            node.style.transition = "transform 220ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease";
            node.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) rotate(${rotation}deg)`;
            node.style.opacity = "0";
            host.window.setTimeout(cleanup, 240);
            return;
          }
          node.dataset.visible = "false";
          node.addEventListener("transitionend", cleanup, { once: true });
          host.window.setTimeout(cleanup, 240);
        };
        const scheduleTimer = () => {
          clearTimer();
          if (removed || paused || !Number.isFinite(remainingDuration) || remainingDuration <= 0) return;
          timerStartedAt = Date.now();
          removalTimer = host.window.setTimeout(() => dismiss(false, null, "timeout"), remainingDuration);
        };
        const pauseTimer = () => {
          if (
            paused ||
            removalTimer === null ||
            !Number.isFinite(remainingDuration) ||
            remainingDuration <= 0
          )
            return;
          paused = true;
          remainingDuration = Math.max(0, remainingDuration - (Date.now() - timerStartedAt));
          clearTimer();
        };
        const resumeTimer = () => {
          if (!paused) return;
          paused = false;
          scheduleTimer();
        };
        const resetTimer = (duration = options.duration) => {
          remainingDuration = duration;
          paused = false;
          scheduleTimer();
        };
        const update = (nextArgs, nextRawOptions = {}) => {
          const previous = { ...options };
          const nextOptions = normalizeToastOptions({
            ...options,
            ...nextRawOptions,
          });
          const nextPalette = TOAST_COLORS[nextOptions.type];
          Object.assign(options, nextOptions);
          node.style.setProperty("--rod-toast-bg", nextPalette.bg);
          node.style.setProperty("--rod-toast-border", nextPalette.border);
          node.style.setProperty("--rod-toast-text", nextPalette.text);
          node.style.setProperty("--rod-toast-accent", nextPalette.accent);
          node.setAttribute("role", nextOptions.role);
          renderArgs(nextArgs, nextOptions);
          resetTimer(nextOptions.duration);
          emitEvent("update", {
            record,
            controller,
            previous,
            options: { ...options },
            args: nextArgs,
            scope: options.scope,
          });
          return controller;
        };
        const updateLoading = (inputArgs) => {
          const parsed = parseLoadingInput(inputArgs);
          const nextOptions = {
            ...options,
            ...parsed,
            loading: true,
            loadingState: parsed.loadingState || options.loadingState || "loading",
          };
          return update([], nextOptions);
        };
        const settleLoading = (type, inputArgs = []) => {
          const parsed = parseLoadingInput(inputArgs);
          const durationByType = {
            success: state.config.loadingSuccessDuration,
            error: state.config.loadingErrorDuration,
            info: state.config.loadingInfoDuration,
            warning: state.config.loadingWarningDuration,
          };
          const semanticIcon = parsed.icon !== void 0 ? parsed.icon : TOAST_COLORS[type].icon;
          const nextOptions = {
            ...options,
            ...parsed,
            type,
            loading: true,
            loadingState: "settled",
            animation: "none",
            icon: semanticIcon,
            progress: type === "success" ? 1 : (parsed.progress ?? options.progress),
            duration: Number.isFinite(parsed.duration)
              ? Number(parsed.duration)
              : (durationByType[type] ?? state.config.duration),
          };
          return update([], nextOptions);
        };
        const bumpDuplicate = () => {
          duplicateCount += 1;
          count.textContent = `×${duplicateCount}`;
          count.dataset.visible = "true";
          resetTimer(options.duration);
          return controller;
        };
        const record = {
          node,
          options,
          args,
          dedupeKey: null,
          createdAt: Date.now(),
          lastSeenAt: Date.now(),
          dismiss,
          update,
          updateLoading,
          settleLoading,
          bumpDuplicate,
          get removed() {
            return removed;
          },
        };
        const controller = {
          get id() {
            return options.id;
          },
          get element() {
            return node;
          },
          get progress() {
            return options.progress;
          },
          get state() {
            return options.loading ? options.loadingState : options.type;
          },
          update(...inputArgs) {
            if (options.loading) return updateLoading(inputArgs);
            const parsed = parseArguments(inputArgs, null);
            return update(parsed.args, parsed.options);
          },
          setProgress(value, next = {}) {
            return updateLoading([
              {
                ...next,
                progress: value,
                animation: next.animation || options.animation || "progress",
              },
            ]);
          },
          success(...inputArgs) {
            return settleLoading("success", inputArgs);
          },
          error(...inputArgs) {
            return settleLoading("error", inputArgs);
          },
          info(...inputArgs) {
            return settleLoading("info", inputArgs);
          },
          warning(...inputArgs) {
            return settleLoading("warning", inputArgs);
          },
          dismiss(reason = "programmatic", immediate = false) {
            if (typeof reason === "boolean") {
              immediate = reason;
              reason = "programmatic";
            }
            dismiss(Boolean(immediate), null, String(reason || "programmatic"));
          },
        };
        actions.appendChild(createMinimizeButton(host.document));
        actions.appendChild(createExpandButton(host.document, record));
        if (options.closeButton)
          actions.appendChild(createCloseButton(host.document, () => dismiss(false, null, "close")));
        if (options.pauseOnInteraction) {
          node.addEventListener("pointerenter", pauseTimer);
          node.addEventListener("pointerleave", resumeTimer);
          node.addEventListener("focusin", pauseTimer);
          node.addEventListener("focusout", (event) => {
            const nextTarget = event.relatedTarget;
            if (!nextTarget || !node.contains(nextTarget)) resumeTimer();
          });
        }
        node.addEventListener("keydown", (event) => {
          if (event.key !== "Escape") return;
          if (state.stackExpanded) {
            event.preventDefault();
            event.stopPropagation();
            setStackExpanded(false);
            return;
          }
          if (!options.dismissible) return;
          event.preventDefault();
          event.stopPropagation();
          dismiss(false, null, "escape");
        });
        renderArgs(args, options);
        host.list.prepend(node);
        state.toasts.push(record);
        emitEvent("create", {
          record,
          controller,
          options: { ...options },
          args,
          scope: options.scope,
        });
        installSwipeToDismiss(record, host);
        syncStackLayout();
        (typeof host.window.requestAnimationFrame === "function"
          ? host.window.requestAnimationFrame.bind(host.window)
          : (callback) => host.window.setTimeout(callback, 0))(() => {
          if (node.isConnected) node.dataset.visible = "true";
        });
        scheduleTimer();
        return {
          record,
          controller,
        };
      }
      function showParsedToast(parsed) {
        const options = normalizeToastOptions(parsed.options);
        if (options.id) {
          const existing = state.recordsById.get(options.id);
          if (existing && !existing.removed) {
            existing.lastSeenAt = Date.now();
            if (options.loading || existing.options.loading)
              return existing.updateLoading([
                {
                  ...parsed.options,
                  loading: true,
                },
              ]);
            return existing.update(parsed.args, parsed.options);
          }
        }
        const dedupeKey = options.dedupe ? createDedupeKey(parsed.args, options) : null;
        if (dedupeKey && !options.id) {
          const existing = state.dedupeRecords.get(dedupeKey);
          const now = Date.now();
          const isPersistentDuplicate =
            Boolean(state.config.coalescePersistent) &&
            options.duration <= 0 &&
            existing?.options?.duration <= 0;
          const isInsideDedupeWindow = existing && now - existing.lastSeenAt <= options.dedupeWindow;
          if (existing && !existing.removed && (isPersistentDuplicate || isInsideDedupeWindow)) {
            existing.lastSeenAt = now;
            return existing.bumpDuplicate();
          }
        }
        const created = createToastRecord(parsed.args, parsed.options);
        if (!created) return null;
        created.record.dedupeKey = dedupeKey;
        if (options.id) state.recordsById.set(options.id, created.record);
        if (dedupeKey) state.dedupeRecords.set(dedupeKey, created.record);
        return created.controller;
      }
      function showToast(inputArgs, forcedType) {
        return showParsedToast(parseArguments(inputArgs, forcedType));
      }
      function showLoadingToast(inputArgs) {
        const descriptor = parseLoadingInput(inputArgs);
        return showParsedToast({
          args: [],
          options: {
            ...descriptor,
            type: descriptor.type || "default",
            loading: true,
            loadingState: "loading",
            animation: descriptor.animation || state.config.loadingAnimation,
            icon: descriptor.icon === void 0 ? state.config.loadingIcon : descriptor.icon,
            duration: Number.isFinite(descriptor.duration)
              ? Number(descriptor.duration)
              : state.config.loadingDuration,
            dedupe: descriptor.dedupe === void 0 ? false : descriptor.dedupe,
          },
        });
      }
      function normalizeActionDescriptors(actions, fallbackActions = []) {
        return (Array.isArray(actions) && actions.length ? actions : fallbackActions)
          .filter((action) => action && typeof action === "object")
          .map((action, index) => ({
            id: action.id === void 0 || action.id === null ? `action-${index + 1}` : String(action.id),
            label:
              action.label === void 0 || action.label === null
                ? String(action.id || `Action ${index + 1}`)
                : String(action.label),
            labelTemplate:
              action.label === void 0 || action.label === null
                ? String(action.id || `Action ${index + 1}`)
                : String(action.label),
            loadingLabel:
              action.loadingLabel === void 0 || action.loadingLabel === null
                ? null
                : String(action.loadingLabel),
            successLabel:
              action.successLabel === void 0 || action.successLabel === null
                ? null
                : String(action.successLabel),
            icon: action.icon === false || action.icon === null ? false : action.icon || null,
            variant: ["primary", "secondary", "danger", "ghost"].includes(action.variant)
              ? action.variant
              : "secondary",
            disabled: Boolean(action.disabled),
            disabledUntilCountdown: Boolean(action.disabledUntilCountdown),
            close: action.close !== false && action.keepOpen !== true,
            keepOpen: action.keepOpen === true || action.close === false,
            handle: typeof action.handle === "function" ? action.handle : null,
            hasValue: hasOwn(action, "value"),
            value: action.value,
            shortcut: action.shortcut === void 0 || action.shortcut === null ? null : String(action.shortcut),
            raw: action,
          }));
      }
      function normalizeShortcutName(value) {
        return String(value || "")
          .split("+")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const lower = part.toLowerCase();
            if (lower === "cmd" || lower === "command") return "Meta";
            if (lower === "ctrl" || lower === "control") return "Control";
            if (lower === "alt" || lower === "option") return "Alt";
            if (lower === "shift") return "Shift";
            if (lower === "esc") return "Escape";
            if (lower === "return") return "Enter";
            return part.length === 1 ? part.toUpperCase() : part;
          })
          .sort((left, right) => {
            const order = ["Control", "Alt", "Shift", "Meta"];
            const leftIndex = order.indexOf(left);
            const rightIndex = order.indexOf(right);
            if (leftIndex >= 0 || rightIndex >= 0)
              return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
            return 0;
          })
          .join("+");
      }
      function shortcutFromEvent(event) {
        const parts = [];
        if (event.ctrlKey) parts.push("Control");
        if (event.altKey) parts.push("Alt");
        if (event.shiftKey) parts.push("Shift");
        if (event.metaKey) parts.push("Meta");
        parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key);
        return normalizeShortcutName(parts.join("+"));
      }
      function createDetailsNode(documentRef, details, label = "Details") {
        if (details === void 0 || details === null || details === false) return null;
        const root = documentRef.createElement("details");
        const summary = documentRef.createElement("summary");
        const body = documentRef.createElement("div");
        root.className = "rod-toast__details";
        summary.textContent = String(label || "Details");
        body.className = "rod-toast__details-body";
        if (typeof details === "string") body.textContent = details;
        else body.appendChild(renderToastValue(details, documentRef, state.config));
        root.appendChild(summary);
        root.appendChild(body);
        return root;
      }
      async function copyText(value) {
        const text = String(value ?? "");
        const hostWindow = state.hostWindow || initialHostWindow;
        const hostDocument = state.hostDocument || hostWindow.document;
        if (hostWindow.navigator?.clipboard?.writeText) {
          await hostWindow.navigator.clipboard.writeText(text);
          return true;
        }
        const textarea = hostDocument.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-99999px";
        hostDocument.body?.appendChild(textarea);
        textarea.select();
        const copied = safeCall(() => hostDocument.execCommand("copy"), false);
        textarea.remove();
        return copied;
      }
      function buildCheckboxes(documentRef, checkbox) {
        const source = Array.isArray(checkbox) ? checkbox : checkbox ? [checkbox] : [];
        if (!source.length)
          return {
            node: null,
            getValue: () => ({}),
          };
        const root = documentRef.createElement("div");
        const inputs = new Map();
        root.className = "rod-toast__checkboxes";
        source.forEach((item, index) => {
          const descriptor =
            typeof item === "string"
              ? {
                  id: `checkbox-${index + 1}`,
                  label: item,
                }
              : item || {};
          const id = String(descriptor.id || `checkbox-${index + 1}`);
          const label = documentRef.createElement("label");
          const input = documentRef.createElement("input");
          const copy = documentRef.createElement("span");
          label.className = "rod-toast__checkbox";
          input.type = "checkbox";
          input.checked = Boolean(descriptor.checked);
          input.disabled = Boolean(descriptor.disabled);
          input.dataset.checkboxId = id;
          copy.textContent = String(descriptor.label || id);
          label.appendChild(input);
          label.appendChild(copy);
          root.appendChild(label);
          inputs.set(id, input);
        });
        return {
          node: root,
          getValue() {
            return Object.fromEntries([...inputs.entries()].map(([id, input]) => [id, input.checked]));
          },
        };
      }
      function formatDialogResult(options, value, reason, actionId, values) {
        if (!options.returnMeta) return value;
        const result = {
          value,
          reason,
          actionId: actionId || null,
        };
        if (values && typeof values === "object") Object.assign(result, values);
        return result;
      }
      function showActionDialog(descriptor = {}, settings = {}) {
        const options = isPlainObject(descriptor) ? descriptor : { title: String(descriptor ?? "") };
        const fallbackActions = settings.fallbackActions || [
          {
            id: "cancel",
            label: "Cancel",
            icon: "circle-x",
            variant: "secondary",
            value: settings.dismissValue ?? false,
          },
          {
            id: "confirm",
            label: "Confirm",
            icon: "check",
            variant: "primary",
            value: true,
          },
        ];
        const actions = normalizeActionDescriptors(options.actions, fallbackActions);
        const dismissValue = hasOwn(options, "dismissValue")
          ? options.dismissValue
          : (settings.dismissValue ?? false);
        return new Promise((resolve, reject) => {
          let settled = false;
          let controller = null;
          let created = null;
          let countdownTimer = null;
          let remainingSeconds = 0;
          let initialSeconds = 0;
          const cleanupCallbacks = [];
          const finish = (value, reason = "action", actionId = null) => {
            if (settled) return;
            settled = true;
            if (countdownTimer !== null)
              (state.hostWindow || initialHostWindow).clearInterval(countdownTimer);
            cleanupCallbacks.forEach((callback) => safeCall(callback, void 0));
            const values = settings.getValues?.() || {};
            resolve(formatDialogResult(options, value, reason, actionId, values));
          };
          const settleDismissed = ({ reason = "dismiss" } = {}) => {
            finish(dismissValue, reason, null);
          };
          created = createToastRecord([], {
            type: hasOwn(TOAST_COLORS, options.type) ? options.type : settings.type || "default",
            title: options.title,
            description: options.description,
            icon: options.icon === void 0 ? settings.icon || "circle" : options.icon,
            duration: Number.isFinite(options.duration) ? Number(options.duration) : (settings.duration ?? 0),
            id: options.id,
            scope: options.scope,
            metadata: options.metadata,
            dedupe: false,
            pauseOnInteraction: options.pauseOnInteraction ?? true,
            dismissible: options.dismissible !== false,
            closeButton: options.dismissible !== false && (options.closeButton ?? true),
            swipeToDismiss: options.dismissible !== false && (options.swipeToDismiss ?? true),
            role: options.role || "alertdialog",
            onDismiss: settleDismissed,
          });
          if (!created) {
            finish(dismissValue, "unavailable", null);
            return;
          }
          controller = created.controller;
          const record = created.record;
          const node = controller.element;
          const content = node.querySelector(".rod-toast__content");
          const iconNode = node.querySelector(".rod-toast__icon");
          node.dataset.confirm = "false";
          node.dataset.interactive = "true";
          node.dataset.interactiveKind = settings.kind || "dialog";
          node.setAttribute("aria-modal", "false");
          if (!content) {
            controller.dismiss("unavailable", true);
            finish(dismissValue, "unavailable", null);
            return;
          }
          const documentRef = node.ownerDocument;
          const root = documentRef.createElement("div");
          const copy = documentRef.createElement("div");
          const title = documentRef.createElement("div");
          const description = documentRef.createElement("div");
          const body = documentRef.createElement("div");
          const validation = documentRef.createElement("div");
          const countdown = documentRef.createElement("div");
          const countdownLabel = documentRef.createElement("div");
          const countdownTrack = documentRef.createElement("div");
          const countdownBar = documentRef.createElement("div");
          const actionsNode = documentRef.createElement("div");
          root.className = "rod-toast__interactive";
          copy.className = "rod-toast__interactive-copy";
          title.className = "rod-toast__interactive-title";
          description.className = "rod-toast__interactive-description";
          validation.className = "rod-toast__validation";
          validation.dataset.visible = "false";
          countdown.className = "rod-toast__countdown";
          countdown.dataset.visible = "false";
          countdownTrack.className = "rod-toast__countdown-track";
          countdownBar.className = "rod-toast__countdown-bar";
          actionsNode.className = "rod-toast__confirm-actions";
          title.textContent = String(options.title || "");
          title.hidden = !title.textContent;
          description.textContent = String(options.description || "");
          description.hidden = !description.textContent;
          countdownTrack.appendChild(countdownBar);
          countdown.appendChild(countdownLabel);
          countdown.appendChild(countdownTrack);
          copy.appendChild(title);
          copy.appendChild(description);
          root.appendChild(copy);
          root.appendChild(body);
          const checkboxApi = buildCheckboxes(documentRef, options.checkbox);
          if (checkboxApi.node) body.appendChild(checkboxApi.node);
          const bodyApi =
            settings.buildBody?.({
              document: documentRef,
              body,
              node,
              controller,
              options,
            }) || {};
          settings.getValues = () => ({
            ...(bodyApi.getValues?.() || {}),
            ...(checkboxApi.node ? { checked: checkboxApi.getValue() } : {}),
          });
          let currentDetailsNode = createDetailsNode(
            documentRef,
            options.details,
            options.detailsLabel || "Details",
          );
          if (currentDetailsNode) root.appendChild(currentDetailsNode);
          root.appendChild(validation);
          root.appendChild(countdown);
          root.appendChild(actionsNode);
          content.replaceChildren(root);
          const buttons = [];
          const buttonByActionId = new Map();
          const setValidation = (message) => {
            validation.textContent = String(message || "");
            validation.dataset.visible = String(Boolean(validation.textContent));
          };
          const updateDialog = (next = {}) => {
            if (hasOwn(next, "title")) {
              title.textContent = String(next.title || "");
              title.hidden = !title.textContent;
            }
            if (hasOwn(next, "description")) {
              description.textContent = String(next.description || "");
              description.hidden = !description.textContent;
            }
            if (hasOwn(next, "details")) {
              const nextDetails = createDetailsNode(
                documentRef,
                next.details,
                next.detailsLabel || options.detailsLabel || "Details",
              );
              currentDetailsNode?.remove();
              currentDetailsNode = nextDetails;
              if (currentDetailsNode) root.insertBefore(currentDetailsNode, validation);
            }
            if (hasOwn(next, "validation")) setValidation(next.validation);
            return controller;
          };
          const setButtonsBusy = (activeButton, action, busy) => {
            buttons.forEach((button) => {
              const descriptor = button.__rodAction;
              const lockedByCountdown = descriptor.disabledUntilCountdown && remainingSeconds > 0;
              button.disabled = busy || descriptor.disabled || lockedByCountdown;
              button.dataset.busy = String(busy && button === activeButton);
            });
            if (activeButton) {
              const label = activeButton.querySelector("span");
              if (label) label.textContent = busy && action.loadingLabel ? action.loadingLabel : action.label;
            }
          };
          const executeAction = async (action, button, event = null) => {
            if (settled || button.disabled) return;
            setValidation("");
            const values = settings.getValues?.() || {};
            const validationResult = await settings.validate?.({
              action,
              values,
              options,
            });
            if (validationResult !== true && validationResult !== void 0) {
              setValidation(
                validationResult === false
                  ? options.validationMessage || "Please review this value."
                  : validationResult,
              );
              return;
            }
            const originalIcon = button.querySelector("svg")?.cloneNode(true);
            const labelNode = button.querySelector("span");
            setButtonsBusy(button, action, true);
            if (button.querySelector("svg"))
              button.replaceChild(
                createSvgIcon(documentRef, "loader-circle", 15),
                button.querySelector("svg"),
              );
            else button.insertBefore(createSvgIcon(documentRef, "loader-circle", 15), labelNode);
            let closedByContext = false;
            const close = (value, reason = "action") => {
              closedByContext = true;
              finish(value, reason, action.id);
              controller.dismiss(reason);
            };
            try {
              emitEvent("action", {
                phase: "start",
                actionId: action.id,
                action: action.raw,
                controller,
                scope: options.scope || null,
              });
              let result;
              if (action.handle)
                result = await action.handle({
                  action: action.raw,
                  controller,
                  event,
                  toast,
                  close,
                  update: updateDialog,
                  setValidation,
                  values,
                  checked: values.checked || {},
                });
              if (closedByContext) return;
              if (result === void 0)
                result = settings.resolveValue
                  ? settings.resolveValue(action, values)
                  : action.hasValue
                    ? action.value
                    : action.id;
              if (action.successLabel && labelNode) {
                labelNode.textContent = action.successLabel;
                button.querySelector("svg")?.replaceWith(createSvgIcon(documentRef, "check", 15));
                await new Promise((resolveDelay) => {
                  (state.hostWindow || initialHostWindow).setTimeout(resolveDelay, 260);
                });
              }
              emitEvent("action", {
                phase: "success",
                actionId: action.id,
                action: action.raw,
                result,
                controller,
                scope: options.scope || null,
              });
              if (action.close) {
                finish(result, "action", action.id);
                controller.dismiss("action");
                return;
              }
              button.querySelector("svg")?.remove();
              if (originalIcon) button.insertBefore(originalIcon, labelNode);
              if (labelNode) labelNode.textContent = action.label;
              setButtonsBusy(button, action, false);
            } catch (error) {
              emitEvent("action", {
                phase: "error",
                actionId: action.id,
                action: action.raw,
                error,
                controller,
                scope: options.scope || null,
              });
              if (options.rejectOnActionError === false) {
                setValidation(error?.message || String(error));
                button.querySelector("svg")?.remove();
                if (originalIcon) button.insertBefore(originalIcon, labelNode);
                if (labelNode) labelNode.textContent = action.label;
                setButtonsBusy(button, action, false);
                return;
              }
              if (!settled) {
                settled = true;
                cleanupCallbacks.forEach((callback) => safeCall(callback, void 0));
                reject(error);
                controller.dismiss("action-error", true);
              }
            }
          };
          actions.forEach((action) => {
            const button = documentRef.createElement("button");
            const label = documentRef.createElement("span");
            button.type = "button";
            button.className = "rod-toast__confirm-button";
            button.dataset.actionId = action.id;
            button.dataset.variant = action.variant;
            button.dataset.busy = "false";
            button.__rodAction = action;
            button.disabled = action.disabled;
            if (action.icon) button.appendChild(createSvgIcon(documentRef, action.icon, 15));
            label.textContent = action.label;
            button.appendChild(label);
            button.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              executeAction(action, button, event);
            });
            actionsNode.appendChild(button);
            buttons.push(button);
            buttonByActionId.set(action.id, button);
          });
          const countdownValue =
            typeof options.countdown === "object" ? options.countdown.seconds : options.countdown;
          initialSeconds = Math.max(0, Math.ceil(Number(countdownValue) || 0));
          remainingSeconds = initialSeconds;
          const updateCountdown = () => {
            countdown.dataset.visible = String(initialSeconds > 0);
            if (!initialSeconds) return;
            const progress = clamp(remainingSeconds / initialSeconds, 0, 1);
            countdown.style.setProperty("--rod-countdown-progress", `${Math.round(progress * 100)}%`);
            countdownLabel.textContent = remainingSeconds > 0 ? `${remainingSeconds}s remaining` : "Ready";
            buttons.forEach((button) => {
              const action = button.__rodAction;
              const label = button.querySelector("span");
              if (label && button.dataset.busy !== "true")
                label.textContent = action.labelTemplate.replace(/\{seconds\}/g, String(remainingSeconds));
              button.disabled = action.disabled || (action.disabledUntilCountdown && remainingSeconds > 0);
            });
          };
          if (initialSeconds > 0) {
            updateCountdown();
            countdownTimer = (state.hostWindow || initialHostWindow).setInterval(() => {
              remainingSeconds = Math.max(0, remainingSeconds - 1);
              updateCountdown();
              if (remainingSeconds <= 0) {
                (state.hostWindow || initialHostWindow).clearInterval(countdownTimer);
                countdownTimer = null;
                const autoActionId =
                  typeof options.countdown === "object" ? options.countdown.autoAction : null;
                if (autoActionId && buttonByActionId.has(String(autoActionId)))
                  buttonByActionId.get(String(autoActionId)).click();
              }
            }, 1e3);
          }
          const shortcuts = new Map();
          Object.entries(options.shortcuts || {}).forEach(([shortcut, actionId]) => {
            shortcuts.set(normalizeShortcutName(shortcut), String(actionId));
          });
          actions.forEach((action) => {
            if (action.shortcut) shortcuts.set(normalizeShortcutName(action.shortcut), action.id);
          });
          const keyHandler = (event) => {
            if (settled) return;
            const shortcut = shortcutFromEvent(event);
            const actionId = shortcuts.get(shortcut);
            if (actionId && buttonByActionId.has(actionId)) {
              event.preventDefault();
              event.stopPropagation();
              buttonByActionId.get(actionId).click();
              return;
            }
            if (event.key === "Escape" && options.dismissible !== false) {
              event.preventDefault();
              event.stopPropagation();
              controller.dismiss("escape");
            }
          };
          documentRef.addEventListener("keydown", keyHandler, true);
          cleanupCallbacks.push(() => {
            documentRef.removeEventListener("keydown", keyHandler, true);
          });
          setManagerMinimized(false);
          syncStackLayout();
          const preferredButton =
            buttons.find((button) => {
              return !button.disabled && button.dataset.variant === "primary";
            }) || buttons.find((button) => !button.disabled);
          const hostWindow = state.hostWindow || initialHostWindow;
          (typeof hostWindow.requestAnimationFrame === "function"
            ? hostWindow.requestAnimationFrame.bind(hostWindow)
            : (callback) => hostWindow.setTimeout(callback, 0))(() => {
            bodyApi.focus?.();
            if (!bodyApi.focus) preferredButton?.focus?.({ preventScroll: true });
            iconNode?.setAttribute("aria-hidden", "true");
          });
          record.dialogActions = actions;
        });
      }
      function showConfirmToast(descriptor = {}) {
        const options = isPlainObject(descriptor) ? { ...descriptor } : { title: String(descriptor ?? "") };
        options.shortcuts ||= {
          Escape: "cancel",
          Enter: "confirm",
        };
        return showActionDialog(options, {
          kind: "confirm",
          dismissValue: false,
          fallbackActions: [
            {
              id: "cancel",
              label: "Cancel",
              icon: "circle-x",
              variant: "secondary",
              value: false,
            },
            {
              id: "confirm",
              label: "Confirm",
              icon: "check",
              variant: "primary",
              value: true,
            },
          ],
        });
      }
      function showPromptToast(descriptor = {}) {
        const options = isPlainObject(descriptor) ? { ...descriptor } : { title: String(descriptor ?? "") };
        options.shortcuts ||= options.multiline
          ? {
              Escape: "cancel",
              "Meta+Enter": "confirm",
              "Control+Enter": "confirm",
            }
          : {
              Escape: "cancel",
              Enter: "confirm",
            };
        let input = null;
        return showActionDialog(options, {
          kind: "prompt",
          dismissValue: hasOwn(options, "dismissValue") ? options.dismissValue : null,
          fallbackActions: [
            {
              id: "cancel",
              label: options.cancelLabel || "Cancel",
              icon: "circle-x",
              variant: "secondary",
              value: hasOwn(options, "dismissValue") ? options.dismissValue : null,
            },
            {
              id: "confirm",
              label: options.confirmLabel || "Save",
              icon: "check",
              variant: "primary",
            },
          ],
          buildBody({ document, body }) {
            const field = document.createElement("label");
            const label = document.createElement("span");
            input = document.createElement(options.multiline ? "textarea" : "input");
            field.className = "rod-toast__field";
            label.className = "rod-toast__field-label";
            label.textContent = String(options.inputLabel || "Value");
            label.hidden = !options.inputLabel;
            input.className = options.multiline ? "rod-toast__textarea" : "rod-toast__input";
            if (!options.multiline) input.type = options.inputType || "text";
            input.value = options.value === void 0 || options.value === null ? "" : String(options.value);
            input.placeholder = String(options.placeholder || "");
            input.autocomplete = options.autocomplete || "off";
            input.spellcheck = options.spellcheck !== false;
            if (Number.isFinite(options.minLength)) input.minLength = options.minLength;
            if (Number.isFinite(options.maxLength)) input.maxLength = options.maxLength;
            input.required = Boolean(options.required);
            field.appendChild(label);
            field.appendChild(input);
            body.appendChild(field);
            return {
              focus() {
                input.focus({ preventScroll: true });
                input.select?.();
              },
              getValues() {
                return { input: input.value };
              },
            };
          },
          async validate({ action, values }) {
            if (action.id === "cancel") return true;
            if (options.required && !String(values.input || "").trim())
              return options.requiredMessage || "A value is required.";
            if (typeof options.validate === "function") return options.validate(values.input);
            return true;
          },
          resolveValue(action, values) {
            if (action.id === "cancel") return action.hasValue ? action.value : null;
            return action.hasValue ? action.value : values.input;
          },
        });
      }
      function showSelectToast(descriptor = {}) {
        const options = isPlainObject(descriptor) ? { ...descriptor } : {};
        options.shortcuts ||= {
          Escape: "cancel",
          Enter: "confirm",
        };
        let select = null;
        const choices = Array.isArray(options.options) ? options.options : [];
        return showActionDialog(options, {
          kind: "select",
          dismissValue: hasOwn(options, "dismissValue") ? options.dismissValue : null,
          fallbackActions: [
            {
              id: "cancel",
              label: options.cancelLabel || "Cancel",
              icon: "circle-x",
              variant: "secondary",
              value: hasOwn(options, "dismissValue") ? options.dismissValue : null,
            },
            {
              id: "confirm",
              label: options.confirmLabel || "Select",
              icon: "check",
              variant: "primary",
            },
          ],
          buildBody({ document, body }) {
            const field = document.createElement("label");
            const label = document.createElement("span");
            select = document.createElement("select");
            field.className = "rod-toast__field";
            label.className = "rod-toast__field-label";
            label.textContent = String(options.inputLabel || "Option");
            label.hidden = !options.inputLabel;
            select.className = "rod-toast__select";
            select.multiple = Boolean(options.multiple);
            choices.forEach((choice, index) => {
              const descriptor =
                typeof choice === "object"
                  ? choice
                  : {
                      value: choice,
                      label: choice,
                    };
              const option = document.createElement("option");
              option.value = String(descriptor.value ?? index);
              option.textContent = String(descriptor.label ?? descriptor.value ?? index);
              option.disabled = Boolean(descriptor.disabled);
              option.selected = options.multiple
                ? Array.isArray(options.value) && options.value.map(String).includes(option.value)
                : String(options.value ?? "") === option.value;
              select.appendChild(option);
            });
            field.appendChild(label);
            field.appendChild(select);
            body.appendChild(field);
            return {
              focus() {
                select.focus({ preventScroll: true });
              },
              getValues() {
                const selected = [...select.selectedOptions].map((option) => option.value);
                return { selection: options.multiple ? selected : (selected[0] ?? null) };
              },
            };
          },
          async validate({ action, values }) {
            if (action.id === "cancel") return true;
            if (
              options.required &&
              (values.selection === null || values.selection === void 0 || values.selection.length === 0)
            )
              return options.requiredMessage || "Choose an option.";
            if (typeof options.validate === "function") return options.validate(values.selection);
            return true;
          },
          resolveValue(action, values) {
            if (action.id === "cancel") return action.hasValue ? action.value : null;
            return action.hasValue ? action.value : values.selection;
          },
        });
      }
      function isRichDescriptor(value) {
        return (
          isPlainObject(value) &&
          ["title", "description", "details", "actions", "error", "copyError"].some((key) =>
            hasOwn(value, key),
          )
        );
      }
      function showRichToast(descriptor = {}, forcedType = null) {
        const options = isPlainObject(descriptor) ? { ...descriptor } : { title: String(descriptor ?? "") };
        const type = forcedType || options.type || "default";
        const created = createToastRecord([], {
          ...options,
          type,
          dedupe: options.dedupe ?? false,
        });
        if (!created) return null;
        const controller = created.controller;
        const node = controller.element;
        const content = node.querySelector(".rod-toast__content");
        if (!content) return controller;
        const documentRef = node.ownerDocument;
        node.dataset.rich = "true";
        const render = (next = options) => {
          const root = documentRef.createElement("div");
          const copy = documentRef.createElement("div");
          const title = documentRef.createElement("div");
          const description = documentRef.createElement("div");
          const actionBar = documentRef.createElement("div");
          root.className = "rod-toast__rich";
          copy.className = "rod-toast__rich-copy";
          title.className = "rod-toast__rich-title";
          description.className = "rod-toast__rich-description";
          actionBar.className = "rod-toast__action-bar";
          title.textContent = String(next.title || "");
          title.hidden = !title.textContent;
          description.textContent = String(next.description || "");
          description.hidden = !description.textContent;
          copy.appendChild(title);
          copy.appendChild(description);
          root.appendChild(copy);
          const details = next.details ?? next.error;
          const detailsNode = createDetailsNode(
            documentRef,
            details instanceof Error ? details.stack || details.message : details,
            next.detailsLabel || "Details",
          );
          if (detailsNode) root.appendChild(detailsNode);
          const actions = normalizeActionDescriptors(next.actions, []);
          if (next.copyError !== false && next.error)
            actions.push(
              normalizeActionDescriptors([
                {
                  id: "copy-error",
                  label: next.copyLabel || "Copy error",
                  icon: "copy",
                  variant: "secondary",
                  close: false,
                  successLabel: "Copied",
                  async handle() {
                    return copyText(
                      next.error instanceof Error ? next.error.stack || next.error.message : next.error,
                    );
                  },
                },
              ])[0],
            );
          actions.forEach((action) => {
            const button = documentRef.createElement("button");
            const label = documentRef.createElement("span");
            button.type = "button";
            button.className = "rod-toast__action-button";
            button.dataset.variant = action.variant;
            button.dataset.busy = "false";
            button.disabled = action.disabled;
            if (action.icon) button.appendChild(createSvgIcon(documentRef, action.icon, 14));
            label.textContent = action.label;
            button.appendChild(label);
            button.addEventListener("click", async (event) => {
              event.preventDefault();
              event.stopPropagation();
              if (button.disabled) return;
              button.disabled = true;
              button.dataset.busy = "true";
              const original = label.textContent;
              if (action.loadingLabel) label.textContent = action.loadingLabel;
              try {
                const result = action.handle
                  ? await action.handle({
                      action: action.raw,
                      controller,
                      event,
                      toast,
                      close: (reason = "action") => controller.dismiss(reason),
                      update: (nextDescriptor) =>
                        render({
                          ...next,
                          ...nextDescriptor,
                        }),
                    })
                  : action.hasValue
                    ? action.value
                    : action.id;
                emitEvent("action", {
                  phase: "success",
                  actionId: action.id,
                  action: action.raw,
                  result,
                  controller,
                  scope: options.scope || null,
                });
                if (action.successLabel) label.textContent = action.successLabel;
                if (action.close) controller.dismiss("action");
              } catch (error) {
                emitEvent("action", {
                  phase: "error",
                  actionId: action.id,
                  action: action.raw,
                  error,
                  controller,
                  scope: options.scope || null,
                });
                label.textContent = original;
                button.disabled = false;
                button.dataset.busy = "false";
                showSemanticToast("error", [error]);
              }
              if (!action.close)
                (state.hostWindow || initialHostWindow).setTimeout(
                  () => {
                    label.textContent = original;
                    button.disabled = false;
                    button.dataset.busy = "false";
                  },
                  action.successLabel ? 650 : 0,
                );
            });
            actionBar.appendChild(button);
          });
          if (actions.length) root.appendChild(actionBar);
          content.replaceChildren(root);
        };
        render(options);
        controller.updateRich = (next = {}) => {
          Object.assign(options, next);
          render(options);
          return controller;
        };
        return controller;
      }
      function showSemanticToast(type, inputArgs) {
        const args = [...inputArgs];
        if (args.length === 1 && isRichDescriptor(args[0])) return showRichToast(args[0], type);
        if (args[0] instanceof Error) {
          const error = args[0];
          const tail = args[1] && isOptionsCandidate(args[1]) ? args[1] : {};
          return showRichToast(
            {
              ...tail,
              title: tail.title || error.message || error.name || "Error",
              description: tail.description || error.name || "Error",
              error,
              icon: tail.icon || "circle-x",
              copyError: tail.copyError ?? true,
            },
            type,
          );
        }
        return showToast(args, type);
      }
      function getTaskStorage() {
        const hostWindow = state.hostWindow || initialHostWindow;
        const key = state.config.taskStorage === "localStorage" ? "localStorage" : "sessionStorage";
        return safeCall(() => hostWindow[key], null);
      }
      function getPersistedTaskSnapshots() {
        const storage = getTaskStorage();
        if (!storage) return [];
        return safeCall(() => {
          const parsed = JSON.parse(storage.getItem(state.config.taskStorageKey) || "[]");
          return Array.isArray(parsed) ? parsed : [];
        }, []);
      }
      function persistTaskSnapshots() {
        if (!state.config.persistTasks) return;
        const storage = getTaskStorage();
        if (!storage) return;
        const snapshots = [...state.tasks.values()]
          .filter((task) => task.persist && !task.dismissed)
          .map((task) => task.snapshot())
          .slice(-state.config.maxPersistedTasks);
        safeCall(
          () => {
            storage.setItem(state.config.taskStorageKey, JSON.stringify(snapshots));
          },
          void 0,
        );
      }
      function normalizeTaskStatus(value) {
        return ["queued", "running", "paused", "success", "error", "warning", "cancelled"].includes(value)
          ? value
          : "queued";
      }
      function createTaskController(descriptor = {}) {
        const options = isPlainObject(descriptor) ? { ...descriptor } : { title: String(descriptor ?? "") };
        const id = String(options.id || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const existing = state.tasks.get(id);
        if (existing && !existing.dismissed) return existing;
        const abortController = new AbortController();
        const taskState = {
          id,
          title: String(options.title || "Task"),
          description: String(options.description || ""),
          icon: options.icon || "clock",
          status: normalizeTaskStatus(options.status || "queued"),
          progress: normalizeProgress(options.progress),
          progressLabel: options.progressLabel || null,
          metadata: options.metadata && typeof options.metadata === "object" ? { ...options.metadata } : {},
          scope: options.scope == null ? null : String(options.scope),
          createdAt: Number(options.createdAt) || Date.now(),
          updatedAt: Date.now(),
          restored: Boolean(options.restored),
          orphaned: Boolean(options.orphaned),
        };
        let dismissed = false;
        let paused = taskState.status === "paused";
        const persist = options.persist ?? state.config.persistTasks;
        const toastId = options.toastId || `task:${id}`;
        const task = {
          id,
          persist,
          abortController,
          signal: abortController.signal,
          get status() {
            return taskState.status;
          },
          get progress() {
            return taskState.progress;
          },
          get dismissed() {
            return dismissed;
          },
          get element() {
            return toastController?.element || null;
          },
          snapshot() {
            return {
              id,
              title: taskState.title,
              description: taskState.description,
              icon: taskState.icon,
              status: taskState.status,
              progress: taskState.progress,
              progressLabel: taskState.progressLabel,
              metadata: taskState.metadata,
              scope: taskState.scope,
              createdAt: taskState.createdAt,
              updatedAt: taskState.updatedAt,
              persist,
            };
          },
        };
        const toastController = showLoadingToast([
          {
            id: toastId,
            title: taskState.title,
            description: taskState.description,
            icon: taskState.icon,
            animation: taskState.progress === null ? "spinner" : "progress",
            progress: taskState.progress,
            progressLabel: taskState.progressLabel,
            duration: 0,
            dedupe: false,
            scope: taskState.scope,
            metadata: {
              ...taskState.metadata,
              taskId: id,
            },
            onDismiss({ reason } = {}) {
              dismissed = true;
              state.tasks.delete(id);
              persistTaskSnapshots();
              emitEvent("task:dismiss", {
                task,
                reason,
              });
            },
          },
        ]);
        if (!toastController) return null;
        const node = toastController.element;
        const loadingCopy = node.querySelector(".rod-toast__loading-copy");
        const taskStatus = node.ownerDocument.createElement("div");
        const taskActions = node.ownerDocument.createElement("div");
        taskStatus.className = "rod-toast__task-status";
        taskActions.className = "rod-toast__task-actions";
        loadingCopy?.appendChild(taskStatus);
        loadingCopy?.appendChild(taskActions);
        const renderTaskActions = () => {
          taskActions.replaceChildren();
          const descriptors = [];
          if (options.pausable && ["running", "queued"].includes(taskState.status))
            descriptors.push({
              id: "pause",
              label: "Pause",
              icon: "pause",
            });
          if (options.pausable && taskState.status === "paused")
            descriptors.push({
              id: "resume",
              label: "Resume",
              icon: "play",
            });
          if (options.cancellable && !["success", "error", "cancelled"].includes(taskState.status))
            descriptors.push({
              id: "cancel",
              label: "Cancel",
              icon: "square",
            });
          normalizeActionDescriptors(
            (Array.isArray(options.actions) ? options.actions : []).map((action) => ({
              ...action,
              close: action?.close === true,
            })),
            [],
          ).forEach((action) => descriptors.push(action));
          descriptors.forEach((rawAction) => {
            const action = rawAction.raw ? rawAction : normalizeActionDescriptors([rawAction])[0];
            const button = node.ownerDocument.createElement("button");
            const label = node.ownerDocument.createElement("span");
            button.type = "button";
            button.className = "rod-toast__task-button";
            button.dataset.busy = "false";
            if (action.icon) button.appendChild(createSvgIcon(node.ownerDocument, action.icon, 14));
            label.textContent = action.label;
            button.appendChild(label);
            button.addEventListener("click", async (event) => {
              event.preventDefault();
              event.stopPropagation();
              if (action.id === "pause") return task.pause();
              if (action.id === "resume") return task.resume();
              if (action.id === "cancel") return task.cancel("user");
              button.disabled = true;
              button.dataset.busy = "true";
              try {
                await action.handle?.({
                  task,
                  controller: toastController,
                  event,
                  toast,
                });
                if (action.close) task.dismiss("action");
              } finally {
                button.disabled = false;
                button.dataset.busy = "false";
              }
            });
            taskActions.appendChild(button);
          });
          taskActions.hidden = !taskActions.childElementCount;
        };
        const apply = (next = {}, emit = true) => {
          if (dismissed) return task;
          if (hasOwn(next, "title")) taskState.title = String(next.title || "");
          if (hasOwn(next, "description")) taskState.description = String(next.description || "");
          if (hasOwn(next, "icon")) taskState.icon = next.icon || "circle";
          if (hasOwn(next, "status")) taskState.status = normalizeTaskStatus(next.status);
          if (hasOwn(next, "progress")) taskState.progress = normalizeProgress(next.progress);
          if (hasOwn(next, "progressLabel"))
            taskState.progressLabel = next.progressLabel == null ? null : String(next.progressLabel);
          if (next.metadata && typeof next.metadata === "object")
            taskState.metadata = {
              ...taskState.metadata,
              ...next.metadata,
            };
          taskState.updatedAt = Date.now();
          paused = taskState.status === "paused";
          const semantic = {
            queued: {
              icon: taskState.icon || "clock",
              animation: "pulse",
            },
            running: {
              icon: taskState.icon || "loader-circle",
              animation: taskState.progress === null ? "spinner" : "progress",
            },
            paused: {
              icon: "pause",
              animation: "none",
            },
            warning: {
              icon: "triangle-alert",
              animation: "none",
            },
            cancelled: {
              icon: "square",
              animation: "none",
            },
          }[taskState.status] || {
            icon: taskState.icon,
            animation: "none",
          };
          if (["success", "error"].includes(taskState.status))
            (taskState.status === "success"
              ? toastController.success.bind(toastController)
              : toastController.error.bind(toastController))({
              title: taskState.title,
              description: taskState.description,
              icon: taskState.status === "success" ? "check" : "circle-x",
              duration: Number.isFinite(next.duration)
                ? Number(next.duration)
                : taskState.status === "success"
                  ? state.config.loadingSuccessDuration
                  : state.config.loadingErrorDuration,
            });
          else
            toastController.update({
              title: taskState.title,
              description: taskState.description,
              icon: semantic.icon,
              animation: semantic.animation,
              progress: taskState.progress,
              progressLabel: taskState.progressLabel,
              duration: 0,
            });
          taskStatus.textContent = taskState.status;
          renderTaskActions();
          persistTaskSnapshots();
          if (emit)
            emitEvent("task:update", {
              task,
              snapshot: task.snapshot(),
            });
          return task;
        };
        Object.assign(task, {
          controller: toastController,
          update(next = {}) {
            return apply(next);
          },
          start(next = {}) {
            return apply({
              ...next,
              status: "running",
            });
          },
          setProgress(value, next = {}) {
            return apply({
              ...next,
              status: next.status || "running",
              progress: value,
            });
          },
          async pause() {
            if (dismissed || paused) return task;
            await options.pause?.({
              task,
              signal: task.signal,
            });
            return apply({ status: "paused" });
          },
          async resume() {
            if (dismissed || !paused) return task;
            await options.resume?.({
              task,
              signal: task.signal,
            });
            return apply({ status: "running" });
          },
          async cancel(reason = "cancelled") {
            if (dismissed || ["success", "error", "cancelled"].includes(taskState.status)) return task;
            abortController.abort(reason);
            await options.cancel?.({
              task,
              reason,
            });
            apply({
              status: "cancelled",
              title: options.cancelledTitle || taskState.title,
              description: options.cancelledDescription || "Task cancelled.",
            });
            emitEvent("task:cancel", {
              task,
              reason,
            });
            return task;
          },
          success(next = {}) {
            return apply({
              ...next,
              status: "success",
              progress: 1,
            });
          },
          error(error, next = {}) {
            const details = error instanceof Error ? error.message : String(error || "");
            return apply({
              ...next,
              status: "error",
              description: next.description || details || taskState.description,
            });
          },
          warning(next = {}) {
            return apply({
              ...next,
              status: "warning",
            });
          },
          dismiss(reason = "programmatic", immediate = false) {
            toastController.dismiss(reason, immediate);
            return task;
          },
          async run(executor) {
            task.start();
            try {
              const result = await executor({
                task,
                signal: task.signal,
                progress: (value, next = {}) => task.setProgress(value, next),
                update: (next = {}) => task.update(next),
              });
              task.success();
              return result;
            } catch (error) {
              if (task.signal.aborted) await task.cancel(task.signal.reason || "aborted");
              else task.error(error);
              throw error;
            }
          },
        });
        state.tasks.set(id, task);
        apply(taskState, false);
        persistTaskSnapshots();
        emitEvent("task:create", {
          task,
          snapshot: task.snapshot(),
        });
        return task;
      }
      function resolvePhaseDescriptor(spec, value, fallback = {}) {
        const resolved = typeof spec === "function" ? spec(value) : spec;
        if (resolved === void 0 || resolved === null) return fallback;
        if (typeof resolved === "string")
          return {
            ...fallback,
            description: resolved,
          };
        return {
          ...fallback,
          ...resolved,
        };
      }
      async function showPromiseToast(input, descriptor = {}) {
        const options = isPlainObject(descriptor) ? descriptor : {};
        const task = createTaskController({
          ...resolvePhaseDescriptor(options.loading, null, {
            title: options.title || "Working",
            description: options.description || "Please wait…",
            icon: options.icon || "loader-circle",
          }),
          id: options.id,
          scope: options.scope,
          metadata: options.metadata,
          status: "running",
          cancellable: options.cancellable,
          pausable: options.pausable,
          persist: options.persist,
        });
        try {
          const result =
            typeof input === "function"
              ? await input({
                  task,
                  signal: task.signal,
                  progress: (value, next = {}) => task.setProgress(value, next),
                  update: (next = {}) => task.update(next),
                  toast,
                })
              : await input;
          const success = resolvePhaseDescriptor(options.success, result, {
            title: "Completed",
            description: "The operation completed successfully.",
          });
          task.success(success);
          return result;
        } catch (error) {
          const failure = resolvePhaseDescriptor(options.error, error, {
            title: "Failed",
            description: error?.message || String(error),
          });
          task.error(error, failure);
          throw error;
        }
      }
      async function showUndoToast(descriptor = {}) {
        const options = isPlainObject(descriptor) ? descriptor : {};
        const duration = Number.isFinite(options.duration) ? Number(options.duration) : 6e3;
        const seconds = Math.max(1, Math.ceil(duration / 1e3));
        return showConfirmToast({
          ...options,
          icon: options.icon || "undo",
          duration,
          dismissValue: false,
          countdown: seconds,
          actions: [
            {
              id: "undo",
              label: `${options.actionLabel || "Undo"} · {seconds}s`,
              icon: options.actionIcon || "undo",
              variant: options.variant || "secondary",
              loadingLabel: options.loadingLabel || "Undoing…",
              successLabel: options.successLabel || "Restored",
              async handle(context) {
                await options.undo?.(context);
                return true;
              },
            },
          ],
        });
      }
      async function showRetryToast(descriptor = {}) {
        const options = isPlainObject(descriptor) ? descriptor : {};
        if (typeof options.run !== "function") throw new TypeError("toast.retry() requires a run function.");
        const maxAttempts = Math.max(1, Number(options.maxAttempts) || 3);
        const abortController = new AbortController();
        const task = createTaskController({
          id: options.id,
          title: options.title || "Trying operation",
          description: options.description || "Starting…",
          icon: options.icon || "refresh",
          status: "running",
          scope: options.scope,
          metadata: options.metadata,
          cancellable: true,
          cancel() {
            abortController.abort(new DOMException("Cancelled", "AbortError"));
          },
        });
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          task.update({
            status: "running",
            title: options.title || "Trying operation",
            description: `Attempt ${attempt} of ${maxAttempts}`,
            icon: "refresh",
            progress: null,
          });
          emitEvent("retry:attempt", {
            task,
            attempt,
            maxAttempts,
          });
          try {
            const result = await options.run({
              attempt,
              maxAttempts,
              signal: abortController.signal,
              task,
              progress: (value, next = {}) => task.setProgress(value, next),
            });
            task.success(
              resolvePhaseDescriptor(options.success, result, {
                title: "Completed",
                description: `Succeeded on attempt ${attempt}.`,
              }),
            );
            return result;
          } catch (error) {
            if (abortController.signal.aborted) {
              await task.cancel("cancelled");
              throw error;
            }
            if (attempt >= maxAttempts) {
              task.error(
                error,
                resolvePhaseDescriptor(options.error, error, {
                  title: "All attempts failed",
                  description: error?.message || String(error),
                }),
              );
              throw error;
            }
            const configured = Array.isArray(options.backoff)
              ? options.backoff[Math.min(attempt - 1, options.backoff.length - 1)]
              : typeof options.backoff === "function"
                ? options.backoff(attempt, error)
                : Number(options.backoff) || 1e3 * 2 ** (attempt - 1);
            const delay = Math.max(0, Number(configured) || 0);
            task.update({
              status: "paused",
              title: options.retryTitle || "Retry scheduled",
              description: `Attempt ${attempt} failed. Retrying in ${Math.ceil(delay / 1e3)}s…`,
              icon: "clock",
            });
            if (
              (await showConfirmToast({
                title: options.retryTitle || "Try again?",
                description: error?.message || String(error),
                icon: "refresh",
                duration: delay,
                dismissValue: "retry",
                details: error?.stack || error,
                rejectOnActionError: false,
                actions: [
                  {
                    id: "cancel",
                    label: "Cancel",
                    icon: "circle-x",
                    variant: "secondary",
                    value: "cancel",
                  },
                  {
                    id: "details",
                    label: "View details",
                    icon: "eye",
                    variant: "ghost",
                    keepOpen: true,
                    handle({ update }) {
                      update({ details: error?.stack || error });
                    },
                  },
                  {
                    id: "retry",
                    label: "Retry now",
                    icon: "refresh",
                    variant: "primary",
                    value: "retry",
                  },
                ],
              })) === "cancel"
            ) {
              abortController.abort(new DOMException("Cancelled", "AbortError"));
              await task.cancel("cancelled");
              throw error;
            }
          }
        }
        throw new Error("Retry loop ended unexpectedly.");
      }
      function createTaskGroup(descriptor = {}) {
        const options = isPlainObject(descriptor) ? descriptor : { title: String(descriptor ?? "Group") };
        const id = String(options.id || `group-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const existing = state.groups.get(id);
        if (existing) return existing;
        const children = new Map();
        const weights = new Map(Object.entries(options.weights || {}));
        const parent = createTaskController({
          id: options.parentTaskId || `group:${id}`,
          title: options.title || "Task group",
          description: options.description || "Waiting for tasks…",
          icon: options.icon || "folder",
          status: "queued",
          scope: options.scope,
          metadata: {
            ...(options.metadata || {}),
            groupId: id,
            groupRoot: true,
          },
          persist: options.persist,
        });
        const group = {
          id,
          parent,
          children,
          weights,
          task(keyOrDescriptor, maybeDescriptor = {}) {
            const childOptions =
              typeof keyOrDescriptor === "string"
                ? {
                    ...maybeDescriptor,
                    key: maybeDescriptor.key || keyOrDescriptor,
                    title: maybeDescriptor.title || keyOrDescriptor,
                  }
                : { ...(keyOrDescriptor || {}) };
            const key = String(childOptions.key || childOptions.id || `task-${children.size + 1}`);
            if (children.has(key)) return children.get(key);
            const child = createTaskController({
              ...childOptions,
              id: childOptions.id || `${id}:${key}`,
              scope: childOptions.scope ?? options.scope,
              metadata: {
                ...(childOptions.metadata || {}),
                groupId: id,
                groupKey: key,
              },
              persist: childOptions.persist ?? options.persist,
            });
            children.set(key, child);
            recompute();
            return child;
          },
          setWeights(nextWeights = {}) {
            Object.entries(nextWeights).forEach(([key, value]) => {
              weights.set(String(key), Math.max(0, Number(value) || 0));
            });
            recompute();
            return group;
          },
          recompute,
          dismissAll(reason = "group-dismiss") {
            children.forEach((task) => task.dismiss(reason));
            parent.dismiss(reason);
            group.unsubscribe?.();
            state.groups.delete(id);
          },
          complete(next = {}) {
            parent.success(next);
            group.unsubscribe?.();
            return group;
          },
        };
        function recompute() {
          const entries = [...children.entries()];
          if (!entries.length) {
            parent.update({
              status: "queued",
              progress: null,
            });
            return group;
          }
          let totalWeight = 0;
          let completedWeight = 0;
          let hasUnknownProgress = false;
          let hasError = false;
          let allSuccess = true;
          entries.forEach(([key, task]) => {
            const weight = weights.has(key) ? Number(weights.get(key)) : 1;
            totalWeight += weight;
            if (task.status === "error") hasError = true;
            if (task.status !== "success") allSuccess = false;
            if (task.status === "success") completedWeight += weight;
            else if (task.progress === null) hasUnknownProgress = true;
            else completedWeight += weight * task.progress;
          });
          if (hasError)
            parent.error("One or more child tasks failed.", {
              title: options.errorTitle || "Task group failed",
            });
          else if (allSuccess)
            parent.success({
              title: options.successTitle || options.title || "All tasks completed",
              description: options.successDescription || `${entries.length} tasks completed.`,
            });
          else
            parent.update({
              status: "running",
              title: options.title || "Task group",
              description: `${entries.filter(([, task]) => task.status === "success").length}/${entries.length} tasks completed`,
              progress: hasUnknownProgress || totalWeight <= 0 ? null : completedWeight / totalWeight,
            });
          return group;
        }
        group.unsubscribe = addEventListenerInternal("task:update", ({ task }) => {
          if (task.snapshot().metadata?.groupId === id && task !== parent) recompute();
        });
        state.groups.set(id, group);
        emitEvent("group:create", { group });
        return group;
      }
      function restorePersistedTasks() {
        if (!state.config.persistTasks || state.restoredTasks) return [];
        state.restoredTasks = true;
        const now = Date.now();
        const restored = [];
        getPersistedTaskSnapshots().forEach((snapshot) => {
          if (
            ["success", "error", "cancelled"].includes(snapshot.status) &&
            now - Number(snapshot.updatedAt || 0) > state.config.taskTerminalRetention
          )
            return;
          const status = ["running", "queued"].includes(snapshot.status) ? "paused" : snapshot.status;
          const description = ["running", "queued"].includes(snapshot.status)
            ? `${snapshot.description || ""}${snapshot.description ? " · " : ""}Restored after reload. Resume manually.`
            : snapshot.description;
          const task = createTaskController({
            ...snapshot,
            status,
            description,
            restored: true,
            orphaned: true,
            persist: true,
            pausable: false,
            cancellable: true,
          });
          if (task) restored.push(task);
        });
        emitEvent("tasks:restore", { tasks: restored });
        return restored;
      }
      function createScope(name, defaults = {}) {
        const scopeName = String(name || "default");
        const enrichDescriptor = (descriptor = {}) => ({
          ...defaults,
          ...(isPlainObject(descriptor) ? descriptor : { title: String(descriptor ?? "") }),
          scope: scopeName,
        });
        const withOptions = (inputArgs) => {
          const args = [...inputArgs];
          let trailing = {};
          if (args.length && isOptionsCandidate(args[args.length - 1])) {
            trailing = { ...args.pop() };
            delete trailing[OPTIONS_SYMBOL];
          }
          return [
            ...args,
            toast.options({
              ...defaults,
              ...trailing,
              scope: scopeName,
            }),
          ];
        };
        const semantic = (type, args) => {
          if (args.length === 1 && isRichDescriptor(args[0]))
            return showRichToast(enrichDescriptor(args[0]), type);
          if (args[0] instanceof Error) {
            const trailing = args[1] && isOptionsCandidate(args[1]) ? { ...args[1] } : {};
            return showSemanticToast(type, [
              args[0],
              toast.options({
                ...defaults,
                ...trailing,
                scope: scopeName,
              }),
            ]);
          }
          return showSemanticToast(type, withOptions(args));
        };
        return {
          name: scopeName,
          show: (...args) => toast(...withOptions(args)),
          error: (...args) => semantic("error", args),
          info: (...args) => semantic("info", args),
          success: (...args) => semantic("success", args),
          warning: (...args) => semantic("warning", args),
          loading: (descriptor) => showLoadingToast([enrichDescriptor(descriptor)]),
          confirm: (descriptor) => showConfirmToast(enrichDescriptor(descriptor)),
          prompt: (descriptor) => showPromptToast(enrichDescriptor(descriptor)),
          select: (descriptor) => showSelectToast(enrichDescriptor(descriptor)),
          undo: (descriptor) => showUndoToast(enrichDescriptor(descriptor)),
          task: (descriptor) => createTaskController(enrichDescriptor(descriptor)),
          promise: (input, descriptor) => showPromiseToast(input, enrichDescriptor(descriptor)),
          retry: (descriptor) => showRetryToast(enrichDescriptor(descriptor)),
          group: (descriptor) => createTaskGroup(enrichDescriptor(descriptor)),
          dismissAll(immediate = false) {
            getActiveToastRecords()
              .filter((record) => record.options.scope === scopeName)
              .forEach((record) => record.dismiss(immediate, null, "scope-dismissAll"));
          },
          getTasks() {
            return [...state.tasks.values()].filter((task) => task.snapshot().scope === scopeName);
          },
          minimize: () => setManagerMinimized(true),
          restore: () => setManagerMinimized(false),
        };
      }
      function showDebugToast(inputArgs) {
        const parsed = parseArguments(inputArgs, "debug");
        if (!shouldRenderDebug(parsed.args)) {
          runDownloadFallback(parsed.args);
          return null;
        }
        return showToast(inputArgs, "debug");
      }
      function toast(...args) {
        return showToast(args, null);
      }
      toast.error = (...args) => showSemanticToast("error", args);
      toast.info = (...args) => showSemanticToast("info", args);
      toast.success = (...args) => showSemanticToast("success", args);
      toast.warning = (...args) => showSemanticToast("warning", args);
      toast.message = (descriptor = {}) => showRichToast(descriptor);
      toast.copyError = (error, options = {}) =>
        showRichToast(
          {
            ...options,
            type: "error",
            title: options.title || error?.message || "Error",
            description: options.description || error?.name || "Error",
            error,
            copyError: true,
            icon: options.icon || "circle-x",
          },
          "error",
        );
      toast.loading = (...args) => showLoadingToast(args);
      toast.confirm = (descriptor = {}) => showConfirmToast(descriptor);
      toast.prompt = (descriptor = {}) => showPromptToast(descriptor);
      toast.select = (descriptor = {}) => showSelectToast(descriptor);
      toast.undo = (descriptor = {}) => showUndoToast(descriptor);
      toast.task = (descriptor = {}) => createTaskController(descriptor);
      toast.promise = (input, descriptor = {}) => showPromiseToast(input, descriptor);
      toast.retry = (descriptor = {}) => showRetryToast(descriptor);
      toast.group = (descriptor = {}) => createTaskGroup(descriptor);
      toast.scope = (name, defaults = {}) => createScope(name, defaults);
      toast.debug = (...args) => showDebugToast(args);
      toast.inspect = (...args) => showDebugToast(args);
      toast.options = (options = {}) => {
        const normalized = { ...options };
        Object.defineProperty(normalized, OPTIONS_SYMBOL, {
          value: true,
          enumerable: false,
        });
        return normalized;
      };
      toast.with = (options = {}) => {
        const markedOptions = toast.options(options);
        return (...args) => toast(...args, markedOptions);
      };
      toast.update = (id, ...inputArgs) => {
        const record = state.recordsById.get(String(id));
        if (!record || record.removed) return null;
        record.lastSeenAt = Date.now();
        if (record.options.loading) return record.updateLoading(inputArgs);
        const parsed = parseArguments(inputArgs, null);
        return record.update(parsed.args, parsed.options);
      };
      toast.progress = (id, value, next = {}) => {
        const record = state.recordsById.get(String(id));
        if (!record || record.removed || !record.options.loading) return null;
        return record.updateLoading([
          {
            ...next,
            progress: value,
            animation: next.animation || record.options.animation || "progress",
          },
        ]);
      };
      toast.resolve = (id, type = "success", ...inputArgs) => {
        const record = state.recordsById.get(String(id));
        if (!record || record.removed || !record.options.loading) return null;
        const normalizedType = ["success", "error", "info", "warning"].includes(type) ? type : "success";
        return record.settleLoading(normalizedType, inputArgs);
      };
      toast.dismiss = (target, reason = "programmatic", immediate = false) => {
        if (target && typeof target.dismiss === "function") {
          target.dismiss(reason, immediate);
          return true;
        }
        if (target !== void 0 && target !== null) {
          const record = state.recordsById.get(String(target));
          if (record && !record.removed) {
            record.dismiss(Boolean(immediate), null, String(reason || "programmatic"));
            return true;
          }
        }
        return false;
      };
      toast.dismissAll = (immediate = false) => {
        const records = [...getActiveToastRecords()].reverse();
        for (let index = 0; index < records.length; index += 1) {
          const record = records[index];
          if (immediate) {
            record.dismiss(true, null, "dismissAll");
            continue;
          }
          (state.hostWindow || initialHostWindow).setTimeout(() => {
            record.dismiss(false, null, "dismissAll");
          }, index * 28);
        }
      };
      toast.on = (eventName, listener) => addEventListenerInternal(eventName, listener);
      toast.off = (eventName, listener) => {
        const bucket = state.listeners.get(String(eventName || "*"));
        if (!bucket) return false;
        const removed = bucket.delete(listener);
        if (!bucket.size) state.listeners.delete(String(eventName || "*"));
        return removed;
      };
      toast.once = (eventName, listener) => {
        const unsubscribe = addEventListenerInternal(eventName, (event) => {
          unsubscribe();
          listener(event);
        });
        return unsubscribe;
      };
      toast.emit = (eventName, payload = {}) => emitEvent(eventName, payload);
      toast.getTasks = () => [...state.tasks.values()];
      toast.getTask = (id) => state.tasks.get(String(id)) || null;
      toast.restoreTasks = () => restorePersistedTasks();
      toast.clearPersistedTasks = () => {
        const storage = getTaskStorage();
        safeCall(() => storage?.removeItem(state.config.taskStorageKey), void 0);
        state.restoredTasks = false;
      };
      toast.expand = () => {
        setManagerMinimized(false);
        return setStackExpanded(true);
      };
      toast.collapse = () => setStackExpanded(false);
      toast.minimize = () => setManagerMinimized(true);
      toast.restore = () => setManagerMinimized(false);
      toast.toggleMinimized = () => {
        return setManagerMinimized(!state.managerMinimized);
      };
      toast.isMinimized = () => Boolean(state.managerMinimized);
      toast.toggleStack = () => {
        setStackExpanded(!state.stackExpanded);
        return state.stackExpanded;
      };
      toast.loadInspector = () => loadObjectInspector();
      toast.configure = (nextConfig = {}) => {
        const allowedPositions = new Set([
          "top-center",
          "top-left",
          "top-right",
          "bottom-center",
          "bottom-left",
          "bottom-right",
        ]);
        for (const key of Object.keys(DEFAULT_CONFIG))
          if (hasOwn(nextConfig, key)) state.config[key] = nextConfig[key];
        state.config.maxToasts = Math.max(1, Number(state.config.maxToasts) || DEFAULT_CONFIG.maxToasts);
        state.config.inspectDepth = Math.max(0, Number(state.config.inspectDepth) || 0);
        state.config.inspectItems = Math.max(0, Number(state.config.inspectItems) || 0);
        state.config.previewItems = Math.max(0, Number(state.config.previewItems) || 0);
        state.config.stackVisible = Math.min(
          3,
          Math.max(1, Number(state.config.stackVisible) || DEFAULT_CONFIG.stackVisible),
        );
        state.config.stackMaxHeight = Math.max(
          180,
          Number(state.config.stackMaxHeight) || DEFAULT_CONFIG.stackMaxHeight,
        );
        state.config.stackViewportRatio = clamp(
          Number(state.config.stackViewportRatio) || DEFAULT_CONFIG.stackViewportRatio,
          0.2,
          0.8,
        );
        state.config.swipeThreshold = Math.max(
          24,
          Number(state.config.swipeThreshold) || DEFAULT_CONFIG.swipeThreshold,
        );
        state.config.swipeVelocity = Math.max(
          0.05,
          Number(state.config.swipeVelocity) || DEFAULT_CONFIG.swipeVelocity,
        );
        state.config.objectInspectorLoadTimeout = Math.max(
          1e3,
          Number(state.config.objectInspectorLoadTimeout) || DEFAULT_CONFIG.objectInspectorLoadTimeout,
        );
        state.config.virtualizeAfter = Math.max(
          1,
          Number(state.config.virtualizeAfter) || DEFAULT_CONFIG.virtualizeAfter,
        );
        state.config.virtualRowHeight = Math.max(
          16,
          Number(state.config.virtualRowHeight) || DEFAULT_CONFIG.virtualRowHeight,
        );
        state.config.virtualOverscan = Math.max(
          1,
          Number(state.config.virtualOverscan) || DEFAULT_CONFIG.virtualOverscan,
        );
        state.config.virtualMaxHeight = Math.max(
          120,
          Number(state.config.virtualMaxHeight) || DEFAULT_CONFIG.virtualMaxHeight,
        );
        state.config.stacked = Boolean(state.config.stacked);
        state.config.stackToolbar = Boolean(state.config.stackToolbar);
        state.config.persistAcrossSpaNavigation = Boolean(state.config.persistAcrossSpaNavigation);
        state.config.minimizeOnSpaNavigation = Boolean(state.config.minimizeOnSpaNavigation);
        state.config.persistTasks = Boolean(state.config.persistTasks);
        state.config.restoreTasksOnLoad = Boolean(state.config.restoreTasksOnLoad);
        state.config.taskStorage =
          state.config.taskStorage === "localStorage" ? "localStorage" : "sessionStorage";
        state.config.taskStorageKey = String(state.config.taskStorageKey || DEFAULT_CONFIG.taskStorageKey);
        state.config.maxPersistedTasks = Math.max(
          1,
          Number(state.config.maxPersistedTasks) || DEFAULT_CONFIG.maxPersistedTasks,
        );
        state.config.taskTerminalRetention = Number.isFinite(Number(state.config.taskTerminalRetention))
          ? Math.max(0, Number(state.config.taskTerminalRetention))
          : DEFAULT_CONFIG.taskTerminalRetention;
        state.config.successExitAnimation = Boolean(state.config.successExitAnimation);
        state.config.successCollapseDuration = Math.max(
          120,
          Number(state.config.successCollapseDuration) || DEFAULT_CONFIG.successCollapseDuration,
        );
        state.config.successExitDuration = Math.max(
          80,
          Number(state.config.successExitDuration) || DEFAULT_CONFIG.successExitDuration,
        );
        state.config.loadingDuration = Number.isFinite(Number(state.config.loadingDuration))
          ? Number(state.config.loadingDuration)
          : DEFAULT_CONFIG.loadingDuration;
        state.config.loadingAnimation = normalizeLoadingAnimation(state.config.loadingAnimation);
        state.config.loadingIcon =
          state.config.loadingIcon === false || state.config.loadingIcon === null
            ? false
            : state.config.loadingIcon || DEFAULT_CONFIG.loadingIcon;
        state.config.loadingSuccessDuration = Math.max(
          0,
          Number(state.config.loadingSuccessDuration) || DEFAULT_CONFIG.loadingSuccessDuration,
        );
        state.config.loadingErrorDuration = Math.max(
          0,
          Number(state.config.loadingErrorDuration) || DEFAULT_CONFIG.loadingErrorDuration,
        );
        state.config.loadingInfoDuration = Math.max(
          0,
          Number(state.config.loadingInfoDuration) || DEFAULT_CONFIG.loadingInfoDuration,
        );
        state.config.loadingWarningDuration = Math.max(
          0,
          Number(state.config.loadingWarningDuration) || DEFAULT_CONFIG.loadingWarningDuration,
        );
        state.config.coalescePersistent = Boolean(state.config.coalescePersistent);
        state.config.swipeToDismiss = Boolean(state.config.swipeToDismiss);
        state.config.virtualizeInspector = Boolean(state.config.virtualizeInspector);
        state.config.unmountInspectorOnCollapse = Boolean(state.config.unmountInspectorOnCollapse);
        state.config.useShadowRoot = Boolean(state.config.useShadowRoot);
        state.config.fallbackToLightDom = Boolean(state.config.fallbackToLightDom);
        state.config.shadowRootMode = state.config.shadowRootMode === "open" ? "open" : "closed";
        if (!allowedPositions.has(state.config.position)) state.config.position = DEFAULT_CONFIG.position;
        if (typeof state.config.shouldDebug !== "boolean" && typeof state.config.shouldDebug !== "function")
          state.config.shouldDebug = DEFAULT_CONFIG.shouldDebug;
        if (state.config.downloadFallback !== null && typeof state.config.downloadFallback !== "function")
          state.config.downloadFallback = DEFAULT_CONFIG.downloadFallback;
        if (state.config.objectInspectorSrc !== null && typeof state.config.objectInspectorSrc !== "string")
          state.config.objectInspectorSrc = DEFAULT_CONFIG.objectInspectorSrc;
        if (!state.config.persistAcrossSpaNavigation && state.spaCleanup) state.spaCleanup();
        else if (state.config.persistAcrossSpaNavigation && state.hostWindow && state.hostDocument)
          installSpaPersistence(state.hostWindow, state.hostDocument);
        if (state.container) {
          state.container.dataset.position = state.config.position;
          syncStackLayout();
        }
        return { ...state.config };
      };
      toast.getConfig = () => ({ ...state.config });
      toast.getHostMode = () => state.hostMode;
      toast.repairHost = () => {
        scheduleHostRepair();
        return state.hostElement;
      };
      toast.version = VERSION;
      Object.defineProperty(toast, "objectInspector", {
        configurable: true,
        enumerable: true,
        get() {
          return getObjectInspectorApi();
        },
      });
      state.api = toast;
      try {
        Object.defineProperty(initialHostWindow, TOAST_GLOBAL, {
          value: toast,
          configurable: true,
          writable: true,
        });
      } catch {
        initialHostWindow[TOAST_GLOBAL] = toast;
      }
      globalWindow[TOAST_GLOBAL] = toast;
      globalWindow.toast = toast;
      if (state.config.restoreTasksOnLoad)
        (initialHostWindow.setTimeout || globalWindow.setTimeout)(() => {
          safeCall(() => restorePersistedTasks(), void 0);
        }, 0);
    })(window);

    (function installRodMenu(rootWindow) {
      "use strict";
      const VERSION = "2.3.0";
      const GLOBAL_NAME = "RodMenu";
      const ROOT_ATTR = "data-rod-menu-host";
      const ACTIVE_ATTR = "data-rod-menu-active";
      const ID_PREFIX = "rod-menu";
      const DEFAULT_Z_INDEX = 2147482500;
      const STYLE_VERSION = "v2.3.0";
      const defaultDependencyUrls = {
        elements: [
          "https://rod.migos.club/elements/dist/elements.js",
          "https://rod.migos.club/elements/elements.js",
          "https://raw.githubusercontent.com/rodkisten/rodkisten.github.io/master/elements/elements.js",
        ],
        toaster: [
          "https://rod.migos.club/userscripts/toaster.js?v=4.7.0",
          "https://rod.migos.club/userscripts/toaster.js",
        ],
        cipo: ["https://rod.migos.club/bundler/cipo.iife.js"],
        broto: ["https://rod.migos.club/bundler/broto.iife.js"],
      };
      const defaultGestureConfig = {
        preventPullToRefresh: true,
        dragFromContent: true,
        dismissThresholdPx: 140,
        dismissThresholdRatio: 0.22,
        velocityThresholdPxMs: 0.9,
        activationDistancePx: 7,
        contentDragActivationPx: 22,
        velocityMinDragPx: 64,
        minDismissDistancePx: 96,
      };
      const defaultStackConfig = {
        enabled: true,
        maxVisible: 3,
        offsetPx: 12,
        scaleStep: 0.018,
        backdropClick: "previous",
      };
      const defaultKeyboardConfig = {
        visualViewport: true,
        preserveFocusOnHydrate: true,
        keepFocusedFieldVisible: true,
        focusScrollPaddingPx: 16,
        autoFocus: "desktop",
      };
      const defaultConfig = {
        shadowRoot: true,
        defaultPresentation: "bottom-sheet",
        zIndex: DEFAULT_Z_INDEX,
        autoLoadDependencies: false,
        dependencyTimeoutMs: 8e3,
        dependencyUrls: defaultDependencyUrls,
        toasterErrors: true,
        stack: defaultStackConfig,
        gestures: defaultGestureConfig,
        keyboard: defaultKeyboardConfig,
        scrollIsolation: true,
        defaultSchema: {},
        theme: {},
        css: "",
        components: {},
        fieldTypes: {},
        refreshActiveOnConfigure: true,
      };
      let globalConfig = {
        ...defaultConfig,
        dependencyUrls: { ...defaultDependencyUrls },
        stack: { ...defaultStackConfig },
        gestures: { ...defaultGestureConfig },
        keyboard: { ...defaultKeyboardConfig },
        defaultSchema: {},
        theme: {},
        components: {},
        fieldTypes: {},
      };
      let counter = 0;
      const activeHandles = new Map();
      const surfaceStackByDocument = new WeakMap();
      function getSurfaceStack(doc) {
        const current = surfaceStackByDocument.get(doc) || [];
        const live = current.filter((surface) => !surface.isDestroyedForStack());
        if (live.length !== current.length) surfaceStackByDocument.set(doc, live);
        return live;
      }
      function refreshSurfaceStack(doc) {
        const stack = getSurfaceStack(doc);
        const total = stack.length;
        stack.forEach((surface, index) => surface.applyStackState(index, total));
      }
      function registerSurfaceInStack(surface) {
        const stack = getSurfaceStack(surface.doc).filter((item) => item !== surface);
        stack.push(surface);
        surfaceStackByDocument.set(surface.doc, stack);
        refreshSurfaceStack(surface.doc);
      }
      function unregisterSurfaceFromStack(surface) {
        const stack = getSurfaceStack(surface.doc).filter((item) => item !== surface);
        if (stack.length) surfaceStackByDocument.set(surface.doc, stack);
        else surfaceStackByDocument.delete(surface.doc);
        refreshSurfaceStack(surface.doc);
      }
      function isTopStackSurface(surface) {
        const stack = getSurfaceStack(surface.doc);
        return stack.length === 0 || stack[stack.length - 1] === surface;
      }
      function activateStackSurface(surface) {
        const stack = getSurfaceStack(surface.doc);
        const index = stack.indexOf(surface);
        if (index < 0) return false;
        if (index !== stack.length - 1) {
          stack.splice(index, 1);
          stack.push(surface);
          surfaceStackByDocument.set(surface.doc, stack);
          refreshSurfaceStack(surface.doc);
        }
        surface.focusFromStack();
        return true;
      }
      function activatePreviousStackSurface(surface) {
        const stack = getSurfaceStack(surface.doc);
        const index = stack.indexOf(surface);
        if (index <= 0) return false;
        return activateStackSurface(stack[index - 1]);
      }
      const registeredComponents = new Map();
      const registeredFieldTypes = new Map();
      const docState = new WeakMap();
      const runtimeStatus = {
        elements: {
          name: "elements",
          state: "fallback",
        },
        toaster: {
          name: "toaster",
          state: "fallback",
        },
        cipo: {
          name: "cipo",
          state: "fallback",
        },
        broto: {
          name: "broto",
          state: "fallback",
        },
      };
      const dependencyPromises = new Map();
      const elementFacadeByDocument = new WeakMap();
      function getRealmCandidates() {
        const candidates = [];
        const add = (value) => {
          if (!value || (typeof value !== "object" && typeof value !== "function")) return;
          const realm = value;
          if (!candidates.includes(realm)) candidates.push(realm);
        };
        add(globalThis);
        add(rootWindow);
        try {
          if (typeof unsafeWindow !== "undefined") add(unsafeWindow);
          else add(globalThis["unsafeWindow"]);
        } catch {}
        try {
          add(rootWindow.parent);
        } catch {}
        try {
          add(rootWindow.top);
        } catch {}
        try {
          add(rootWindow.opener);
        } catch {}
        return candidates;
      }
      function readGlobal(names) {
        for (const realm of getRealmCandidates())
          for (const name of names)
            try {
              const value = realm[name];
              if (value != null) return value;
            } catch {}
        return null;
      }
      function resolveRodElements() {
        const runtime = readGlobal(["RodElements"]);
        return runtime && typeof runtime.el === "function" ? runtime : null;
      }
      function resolveCipo() {
        const runtime = readGlobal(["Cipo", "CIPO"]);
        return runtime && typeof runtime === "object" ? runtime : null;
      }
      function resolveBroto() {
        const runtime = readGlobal(["Broto", "broto"]);
        return runtime && typeof runtime.store === "function" ? runtime : null;
      }
      function resolveToaster() {
        const runtime = readGlobal(["RodToaster", "toast"]);
        return (runtime && typeof runtime === "object") || typeof runtime === "function" ? runtime : null;
      }
      function markDependency(name, state, source, error) {
        runtimeStatus[name] = {
          name,
          state,
          source,
          error: error == null ? void 0 : error instanceof Error ? error.message : String(error),
        };
      }
      function dependencyPresent(name) {
        switch (name) {
          case "elements":
            return resolveRodElements();
          case "toaster":
            return resolveToaster();
          case "cipo":
            return resolveCipo();
          case "broto":
            return resolveBroto();
        }
      }
      function waitForDependency(name, timeoutMs) {
        const startedAt = Date.now();
        return new Promise((resolve) => {
          const tick = () => {
            const existing = dependencyPresent(name);
            if (existing) {
              resolve(existing);
              return;
            }
            if (Date.now() - startedAt >= timeoutMs) {
              resolve(null);
              return;
            }
            rootWindow.setTimeout(tick, 32);
          };
          tick();
        });
      }
      function injectScriptTag(url) {
        return new Promise((resolve) => {
          const doc = resolveDocument();
          const script = doc.createElement("script");
          script.src = url;
          script.async = true;
          script.crossOrigin = "anonymous";
          script.dataset.rodMenuDependency = "true";
          let settled = false;
          const timer = rootWindow.setTimeout(() => done(false), globalConfig.dependencyTimeoutMs);
          const done = (ok) => {
            if (settled) return;
            settled = true;
            rootWindow.clearTimeout(timer);
            script.onload = null;
            script.onerror = null;
            if (!ok) script.remove();
            resolve(ok);
          };
          script.onload = () => done(true);
          script.onerror = () => done(false);
          (doc.head || doc.documentElement).append(script);
        });
      }
      async function tryGmAddElement(url) {
        const gmAdd = typeof GM_addElement === "function" ? GM_addElement : readGlobal(["GM_addElement"]);
        if (typeof gmAdd !== "function") return false;
        try {
          gmAdd("script", {
            src: url,
            type: "text/javascript",
          });
          return true;
        } catch {
          return false;
        }
      }
      function requestScriptText(url) {
        const direct =
          typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : readGlobal(["GM_xmlhttpRequest"]);
        if (typeof direct === "function")
          return new Promise((resolve) => {
            try {
              direct({
                method: "GET",
                url,
                timeout: globalConfig.dependencyTimeoutMs,
                onload: (response) => {
                  const text = response?.responseText;
                  resolve(typeof text === "string" ? text : null);
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null),
              });
            } catch {
              resolve(null);
            }
          });
        const gm = typeof GM !== "undefined" ? GM : readGlobal(["GM"]);
        if (gm && typeof gm.xmlHttpRequest === "function")
          return gm
            .xmlHttpRequest({
              method: "GET",
              url,
              timeout: globalConfig.dependencyTimeoutMs,
            })
            .then((response) => {
              const text = response?.responseText;
              return typeof text === "string" ? text : null;
            })
            .catch(() => null);
        return Promise.resolve(null);
      }
      function executeScriptText(source) {
        const target = (() => {
          try {
            const unsafe = typeof unsafeWindow !== "undefined" ? unsafeWindow : globalThis["unsafeWindow"];
            if (unsafe && typeof unsafe === "object") return unsafe;
          } catch {}
          return rootWindow;
        })();
        try {
          const doc = target.document;
          const script = doc.createElement("script");
          script.textContent = `${source}\n//# sourceURL=rod-menu-dependency.js`;
          (doc.head || doc.documentElement).append(script);
          script.remove();
          return true;
        } catch {}
        try {
          const Executor = target.Function;
          Executor(`${source}\n//# sourceURL=rod-menu-dependency.js`).call(target);
          return true;
        } catch {}
        return false;
      }
      async function tryDynamicImport(url) {
        try {
          await new Function("url", "return import(url)")(url);
          return true;
        } catch {
          return false;
        }
      }
      async function tryRequire(url) {
        const req = typeof require === "function" ? require : readGlobal(["require"]);
        if (typeof req !== "function") return false;
        try {
          const result = req(url);
          if (result && typeof result.then === "function") await result;
          return true;
        } catch {}
        try {
          await new Promise((resolve, reject) => {
            req(
              [url],
              () => resolve(),
              (error) => reject(error),
            );
          });
          return true;
        } catch {
          return false;
        }
      }
      async function loadDependency(name) {
        const existing = dependencyPresent(name);
        if (existing) {
          markDependency(name, "native", "window");
          return existing;
        }
        const pending = dependencyPromises.get(name);
        if (pending) return pending;
        const promise = (async () => {
          markDependency(name, "loading");
          const urls = globalConfig.dependencyUrls[name];
          let lastError = null;
          for (const url of urls)
            try {
              if (await injectScriptTag(url)) {
                const loaded = await waitForDependency(name, 500);
                if (loaded) {
                  markDependency(name, "loaded", `script:${url}`);
                  return loaded;
                }
              }
              if (await tryGmAddElement(url)) {
                const loaded = await waitForDependency(name, 700);
                if (loaded) {
                  markDependency(name, "loaded", `GM_addElement:${url}`);
                  return loaded;
                }
              }
              const source = await requestScriptText(url);
              if (source && executeScriptText(source)) {
                const loaded = await waitForDependency(name, 150);
                if (loaded) {
                  markDependency(name, "loaded", `GM_xhr:${url}`);
                  return loaded;
                }
              }
              if (await tryDynamicImport(url)) {
                const loaded = await waitForDependency(name, 250);
                if (loaded) {
                  markDependency(name, "loaded", `import:${url}`);
                  return loaded;
                }
              }
              if (await tryRequire(url)) {
                const loaded = await waitForDependency(name, 250);
                if (loaded) {
                  markDependency(name, "loaded", `require:${url}`);
                  return loaded;
                }
              }
            } catch (error) {
              lastError = error;
            }
          markDependency(name, "fallback", void 0, lastError);
          return null;
        })();
        dependencyPromises.set(name, promise);
        return promise.finally(() => dependencyPromises.delete(name));
      }
      async function loadDependencies() {
        await loadDependency("cipo");
        await Promise.allSettled([
          loadDependency("elements"),
          loadDependency("broto"),
          loadDependency("toaster"),
        ]);
        return {
          elements: { ...runtimeStatus.elements },
          toaster: { ...runtimeStatus.toaster },
          cipo: { ...runtimeStatus.cipo },
          broto: { ...runtimeStatus.broto },
        };
      }
      function createElement(doc, tag) {
        const elements = resolveRodElements();
        if (elements)
          try {
            try {
              elements.configure?.({
                document: doc,
                cipo: resolveCipo(),
              });
            } catch {}
            let facade = elementFacadeByDocument.get(doc);
            if (!facade) {
              facade = elements;
              elementFacadeByDocument.set(doc, facade);
            }
            const node = facade.el(tag, { $document: doc });
            if (node && node.ownerDocument === doc) return node;
          } catch {}
        return doc.createElement(tag);
      }
      function artifactCssText(value) {
        if (typeof value === "string") return value;
        if (!value || typeof value !== "object") return "";
        const record = value;
        for (const key of ["cssText", "css", "text", "code", "compiled", "value"]) {
          const candidate = record[key];
          if (typeof candidate === "string" && candidate.includes("{")) return candidate;
        }
        try {
          const stringified = String(value);
          return stringified !== "[object Object]" && stringified.includes("{") ? stringified : "";
        } catch {
          return "";
        }
      }
      function compileStylesheet(source) {
        const cipo = resolveCipo();
        if (!cipo) return source;
        try {
          const tag = cipo.sheet?.css;
          if (typeof tag === "function") {
            const cooked = [source];
            Object.defineProperty(cooked, "raw", { value: [source] });
            const cssText = artifactCssText(tag.call(cipo.sheet, cooked));
            if (cssText) return cssText;
          }
        } catch {}
        for (const compiler of [cipo.compileCss, cipo.compile]) {
          if (typeof compiler !== "function") continue;
          try {
            const cssText = artifactCssText(compiler.call(cipo, source, { mode: "sheet" }));
            if (cssText) return cssText;
          } catch {}
        }
        return source;
      }
      function setBrotoLeaf(store, name, value) {
        if (!store || typeof store !== "object") return false;
        const leaf = store[name];
        if (leaf && typeof leaf.set === "function") {
          leaf.set(value);
          return true;
        }
        return false;
      }
      function createReactiveStore(initial) {
        let snapshot = { ...initial };
        const broto = resolveBroto();
        let brotoStore = null;
        if (broto?.store)
          try {
            brotoStore = broto.store({ ...snapshot });
          } catch {}
        const run = (fn) => {
          if (broto?.batch)
            try {
              broto.batch(fn);
              return;
            } catch {}
          fn();
        };
        return {
          backend: brotoStore ? "broto" : "fallback",
          snapshot: () => snapshot,
          replace(next) {
            snapshot = { ...next };
            if (brotoStore)
              run(() => {
                for (const [name, value] of Object.entries(snapshot)) setBrotoLeaf(brotoStore, name, value);
              });
          },
          set(name, value) {
            snapshot[name] = value;
            if (brotoStore)
              run(() => {
                setBrotoLeaf(brotoStore, name, value);
              });
          },
          patch(values) {
            Object.assign(snapshot, values);
            if (brotoStore)
              run(() => {
                for (const [name, value] of Object.entries(values)) setBrotoLeaf(brotoStore, name, value);
              });
          },
        };
      }
      function getStorageAdapter(storage, win) {
        if (storage && typeof storage === "object") return storage;
        const kind = storage || "local";
        if (kind === "local" || kind === "session") {
          const nativeStorage = (() => {
            try {
              return kind === "local" ? win.localStorage : win.sessionStorage;
            } catch {
              return null;
            }
          })();
          if (!nativeStorage) return null;
          return {
            getItem(key) {
              try {
                return nativeStorage.getItem(key);
              } catch {
                return null;
              }
            },
            setItem(key, value) {
              try {
                nativeStorage.setItem(key, value);
              } catch {}
            },
            removeItem(key) {
              try {
                nativeStorage.removeItem(key);
              } catch {}
            },
          };
        }
        if (kind === "gm") {
          const legacyGet = typeof GM_getValue === "function" ? GM_getValue : readGlobal(["GM_getValue"]);
          const legacySet = typeof GM_setValue === "function" ? GM_setValue : readGlobal(["GM_setValue"]);
          const legacyDelete =
            typeof GM_deleteValue === "function" ? GM_deleteValue : readGlobal(["GM_deleteValue"]);
          const gmApi = typeof GM !== "undefined" ? GM : readGlobal(["GM"]);
          if ((!legacyGet || !legacySet) && (!gmApi?.getValue || !gmApi?.setValue)) return null;
          return {
            async getItem(key) {
              try {
                const value = gmApi?.getValue ? await gmApi.getValue(key, null) : legacyGet?.(key, null);
                return value == null ? null : String(value);
              } catch {
                return null;
              }
            },
            async setItem(key, value) {
              try {
                if (gmApi?.setValue) await gmApi.setValue(key, value);
                else legacySet?.(key, value);
              } catch {}
            },
            async removeItem(key) {
              try {
                if (gmApi?.deleteValue) await gmApi.deleteValue(key);
                else legacyDelete?.(key);
              } catch {}
            },
          };
        }
        return null;
      }
      function createPersistenceManager(store, storeConfig, id, win, onHydrated, onError) {
        const raw = storeConfig?.persist;
        const config =
          raw === true
            ? {
                key: `rod-menu:${id}`,
                storage: "local",
                hydrate: true,
                debounceMs: 120,
                persistOn: "change",
              }
            : raw && typeof raw === "object"
              ? raw
              : null;
        let persistenceState = config ? "idle" : "disabled";
        let timer = 0;
        let chain = Promise.resolve();
        let started = false;
        let resolveReady;
        const ready = new Promise((resolve) => {
          resolveReady = resolve;
        });
        const key = config?.key || `rod-menu:${id}`;
        const adapter = config ? getStorageAdapter(config.storage, win) : null;
        const persistOn = new Set(
          Array.isArray(config?.persistOn) ? config.persistOn : [config?.persistOn || "change"],
        );
        const parseStored = async (rawValue) => {
          if (!config) return null;
          const transform = config.transform;
          let stored;
          if (transform?.deserialize) stored = await transform.deserialize(rawValue);
          else {
            const parsed = JSON.parse(rawValue);
            if (parsed && typeof parsed === "object" && "__rodMenu" in parsed) {
              const envelope = parsed;
              if (config.version != null && envelope.version !== config.version) return null;
              stored = envelope.data;
            } else stored = parsed;
          }
          if (transform?.fromStorage) return (await transform.fromStorage(stored)) ?? null;
          return stored && typeof stored === "object" ? stored : null;
        };
        const serializeSnapshot = async () => {
          if (!config) return "";
          const transform = config.transform;
          const snapshot = store.snapshot();
          const stored = transform?.toStorage ? await transform.toStorage(snapshot) : snapshot;
          if (transform?.serialize) return await transform.serialize(stored);
          return JSON.stringify({
            __rodMenu: 1,
            version: config.version ?? 1,
            data: stored,
          });
        };
        const hydrate = async () => {
          if (!config || !adapter || config.hydrate === false) return;
          persistenceState = "hydrating";
          try {
            const storedRaw = await adapter.getItem(key);
            if (storedRaw == null) {
              persistenceState = "ready";
              return;
            }
            const persisted = await parseStored(storedRaw);
            if (!persisted) {
              persistenceState = "ready";
              return;
            }
            const initial = store.snapshot();
            let next;
            if (typeof config.merge === "function") next = config.merge(initial, persisted);
            else if (config.merge === "initial-over-persisted")
              next = {
                ...persisted,
                ...initial,
              };
            else
              next = {
                ...initial,
                ...persisted,
              };
            store.replace(next);
            onHydrated(store.snapshot());
            persistenceState = "ready";
          } catch (error) {
            persistenceState = "error";
            onError(error);
          }
        };
        const persist = async () => {
          if (!config || !adapter) return;
          if (timer) {
            win.clearTimeout(timer);
            timer = 0;
          }
          persistenceState = "saving";
          try {
            const serialized = await serializeSnapshot();
            await adapter.setItem(key, serialized);
            persistenceState = "ready";
          } catch (error) {
            persistenceState = "error";
            onError(error);
          }
        };
        const enqueuePersist = () => {
          chain = chain.then(persist, persist);
          return chain;
        };
        const schedule = () => {
          if (!config || !adapter) return;
          const delay = Math.max(0, config.debounceMs ?? 120);
          if (timer) win.clearTimeout(timer);
          if (delay === 0) {
            enqueuePersist();
            return;
          }
          timer = win.setTimeout(() => {
            timer = 0;
            enqueuePersist();
          }, delay);
        };
        return {
          handle: {
            get backend() {
              return store.backend;
            },
            get persistence() {
              return persistenceState;
            },
            ready,
            snapshot: () => store.snapshot(),
            persist: enqueuePersist,
            hydrate,
            async clearPersisted() {
              if (!adapter) return;
              if (timer) {
                win.clearTimeout(timer);
                timer = 0;
              }
              try {
                await adapter.removeItem(key);
                persistenceState = "ready";
              } catch (error) {
                persistenceState = "error";
                onError(error);
              }
            },
          },
          start() {
            if (started) return;
            started = true;
            hydrate().finally(resolveReady);
            if (!config || !adapter || config.hydrate === false) resolveReady();
          },
          trigger(trigger) {
            if (!persistOn.has(trigger)) return;
            if (trigger === "change") schedule();
            else enqueuePersist();
          },
        };
      }
      function notifyToaster(kind, title, description) {
        const toaster = resolveToaster();
        const method = toaster?.[kind];
        if (typeof method !== "function") return false;
        try {
          method.call(toaster, {
            title,
            description,
          });
          return true;
        } catch {
          try {
            method.call(toaster, title, description);
            return true;
          } catch {}
        }
        return false;
      }
      const css = String.raw`
:host, .rm-host {
  all: initial;
  color-scheme: light dark;
  --rm-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
  --rm-bg: color-mix(in srgb, Canvas 94%, transparent);
  --rm-panel: color-mix(in srgb, Canvas 98%, transparent);
  --rm-elevated: color-mix(in srgb, Canvas 92%, CanvasText 8%);
  --rm-text: CanvasText;
  --rm-muted: color-mix(in srgb, CanvasText 58%, transparent);
  --rm-border: color-mix(in srgb, CanvasText 14%, transparent);
  --rm-accent: #ff7a18;
  --rm-accent-strong: #ff5b00;
  --rm-danger: #ff453a;
  --rm-success: #30d158;
  --rm-radius: 26px;
  --rm-shadow: 0 28px 90px rgba(0, 0, 0, .24), 0 10px 30px rgba(0, 0, 0, .14);
  --rm-ease: cubic-bezier(.2,.8,.2,1);
  font-family: var(--rm-font);
}
* {
  box-sizing: border-box;
}
button, input, textarea, select {
  font: inherit;
}
button {
  -webkit-tap-highlight-color: transparent;
}
.rm-root {
  position: absolute;
  inset: 0;
  z-index: var(--rm-z);
  pointer-events: none;
  font-family: var(--rm-font);
  color: var(--rm-text);
  overscroll-behavior: none;
  -webkit-overflow-scrolling: auto;
}
.rm-root[data-open="true"] {
  pointer-events: auto;
}
.rm-root[data-stack-active="false"] {
  pointer-events: none;
}
.rm-root[data-stack-active="false"] .rm-backdrop {
  opacity: 0 !important;
}
.rm-root[data-stack-active="false"] .rm-shell {
  opacity: var(--rm-stack-opacity, 1);
}
.rm-root[data-has-behind="true"] .rm-backdrop {
  background: rgba(0,0,0,.36);
}
.rm-root[data-visual-viewport="true"] {
  inset: auto;
  top: var(--rm-vv-top, 0px);
  left: var(--rm-vv-left, 0px);
  width: var(--rm-vvw, 100vw);
  height: var(--rm-vvh, 100vh);
}
.rm-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,.48);
  opacity: 0;
  transition: opacity 130ms linear;
  touch-action: none;
  overscroll-behavior: none;
}
.rm-root[data-open="true"] .rm-backdrop {
  opacity: 1;
}
.rm-shell {
  position: absolute;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--rm-panel);
  border: 1px solid var(--rm-border);
  box-shadow: var(--rm-shadow);
  overflow: hidden;
  opacity: 0;
  transform: translate3d(0, 30px, 0) scale(.985);
  transition: transform 150ms var(--rm-ease), opacity 110ms linear;
  will-change: transform;
  overscroll-behavior: contain;
}
.rm-root[data-open="true"] .rm-shell {
  opacity: 1;
  transform: translate3d(0, 0, 0) scale(1);
}
.rm-root[data-presentation="bottom-sheet"] .rm-shell {
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  max-height: min(92dvh, calc(var(--rm-vvh, 100vh) - 8px));
  border-radius: var(--rm-radius) var(--rm-radius) 0 0;
  --rm-sheet-x: 0px;
  --rm-drag-y: 0px;
  opacity: 0;
  transform: translate3d(var(--rm-sheet-x), calc(18px + var(--rm-drag-y)), 0) scale(.992);
}
.rm-root[data-presentation="bottom-sheet"][data-open="true"] .rm-shell {
  opacity: 1;
  transform: translate3d(var(--rm-sheet-x), calc(var(--rm-drag-y) + var(--rm-stack-y, 0px)), 0) scale(var(--rm-stack-scale, 1));
}
.rm-root[data-presentation="modal"] .rm-shell {
  left: 50%;
  top: 50%;
  width: min(calc(100vw - 28px), var(--rm-width, 640px));
  max-height: min(86dvh, calc(var(--rm-vvh, 100vh) - 28px));
  border-radius: var(--rm-radius);
  transform: translate3d(-50%, calc(-50% + 24px), 0) scale(.97);
}
.rm-root[data-presentation="modal"][data-open="true"] .rm-shell {
  transform: translate3d(-50%, calc(-50% + var(--rm-stack-y, 0px)), 0) scale(var(--rm-stack-scale, 1));
}
.rm-root[data-presentation="drawer"] .rm-shell {
  border-radius: 0;
}
.rm-root[data-presentation="drawer"][data-side="right"] .rm-shell {
  top: 0;
  right: 0;
  bottom: 0;
  width: min(92vw, var(--rm-width, 520px));
  transform: translate3d(105%, 0, 0);
}
.rm-root[data-presentation="drawer"][data-side="left"] .rm-shell {
  top: 0;
  left: 0;
  bottom: 0;
  width: min(92vw, var(--rm-width, 520px));
  transform: translate3d(-105%, 0, 0);
}
.rm-root[data-presentation="drawer"][data-side="top"] .rm-shell {
  top: 0;
  left: 0;
  right: 0;
  max-height: 86dvh;
  transform: translate3d(0, -105%, 0);
}
.rm-root[data-presentation="drawer"][data-side="bottom"] .rm-shell {
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 86dvh;
  transform: translate3d(0, 105%, 0);
}
.rm-root[data-presentation="drawer"][data-open="true"] .rm-shell {
  transform: translate3d(0,0,0);
}
.rm-root[data-presentation="popover"] .rm-shell {
  left: var(--rm-popover-left, 50%);
  top: var(--rm-popover-top, 50%);
  width: min(calc(100vw - 24px), var(--rm-width, 520px));
  max-height: min(80dvh, calc(var(--rm-vvh, 100vh) - 16px));
  border-radius: 22px;
  transform-origin: var(--rm-popover-align, 50%) 0%;
  transform: translate3d(var(--rm-popover-shift, -50%), 10px, 0) scale(.96);
}
.rm-root[data-presentation="popover"][data-popover-above="true"] .rm-shell {
  transform-origin: var(--rm-popover-align, 50%) 100%;
  transform: translate3d(var(--rm-popover-shift, -50%), calc(-100% - 10px), 0) scale(.96);
}
.rm-root[data-presentation="popover"][data-open="true"] .rm-shell {
  transform: translate3d(var(--rm-popover-shift, -50%), 0, 0) scale(1);
}
.rm-root[data-presentation="popover"][data-popover-above="true"][data-open="true"] .rm-shell {
  transform: translate3d(var(--rm-popover-shift, -50%), -100%, 0) scale(1);
}
.rm-handle-wrap {
  display: flex;
  justify-content: center;
  padding: 10px 12px 0;
  touch-action: none;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}
.rm-handle-wrap:active {
  cursor: grabbing;
}
.rm-handle {
  width: 42px;
  height: 5px;
  border-radius: 99px;
  background: var(--rm-border);
}
.rm-header {
  display: grid;
  grid-template-columns: minmax(0,1fr) auto;
  gap: 16px;
  align-items: start;
  padding: 18px 20px 14px;
}
.rm-heading {
  min-width: 0;
}
.rm-eyebrow {
  font: 700 11px/1.2 var(--rm-font);
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--rm-accent);
  margin-bottom: 7px;
}
.rm-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rm-icon {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--rm-accent) 15%, transparent);
  flex: 0 0 auto;
}
.rm-title {
  margin: 0;
  font: 760 22px/1.12 var(--rm-font);
  letter-spacing: -.025em;
}
.rm-description {
  margin: 8px 0 0;
  font: 450 14px/1.45 var(--rm-font);
  color: var(--rm-muted);
}
.rm-close {
  appearance: none;
  border: 0;
  border-radius: 999px;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  background: var(--rm-elevated);
  color: var(--rm-text);
  cursor: pointer;
  transition: transform 160ms ease, background 160ms ease;
}
.rm-close:active {
  transform: scale(.92);
}
.rm-body {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 0 16px 8px;
  scrollbar-width: thin;
  touch-action: pan-x pan-y;
  overscroll-behavior-y: contain;
  -webkit-user-select: auto;
}
.rm-root[data-keyboard="true"] .rm-shell {
  max-height: calc(var(--rm-vvh, 100vh) - 8px);
}
.rm-section {
  margin: 0 0 14px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--rm-elevated) 58%, transparent);
  border: 1px solid var(--rm-border);
  overflow: hidden;
}
.rm-section[data-bare="true"] {
  margin: 0 0 14px;
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
}
.rm-section[data-bare="true"] .rm-fields {
  gap: 12px;
}
.rm-section-head {
  padding: 14px 14px 6px;
}
.rm-section-title {
  margin: 0;
  font: 700 13px/1.25 var(--rm-font);
}
.rm-section-description {
  margin: 4px 0 0;
  color: var(--rm-muted);
  font: 430 12px/1.4 var(--rm-font);
}
.rm-section-toggle {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:0;
}
.rm-fields {
  display: grid;
  gap: 0;
}
.rm-field {
  position: relative;
  padding: 12px 14px;
  border-top: 1px solid var(--rm-border);
  min-width: 0;
}
.rm-field[data-chrome="bare"] {
  padding: 0;
  border: 0;
  background: transparent;
}
.rm-field:first-child {
  border-top: 0;
}
.rm-field[data-hidden="true"] {
  display: none !important;
}
.rm-label-row {
  display:flex;
  justify-content:space-between;
  gap:12px;
  align-items:baseline;
  margin-bottom:7px;
}
.rm-label {
  font: 650 13px/1.25 var(--rm-font);
}
.rm-required {
  color: var(--rm-danger);
  margin-left: 3px;
}
.rm-help, .rm-description-field {
  font: 430 12px/1.35 var(--rm-font);
  color: var(--rm-muted);
}
.rm-help {
  margin-top: 7px;
}
.rm-error {
  margin-top: 7px;
  color: var(--rm-danger);
  font: 600 12px/1.35 var(--rm-font);
  display:none;
}
.rm-field[data-error="true"] .rm-error {
  display:block;
}
.rm-control, .rm-textarea, .rm-select {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--rm-border);
  border-radius: 13px;
  background: color-mix(in srgb, Canvas 87%, transparent);
  color: var(--rm-text);
  outline: none;
  padding: 10px 12px;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}
.rm-control:focus, .rm-textarea:focus, .rm-select:focus {
  border-color: color-mix(in srgb, var(--rm-accent) 72%, white 10%);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rm-accent) 18%, transparent);
}
.rm-textarea {
  resize: vertical;
  min-height: 96px;
}
.rm-check-row {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:14px;
}
.rm-check-label {
  min-width:0;
}
.rm-native-check {
  width:20px;
  height:20px;
  accent-color: var(--rm-accent);
}
.rm-switch {
  appearance:none;
  width:48px;
  height:28px;
  border:0;
  border-radius:999px;
  background: var(--rm-border);
  position:relative;
  cursor:pointer;
  transition:background 180ms ease;
  flex:0 0 auto;
}
.rm-switch::after {
  content:"";
  position:absolute;
  width:22px;
  height:22px;
  top:3px;
  left:3px;
  border-radius:50%;
  background:white;
  box-shadow:0 2px 8px rgba(0,0,0,.25);
  transition:transform 180ms var(--rm-ease);
}
.rm-switch:checked {
  background: var(--rm-accent);
}
.rm-switch:checked::after {
  transform: translateX(20px);
}
.rm-options {
  display:flex;
  flex-direction:column;
  gap:8px;
}
.rm-options[data-direction="horizontal"] {
  flex-direction:row;
  flex-wrap:wrap;
}
.rm-option {
  display:flex;
  gap:9px;
  align-items:flex-start;
  font: 500 13px/1.35 var(--rm-font);
}
.rm-option input {
  accent-color: var(--rm-accent);
  margin-top:2px;
}
.rm-option-copy {
  display:grid;
  gap:2px;
}
.rm-option-desc {
  font-size:11px;
  color:var(--rm-muted);
}
.rm-segmented {
  display:grid;
  grid-auto-flow:column;
  grid-auto-columns:minmax(0,1fr);
  gap:4px;
  padding:4px;
  background:var(--rm-elevated);
  border-radius:13px;
}
.rm-segment {
  border:0;
  border-radius:10px;
  padding:9px 10px;
  color:var(--rm-muted);
  background:transparent;
  cursor:pointer;
  font-weight:650;
}
.rm-segment[data-selected="true"] {
  background:var(--rm-panel);
  color:var(--rm-text);
  box-shadow:0 2px 9px rgba(0,0,0,.1);
}
.rm-range-wrap {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:10px;
  align-items:center;
}
.rm-range {
  width:100%;
  accent-color:var(--rm-accent);
}
.rm-range-value {
  min-width:44px;
  text-align:right;
  font:650 12px/1 var(--rm-font);
  color:var(--rm-muted);
}
.rm-color-row {
  display:flex;
  gap:10px;
  align-items:center;
}
.rm-color {
  width:54px;
  height:42px;
  border:1px solid var(--rm-border);
  border-radius:11px;
  padding:3px;
  background:transparent;
}
.rm-presets {
  display:flex;
  flex-wrap:wrap;
  gap:7px;
}
.rm-swatch {
  width:28px;
  height:28px;
  border-radius:50%;
  border:2px solid color-mix(in srgb, CanvasText 18%, transparent);
  cursor:pointer;
}
.rm-stars {
  display:flex;
  gap:4px;
}
.rm-star {
  border:0;
  background:transparent;
  color:var(--rm-border);
  font-size:27px;
  padding:2px;
  cursor:pointer;
  line-height:1;
}
.rm-star[data-on="true"] {
  color:#ffb020;
}
.rm-chipbox {
  display:flex;
  flex-wrap:wrap;
  gap:7px;
}
.rm-chip {
  border:1px solid var(--rm-border);
  background:var(--rm-panel);
  color:var(--rm-text);
  border-radius:999px;
  padding:8px 11px;
  cursor:pointer;
  font:600 12px/1 var(--rm-font);
}
.rm-chip[data-selected="true"] {
  border-color:var(--rm-accent);
  background:color-mix(in srgb, var(--rm-accent) 13%, var(--rm-panel));
}
.rm-typeahead {
  position: relative;
  display: grid;
  gap: 7px;
  min-width: 0;
}
.rm-typeahead[data-disabled="true"] {
  opacity: .56;
  pointer-events: none;
}
.rm-typeahead-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
}
.rm-typeahead-input {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--rm-border);
  border-radius: 13px;
  background: color-mix(in srgb, Canvas 87%, transparent);
  color: var(--rm-text);
  outline: none;
  padding: 10px 38px 10px 12px;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}
.rm-typeahead-input:focus {
  border-color: color-mix(in srgb, var(--rm-accent) 72%, white 10%);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rm-accent) 18%, transparent);
}
.rm-typeahead-chevron {
  position: absolute;
  right: 12px;
  pointer-events: none;
  color: var(--rm-muted);
  font: 800 13px/1 var(--rm-font);
  transform: translateY(-1px);
}
.rm-typeahead-selected {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.rm-typeahead-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  border: 1px solid color-mix(in srgb, var(--rm-accent) 38%, var(--rm-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--rm-accent) 11%, var(--rm-panel));
  color: var(--rm-text);
  padding: 5px 8px 5px 10px;
  font: 650 11px/1.2 var(--rm-font);
}
.rm-typeahead-chip span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rm-typeahead-chip button {
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--rm-muted);
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
  font: 800 12px/1 var(--rm-font);
}
.rm-typeahead-list {
  display: grid;
  gap: 5px;
  max-height: 240px;
  overflow: auto;
  padding: 5px;
  border: 1px solid var(--rm-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--rm-panel) 96%, Canvas 4%);
  box-shadow: 0 12px 28px rgba(0, 0, 0, .18);
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.rm-typeahead-option {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: var(--rm-text);
  padding: 9px 10px;
  text-align: left;
  cursor: pointer;
}
.rm-typeahead-option:hover,
.rm-typeahead-option[data-highlighted="true"] {
  background: color-mix(in srgb, var(--rm-accent) 8%, transparent);
}
.rm-typeahead-option[data-selected="true"] {
  border-color: color-mix(in srgb, var(--rm-accent) 34%, var(--rm-border));
  background: color-mix(in srgb, var(--rm-accent) 12%, transparent);
}
.rm-typeahead-option:disabled {
  opacity: .45;
  cursor: not-allowed;
}
.rm-typeahead-option-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.rm-typeahead-option-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 650 12px/1.25 var(--rm-font);
}
.rm-typeahead-option-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--rm-muted);
  font: 500 10px/1.25 var(--rm-font);
}
.rm-typeahead-indicator {
  width: 20px;
  height: 20px;
  border: 1.5px solid color-mix(in srgb, CanvasText 24%, var(--rm-border));
  display: grid;
  place-items: center;
  color: white;
  flex: 0 0 auto;
}
.rm-typeahead-indicator[data-kind="radio"] {
  border-radius: 50%;
}
.rm-typeahead-indicator[data-kind="checkbox"] {
  border-radius: 6px;
}
.rm-typeahead-option[data-selected="true"] .rm-typeahead-indicator {
  border-color: var(--rm-accent);
  background: var(--rm-accent);
}
.rm-typeahead-indicator::after {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0;
}
.rm-typeahead-indicator[data-kind="checkbox"]::after {
  width: 9px;
  height: 5px;
  border-left: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  background: transparent;
  transform: rotate(-45deg) translate(1px, -1px);
}
.rm-typeahead-option[data-selected="true"] .rm-typeahead-indicator::after {
  opacity: 1;
}
.rm-typeahead-empty {
  padding: 12px 10px;
  color: var(--rm-muted);
  text-align: center;
  font: 500 11px/1.35 var(--rm-font);
}
.rm-divider {
  height:1px;
  background:var(--rm-border);
  margin:4px 0;
}
.rm-field-button {
  border:0;
  border-radius:13px;
  min-height:42px;
  padding:10px 13px;
  cursor:pointer;
  font-weight:700;
}
.rm-actions {
  display:flex;
  flex-wrap:wrap;
  justify-content:flex-end;
  gap:9px;
  padding:12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top:1px solid var(--rm-border);
  background:var(--rm-panel);
}
.rm-action {
  position:relative;
  border:0;
  min-height:44px;
  padding:10px 16px;
  border-radius:14px;
  cursor:pointer;
  font:700 13px/1 var(--rm-font);
  transition:transform 140ms ease, opacity 140ms ease, filter 140ms ease;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:8px;
}
.rm-action:active {
  transform:scale(.96);
}
.rm-action:disabled {
  opacity:.46;
  cursor:not-allowed;
}
.rm-action[data-variant="primary"] {
  background:linear-gradient(135deg,var(--rm-accent),var(--rm-accent-strong));
  color:white;
}
.rm-action[data-variant="secondary"] {
  background:var(--rm-elevated);
  color:var(--rm-text);
}
.rm-action[data-variant="ghost"] {
  background:transparent;
  color:var(--rm-text);
}
.rm-action[data-variant="danger"] {
  background:var(--rm-danger);
  color:white;
}
.rm-action[data-variant="success"] {
  background:var(--rm-success);
  color:#07250f;
}
.rm-spinner {
  width:14px;
  height:14px;
  border:2px solid currentColor;
  border-right-color:transparent;
  border-radius:50%;
  animation:rm-spin .65s linear infinite;
}
.rm-root[data-loading="true"] .rm-body {
  opacity:.66;
  pointer-events:none;
}
.rm-global-error {
  margin: 0 16px 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--rm-danger) 12%, transparent);
  color: var(--rm-danger);
  font: 600 12px/1.4 var(--rm-font);
  display:none;
}
.rm-global-error[data-show="true"] {
  display:block;
}
@keyframes rm-spin {
  to {
    transform:rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .rm-backdrop, .rm-shell, .rm-action, .rm-close, .rm-switch, .rm-switch::after {
    transition-duration:.001ms !important;
    animation-duration:.001ms !important;
  }
}

.rm-control-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: stretch;
}
.rm-trailing-action,
.rm-mini-button {
  border: 1px solid var(--rm-border);
  border-radius: 12px;
  background: color-mix(in srgb, Canvas 86%, transparent);
  color: var(--rm-text);
  min-height: 40px;
  padding: 8px 11px;
  font: 650 12px/1 var(--rm-font);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
}
.rm-trailing-action:disabled,
.rm-mini-button:disabled {
  opacity: .48;
  cursor: default;
}
.rm-trailing-action[data-loading="true"] {
  opacity: .7;
}
.rm-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--rm-accent) 18%, transparent);
  color: var(--rm-accent-strong);
  font: 750 10px/1 var(--rm-font);
  white-space: nowrap;
}
.rm-shortcut {
  margin-left: auto;
  border: 1px solid var(--rm-border);
  border-radius: 7px;
  background: color-mix(in srgb, Canvas 82%, transparent);
  color: var(--rm-muted);
  padding: 3px 5px;
  font: 600 9px/1 var(--rm-font);
}
.rm-action-icon,
.rm-tab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.rm-tabs-wrap {
  display: grid;
  gap: 10px;
}
.rm-tabs {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  gap: 6px;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 2px 8px;
  scrollbar-width: none;
  background: linear-gradient(var(--rm-panel) 72%, transparent);
  touch-action: pan-x;
  overscroll-behavior-x: contain;
  overscroll-behavior-y: none;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
  scroll-snap-type: x proximity;
  user-select: none;
  -webkit-user-select: none;
}
.rm-tabs[data-dragging="true"] {
  scroll-behavior: auto;
}
.rm-tabs::-webkit-scrollbar {
  display: none;
}
.rm-tab {
  border: 1px solid var(--rm-border);
  border-radius: 999px;
  background: color-mix(in srgb, Canvas 86%, transparent);
  color: var(--rm-muted);
  min-height: 36px;
  padding: 7px 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  cursor: pointer;
  font: 650 12px/1 var(--rm-font);
  flex: 0 0 auto;
  scroll-snap-align: start;
  touch-action: pan-x;
}
.rm-tab[data-active="true"] {
  background: color-mix(in srgb, var(--rm-accent) 16%, Canvas 84%);
  color: var(--rm-text);
  border-color: color-mix(in srgb, var(--rm-accent) 45%, var(--rm-border));
}
.rm-tab-panel {
  min-width: 0;
  transform-origin: center center;
}
.rm-tab-panel[data-entering="true"] {
  animation: rm-tab-panel-enter 170ms cubic-bezier(.2,.75,.25,1) both;
}
@keyframes rm-tab-panel-enter {
  from {
    opacity: 0;
    transform: translate3d(10px, 0, 0);
    filter: blur(1.5px);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
    filter: blur(0);
  }
}
.rm-saved-sync {
  display: grid;
  gap: 12px;
}
.rm-saved-sync-summary {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--rm-border);
  border-radius: 14px;
  background: var(--rm-elevated);
}
.rm-saved-sync-summary strong {
  font: 750 14px/1.25 var(--rm-font);
  color: var(--rm-text);
}
.rm-saved-sync-summary small {
  font: 500 11px/1.45 var(--rm-font);
  color: var(--rm-muted);
}
.rm-saved-sync-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}
.rm-saved-sync-stat {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 9px 8px;
  border: 1px solid var(--rm-border);
  border-radius: 12px;
  background: var(--rm-panel);
}
.rm-saved-sync-stat b {
  font: 800 13px/1 var(--rm-font);
  color: var(--rm-text);
}
.rm-saved-sync-stat span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 600 9px/1.2 var(--rm-font);
  color: var(--rm-muted);
  text-transform: uppercase;
  letter-spacing: .04em;
}
.rm-saved-sync-commands {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.rm-saved-sync-command {
  width: 100%;
  min-height: 42px;
}
@media (max-width: 420px) {
  .rm-saved-sync-commands {
    grid-template-columns: 1fr;
  }
}

.rm-media-preview {
  display: grid;
  grid-template-columns: minmax(90px, 34%) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
  overflow: hidden;
  border: 1px solid var(--rm-border);
  border-radius: 16px;
  background: color-mix(in srgb, Canvas 88%, transparent);
}
.rm-media-preview[data-compact="true"] {
  grid-template-columns: 84px minmax(0, 1fr);
}
.rm-media-thumb,
.rm-media-placeholder {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 112px;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  background: color-mix(in srgb, CanvasText 8%, Canvas 92%);
}
.rm-media-placeholder {
  display: grid;
  place-items: center;
  color: var(--rm-muted);
  font: 800 11px/1 var(--rm-font);
  letter-spacing: .08em;
}
.rm-media-copy {
  min-width: 0;
  padding: 11px 11px 11px 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
}
.rm-media-copy strong,
.rm-media-item-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 700 13px/1.2 var(--rm-font);
}
.rm-media-copy p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  color: var(--rm-muted);
  font: 430 12px/1.35 var(--rm-font);
}
.rm-media-copy small,
.rm-media-item-copy small {
  color: var(--rm-muted);
  font: 500 10px/1.3 var(--rm-font);
}
.rm-media-open {
  color: var(--rm-accent-strong);
  text-decoration: none;
  font: 650 11px/1.2 var(--rm-font);
}
.rm-media-picker {
  display: grid;
  gap: 9px;
}
.rm-picker-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--rm-muted);
  font: 600 11px/1.2 var(--rm-font);
}
.rm-media-grid {
  display: grid;
  grid-template-columns: repeat(var(--rm-media-columns, 2), minmax(0, 1fr));
  gap: 8px;
}
.rm-media-item {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--rm-border);
  border-radius: 14px;
  background: color-mix(in srgb, Canvas 88%, transparent);
  color: var(--rm-text);
  padding: 0;
  text-align: left;
  cursor: pointer;
}
.rm-media-item[data-selected="true"] {
  border-color: var(--rm-accent);
  box-shadow: inset 0 0 0 1px var(--rm-accent);
}
.rm-media-item img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  background: color-mix(in srgb, CanvasText 7%, Canvas 93%);
}
.rm-media-item-copy {
  min-width: 0;
  padding: 8px 9px 9px;
  display: grid;
  gap: 3px;
}
.rm-media-check {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--rm-accent);
  color: white;
  opacity: 0;
  transform: scale(.8);
  transition: opacity 140ms ease, transform 140ms ease;
  font: 800 12px/1 var(--rm-font);
}
.rm-media-item[data-selected="true"] .rm-media-check {
  opacity: 1;
  transform: scale(1);
}
.rm-provider-list,
.rm-request-log,
.rm-channel-picker,
.rm-debug-json {
  display: grid;
  gap: 7px;
}
.rm-provider {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border: 1px solid var(--rm-border);
  border-radius: 12px;
  background: color-mix(in srgb, Canvas 88%, transparent);
}
.rm-provider-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--rm-muted);
}
.rm-provider[data-state="success"] .rm-provider-dot {
  background: var(--rm-success);
}
.rm-provider[data-state="error"] .rm-provider-dot {
  background: var(--rm-danger);
}
.rm-provider[data-state="loading"] .rm-provider-dot {
  background: var(--rm-accent);
  animation: rmPulse 1s ease-in-out infinite;
}
.rm-provider-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.rm-provider-copy strong {
  font: 650 12px/1.2 var(--rm-font);
}
.rm-provider-copy small,
.rm-provider-duration {
  color: var(--rm-muted);
  font: 500 10px/1.2 var(--rm-font);
}
.rm-request-log {
  overflow: auto;
  overscroll-behavior: contain;
}
.rm-request-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--rm-border);
  background: transparent;
  color: inherit;
  padding: 8px 2px;
  text-align: left;
}
.rm-request-method {
  color: var(--rm-accent-strong);
  font: 800 10px/1 var(--rm-font);
}
.rm-request-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 500 11px/1.3 var(--rm-font);
}
.rm-request-status {
  color: var(--rm-muted);
  font: 600 10px/1 var(--rm-font);
}
.rm-debug-json pre {
  margin: 0;
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--rm-border);
  border-radius: 12px;
  background: color-mix(in srgb, CanvasText 6%, Canvas 94%);
  padding: 10px;
  color: var(--rm-text);
  font: 500 10px/1.45 ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.rm-channel-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 7px;
}
.rm-channel-option {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--rm-border);
  border-radius: 13px;
  background: color-mix(in srgb, Canvas 88%, transparent);
  color: var(--rm-text);
  padding: 9px 10px;
  text-align: left;
  cursor: pointer;
}
.rm-channel-option[data-selected="true"] {
  border-color: var(--rm-accent);
  background: color-mix(in srgb, var(--rm-accent) 12%, Canvas 88%);
}
.rm-channel-option > span:last-child {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.rm-channel-option strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 650 12px/1.2 var(--rm-font);
}
.rm-channel-option small {
  color: var(--rm-muted);
  font: 500 10px/1.2 var(--rm-font);
}
.rm-history-list {
  display: grid;
  gap: 7px;
}
.rm-history-item {
  min-width: 0;
  border: 1px solid var(--rm-border);
  border-radius: 12px;
  background: color-mix(in srgb, Canvas 88%, transparent);
  padding: 10px 11px;
  color: var(--rm-text);
  font: 500 12px/1.35 var(--rm-font);
  overflow-wrap: anywhere;
}
@keyframes rmPulse {
  0%, 100% { opacity: .45; transform: scale(.8); }
  50% { opacity: 1; transform: scale(1.15); }
}

@media (min-width: 760px) {
  .rm-root[data-presentation="bottom-sheet"] .rm-shell {
    left: 50%;
    right: auto;
    bottom: max(12px, env(safe-area-inset-bottom));
    width: min(calc(100vw - 40px), 720px);
    border-radius: var(--rm-radius);
    --rm-sheet-x: -50%;
  }
}

`;
      function isObject(value) {
        return !!value && typeof value === "object" && !Array.isArray(value);
      }
      function cloneValue(value) {
        if (Array.isArray(value)) return value.slice();
        if (value instanceof Date) return new Date(value.getTime());
        if (isObject(value)) return { ...value };
        return value;
      }
      function nextId() {
        counter += 1;
        return `${ID_PREFIX}-${Date.now().toString(36)}-${counter.toString(36)}`;
      }
      function getOwnerWindow(doc) {
        return doc.defaultView || rootWindow;
      }
      function getHighestReachableWindow(start) {
        let current = start;
        for (;;) {
          try {
            if (current.parent && current.parent !== current && current.parent.document) {
              current = current.parent;
              continue;
            }
          } catch {}
          return current;
        }
      }
      function resolveDocument() {
        const highest = getHighestReachableWindow(rootWindow);
        try {
          return highest.document;
        } catch {
          return rootWindow.document;
        }
      }
      function publishEverywhere(api) {
        const visited = new Set();
        const queue = [rootWindow];
        try {
          const top = getHighestReachableWindow(rootWindow);
          if (!queue.includes(top)) queue.push(top);
        } catch {}
        while (queue.length) {
          const win = queue.shift();
          if (!win || visited.has(win)) continue;
          visited.add(win);
          try {
            Object.defineProperty(win, GLOBAL_NAME, {
              configurable: true,
              enumerable: false,
              writable: true,
              value: api,
            });
          } catch {
            try {
              win[GLOBAL_NAME] = api;
            } catch {}
          }
          try {
            if (win.parent && win.parent !== win) queue.push(win.parent);
          } catch {}
          try {
            if (win.top && win.top !== win) queue.push(win.top);
          } catch {}
          try {
            for (let i = 0; i < win.frames.length; i += 1) queue.push(win.frames[i]);
          } catch {}
          try {
            if (win.opener && !win.opener.closed) queue.push(win.opener);
          } catch {}
        }
      }
      const stylesheetCache = new Map();
      function resolveCompiledStylesheet(source) {
        const cached = stylesheetCache.get(source);
        if (cached !== void 0) return cached;
        const compiled = compileStylesheet(source);
        if (stylesheetCache.size >= 8) {
          const oldest = stylesheetCache.keys().next().value;
          if (oldest !== void 0) stylesheetCache.delete(oldest);
        }
        stylesheetCache.set(source, compiled);
        return compiled;
      }
      function appendStyle(root, instanceCss = "") {
        const doc = root.ownerDocument;
        const style = createElement(doc, "style");
        style.dataset.rodMenuStyle = STYLE_VERSION;
        const extra = [globalConfig.css, instanceCss].filter(Boolean).join(`

`);
        style.textContent = resolveCompiledStylesheet(extra ? `${css}\n\n${extra}` : css);
        root.append(style);
      }
      function applyAttributes(element, attributes) {
        if (!attributes) return;
        for (const [key, raw] of Object.entries(attributes)) {
          if (raw === void 0 || raw === null || raw === false) continue;
          if (raw === true) element.setAttribute(key, "");
          else element.setAttribute(key, String(raw));
        }
      }
      function lockDocumentScroll(doc) {
        const win = getOwnerWindow(doc);
        const body = doc.body;
        const state = docState.get(doc) ?? {
          count: 0,
          overflow: doc.documentElement.style.overflow,
          paddingRight: doc.documentElement.style.paddingRight,
          overscrollBehavior: doc.documentElement.style.overscrollBehavior,
          bodyPosition: body?.style.position || "",
          bodyTop: body?.style.top || "",
          bodyLeft: body?.style.left || "",
          bodyRight: body?.style.right || "",
          bodyWidth: body?.style.width || "",
          bodyOverflow: body?.style.overflow || "",
          bodyTouchAction: body?.style.touchAction || "",
          bodyOverscrollBehavior: body?.style.overscrollBehavior || "",
          scrollX: win.scrollX,
          scrollY: win.scrollY,
        };
        if (state.count === 0) {
          const scrollbar = Math.max(0, win.innerWidth - doc.documentElement.clientWidth);
          state.overflow = doc.documentElement.style.overflow;
          state.paddingRight = doc.documentElement.style.paddingRight;
          state.overscrollBehavior = doc.documentElement.style.overscrollBehavior;
          state.scrollX = win.scrollX;
          state.scrollY = win.scrollY;
          doc.documentElement.style.overflow = "hidden";
          doc.documentElement.style.overscrollBehavior = "none";
          if (scrollbar > 0) doc.documentElement.style.paddingRight = `${scrollbar}px`;
          if (body) {
            state.bodyOverflow = body.style.overflow;
            state.bodyTouchAction = body.style.touchAction;
            state.bodyOverscrollBehavior = body.style.overscrollBehavior;
            body.style.overflow = "hidden";
            body.style.touchAction = "none";
            body.style.overscrollBehavior = "none";
          }
        }
        state.count += 1;
        docState.set(doc, state);
      }
      function unlockDocumentScroll(doc) {
        const state = docState.get(doc);
        if (!state) return;
        state.count = Math.max(0, state.count - 1);
        if (state.count === 0) {
          const body = doc.body;
          doc.documentElement.style.overflow = state.overflow;
          doc.documentElement.style.paddingRight = state.paddingRight;
          doc.documentElement.style.overscrollBehavior = state.overscrollBehavior;
          if (body) {
            body.style.overflow = state.bodyOverflow;
            body.style.touchAction = state.bodyTouchAction;
            body.style.overscrollBehavior = state.bodyOverscrollBehavior;
          }
          docState.delete(doc);
        }
      }
      function getSizeWidth(size) {
        switch (size) {
          case "sm":
            return "440px";
          case "lg":
            return "760px";
          case "xl":
            return "960px";
          case "fullscreen":
            return "calc(100vw - 16px)";
          default:
            return "640px";
        }
      }
      function matchesShortcut(event, shortcut) {
        const parts = shortcut
          .toLowerCase()
          .split("+")
          .map((part) => part.trim())
          .filter(Boolean);
        if (!parts.length) return false;
        const key = parts[parts.length - 1];
        if (!(
          !(
            parts.includes("mod") ||
            parts.includes("meta") ||
            parts.includes("cmd") ||
            parts.includes("ctrl")
          ) ||
          (parts.includes("ctrl")
            ? event.ctrlKey
            : parts.includes("meta") || parts.includes("cmd")
              ? event.metaKey
              : event.metaKey || event.ctrlKey)
        ))
          return false;
        if (parts.includes("shift") !== event.shiftKey) return false;
        if (parts.includes("alt") !== event.altKey) return false;
        return (
          (event.key.toLowerCase() === " " ? "space" : event.key.toLowerCase()) === key ||
          event.code.toLowerCase() === key
        );
      }
      function normalizePresentation(value, win, hasAnchor = false) {
        const selected = value ?? globalConfig.defaultPresentation;
        if (selected !== "auto") return selected;
        if (win.matchMedia?.("(max-width: 720px)").matches) return "bottom-sheet";
        return hasAnchor ? "popover" : "modal";
      }
      class SurfaceController {
        constructor(schema) {
          _defineProperty(this, "id", void 0);
          _defineProperty(this, "doc", void 0);
          _defineProperty(this, "win", void 0);
          _defineProperty(this, "host", void 0);
          _defineProperty(this, "root", void 0);
          _defineProperty(this, "result", void 0);
          _defineProperty(this, "handle", void 0);
          _defineProperty(this, "context", void 0);
          _defineProperty(this, "schemaValue", void 0);
          _defineProperty(this, "valuesValue", void 0);
          _defineProperty(this, "stateStore", void 0);
          _defineProperty(this, "persistenceManager", void 0);
          _defineProperty(this, "storeHandle", void 0);
          _defineProperty(this, "initialValues", void 0);
          _defineProperty(this, "activeTabId", null);
          _defineProperty(this, "errorsValue", {});
          _defineProperty(this, "actionLoading", new Set());
          _defineProperty(this, "loading", false);
          _defineProperty(this, "settled", false);
          _defineProperty(this, "destroyed", false);
          _defineProperty(this, "resolveResult", void 0);
          _defineProperty(this, "previousFocus", null);
          _defineProperty(this, "lastFocusedInside", null);
          _defineProperty(this, "stackIndex", 0);
          _defineProperty(this, "stackTotal", 1);
          _defineProperty(this, "stackActive", true);
          _defineProperty(this, "listeners", []);
          _defineProperty(this, "renderListeners", []);
          _defineProperty(this, "fieldNodes", new Map());
          _defineProperty(this, "inputNodes", new Map());
          _defineProperty(this, "customNodes", new Map());
          this.schemaValue = {
            ...globalConfig.defaultSchema,
            ...schema,
          };
          this.id = schema.id || nextId();
          this.doc = resolveDocument();
          this.win = getOwnerWindow(this.doc);
          this.valuesValue = this.buildInitialValues(schema);
          this.stateStore = createReactiveStore(this.valuesValue);
          this.valuesValue = this.stateStore.snapshot();
          this.initialValues = this.cloneValues(this.valuesValue);
          this.activeTabId = schema.initialTab || schema.tabs?.[0]?.id || null;
          this.host = createElement(this.doc, "div");
          this.host.setAttribute(ROOT_ATTR, this.id);
          this.host.className = "rm-host";
          this.host.style.position = "fixed";
          this.host.style.inset = "0";
          this.host.style.width = "100%";
          this.host.style.height = "100%";
          this.host.style.pointerEvents = "none";
          this.host.style.overflow = "visible";
          this.host.style.contain = "layout style";
          this.host.style.isolation = "isolate";
          this.host.style.backfaceVisibility = "hidden";
          this.host.style.setProperty("-webkit-backface-visibility", "hidden");
          const useShadow = globalConfig.shadowRoot && typeof this.host.attachShadow === "function";
          this.root = useShadow ? this.host.attachShadow({ mode: "open" }) : this.host;
          appendStyle(this.root, this.schemaValue.css || "");
          this.result = new Promise((resolve) => {
            this.resolveResult = resolve;
          });
          const controller = this;
          this.context = {
            get id() {
              return controller.id;
            },
            get values() {
              return controller.valuesValue;
            },
            get errors() {
              return controller.errorsValue;
            },
            get schema() {
              return controller.schemaValue;
            },
            get store() {
              return controller.storeHandle;
            },
            get activeTab() {
              return controller.activeTabId;
            },
            get host() {
              return controller.host;
            },
            get root() {
              return controller.root;
            },
            get surface() {
              return controller.handle;
            },
            get(name) {
              return controller.valuesValue[name];
            },
            set(name, value) {
              controller.setValue(name, value);
            },
            setValues(values) {
              controller.setValues(values);
            },
            reset() {
              controller.reset();
            },
            validate() {
              return controller.validate();
            },
            close(data) {
              controller.finish("dismiss", data, "api");
            },
            dismiss(reason) {
              controller.finish("dismiss", void 0, reason ?? "api");
            },
            setLoading(loading) {
              controller.setLoading(loading);
            },
            setActionLoading(actionId, loading) {
              controller.setActionLoading(actionId, loading);
            },
            setFieldError(name, error) {
              controller.setFieldError(name, error);
            },
            clearErrors() {
              controller.clearErrors();
            },
            update(patch) {
              controller.update(patch);
            },
            setActiveTab(tabId) {
              controller.setActiveTab(tabId);
            },
            persist() {
              return controller.storeHandle.persist();
            },
            hydrate() {
              return controller.storeHandle.hydrate();
            },
            clearPersisted() {
              return controller.storeHandle.clearPersisted();
            },
            bringToFront() {
              controller.bringToFront();
            },
            component(name, props = {}) {
              return controller.renderNamedComponent(name, props);
            },
          };
          this.persistenceManager = createPersistenceManager(
            this.stateStore,
            this.schemaValue.store,
            this.id,
            this.win,
            (values) => {
              this.valuesValue = values;
              if (!this.destroyed) this.applyHydratedValues(values);
              try {
                this.schemaValue.onHydrate?.(this.context);
              } catch (error) {
                this.reportError(error);
              }
            },
            (error) => this.reportError(error),
          );
          this.storeHandle = this.persistenceManager.handle;
          this.handle = {
            id: this.id,
            result: this.result,
            ready: this.storeHandle.ready,
            store: this.storeHandle,
            element: this.host,
            context: this.context,
            close: (data) => this.finish("dismiss", data, "api"),
            dismiss: (reason) => this.finish("dismiss", void 0, reason ?? "api"),
            update: (patch) => this.update(patch),
            setValue: (name, value) => this.setValue(name, value),
            setValues: (values) => this.setValues(values),
            getValue: (name) => this.valuesValue[name],
            validate: () => this.validate(),
            setLoading: (loading) => this.setLoading(loading),
            setActiveTab: (tabId) => this.setActiveTab(tabId),
            persist: () => this.storeHandle.persist(),
            hydrate: () => this.storeHandle.hydrate(),
            clearPersisted: () => this.storeHandle.clearPersisted(),
            bringToFront: () => this.bringToFront(),
            destroy: () => this.destroy(),
          };
          this.mount();
        }
        isDestroyedForStack() {
          return this.destroyed;
        }
        getStackConfig() {
          const local = this.schemaValue.stack;
          if (local === false)
            return {
              ...globalConfig.stack,
              enabled: false,
            };
          if (local === true || local == null) return { ...globalConfig.stack };
          return {
            ...globalConfig.stack,
            ...local,
          };
        }
        isStackTop() {
          return isTopStackSurface(this);
        }
        applyStackState(index, total) {
          this.stackIndex = index;
          this.stackTotal = Math.max(1, total);
          this.stackActive = index === total - 1;
          const config = this.getStackConfig();
          const depth = Math.max(0, total - 1 - index);
          const visibleDepth = Math.min(depth, Math.max(0, config.maxVisible - 1));
          const hiddenByDepth = depth >= Math.max(1, config.maxVisible);
          const visuallyStacked = config.enabled && total > 1;
          const baseZ = this.schemaValue.zIndex ?? globalConfig.zIndex;
          this.host.style.zIndex = String(baseZ + index);
          this.host.dataset.stackActive = String(this.stackActive);
          this.host.dataset.stackDepth = String(depth);
          const root = this.root.querySelector(".rm-root");
          if (!root) return;
          root.dataset.stackActive = String(this.stackActive);
          root.dataset.stackDepth = String(depth);
          root.dataset.stackCount = String(total);
          root.dataset.hasBehind = String(this.stackActive && total > 1 && visuallyStacked);
          root.style.setProperty(
            "--rm-stack-y",
            visuallyStacked && !this.stackActive ? `${-visibleDepth * config.offsetPx}px` : "0px",
          );
          root.style.setProperty(
            "--rm-stack-scale",
            visuallyStacked && !this.stackActive
              ? String(Math.max(0.9, 1 - visibleDepth * config.scaleStep))
              : "1",
          );
          root.style.setProperty(
            "--rm-stack-opacity",
            hiddenByDepth || (!config.enabled && !this.stackActive) ? "0" : "1",
          );
          root.style.visibility =
            hiddenByDepth || (!config.enabled && !this.stackActive) ? "hidden" : "visible";
          const shell = root.querySelector(".rm-shell");
          if (shell) {
            shell.setAttribute("aria-hidden", String(!this.stackActive));
            if ("inert" in shell) shell.inert = !this.stackActive;
          }
        }
        bringToFront() {
          if (this.destroyed) return;
          activateStackSurface(this);
        }
        focusFromStack() {
          if (this.destroyed || !this.stackActive) return;
          this.win.requestAnimationFrame(() => {
            if (this.destroyed || !this.isStackTop()) return;
            if (this.lastFocusedInside?.isConnected)
              try {
                this.lastFocusedInside.focus({ preventScroll: true });
                return;
              } catch {}
            this.focusInitial();
          });
        }
        buildInitialValues(schema) {
          const result = { ...(schema.initialValues || {}) };
          const fields = this.getAllFields(schema);
          for (const field of fields) {
            if (
              [
                "divider",
                "html",
                "button",
                "media-preview",
                "provider-status",
                "request-log",
                "debug-json",
              ].includes(field.type)
            )
              continue;
            if (Object.prototype.hasOwnProperty.call(result, field.name)) continue;
            if (field.value !== void 0) result[field.name] = cloneValue(field.value);
            else if (field.defaultValue !== void 0) result[field.name] = cloneValue(field.defaultValue);
            else result[field.name] = this.defaultForField(field);
          }
          return result;
        }
        defaultForField(field) {
          switch (field.type) {
            case "checkbox":
            case "switch":
              return false;
            case "multiselect":
            case "checkbox-group":
            case "media-picker":
              return [];
            case "channel-picker":
              return field.multiple ? [] : "";
            case "range":
              return field.min ?? 0;
            case "number":
              return "";
            case "rating":
              return field.allowZero === false ? 1 : 0;
            case "file":
              return [];
            default:
              return "";
          }
        }
        cloneValues(values) {
          const out = {};
          for (const [key, value] of Object.entries(values)) out[key] = cloneValue(value);
          return out;
        }
        getAllFields(schema = this.schemaValue) {
          const direct = schema.fields ? Array.from(schema.fields) : [];
          const sectionFields = schema.sections?.flatMap((section) => Array.from(section.fields)) ?? [];
          const tabFields =
            schema.tabs?.flatMap((tab) => [
              ...(tab.fields ? Array.from(tab.fields) : []),
              ...(tab.sections?.flatMap((section) => Array.from(section.fields)) ?? []),
            ]) ?? [];
          return [...direct, ...sectionFields, ...tabFields];
        }
        mount() {
          this.previousFocus = this.doc.activeElement;
          (globalConfig.mount?.(this.doc) || this.doc.documentElement).append(this.host);
          this.render();
          activeHandles.set(this.id, this.handle);
          registerSurfaceInStack(this);
          if (this.schemaValue.scrollLock !== false) lockDocumentScroll(this.doc);
          this.bindGlobalEvents();
          this.setupScrollIsolation();
          this.setupVisualViewport();
          this.setupAnchorTracking();
          requestAnimationFrame(() => {
            if (this.destroyed) return;
            const root = this.getRootElement();
            root.dataset.open = "true";
            this.host.setAttribute(ACTIVE_ATTR, "true");
            try {
              this.schemaValue.onOpen?.(this.context);
            } catch (error) {
              this.reportError(error);
            }
            requestAnimationFrame(() => {
              if (this.destroyed) return;
              this.focusInitial();
              this.persistenceManager.start();
            });
          });
        }
        render() {
          for (const off of this.renderListeners.splice(0))
            try {
              off();
            } catch {}
          this.fieldNodes.clear();
          this.inputNodes.clear();
          this.customNodes.clear();
          this.root.querySelector?.(".rm-root")?.remove();
          const root = this.renderComponent("root", () => createElement(this.doc, "div"));
          root.className = `rm-root ${this.schemaValue.className || ""}`.trim();
          root.dataset.open = "false";
          root.dataset.loading = String(this.loading);
          root.dataset.presentation = normalizePresentation(
            this.schemaValue.presentation,
            this.win,
            !!this.schemaValue.anchor,
          );
          root.dataset.side = this.schemaValue.drawerSide || "right";
          root.style.setProperty("--rm-z", String(this.schemaValue.zIndex ?? globalConfig.zIndex));
          root.style.setProperty("--rm-width", getSizeWidth(this.schemaValue.size));
          const theme = {
            ...globalConfig.theme,
            ...(this.schemaValue.theme || {}),
          };
          for (const [name, value] of Object.entries(theme)) {
            const variable = name.startsWith("--") ? name : `--rm-${name}`;
            root.style.setProperty(variable, String(value));
          }
          const backdrop = this.renderComponent("backdrop", () => createElement(this.doc, "div"));
          backdrop.classList.add("rm-backdrop");
          if (this.schemaValue.closeOnBackdrop !== false && this.schemaValue.dismissible !== false)
            backdrop.addEventListener("pointerdown", (event) => {
              if (event.target !== backdrop || !this.isStackTop()) return;
              const stackConfig = this.getStackConfig();
              if (stackConfig.enabled && stackConfig.backdropClick === "previous" && this.stackTotal > 1) {
                if (activatePreviousStackSurface(this)) return;
              }
              this.finish("dismiss", void 0, "backdrop");
            });
          const shell = this.renderComponent("shell", () => createElement(this.doc, "section"));
          shell.classList.add("rm-shell");
          shell.setAttribute("role", "dialog");
          shell.setAttribute("aria-modal", "true");
          shell.setAttribute("aria-label", this.schemaValue.title || "Menu");
          if (this.schemaValue.showHandle !== false && root.dataset.presentation === "bottom-sheet") {
            const wrap = this.renderComponent("handle", () => {
              const node = createElement(this.doc, "div");
              node.innerHTML = '<div class="rm-handle" aria-hidden="true"></div>';
              return node;
            });
            wrap.classList.add("rm-handle-wrap");
            shell.append(wrap);
          }
          shell.append(this.renderHeader());
          const globalError = createElement(this.doc, "div");
          globalError.className = "rm-global-error";
          globalError.dataset.show = "false";
          shell.append(globalError);
          const body = this.renderComponent("body", () => createElement(this.doc, "div"));
          body.classList.add("rm-body");
          if (this.schemaValue.fields?.length)
            body.append(this.renderSection({ fields: this.schemaValue.fields }));
          for (const section of this.schemaValue.sections || []) body.append(this.renderSection(section));
          if (this.schemaValue.tabs?.length) body.append(this.renderTabs());
          shell.append(body);
          this.positionFromAnchor(root, shell);
          if (this.schemaValue.actions?.length) shell.append(this.renderActions());
          root.append(backdrop, shell);
          this.root.append(root);
          if (root.dataset.presentation === "bottom-sheet") this.bindBottomSheetGestures(root, shell);
          this.refreshDynamicState();
          if (getSurfaceStack(this.doc).includes(this)) refreshSurfaceStack(this.doc);
        }
        renderHeader() {
          return this.renderComponent("header", () => this.renderHeaderDefault());
        }
        renderTabs() {
          return this.renderComponent("tabs", () => this.renderTabsDefault(), {
            activeTab: this.activeTabId,
          });
        }
        renderSection(section) {
          return this.renderComponent("section", () => this.renderSectionDefault(section), { section });
        }
        renderActions() {
          return this.renderComponent("actions", () => this.renderActionsDefault(), {
            actions: this.schemaValue.actions || [],
          });
        }
        renderTabsDefault() {
          const wrapper = createElement(this.doc, "div");
          wrapper.className = "rm-tabs-wrap";
          const visibleTabs = (this.schemaValue.tabs || []).filter(
            (tab) => !tab.visibleWhen || this.safePredicate(tab.visibleWhen),
          );
          if (!visibleTabs.length) return wrapper;
          if (!this.activeTabId || !visibleTabs.some((tab) => tab.id === this.activeTabId))
            this.activeTabId = visibleTabs[0].id;
          const nav = createElement(this.doc, "div");
          nav.className = "rm-tabs";
          nav.setAttribute("role", "tablist");
          for (const tab of visibleTabs) {
            const button = createElement(this.doc, "button");
            button.type = "button";
            button.className = "rm-tab";
            button.dataset.active = String(tab.id === this.activeTabId);
            button.dataset.tabId = tab.id;
            button.setAttribute("role", "tab");
            button.setAttribute("aria-selected", String(tab.id === this.activeTabId));
            if (tab.icon) {
              const icon = createElement(this.doc, "span");
              icon.className = "rm-tab-icon";
              icon.innerHTML = tab.icon;
              button.append(icon);
            }
            const label = createElement(this.doc, "span");
            label.textContent = tab.label;
            button.append(label);
            if (tab.badge != null) {
              const badge = createElement(this.doc, "span");
              badge.className = "rm-badge";
              badge.textContent = String(tab.badge);
              button.append(badge);
            }
            button.addEventListener("click", () => this.setActiveTab(tab.id));
            nav.append(button);
          }
          wrapper.append(nav);
          const active = visibleTabs.find((tab) => tab.id === this.activeTabId) || visibleTabs[0];
          const panel = createElement(this.doc, "div");
          panel.className = "rm-tab-panel";
          panel.dataset.tabPanel = active.id;
          panel.setAttribute("role", "tabpanel");
          if (active.fields?.length) panel.append(this.renderSection({ fields: active.fields }));
          for (const section of active.sections || []) panel.append(this.renderSection(section));
          wrapper.append(panel);
          this.win.requestAnimationFrame(() => {
            if (!this.destroyed) this.revealActiveTab(nav, "auto");
          });
          return wrapper;
        }
        revealActiveTab(nav, behavior = "smooth") {
          const tabs = nav || this.root.querySelector(".rm-tabs");
          if (!tabs || !this.activeTabId) return;
          const escaped =
            typeof CSS !== "undefined" && typeof CSS.escape === "function"
              ? CSS.escape(this.activeTabId)
              : this.activeTabId.replace(/["\\]/g, "\\$&");
          const active = tabs.querySelector(`.rm-tab[data-tab-id="${escaped}"]`);
          if (!active) return;
          const maxScroll = Math.max(0, tabs.scrollWidth - tabs.clientWidth);
          const desired = Math.max(0, Math.min(maxScroll, active.offsetLeft - 2));
          if (Math.abs(tabs.scrollLeft - desired) < 1) return;
          try {
            tabs.scrollTo({
              left: desired,
              behavior,
            });
          } catch {
            tabs.scrollLeft = desired;
          }
        }
        resolveAnchorRect() {
          const anchor = this.schemaValue.anchor;
          if (!anchor) return null;
          try {
            const resolved = typeof anchor === "function" ? anchor() : anchor;
            if (!resolved) return null;
            if (resolved instanceof this.win.Element) return resolved.getBoundingClientRect();
            if (typeof resolved.left === "number" && typeof resolved.top === "number") return resolved;
          } catch (error) {
            this.reportError(error);
          }
          return null;
        }
        positionFromAnchor(root, shell) {
          const rect = this.resolveAnchorRect();
          if (!rect) return;
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          root.style.setProperty("--rm-origin-x", `${centerX}px`);
          root.style.setProperty("--rm-origin-y", `${centerY}px`);
          if (root.dataset.presentation !== "popover") return;
          const offset = Math.max(0, this.schemaValue.anchorOffset ?? 10);
          const align = this.schemaValue.anchorAlign ?? "center";
          const viewportWidth = this.win.innerWidth;
          const viewportHeight = this.win.innerHeight;
          const preferredX = align === "start" ? rect.left : align === "end" ? rect.right : centerX;
          const left = Math.max(8, Math.min(viewportWidth - 8, preferredX));
          const spaceBelow = viewportHeight - rect.bottom;
          const placeAbove = spaceBelow < 280 && rect.top > spaceBelow;
          const top = placeAbove
            ? Math.max(8, rect.top - offset)
            : Math.min(viewportHeight - 8, rect.bottom + offset);
          root.dataset.popoverAbove = String(placeAbove);
          shell.style.setProperty("--rm-popover-left", `${left}px`);
          shell.style.setProperty("--rm-popover-top", `${top}px`);
          shell.style.setProperty(
            "--rm-popover-align",
            align === "start" ? "0%" : align === "end" ? "100%" : "50%",
          );
          shell.style.setProperty(
            "--rm-popover-shift",
            align === "start" ? "0%" : align === "end" ? "-100%" : "-50%",
          );
        }
        renderHeaderDefault() {
          const header = createElement(this.doc, "header");
          header.className = "rm-header";
          const heading = createElement(this.doc, "div");
          heading.className = "rm-heading";
          if (this.schemaValue.eyebrow) {
            const eyebrow = createElement(this.doc, "div");
            eyebrow.className = "rm-eyebrow";
            eyebrow.textContent = this.schemaValue.eyebrow;
            heading.append(eyebrow);
          }
          if (this.schemaValue.title || this.schemaValue.icon) {
            const row = createElement(this.doc, "div");
            row.className = "rm-title-row";
            if (this.schemaValue.icon) {
              const icon = createElement(this.doc, "div");
              icon.className = "rm-icon";
              icon.innerHTML = this.schemaValue.icon;
              row.append(icon);
            }
            if (this.schemaValue.title) {
              const title = createElement(this.doc, "h2");
              title.className = "rm-title";
              title.textContent = this.schemaValue.title;
              row.append(title);
            }
            heading.append(row);
          }
          if (this.schemaValue.description) {
            const description = createElement(this.doc, "p");
            description.className = "rm-description";
            description.textContent = this.schemaValue.description;
            heading.append(description);
          }
          header.append(heading);
          if (this.schemaValue.dismissible !== false) {
            const close = this.renderComponent("closeButton", () => createElement(this.doc, "button"));
            close.setAttribute("type", "button");
            close.classList.add("rm-close");
            close.setAttribute("aria-label", close.getAttribute("aria-label") || "Fechar");
            if (!close.childNodes.length)
              close.innerHTML =
                '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>';
            close.addEventListener("click", () => this.finish("dismiss", void 0, "api"));
            header.append(close);
          }
          return header;
        }
        renderSectionDefault(section) {
          const wrapper = createElement(this.doc, "section");
          wrapper.className = "rm-section";
          if (section.id) wrapper.dataset.section = section.id;
          const isBareSection =
            !section.title &&
            !section.description &&
            section.fields.length > 0 &&
            section.fields.every((field) => field.chrome === "bare");
          wrapper.dataset.bare = String(isBareSection);
          if (section.visibleWhen && !this.safePredicate(section.visibleWhen)) wrapper.hidden = true;
          let collapsed = !!section.collapsed;
          let fieldsContainer;
          if (section.title || section.description) {
            const head = createElement(this.doc, "div");
            head.className = "rm-section-head";
            const makeCopy = () => {
              const copy = createElement(this.doc, "div");
              if (section.title) {
                const title = createElement(this.doc, "h3");
                title.className = "rm-section-title";
                title.textContent = section.title;
                copy.append(title);
              }
              if (section.description) {
                const description = createElement(this.doc, "p");
                description.className = "rm-section-description";
                description.textContent = section.description;
                copy.append(description);
              }
              return copy;
            };
            if (section.collapsible) {
              const toggle = createElement(this.doc, "button");
              toggle.type = "button";
              toggle.className = "rm-section-toggle";
              toggle.append(makeCopy());
              const glyph = createElement(this.doc, "span");
              glyph.textContent = collapsed ? "+" : "−";
              toggle.append(glyph);
              toggle.addEventListener("click", () => {
                collapsed = !collapsed;
                fieldsContainer.hidden = collapsed;
                glyph.textContent = collapsed ? "+" : "−";
              });
              head.append(toggle);
            } else head.append(makeCopy());
            wrapper.append(head);
          }
          fieldsContainer = createElement(this.doc, "div");
          fieldsContainer.className = "rm-fields";
          fieldsContainer.hidden = collapsed;
          for (const field of section.fields) fieldsContainer.append(this.renderField(field));
          wrapper.append(fieldsContainer);
          return wrapper;
        }
        renderField(field) {
          const renderType = () => {
            const registered = this.resolveFieldTypeRenderer(field.type);
            if (registered) {
              const rendered = registered({
                type: field.type,
                field,
                value: this.valuesValue[field.name],
                document: this.doc,
                window: this.win,
                context: this.context,
                create: (tag, className) => {
                  const node = createElement(this.doc, tag);
                  if (className) node.className = className;
                  return node;
                },
                commit: (value) => this.commitField(field, value),
                defaultRender: () => this.renderFieldDefault(field),
              });
              if (rendered) return rendered;
            }
            return this.renderFieldDefault(field);
          };
          return this.renderComponent("field", renderType, {
            field,
            value: this.valuesValue[field.name],
          });
        }
        renderFieldDefault(field) {
          const row = createElement(this.doc, "div");
          row.className = `rm-field ${field.className || ""}`.trim();
          row.dataset.field = field.name;
          row.dataset.hidden = String(!!field.hidden);
          row.dataset.chrome = field.chrome || "default";
          this.fieldNodes.set(field.name, row);
          if (field.type === "divider") {
            row.innerHTML = '<div class="rm-divider" aria-hidden="true"></div>';
            return row;
          }
          if (
            field.chrome !== "bare" &&
            field.type !== "checkbox" &&
            field.type !== "switch" &&
            field.type !== "hidden" &&
            field.type !== "button" &&
            field.type !== "html"
          ) {
            const labelRow = createElement(this.doc, "div");
            labelRow.className = "rm-label-row";
            const label = createElement(this.doc, "label");
            label.className = "rm-label";
            label.htmlFor = `${this.id}-${field.name}`;
            label.textContent = field.label || field.name;
            if (field.required) {
              const req = createElement(this.doc, "span");
              req.className = "rm-required";
              req.textContent = "*";
              label.append(req);
            }
            labelRow.append(label);
            if (field.description) {
              const desc = createElement(this.doc, "span");
              desc.className = "rm-description-field";
              desc.textContent = field.description;
              labelRow.append(desc);
            }
            row.append(labelRow);
          }
          const control = this.createControl(field);
          if (field.trailingAction) {
            const controlRow = createElement(this.doc, "div");
            controlRow.className = "rm-control-row";
            controlRow.append(control);
            const trailing = field.trailingAction;
            const action = createElement(this.doc, "button");
            action.type = "button";
            action.className = "rm-trailing-action";
            action.dataset.variant = trailing.variant || "secondary";
            action.dataset.trailingAction = trailing.id || field.name;
            action.title = trailing.title || trailing.label;
            action.disabled =
              !!trailing.disabled || !!trailing.disabledWhen?.(this.valuesValue, this.context);
            if (trailing.icon) {
              const icon = createElement(this.doc, "span");
              icon.className = "rm-action-icon";
              icon.innerHTML = trailing.icon;
              action.append(icon);
            }
            const label = createElement(this.doc, "span");
            label.textContent = trailing.label;
            action.append(label);
            action.addEventListener("click", async () => {
              if (action.disabled) return;
              action.disabled = true;
              action.dataset.loading = "true";
              try {
                await trailing.handler(this.context);
              } catch (error) {
                this.reportError(error);
              } finally {
                action.dataset.loading = "false";
                action.disabled =
                  !!trailing.disabled || !!trailing.disabledWhen?.(this.valuesValue, this.context);
              }
            });
            controlRow.append(action);
            row.append(controlRow);
          } else row.append(control);
          if (field.help) {
            const help = createElement(this.doc, "div");
            help.className = "rm-help";
            help.textContent = field.help;
            row.append(help);
          }
          const error = createElement(this.doc, "div");
          error.className = "rm-error";
          error.setAttribute("role", "alert");
          row.append(error);
          return row;
        }

        renderTypeaheadSelect(field, value, multiple) {
          const wrap = createElement(this.doc, "div");
          wrap.className = "rm-typeahead";
          wrap.dataset.multiple = String(multiple);
          wrap.dataset.disabled = String(!!field.disabled);
          const selected = new Set(
            multiple
              ? Array.isArray(value)
                ? value.map(String)
                : []
              : [String(value ?? "")].filter(Boolean),
          );
          let query = "";
          let open = false;
          let highlightedIndex = 0;
          const inputWrap = createElement(this.doc, "div");
          inputWrap.className = "rm-typeahead-input-wrap";
          const input = createElement(this.doc, "input");
          input.id = `${this.id}-${field.name}`;
          input.name = field.name;
          input.type = "text";
          input.className = "rm-typeahead-input";
          input.placeholder = field.placeholder || field.searchPlaceholder || "Pesquisar…";
          input.disabled = !!field.disabled;
          input.readOnly = !!field.readonly;
          input.autocomplete = "off";
          input.setAttribute("role", "combobox");
          input.setAttribute("aria-autocomplete", "list");
          input.setAttribute("aria-expanded", "false");
          input.setAttribute("aria-haspopup", "listbox");
          applyAttributes(input, field.attributes);
          const chevron = createElement(this.doc, "span");
          chevron.className = "rm-typeahead-chevron";
          chevron.setAttribute("aria-hidden", "true");
          chevron.textContent = "⌄";
          inputWrap.append(input, chevron);
          const selectedHost = createElement(this.doc, "div");
          selectedHost.className = "rm-typeahead-selected";
          selectedHost.hidden = !multiple || selected.size === 0;
          const listId = `${this.id}-${field.name}-typeahead-list`;
          const list = createElement(this.doc, "div");
          list.id = listId;
          list.className = "rm-typeahead-list";
          list.setAttribute("role", "listbox");
          list.hidden = true;
          input.setAttribute("aria-controls", listId);
          const filteredOptions = () => {
            const normalized = query.trim().toLocaleLowerCase();
            if (!normalized) return Array.from(field.options);
            return Array.from(field.options).filter((option) => {
              return `${option.label} ${option.value} ${option.description || ""}`
                .toLocaleLowerCase()
                .includes(normalized);
            });
          };
          const syncInputValue = () => {
            if (multiple) {
              input.value = query;
              return;
            }
            const selectedOption = field.options.find((option) => selected.has(option.value));
            input.value = open ? query : selectedOption?.label || "";
          };
          const scrollHighlightedIntoView = () => {
            list
              .querySelector(`.rm-typeahead-option[data-index="${highlightedIndex}"]`)
              ?.scrollIntoView({ block: "nearest" });
          };
          const renderSelected = () => {
            selectedHost.replaceChildren();
            if (!multiple || selected.size === 0) {
              selectedHost.hidden = true;
              return;
            }
            selectedHost.hidden = false;
            for (const valueItem of selected) {
              const option = field.options.find((item) => item.value === valueItem);
              if (!option) continue;
              const chip = createElement(this.doc, "div");
              chip.className = "rm-typeahead-chip";
              const label = createElement(this.doc, "span");
              label.textContent = option.label;
              chip.append(label);
              if (!field.disabled && !field.readonly && !option.disabled) {
                const remove = createElement(this.doc, "button");
                remove.type = "button";
                remove.setAttribute("aria-label", `Remover ${option.label}`);
                remove.textContent = "×";
                remove.addEventListener("click", (event) => {
                  event.stopPropagation();
                  selected.delete(option.value);
                  this.commitField(field, Array.from(selected));
                  renderSelected();
                  renderOptions();
                });
                chip.append(remove);
              }
              selectedHost.append(chip);
            }
          };
          const renderOptions = () => {
            const options = filteredOptions();
            list.replaceChildren();
            highlightedIndex = Math.min(highlightedIndex, Math.max(0, options.length - 1));
            if (!options.length) {
              const empty = createElement(this.doc, "div");
              empty.className = "rm-typeahead-empty";
              empty.textContent = field.emptyMessage || "Nenhuma opção encontrada.";
              list.append(empty);
              return;
            }
            options.forEach((option, index) => {
              const button = createElement(this.doc, "button");
              button.type = "button";
              button.className = "rm-typeahead-option";
              button.dataset.selected = String(selected.has(option.value));
              button.dataset.highlighted = String(index === highlightedIndex);
              button.dataset.index = String(index);
              button.disabled = !!field.disabled || !!field.readonly || !!option.disabled;
              button.setAttribute("role", "option");
              button.setAttribute("aria-selected", String(selected.has(option.value)));
              const indicator = createElement(this.doc, "span");
              indicator.className = "rm-typeahead-indicator";
              indicator.dataset.kind = multiple ? "checkbox" : "radio";
              indicator.setAttribute("aria-hidden", "true");
              const copy = createElement(this.doc, "span");
              copy.className = "rm-typeahead-option-copy";
              const title = createElement(this.doc, "strong");
              title.textContent = option.label;
              copy.append(title);
              if (option.description) {
                const description = createElement(this.doc, "small");
                description.textContent = option.description;
                copy.append(description);
              }
              button.append(indicator, copy);
              button.addEventListener("mouseenter", () => {
                highlightedIndex = index;
                for (const item of Array.from(list.querySelectorAll(".rm-typeahead-option")))
                  item.dataset.highlighted = String(item === button);
              });
              button.addEventListener("click", () => {
                if (multiple) {
                  selected.has(option.value) ? selected.delete(option.value) : selected.add(option.value);
                  this.commitField(field, Array.from(selected));
                  renderSelected();
                  renderOptions();
                  open = true;
                  list.hidden = false;
                  input.setAttribute("aria-expanded", "true");
                  input.focus({ preventScroll: true });
                } else {
                  selected.clear();
                  selected.add(option.value);
                  this.commitField(field, option.value);
                  query = "";
                  open = false;
                  list.hidden = true;
                  input.setAttribute("aria-expanded", "false");
                  syncInputValue();
                }
              });
              list.append(button);
            });
          };
          const openList = () => {
            if (field.disabled || field.readonly) return;
            open = true;
            list.hidden = false;
            input.setAttribute("aria-expanded", "true");
            renderOptions();
            if (!multiple) input.value = query;
          };
          const closeList = () => {
            open = false;
            list.hidden = true;
            input.setAttribute("aria-expanded", "false");
            query = "";
            syncInputValue();
          };
          input.addEventListener("focus", openList);
          input.addEventListener("click", openList);
          input.addEventListener("input", () => {
            query = input.value;
            highlightedIndex = 0;
            open = true;
            list.hidden = false;
            input.setAttribute("aria-expanded", "true");
            renderOptions();
          });
          input.addEventListener("keydown", (event) => {
            const options = filteredOptions();
            if (event.key === "ArrowDown") {
              event.preventDefault();
              openList();
              if (options.length) highlightedIndex = (highlightedIndex + 1) % options.length;
              renderOptions();
              scrollHighlightedIntoView();
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              openList();
              if (options.length) highlightedIndex = (highlightedIndex - 1 + options.length) % options.length;
              renderOptions();
              scrollHighlightedIntoView();
              return;
            }
            if (event.key === "Enter" && open && options.length) {
              event.preventDefault();
              list.querySelector(`.rm-typeahead-option[data-index="${highlightedIndex}"]`)?.click();
              return;
            }
            if (event.key === "Escape" && open) {
              event.preventDefault();
              closeList();
            }
          });
          this.renderListeners.push(() => {
            this.root.removeEventListener("pointerdown", onRootPointerDown, true);
          });
          const onRootPointerDown = (event) => {
            if (!open) return;
            if ((typeof event.composedPath === "function" ? event.composedPath() : []).includes(wrap)) return;
            closeList();
          };
          this.root.addEventListener("pointerdown", onRootPointerDown, true);
          renderSelected();
          renderOptions();
          syncInputValue();
          wrap.append(selectedHost, inputWrap, list);
          this.inputNodes.set(field.name, wrap);
          return wrap;
        }
        createControl(field) {
          const value = this.valuesValue[field.name];
          const baseInput = (type) => {
            const input = createElement(this.doc, "input");
            input.id = `${this.id}-${field.name}`;
            input.name = field.name;
            input.type = type;
            input.className = "rm-control";
            input.placeholder = field.placeholder || "";
            input.disabled = !!field.disabled;
            input.readOnly = !!field.readonly;
            input.required = !!field.required;
            input.autofocus = !!field.autoFocus;
            applyAttributes(input, field.attributes);
            this.inputNodes.set(field.name, input);
            return input;
          };
          switch (field.type) {
            case "text":
            case "email":
            case "password":
            case "search":
            case "url":
            case "tel": {
              const input = baseInput(field.type);
              input.value = String(value ?? "");
              if (field.minLength != null) input.minLength = field.minLength;
              if (field.maxLength != null) input.maxLength = field.maxLength;
              if (field.pattern) input.pattern = field.pattern;
              if (field.autocomplete) input.setAttribute("autocomplete", field.autocomplete);
              if (field.inputmode) input.setAttribute("inputmode", field.inputmode);
              if (field.spellcheck != null) input.spellcheck = field.spellcheck;
              input.addEventListener("input", () => this.commitField(field, input.value));
              return input;
            }
            case "number": {
              const input = baseInput("number");
              input.value = value === "" || value == null ? "" : String(value);
              if (field.min != null) input.min = String(field.min);
              if (field.max != null) input.max = String(field.max);
              if (field.step != null) input.step = String(field.step);
              input.addEventListener("input", () =>
                this.commitField(field, input.value === "" ? "" : input.valueAsNumber),
              );
              return input;
            }
            case "textarea": {
              const input = createElement(this.doc, "textarea");
              input.id = `${this.id}-${field.name}`;
              input.name = field.name;
              input.className = "rm-textarea";
              input.placeholder = field.placeholder || "";
              input.value = String(value ?? "");
              input.rows = field.rows ?? 4;
              input.disabled = !!field.disabled;
              input.readOnly = !!field.readonly;
              input.required = !!field.required;
              input.autofocus = !!field.autoFocus;
              if (field.minLength != null) input.minLength = field.minLength;
              if (field.maxLength != null) input.maxLength = field.maxLength;
              input.style.resize = field.resize || "vertical";
              applyAttributes(input, field.attributes);
              input.addEventListener("input", () => this.commitField(field, input.value));
              this.inputNodes.set(field.name, input);
              return input;
            }
            case "select": {
              if (field.searchable) return this.renderTypeaheadSelect(field, value, false);
              const select = createElement(this.doc, "select");
              select.id = `${this.id}-${field.name}`;
              select.name = field.name;
              select.className = "rm-select";
              select.disabled = !!field.disabled;
              for (const option of field.options) {
                const el = createElement(this.doc, "option");
                el.value = option.value;
                el.textContent = option.label;
                el.disabled = !!option.disabled;
                select.append(el);
              }
              select.value = String(value ?? "");
              select.addEventListener("change", () => this.commitField(field, select.value));
              this.inputNodes.set(field.name, select);
              return select;
            }
            case "multiselect": {
              if (field.searchable) return this.renderTypeaheadSelect(field, value, true);
              const box = createElement(this.doc, "div");
              box.className = "rm-chipbox";
              const selected = new Set(Array.isArray(value) ? value.map(String) : []);
              for (const option of field.options) {
                const button = createElement(this.doc, "button");
                button.type = "button";
                button.className = "rm-chip";
                button.textContent = option.label;
                button.disabled = !!option.disabled;
                const sync = () => (button.dataset.selected = String(selected.has(option.value)));
                sync();
                button.addEventListener("click", () => {
                  selected.has(option.value) ? selected.delete(option.value) : selected.add(option.value);
                  sync();
                  this.commitField(field, Array.from(selected));
                });
                box.append(button);
              }
              this.inputNodes.set(field.name, box);
              return box;
            }
            case "radio":
            case "checkbox-group": {
              const options = createElement(this.doc, "div");
              options.className = "rm-options";
              options.dataset.direction = field.direction || "vertical";
              const current =
                field.type === "checkbox-group"
                  ? new Set(Array.isArray(value) ? value.map(String) : [])
                  : null;
              for (const option of field.options) {
                const label = createElement(this.doc, "label");
                label.className = "rm-option";
                const input = createElement(this.doc, "input");
                input.type = field.type === "radio" ? "radio" : "checkbox";
                input.name = field.type === "radio" ? field.name : `${field.name}[]`;
                input.value = option.value;
                input.disabled = !!option.disabled;
                input.checked =
                  field.type === "radio" ? String(value ?? "") === option.value : current.has(option.value);
                input.addEventListener("change", () => {
                  if (field.type === "radio") this.commitField(field, option.value);
                  else {
                    input.checked ? current.add(option.value) : current.delete(option.value);
                    this.commitField(field, Array.from(current));
                  }
                });
                const copy = createElement(this.doc, "span");
                copy.className = "rm-option-copy";
                const name = createElement(this.doc, "span");
                name.textContent = option.label;
                copy.append(name);
                if (option.description) {
                  const desc = createElement(this.doc, "span");
                  desc.className = "rm-option-desc";
                  desc.textContent = option.description;
                  copy.append(desc);
                }
                label.append(input, copy);
                options.append(label);
              }
              this.inputNodes.set(field.name, options);
              return options;
            }
            case "checkbox":
            case "switch": {
              const wrap = createElement(this.doc, "label");
              wrap.className = "rm-check-row";
              const copy = createElement(this.doc, "span");
              copy.className = "rm-check-label";
              const title = createElement(this.doc, "span");
              title.className = "rm-label";
              title.textContent = field.label || field.name;
              copy.append(title);
              if (field.description) {
                const desc = createElement(this.doc, "div");
                desc.className = "rm-description-field";
                desc.textContent = field.description;
                copy.append(desc);
              }
              const input = createElement(this.doc, "input");
              input.id = `${this.id}-${field.name}`;
              input.name = field.name;
              input.type = "checkbox";
              input.checked = Boolean(value);
              input.disabled = !!field.disabled;
              input.className = field.type === "switch" ? "rm-switch" : "rm-native-check";
              input.addEventListener("change", () => this.commitField(field, input.checked));
              this.inputNodes.set(field.name, input);
              wrap.append(copy, input);
              return wrap;
            }
            case "range": {
              const wrap = createElement(this.doc, "div");
              wrap.className = "rm-range-wrap";
              const input = createElement(this.doc, "input");
              input.id = `${this.id}-${field.name}`;
              input.name = field.name;
              input.type = "range";
              input.className = "rm-range";
              input.min = String(field.min ?? 0);
              input.max = String(field.max ?? 100);
              input.step = String(field.step ?? 1);
              input.value = String(value ?? field.min ?? 0);
              const out = createElement(this.doc, "output");
              out.className = "rm-range-value";
              out.textContent = input.value;
              input.addEventListener("input", () => {
                out.textContent = input.value;
                this.commitField(field, input.valueAsNumber);
              });
              wrap.append(input);
              if (field.showValue !== false) wrap.append(out);
              this.inputNodes.set(field.name, input);
              return wrap;
            }
            case "date":
            case "datetime-local":
            case "time":
            case "month":
            case "week": {
              const input = baseInput(field.type);
              input.value = String(value ?? "");
              if (field.min) input.min = field.min;
              if (field.max) input.max = field.max;
              if (field.step != null) input.step = String(field.step);
              input.addEventListener("input", () => this.commitField(field, input.value));
              return input;
            }
            case "color": {
              const wrap = createElement(this.doc, "div");
              wrap.className = "rm-color-row";
              const input = createElement(this.doc, "input");
              input.id = `${this.id}-${field.name}`;
              input.name = field.name;
              input.type = "color";
              input.className = "rm-color";
              input.value = typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#ff7a18";
              input.addEventListener("input", () => this.commitField(field, input.value));
              wrap.append(input);
              if (field.presets?.length) {
                const presets = createElement(this.doc, "div");
                presets.className = "rm-presets";
                for (const color of field.presets) {
                  const swatch = createElement(this.doc, "button");
                  swatch.type = "button";
                  swatch.className = "rm-swatch";
                  swatch.style.background = color;
                  swatch.setAttribute("aria-label", color);
                  swatch.addEventListener("click", () => {
                    input.value = color;
                    this.commitField(field, color);
                  });
                  presets.append(swatch);
                }
                wrap.append(presets);
              }
              this.inputNodes.set(field.name, input);
              return wrap;
            }
            case "file": {
              const input = baseInput("file");
              if (field.accept) input.accept = field.accept;
              input.multiple = !!field.multiple;
              if (field.capture) input.setAttribute("capture", field.capture);
              input.addEventListener("change", () => this.commitField(field, Array.from(input.files || [])));
              return input;
            }
            case "hidden": {
              const input = baseInput("hidden");
              input.value = String(value ?? "");
              input.addEventListener("change", () => this.commitField(field, input.value));
              return input;
            }
            case "segmented": {
              const segmented = createElement(this.doc, "div");
              segmented.className = "rm-segmented";
              for (const option of field.options) {
                const button = createElement(this.doc, "button");
                button.type = "button";
                button.className = "rm-segment";
                button.textContent = option.label;
                button.disabled = !!option.disabled;
                const sync = () =>
                  (button.dataset.selected = String(
                    String(this.valuesValue[field.name] ?? "") === option.value,
                  ));
                sync();
                button.addEventListener("click", () => {
                  this.commitField(field, option.value);
                  segmented
                    .querySelectorAll(".rm-segment")
                    .forEach((node) => (node.dataset.selected = String(node === button)));
                });
                segmented.append(button);
              }
              this.inputNodes.set(field.name, segmented);
              return segmented;
            }
            case "rating": {
              const stars = createElement(this.doc, "div");
              stars.className = "rm-stars";
              const max = Math.max(1, field.max ?? 5);
              for (let i = 1; i <= max; i += 1) {
                const button = createElement(this.doc, "button");
                button.type = "button";
                button.className = "rm-star";
                button.textContent = "★";
                const sync = () =>
                  (button.dataset.on = String(Number(this.valuesValue[field.name] || 0) >= i));
                sync();
                button.addEventListener("click", () => {
                  const next =
                    field.allowZero !== false && Number(this.valuesValue[field.name]) === i ? 0 : i;
                  this.commitField(field, next);
                  stars
                    .querySelectorAll(".rm-star")
                    .forEach((node, index) => (node.dataset.on = String(index < next)));
                });
                stars.append(button);
              }
              this.inputNodes.set(field.name, stars);
              return stars;
            }
            case "button": {
              const button = createElement(this.doc, "button");
              button.type = "button";
              button.className = "rm-field-button rm-action";
              button.dataset.variant = field.variant || "secondary";
              button.textContent = field.text || field.label || field.name;
              button.addEventListener("click", async () => {
                try {
                  await field.onPress?.(this.context);
                } catch (error) {
                  this.reportError(error);
                }
              });
              return button;
            }
            case "media-preview": {
              const item = typeof field.item === "function" ? field.item(this.context) : field.item;
              const card = createElement(this.doc, "article");
              card.className = "rm-media-preview";
              card.dataset.compact = String(!!field.compact);
              if (item.thumbnail) {
                const image = createElement(this.doc, "img");
                image.className = "rm-media-thumb";
                image.src = item.thumbnail;
                image.alt = item.title || item.type || "Media preview";
                image.loading = "lazy";
                card.append(image);
              } else {
                const placeholder = createElement(this.doc, "div");
                placeholder.className = "rm-media-placeholder";
                placeholder.textContent =
                  item.type === "video" ? "VIDEO" : item.type === "audio" ? "AUDIO" : "MEDIA";
                card.append(placeholder);
              }
              const copy = createElement(this.doc, "div");
              copy.className = "rm-media-copy";
              const title = createElement(this.doc, "strong");
              title.textContent = item.title || item.source || item.id;
              copy.append(title);
              if (item.description) {
                const description = createElement(this.doc, "p");
                description.textContent = item.description;
                copy.append(description);
              }
              const meta = [
                item.type,
                item.quality,
                item.width && item.height ? `${item.width}×${item.height}` : null,
                item.provider,
                field.showSource !== false ? item.source : null,
              ]
                .filter(Boolean)
                .join(" · ");
              if (meta) {
                const metadata = createElement(this.doc, "small");
                metadata.textContent = meta;
                copy.append(metadata);
              }
              if (item.url) {
                const open = createElement(this.doc, "a");
                open.className = "rm-media-open";
                open.href = item.url;
                open.target = "_blank";
                open.rel = "noopener noreferrer";
                open.textContent = "Abrir origem";
                copy.append(open);
              }
              card.append(copy);
              return card;
            }
            case "media-picker": {
              const items = typeof field.items === "function" ? field.items(this.context) : field.items;
              const wrap = createElement(this.doc, "div");
              wrap.className = "rm-media-picker";
              wrap.style.setProperty("--rm-media-columns", String(field.columns ?? 2));
              let selected = new Set(Array.isArray(value) ? value.map(String) : []);
              const sync = () => {
                wrap.querySelectorAll("[data-media-id]").forEach((node) => {
                  node.dataset.selected = String(selected.has(node.dataset.mediaId || ""));
                });
              };
              if (field.selectAll !== false && items.length > 1) {
                const toolbar = createElement(this.doc, "div");
                toolbar.className = "rm-picker-toolbar";
                const count = createElement(this.doc, "span");
                const updateCount = () => {
                  count.textContent = `${selected.size} de ${items.length} selecionados`;
                };
                updateCount();
                const all = createElement(this.doc, "button");
                all.type = "button";
                all.className = "rm-mini-button";
                all.textContent = "Selecionar tudo";
                all.addEventListener("click", () => {
                  selected = new Set(items.filter((item) => !item.disabled).map((item) => item.id));
                  this.commitField(field, Array.from(selected));
                  sync();
                  updateCount();
                });
                toolbar.append(count, all);
                wrap.append(toolbar);
              }
              const grid = createElement(this.doc, "div");
              grid.className = "rm-media-grid";
              for (const item of items) {
                const card = createElement(this.doc, "button");
                card.type = "button";
                card.className = "rm-media-item";
                card.dataset.mediaId = item.id;
                card.dataset.selected = String(selected.has(item.id));
                card.disabled = !!item.disabled;
                if (item.thumbnail) {
                  const image = createElement(this.doc, "img");
                  image.src = item.thumbnail;
                  image.alt = item.title || item.id;
                  image.loading = "lazy";
                  card.append(image);
                }
                const detail = createElement(this.doc, "span");
                detail.className = "rm-media-item-copy";
                const title = createElement(this.doc, "strong");
                title.textContent = item.title || item.quality || item.id;
                detail.append(title);
                const meta = [
                  item.type,
                  item.quality,
                  item.width && item.height ? `${item.width}×${item.height}` : null,
                  item.provider,
                ]
                  .filter(Boolean)
                  .join(" · ");
                if (meta) {
                  const small = createElement(this.doc, "small");
                  small.textContent = meta;
                  detail.append(small);
                }
                card.append(detail);
                const check = createElement(this.doc, "span");
                check.className = "rm-media-check";
                check.textContent = "✓";
                card.append(check);
                card.addEventListener("click", () => {
                  if (selected.has(item.id)) selected.delete(item.id);
                  else {
                    if (field.maxSelected && selected.size >= field.maxSelected) return;
                    selected.add(item.id);
                  }
                  this.commitField(field, Array.from(selected));
                  sync();
                });
                grid.append(card);
              }
              wrap.append(grid);
              this.inputNodes.set(field.name, wrap);
              return wrap;
            }
            case "provider-status": {
              const providers =
                typeof field.providers === "function" ? field.providers(this.context) : field.providers;
              const list = createElement(this.doc, "div");
              list.className = "rm-provider-list";
              for (const provider of providers) {
                const row = createElement(this.doc, "div");
                row.className = "rm-provider";
                row.dataset.state = provider.state;
                const dot = createElement(this.doc, "span");
                dot.className = "rm-provider-dot";
                const copy = createElement(this.doc, "span");
                copy.className = "rm-provider-copy";
                const label = createElement(this.doc, "strong");
                label.textContent = provider.label;
                copy.append(label);
                const description = createElement(this.doc, "small");
                description.textContent = provider.error || provider.description || provider.state;
                copy.append(description);
                const duration = createElement(this.doc, "span");
                duration.className = "rm-provider-duration";
                duration.textContent = provider.durationMs != null ? `${provider.durationMs} ms` : "";
                row.append(dot, copy, duration);
                list.append(row);
              }
              return list;
            }
            case "request-log": {
              const entries =
                typeof field.entries === "function" ? field.entries(this.context) : field.entries;
              const list = createElement(this.doc, "div");
              list.className = "rm-request-log";
              if (field.maxHeight) list.style.maxHeight = `${field.maxHeight}px`;
              for (const entry of entries) {
                const row = createElement(this.doc, "button");
                row.type = "button";
                row.className = "rm-request-row";
                const status = entry.status == null ? "" : String(entry.status);
                row.innerHTML = `<span class="rm-request-method"></span><span class="rm-request-url"></span><span class="rm-request-status"></span>`;
                const method = row.querySelector(".rm-request-method");
                const url = row.querySelector(".rm-request-url");
                const statusNode = row.querySelector(".rm-request-status");
                if (method) method.textContent = entry.method || "GET";
                if (url) url.textContent = entry.url;
                if (statusNode)
                  statusNode.textContent = [status, entry.durationMs != null ? `${entry.durationMs}ms` : ""]
                    .filter(Boolean)
                    .join(" · ");
                if (field.onSelect)
                  row.addEventListener("click", () => field.onSelect?.(entry, this.context));
                list.append(row);
              }
              return list;
            }
            case "debug-json": {
              const data = typeof field.data === "function" ? field.data(this.context) : field.data;
              const wrap = createElement(this.doc, "div");
              wrap.className = "rm-debug-json";
              const toolbar = createElement(this.doc, "div");
              toolbar.className = "rm-picker-toolbar";
              const label = createElement(this.doc, "span");
              label.textContent = "JSON";
              const copy = createElement(this.doc, "button");
              copy.type = "button";
              copy.className = "rm-mini-button";
              copy.textContent = "Copiar";
              const text = (() => {
                try {
                  return JSON.stringify(data, null, field.pretty === false ? 0 : 2);
                } catch {
                  return String(data);
                }
              })();
              copy.addEventListener("click", async () => {
                try {
                  await this.win.navigator.clipboard?.writeText(text);
                  notifyToaster("success", "Copiado", "JSON copiado para a área de transferência.");
                } catch (error) {
                  this.reportError(error);
                }
              });
              toolbar.append(label, copy);
              const pre = createElement(this.doc, "pre");
              pre.textContent = text;
              if (field.maxHeight) pre.style.maxHeight = `${field.maxHeight}px`;
              wrap.append(toolbar, pre);
              return wrap;
            }
            case "channel-picker": {
              const wrap = createElement(this.doc, "div");
              wrap.className = "rm-channel-picker";
              const optionsHost = createElement(this.doc, "div");
              optionsHost.className = "rm-channel-options";
              let selected = new Set(
                field.multiple
                  ? Array.isArray(value)
                    ? value.map(String)
                    : []
                  : [String(value ?? "")].filter(Boolean),
              );
              const renderOptions = (query = "") => {
                optionsHost.replaceChildren();
                const q = query.trim().toLowerCase();
                for (const option of field.options) {
                  if (q && !`${option.label} ${option.description || ""}`.toLowerCase().includes(q)) continue;
                  const button = createElement(this.doc, "button");
                  button.type = "button";
                  button.className = "rm-channel-option";
                  button.dataset.selected = String(selected.has(option.value));
                  button.disabled = !!option.disabled;
                  if (option.icon) {
                    const icon = createElement(this.doc, "span");
                    icon.innerHTML = option.icon;
                    button.append(icon);
                  }
                  const copy = createElement(this.doc, "span");
                  const title = createElement(this.doc, "strong");
                  title.textContent = option.label;
                  copy.append(title);
                  if (option.description) {
                    const small = createElement(this.doc, "small");
                    small.textContent = option.description;
                    copy.append(small);
                  }
                  button.append(copy);
                  button.addEventListener("click", () => {
                    if (field.multiple) {
                      selected.has(option.value) ? selected.delete(option.value) : selected.add(option.value);
                      this.commitField(field, Array.from(selected));
                    } else {
                      selected = new Set([option.value]);
                      this.commitField(field, option.value);
                    }
                    renderOptions(q);
                  });
                  optionsHost.append(button);
                }
              };
              if (field.searchable) {
                const search = createElement(this.doc, "input");
                search.type = "search";
                search.className = "rm-control rm-channel-search";
                search.placeholder = field.placeholder || "Buscar…";
                search.addEventListener("input", () => renderOptions(search.value));
                wrap.append(search);
              }
              renderOptions();
              wrap.append(optionsHost);
              this.inputNodes.set(field.name, wrap);
              return wrap;
            }
            case "html": {
              const html = createElement(this.doc, "div");
              html.innerHTML = typeof field.html === "function" ? field.html(this.context) : field.html;
              return html;
            }
            case "custom": {
              const container = createElement(this.doc, "div");
              container.dataset.customField = field.name;
              const rendered = field.render(this.context, field);
              if (typeof rendered === "string") container.innerHTML = rendered;
              else if (rendered) container.append(rendered);
              this.customNodes.set(field.name, container);
              return container;
            }
          }
          throw new Error(`Unsupported RodMenu field type: ${field.type}`);
        }
        renderActionsDefault() {
          const footer = createElement(this.doc, "footer");
          footer.className = "rm-actions";
          for (const action of this.schemaValue.actions || []) {
            const button = this.renderComponent(
              "action",
              () => {
                return createElement(this.doc, "button");
              },
              { action },
            );
            button.setAttribute("type", action.role === "submit" ? "submit" : "button");
            button.className = "rm-action";
            button.dataset.action = action.id;
            button.dataset.variant =
              action.variant ||
              (action.role === "destructive" ? "danger" : action.role === "cancel" ? "secondary" : "primary");
            if (action.ariaLabel) button.setAttribute("aria-label", action.ariaLabel);
            if (action.icon) {
              const icon = createElement(this.doc, "span");
              icon.className = "rm-action-icon";
              icon.innerHTML = action.icon;
              button.append(icon);
            }
            const text = createElement(this.doc, "span");
            text.className = "rm-action-label";
            text.textContent = action.label;
            button.append(text);
            if (action.badge != null) {
              const badge = createElement(this.doc, "span");
              badge.className = "rm-badge rm-action-badge";
              badge.dataset.actionBadge = action.id;
              const rawBadge = typeof action.badge === "function" ? action.badge(this.context) : action.badge;
              badge.textContent = rawBadge == null ? "" : String(rawBadge);
              badge.hidden = rawBadge == null || rawBadge === "";
              button.append(badge);
            }
            if (action.shortcut) {
              const shortcut = createElement(this.doc, "kbd");
              shortcut.className = "rm-shortcut";
              shortcut.textContent = action.shortcut;
              button.append(shortcut);
            }
            button.addEventListener("click", () => void this.runAction(action));
            footer.append(button);
          }
          return footer;
        }
        commitField(field, raw) {
          const value = field.transform ? field.transform(raw, this.context) : raw;
          this.stateStore.set(field.name, value);
          this.valuesValue = this.stateStore.snapshot();
          this.persistenceManager.trigger("change");
          this.setFieldError(field.name, null);
          try {
            field.onChange?.(value, this.context);
          } catch (error) {
            this.reportError(error);
          }
          try {
            this.schemaValue.onChange?.(this.context);
          } catch (error) {
            this.reportError(error);
          }
          this.refreshDynamicState();
        }
        async runAction(action) {
          if (this.actionLoading.has(action.id) || this.loading) return;
          if (action.validate !== false && action.role !== "cancel") {
            if (!(await this.validate())) return;
          }
          this.setActionLoading(action.id, true);
          try {
            const data = action.handler ? await action.handler(this.context) : void 0;
            if (action.role === "submit") this.persistenceManager.trigger("submit");
            if (action.close ?? ["submit", "cancel", "destructive"].includes(action.role || "custom"))
              this.finish(action.id, data, "action");
          } catch (error) {
            this.reportError(error);
          } finally {
            this.setActionLoading(action.id, false);
          }
        }
        safePredicate(fn) {
          try {
            return !!fn(this.valuesValue, this.context);
          } catch (error) {
            this.reportError(error);
            return true;
          }
        }
        refreshDynamicState() {
          for (const field of this.getAllFields()) {
            const row = this.fieldNodes.get(field.name);
            if (!row) continue;
            const visible = !field.hidden && (!field.visibleWhen || this.safePredicate(field.visibleWhen));
            row.dataset.hidden = String(!visible);
            const disabled = !!field.disabled || !!field.disabledWhen?.(this.valuesValue, this.context);
            const input = this.inputNodes.get(field.name);
            if (input && "disabled" in input) input.disabled = disabled;
          }
          for (const action of this.schemaValue.actions || []) {
            const button = this.root.querySelector(`.rm-action[data-action="${CSS.escape(action.id)}"]`);
            if (!button) continue;
            button.hidden = !(
              !action.hidden &&
              (!action.visibleWhen || this.safePredicate(action.visibleWhen))
            );
            button.disabled =
              this.loading ||
              this.actionLoading.has(action.id) ||
              !!action.disabled ||
              !!(action.disabledWhen && this.safePredicate(action.disabledWhen));
            const badge = button.querySelector(".rm-action-badge");
            if (badge && action.badge != null)
              try {
                const value = typeof action.badge === "function" ? action.badge(this.context) : action.badge;
                badge.textContent = value == null ? "" : String(value);
                badge.hidden = value == null || value === "";
              } catch (error) {
                this.reportError(error);
              }
          }
          for (const field of this.getAllFields()) {
            const trailing = field.trailingAction;
            if (!trailing) continue;
            const button = this.root.querySelector(
              `.rm-trailing-action[data-trailing-action="${CSS.escape(trailing.id || field.name)}"]`,
            );
            if (!button || button.dataset.loading === "true") continue;
            button.disabled =
              !!trailing.disabled || !!(trailing.disabledWhen && this.safePredicate(trailing.disabledWhen));
          }
        }
        async validate() {
          this.clearErrors();
          let firstInvalid = null;
          const fields = this.getAllFields();
          for (const field of fields) {
            if (
              [
                "divider",
                "html",
                "button",
                "hidden",
                "media-preview",
                "provider-status",
                "request-log",
                "debug-json",
              ].includes(field.type)
            )
              continue;
            const row = this.fieldNodes.get(field.name);
            if (row?.dataset.hidden === "true") continue;
            const value = this.readFieldValue(field);
            if (field.required && this.isEmptyValue(value)) {
              this.setFieldError(field.name, "Campo obrigatório.");
              firstInvalid ||= this.inputNodes.get(field.name) || row || null;
              continue;
            }
            if (
              field.type === "media-picker" &&
              field.minSelected &&
              Array.isArray(value) &&
              value.length < field.minSelected
            ) {
              this.setFieldError(field.name, `Selecione pelo menos ${field.minSelected} item(ns).`);
              firstInvalid ||= this.inputNodes.get(field.name) || row || null;
              continue;
            }
            if (field.validate)
              try {
                const message = await field.validate(value, this.valuesValue, this.context);
                if (message) {
                  this.setFieldError(field.name, message);
                  firstInvalid ||= this.inputNodes.get(field.name) || row || null;
                }
              } catch (error) {
                this.setFieldError(field.name, error instanceof Error ? error.message : "Valor inválido.");
                firstInvalid ||= this.inputNodes.get(field.name) || row || null;
              }
          }
          if (this.schemaValue.validate)
            try {
              const result = await this.schemaValue.validate(this.valuesValue, this.context);
              if (typeof result === "string" && result) this.setGlobalError(result);
              else if (result && typeof result === "object") {
                for (const [name, message] of Object.entries(result))
                  if (message) this.setFieldError(name, message);
              }
            } catch (error) {
              this.setGlobalError(
                error instanceof Error ? error.message : "Não foi possível validar o formulário.",
              );
            }
          const valid = Object.keys(this.errorsValue).length === 0 && !this.getGlobalError();
          if (!valid && firstInvalid) {
            firstInvalid.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
            if ("focus" in firstInvalid) firstInvalid.focus({ preventScroll: true });
          }
          return valid;
        }
        readFieldValue(field) {
          if (field.type === "custom" && field.read) {
            const node = this.customNodes.get(field.name);
            if (node) {
              const next = field.read(node, this.context);
              this.stateStore.set(field.name, next);
              this.valuesValue = this.stateStore.snapshot();
              this.persistenceManager.trigger("change");
              return next;
            }
          }
          return this.valuesValue[field.name];
        }
        isEmptyValue(value) {
          return (
            value == null || value === "" || (Array.isArray(value) && value.length === 0) || value === false
          );
        }
        setFieldError(name, error) {
          const row = this.fieldNodes.get(name);
          if (!error) {
            delete this.errorsValue[name];
            if (row) {
              row.dataset.error = "false";
              const node = row.querySelector(".rm-error");
              if (node) node.textContent = "";
            }
            return;
          }
          this.errorsValue[name] = error;
          if (row) {
            row.dataset.error = "true";
            const node = row.querySelector(".rm-error");
            if (node) node.textContent = error;
          }
        }
        clearErrors() {
          this.errorsValue = {};
          this.setGlobalError("");
          for (const row of this.fieldNodes.values()) {
            row.dataset.error = "false";
            const node = row.querySelector(".rm-error");
            if (node) node.textContent = "";
          }
        }
        setGlobalError(message) {
          const node = this.root.querySelector(".rm-global-error");
          if (!node) return;
          node.textContent = message;
          node.dataset.show = String(!!message);
          if (message) this.errorsValue.__global = message;
          else delete this.errorsValue.__global;
        }
        getGlobalError() {
          return this.errorsValue.__global || "";
        }
        setValue(name, value) {
          this.stateStore.set(name, value);
          this.valuesValue = this.stateStore.snapshot();
          this.persistenceManager.trigger("change");
          this.writeValueToControl(name, value);
          this.refreshDynamicState();
          try {
            this.schemaValue.onChange?.(this.context);
          } catch (error) {
            this.reportError(error);
          }
        }
        setValues(values) {
          this.stateStore.patch(values);
          this.valuesValue = this.stateStore.snapshot();
          this.persistenceManager.trigger("change");
          for (const [name, value] of Object.entries(values)) this.writeValueToControl(name, value);
          this.refreshDynamicState();
          try {
            this.schemaValue.onChange?.(this.context);
          } catch (error) {
            this.reportError(error);
          }
        }
        writeValueToControl(name, value, allowRender = true) {
          const field = this.getAllFields().find((item) => item.name === name);
          if (!field) return;
          if (field.type === "custom" && field.write) {
            const container = this.customNodes.get(name);
            if (container) field.write(container, value, this.context);
            return;
          }
          const input = this.inputNodes.get(name);
          if (!input) return;
          if (
            input instanceof HTMLInputElement ||
            input instanceof HTMLTextAreaElement ||
            input instanceof HTMLSelectElement
          ) {
            if (input instanceof HTMLInputElement && ["checkbox", "radio"].includes(input.type))
              input.checked = Boolean(value);
            else if (!(input instanceof HTMLInputElement && input.type === "file"))
              input.value = String(value ?? "");
          } else if (allowRender) {
            this.render();
            requestAnimationFrame(() => {
              const root = this.getRootElement();
              root.dataset.open = "true";
            });
          }
        }
        reset() {
          this.stateStore.replace(this.cloneValues(this.initialValues));
          this.valuesValue = this.stateStore.snapshot();
          this.persistenceManager.trigger("change");
          this.render();
          requestAnimationFrame(() => {
            this.getRootElement().dataset.open = "true";
          });
        }
        setActiveTab(tabId) {
          const tabs = this.schemaValue.tabs || [];
          const nextTab = tabs.find((tab) => tab.id === tabId);
          if (!nextTab || this.activeTabId === tabId || this.destroyed) return;
          const root = this.getRootElement();
          const shell = root.querySelector(".rm-shell");
          const wrapper = root.querySelector(".rm-tabs-wrap");
          const oldPanel = wrapper?.querySelector(".rm-tab-panel");
          if (!shell || !wrapper || !oldPanel) {
            this.activeTabId = tabId;
            this.render();
            requestAnimationFrame(() => {
              if (!this.destroyed) this.getRootElement().dataset.open = "true";
            });
            return;
          }
          const currentHeight = shell.getBoundingClientRect().height;
          if (currentHeight > 0) {
            shell.style.height = `${Math.round(currentHeight)}px`;
            shell.style.maxHeight = `min(92dvh, calc(var(--rm-vvh, 100vh) - 8px))`;
          }
          for (const tab of tabs) {
            for (const field of tab.fields || []) {
              this.fieldNodes.delete(field.name);
              this.inputNodes.delete(field.name);
              this.customNodes.delete(field.name);
            }
            for (const section of tab.sections || [])
              for (const field of section.fields || []) {
                this.fieldNodes.delete(field.name);
                this.inputNodes.delete(field.name);
                this.customNodes.delete(field.name);
              }
          }
          this.activeTabId = tabId;
          for (const button of Array.from(wrapper.querySelectorAll(".rm-tab"))) {
            const isActive = button.getAttribute("data-tab-id") === tabId;
            button.dataset.active = String(isActive);
            button.setAttribute("aria-selected", String(isActive));
          }
          const panel = createElement(this.doc, "div");
          panel.className = "rm-tab-panel";
          panel.dataset.tabPanel = nextTab.id;
          panel.dataset.entering = "true";
          panel.setAttribute("role", "tabpanel");
          if (nextTab.fields?.length) panel.append(this.renderSection({ fields: nextTab.fields }));
          for (const section of nextTab.sections || []) panel.append(this.renderSection(section));
          oldPanel.replaceWith(panel);
          this.refreshDynamicState();
          requestAnimationFrame(() => {
            if (this.destroyed) return;
            const nav = wrapper.querySelector(".rm-tabs");
            this.revealActiveTab(nav, "smooth");
            panel.addEventListener("animationend", () => panel.removeAttribute("data-entering"), {
              once: true,
            });
          });
        }
        refreshStyles() {
          const style = this.root.querySelector(`style[data-rod-menu-style="${STYLE_VERSION}"]`);
          if (!style) return;
          const extra = [globalConfig.css, this.schemaValue.css || ""].filter(Boolean).join(`

`);
          style.textContent = compileStylesheet(extra ? `${css}\n\n${extra}` : css);
        }
        update(patch) {
          this.schemaValue = {
            ...this.schemaValue,
            ...patch,
          };
          this.refreshStyles();
          this.render();
          requestAnimationFrame(() => {
            this.getRootElement().dataset.open = "true";
          });
        }
        setLoading(loading) {
          this.loading = loading;
          const root = this.getRootElement();
          root.dataset.loading = String(loading);
          this.refreshDynamicState();
        }
        setActionLoading(actionId, loading) {
          loading ? this.actionLoading.add(actionId) : this.actionLoading.delete(actionId);
          const button = this.root.querySelector(`.rm-action[data-action="${CSS.escape(actionId)}"]`);
          if (!button) return;
          const existing = button.querySelector(".rm-spinner");
          if (loading && !existing) {
            const spinner = createElement(this.doc, "span");
            spinner.className = "rm-spinner";
            button.prepend(spinner);
          } else if (!loading && existing) existing.remove();
          this.refreshDynamicState();
        }
        bindGlobalEvents() {
          const keydown = (event) => {
            if (this.destroyed || this.settled || !this.isStackTop()) return;
            const shortcutAction = this.schemaValue.actions?.find(
              (action) => action.shortcut && matchesShortcut(event, action.shortcut),
            );
            if (shortcutAction) {
              event.preventDefault();
              this.runAction(shortcutAction);
              return;
            }
            if (
              event.key === "Escape" &&
              this.schemaValue.dismissible !== false &&
              this.schemaValue.closeOnEscape !== false
            ) {
              event.preventDefault();
              this.finish("dismiss", void 0, "escape");
              return;
            }
            if (event.key === "Tab" && this.schemaValue.trapFocus !== false) this.handleTab(event);
            if (event.key === "Enter" && this.schemaValue.submitOnEnter !== false) {
              const target = event.target;
              if (target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
              const submit = this.schemaValue.actions?.find((action) => action.role === "submit");
              if (submit) {
                event.preventDefault();
                this.runAction(submit);
              }
            }
          };
          const focusin = (event) => {
            const target = event.composedPath()[0];
            if (target instanceof this.win.HTMLElement && this.root.contains(target))
              this.lastFocusedInside = target;
          };
          this.doc.addEventListener("keydown", keydown, true);
          this.host.addEventListener("focusin", focusin, true);
          this.listeners.push(() => {
            this.doc.removeEventListener("keydown", keydown, true);
            this.host.removeEventListener("focusin", focusin, true);
          });
        }
        handleTab(event) {
          const focusable = this.getFocusable();
          if (!focusable.length) {
            event.preventDefault();
            return;
          }
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const active = this.doc.activeElement;
          if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
          }
        }
        getFocusable() {
          return Array.from(
            this.root.querySelectorAll(
              'button:not([disabled]):not([hidden]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((node) => !node.hidden && node.offsetParent !== null);
        }
        getKeyboardConfig() {
          return {
            ...globalConfig.keyboard,
            ...(this.schemaValue.keyboard || {}),
          };
        }
        getDeepActiveElement() {
          let active = this.doc.activeElement;
          while (active && active.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
          return active;
        }
        isEditableElement(node) {
          if (!(node instanceof this.win.HTMLElement)) return false;
          if (node instanceof this.win.HTMLInputElement)
            return (
              node.type !== "button" &&
              node.type !== "submit" &&
              node.type !== "reset" &&
              node.type !== "checkbox" &&
              node.type !== "radio"
            );
          return (
            node instanceof this.win.HTMLTextAreaElement ||
            node instanceof this.win.HTMLSelectElement ||
            node.isContentEditable
          );
        }
        focusInitial() {
          if (!this.isStackTop()) return;
          const config = this.getKeyboardConfig();
          if (config.autoFocus === "never") return;
          const explicit = this.root.querySelector("[autofocus]");
          if (explicit) {
            explicit.focus({ preventScroll: true });
            return;
          }
          if (config.autoFocus === "explicit") return;
          if (config.autoFocus === "desktop") {
            if (this.win.matchMedia?.("(pointer: coarse)")?.matches ?? false) return;
          }
          this.getFocusable()[0]?.focus({ preventScroll: true });
        }
        keepFocusedFieldVisible() {
          if (!this.isStackTop()) return;
          const config = this.getKeyboardConfig();
          if (!config.keepFocusedFieldVisible) return;
          const active = this.getDeepActiveElement();
          if (!this.isEditableElement(active) || !this.root.contains(active)) return;
          const body = this.root.querySelector(".rm-body");
          if (!body) return;
          const bodyRect = body.getBoundingClientRect();
          const activeRect = active.getBoundingClientRect();
          const pad = Math.max(0, config.focusScrollPaddingPx);
          if (activeRect.bottom > bodyRect.bottom - pad)
            body.scrollTop += activeRect.bottom - bodyRect.bottom + pad;
          else if (activeRect.top < bodyRect.top + pad) body.scrollTop -= bodyRect.top + pad - activeRect.top;
        }
        setupVisualViewport() {
          const config = this.getKeyboardConfig();
          const viewport = this.win.visualViewport;
          if (!viewport || !config.visualViewport) return;
          let raf = 0;
          const syncNow = () => {
            raf = 0;
            if (this.destroyed) return;
            const root = this.root.querySelector(".rm-root");
            if (!root) return;
            root.dataset.visualViewport = "true";
            root.style.setProperty("--rm-vvh", `${Math.round(viewport.height)}px`);
            root.style.setProperty("--rm-vvw", `${Math.round(viewport.width)}px`);
            root.style.setProperty("--rm-vv-top", `${Math.round(viewport.offsetTop)}px`);
            root.style.setProperty("--rm-vv-left", `${Math.round(viewport.offsetLeft)}px`);
            const keyboardOpen = viewport.height < this.win.innerHeight - 96;
            root.dataset.keyboard = String(keyboardOpen);
            if (keyboardOpen) this.keepFocusedFieldVisible();
          };
          const sync = () => {
            if (raf) return;
            raf = this.win.requestAnimationFrame(syncNow);
          };
          syncNow();
          viewport.addEventListener("resize", sync, { passive: true });
          viewport.addEventListener("scroll", sync, { passive: true });
          const onFocusIn = () => {
            this.win.setTimeout(() => {
              sync();
              this.keepFocusedFieldVisible();
            }, 0);
            this.win.setTimeout(() => {
              sync();
              this.keepFocusedFieldVisible();
            }, 180);
          };
          this.host.addEventListener("focusin", onFocusIn);
          this.listeners.push(() => {
            if (raf) this.win.cancelAnimationFrame(raf);
            viewport.removeEventListener("resize", sync);
            viewport.removeEventListener("scroll", sync);
            this.host.removeEventListener("focusin", onFocusIn);
          });
        }
        applyHydratedValues(values) {
          const config = this.getKeyboardConfig();
          const active = this.getDeepActiveElement();
          const preserve =
            config.preserveFocusOnHydrate && this.isEditableElement(active) && this.root.contains(active);
          for (const [name, value] of Object.entries(values)) {
            if (!this.getAllFields().find((item) => item.name === name)) continue;
            const input = this.inputNodes.get(name);
            if (preserve && input && (input === active || input.contains(active))) continue;
            this.writeValueToControl(name, value, false);
          }
          this.refreshDynamicState();
          if (preserve) {
            const reconcile = () => {
              this.host.removeEventListener("focusout", reconcile, true);
              this.win.setTimeout(() => {
                if (this.destroyed) return;
                const nextActive = this.getDeepActiveElement();
                if (this.isEditableElement(nextActive) && this.root.contains(nextActive)) return;
                const wasOpen = this.root.querySelector(".rm-root")?.dataset.open === "true";
                const bodyScroll = this.root.querySelector(".rm-body")?.scrollTop ?? 0;
                this.render();
                const nextRoot = this.root.querySelector(".rm-root");
                if (wasOpen && nextRoot) nextRoot.dataset.open = "true";
                const nextBody = this.root.querySelector(".rm-body");
                if (nextBody) nextBody.scrollTop = bodyScroll;
              }, 0);
            };
            this.host.addEventListener("focusout", reconcile, true);
            this.listeners.push(() => this.host.removeEventListener("focusout", reconcile, true));
          }
        }
        setupScrollIsolation() {
          if (this.schemaValue.scrollIsolation === false || globalConfig.scrollIsolation === false) return;
          let lastTouchX = null;
          let lastTouchY = null;
          let touchStartedInHorizontalScroller = false;
          const pathHasHost = (event) => event.composedPath().includes(this.host);
          const findScrollableFromPath = (event) => {
            const path = event.composedPath();
            const shell = this.root.querySelector(".rm-shell");
            if (!shell) return null;
            for (const item of path) {
              if (item === shell) break;
              if (!(item instanceof this.win.HTMLElement)) continue;
              const overflowY = this.win.getComputedStyle(item).overflowY;
              if (
                (overflowY === "auto" || overflowY === "scroll") &&
                item.scrollHeight > item.clientHeight + 1
              )
                return item;
            }
            const body = this.root.querySelector(".rm-body");
            return body && body.scrollHeight > body.clientHeight + 1 ? body : null;
          };
          const onTouchStart = (event) => {
            if (!this.isStackTop()) return;
            if (!pathHasHost(event) || event.touches.length !== 1) return;
            const touch = event.touches[0];
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
            touchStartedInHorizontalScroller = event
              .composedPath()
              .some((item) => item instanceof this.win.Element && !!item.closest?.(".rm-tabs"));
          };
          const onTouchMove = (event) => {
            if (!this.isStackTop()) return;
            if (!event.cancelable || event.touches.length !== 1) return;
            if (!pathHasHost(event)) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            const touch = event.touches[0];
            const x = touch.clientX;
            const y = touch.clientY;
            const previousX = lastTouchX ?? x;
            const previousY = lastTouchY ?? y;
            const fingerDeltaX = x - previousX;
            const fingerDelta = y - previousY;
            lastTouchX = x;
            lastTouchY = y;
            if (touchStartedInHorizontalScroller && Math.abs(fingerDeltaX) >= Math.abs(fingerDelta)) return;
            const scrollable = findScrollableFromPath(event);
            if (!scrollable) {
              event.preventDefault();
              return;
            }
            const atTop = scrollable.scrollTop <= 0;
            const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;
            if ((fingerDelta > 0 && atTop) || (fingerDelta < 0 && atBottom)) event.preventDefault();
          };
          const onTouchEnd = () => {
            lastTouchX = null;
            lastTouchY = null;
            touchStartedInHorizontalScroller = false;
          };
          const onWheel = (event) => {
            if (!this.isStackTop()) return;
            if (!event.cancelable) return;
            if (!pathHasHost(event)) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            const scrollable = findScrollableFromPath(event);
            if (!scrollable) {
              event.preventDefault();
              return;
            }
            const atTop = scrollable.scrollTop <= 0;
            const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;
            if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) event.preventDefault();
          };
          this.doc.addEventListener("touchstart", onTouchStart, {
            passive: true,
            capture: true,
          });
          this.doc.addEventListener("touchmove", onTouchMove, {
            passive: false,
            capture: true,
          });
          this.doc.addEventListener("touchend", onTouchEnd, {
            passive: true,
            capture: true,
          });
          this.doc.addEventListener("touchcancel", onTouchEnd, {
            passive: true,
            capture: true,
          });
          this.doc.addEventListener("wheel", onWheel, {
            passive: false,
            capture: true,
          });
          this.listeners.push(() => {
            this.doc.removeEventListener("touchstart", onTouchStart, true);
            this.doc.removeEventListener("touchmove", onTouchMove, true);
            this.doc.removeEventListener("touchend", onTouchEnd, true);
            this.doc.removeEventListener("touchcancel", onTouchEnd, true);
            this.doc.removeEventListener("wheel", onWheel, true);
          });
        }
        setupAnchorTracking() {
          if (!this.schemaValue.anchor) return;
          const sync = () => {
            if (this.destroyed) return;
            const root = this.root.querySelector(".rm-root");
            const shell = this.root.querySelector(".rm-shell");
            if (root && shell) this.positionFromAnchor(root, shell);
          };
          this.win.addEventListener("resize", sync, { passive: true });
          this.win.addEventListener("scroll", sync, {
            passive: true,
            capture: true,
          });
          this.listeners.push(() => {
            this.win.removeEventListener("resize", sync);
            this.win.removeEventListener("scroll", sync, true);
          });
        }
        getGestureConfig() {
          return {
            ...globalConfig.gestures,
            ...(this.schemaValue.gestures || {}),
          };
        }
        findScrollableAncestor(target, boundary) {
          let node = target instanceof this.win.Element ? target : null;
          while (node && node !== boundary) {
            if (node instanceof this.win.HTMLElement) {
              const overflowY = this.win.getComputedStyle(node).overflowY;
              if (
                (overflowY === "auto" || overflowY === "scroll") &&
                node.scrollHeight > node.clientHeight + 1
              )
                return node;
            }
            node = node.parentElement;
          }
          const body = boundary.querySelector(".rm-body");
          return body && body.scrollHeight > body.clientHeight + 1 ? body : null;
        }
        bindBottomSheetGestures(root, shell) {
          const config = this.getGestureConfig();
          if (
            !config.preventPullToRefresh &&
            this.schemaValue.draggable === false &&
            this.schemaValue.swipeToDismiss === false
          )
            return;
          let tracking = false;
          let dragging = false;
          let startedOnHandle = false;
          let startedAtTop = false;
          let scrollGesture = false;
          let startX = 0;
          let startY = 0;
          let lastMoveY = 0;
          let lastMoveTime = 0;
          let recentVelocity = 0;
          let currentY = 0;
          let scrollable = null;
          let directionLocked = false;
          let verticalGesture = false;
          let startedInTabStrip = false;
          const clearDragVisual = () => {
            shell.style.transition = "";
            shell.style.removeProperty("--rm-drag-y");
          };
          const reset = () => {
            tracking = false;
            dragging = false;
            startedOnHandle = false;
            startedAtTop = false;
            scrollGesture = false;
            currentY = 0;
            scrollable = null;
            directionLocked = false;
            verticalGesture = false;
            startedInTabStrip = false;
            recentVelocity = 0;
            shell.style.transition = "";
          };
          const touchStart = (event) => {
            if (!this.isStackTop() || event.touches.length !== 1) return;
            const touch = event.touches[0];
            tracking = true;
            dragging = false;
            startX = touch.clientX;
            startY = touch.clientY;
            touch.clientY;
            lastMoveY = touch.clientY;
            lastMoveTime = performance.now();
            currentY = 0;
            recentVelocity = 0;
            directionLocked = false;
            verticalGesture = false;
            scrollGesture = false;
            const target = event.composedPath()[0];
            const element = target instanceof this.win.Element ? target : null;
            startedOnHandle = !!element?.closest?.(".rm-handle-wrap");
            startedInTabStrip = !!element?.closest?.(".rm-tabs");
            scrollable = this.findScrollableAncestor(target || event.target, shell);
            startedAtTop = !scrollable || scrollable.scrollTop <= 1;
          };
          const touchMove = (event) => {
            if (!tracking || event.touches.length !== 1) return;
            if (startedInTabStrip) return;
            const touch = event.touches[0];
            const now = performance.now();
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            const moveDt = Math.max(1, now - lastMoveTime);
            recentVelocity = (touch.clientY - lastMoveY) / moveDt;
            lastMoveY = touch.clientY;
            lastMoveTime = now;
            touch.clientY;
            if (!directionLocked && Math.max(Math.abs(dx), Math.abs(dy)) >= config.activationDistancePx) {
              directionLocked = true;
              verticalGesture = Math.abs(dy) > Math.abs(dx) * 1.12;
              if (verticalGesture && !startedOnHandle && !startedAtTop) scrollGesture = true;
            }
            if (!directionLocked || !verticalGesture) return;
            const pullingDown = dy > 0;
            const canDragFromContent =
              config.dragFromContent &&
              startedAtTop &&
              !scrollGesture &&
              dy >= config.contentDragActivationPx;
            const canDrag = this.schemaValue.draggable !== false && (startedOnHandle || canDragFromContent);
            if (scrollGesture) return;
            if (pullingDown && startedAtTop) {
              if (event.cancelable && config.preventPullToRefresh) event.preventDefault();
              event.stopPropagation();
              if (canDrag) {
                if (!dragging) {
                  dragging = true;
                  shell.style.transition = "none";
                }
                const activationOffset = startedOnHandle ? 0 : config.contentDragActivationPx;
                currentY = Math.max(0, dy - activationOffset);
                shell.style.setProperty("--rm-drag-y", `${currentY}px`);
              }
              return;
            }
            if (dragging) {
              if (event.cancelable) event.preventDefault();
              currentY = Math.max(0, dy);
              shell.style.setProperty("--rm-drag-y", `${currentY}px`);
            }
          };
          const dismissDistance = () => {
            const ratioDistance = (shell.offsetHeight || 1) * config.dismissThresholdRatio;
            return Math.max(config.minDismissDistancePx, Math.min(config.dismissThresholdPx, ratioDistance));
          };
          const finishGesture = () => {
            if (!tracking) return;
            const enoughDistance = currentY >= dismissDistance();
            const enoughVelocity =
              currentY >= config.velocityMinDragPx && recentVelocity >= config.velocityThresholdPxMs;
            if (
              dragging &&
              this.schemaValue.swipeToDismiss !== false &&
              this.schemaValue.dismissible !== false &&
              (enoughDistance || enoughVelocity)
            ) {
              shell.style.transition = "";
              this.finish("dismiss", void 0, "swipe");
            } else if (dragging) {
              shell.style.transition = "transform 170ms var(--rm-ease)";
              shell.style.setProperty("--rm-drag-y", "0px");
              this.win.setTimeout(() => {
                if (!this.destroyed) clearDragVisual();
              }, 180);
            }
            reset();
          };
          let pointerDragging = false;
          let pointerId = -1;
          let pointerStartY = 0;
          let pointerCurrentY = 0;
          let pointerLastY = 0;
          let pointerLastTime = 0;
          let pointerVelocity = 0;
          const handle = shell.querySelector(".rm-handle-wrap");
          const pointerDown = (event) => {
            if (
              !handle ||
              event.pointerType === "touch" ||
              event.button !== 0 ||
              this.schemaValue.draggable === false
            )
              return;
            pointerDragging = true;
            pointerId = event.pointerId;
            pointerStartY = event.clientY;
            pointerCurrentY = 0;
            pointerLastY = event.clientY;
            pointerLastTime = performance.now();
            pointerVelocity = 0;
            handle.setPointerCapture?.(pointerId);
            shell.style.transition = "none";
            event.preventDefault();
          };
          const pointerMove = (event) => {
            if (!pointerDragging || event.pointerId !== pointerId) return;
            const now = performance.now();
            const dt = Math.max(1, now - pointerLastTime);
            pointerVelocity = (event.clientY - pointerLastY) / dt;
            pointerLastY = event.clientY;
            pointerLastTime = now;
            pointerCurrentY = Math.max(0, event.clientY - pointerStartY);
            shell.style.setProperty("--rm-drag-y", `${pointerCurrentY}px`);
            event.preventDefault();
          };
          const pointerUp = (event) => {
            if (!pointerDragging || event.pointerId !== pointerId) return;
            const enoughDistance = pointerCurrentY >= dismissDistance();
            const enoughVelocity =
              pointerCurrentY >= config.velocityMinDragPx && pointerVelocity >= config.velocityThresholdPxMs;
            pointerDragging = false;
            if (
              this.schemaValue.swipeToDismiss !== false &&
              this.schemaValue.dismissible !== false &&
              (enoughDistance || enoughVelocity)
            ) {
              shell.style.transition = "";
              this.finish("dismiss", void 0, "swipe");
            } else {
              shell.style.transition = "transform 170ms var(--rm-ease)";
              shell.style.setProperty("--rm-drag-y", "0px");
              this.win.setTimeout(() => {
                if (!this.destroyed) clearDragVisual();
              }, 180);
            }
          };
          const rootTouchMove = (event) => {
            if (!config.preventPullToRefresh || !event.cancelable) return;
            if (!event.composedPath().includes(shell)) {
              event.preventDefault();
              event.stopPropagation();
            }
          };
          shell.addEventListener("touchstart", touchStart, { passive: true });
          shell.addEventListener("touchmove", touchMove, { passive: false });
          shell.addEventListener("touchend", finishGesture, { passive: true });
          shell.addEventListener("touchcancel", finishGesture, { passive: true });
          root.addEventListener("touchmove", rootTouchMove, {
            passive: false,
            capture: true,
          });
          handle?.addEventListener("pointerdown", pointerDown);
          handle?.addEventListener("pointermove", pointerMove);
          handle?.addEventListener("pointerup", pointerUp);
          handle?.addEventListener("pointercancel", pointerUp);
          this.renderListeners.push(() => {
            shell.removeEventListener("touchstart", touchStart);
            shell.removeEventListener("touchmove", touchMove);
            shell.removeEventListener("touchend", finishGesture);
            shell.removeEventListener("touchcancel", finishGesture);
            root.removeEventListener("touchmove", rootTouchMove, true);
            handle?.removeEventListener("pointerdown", pointerDown);
            handle?.removeEventListener("pointermove", pointerMove);
            handle?.removeEventListener("pointerup", pointerUp);
            handle?.removeEventListener("pointercancel", pointerUp);
          });
        }
        resolveComponentRenderer(name) {
          return (
            this.schemaValue.components?.[name] ||
            registeredComponents.get(name) ||
            globalConfig.components[name]
          );
        }
        resolveFieldTypeRenderer(type) {
          return (
            this.schemaValue.fieldTypes?.[type] ||
            registeredFieldTypes.get(type) ||
            globalConfig.fieldTypes[type]
          );
        }
        renderNamedComponent(name, props = {}) {
          const renderer = this.resolveComponentRenderer(name);
          if (!renderer) return null;
          return (
            renderer({
              name,
              document: this.doc,
              window: this.win,
              schema: this.schemaValue,
              context: this.context,
              props,
              defaultRender: () => createElement(this.doc, "div"),
              create: (tag, className) => {
                const node = createElement(this.doc, tag);
                if (className) node.className = className;
                return node;
              },
              render: (nestedName, nestedProps = {}) => this.renderNamedComponent(nestedName, nestedProps),
            }) || null
          );
        }
        renderComponent(name, defaultRender, props = {}) {
          const renderer = this.resolveComponentRenderer(name);
          if (!renderer) return defaultRender();
          const renderNested = (nestedName, nestedProps = {}) =>
            this.renderNamedComponent(nestedName, nestedProps);
          return (
            renderer({
              name,
              document: this.doc,
              window: this.win,
              schema: this.schemaValue,
              context: this.context,
              props,
              defaultRender,
              create: (tag, className) => {
                const node = createElement(this.doc, tag);
                if (className) node.className = className;
                return node;
              },
              render: renderNested,
            }) || defaultRender()
          );
        }
        finish(action, data, reason) {
          if (this.settled) return;
          this.settled = true;
          this.persistenceManager.trigger("close");
          const result = {
            action,
            values: this.cloneValues(this.valuesValue),
            data,
            reason,
          };
          const root = this.getRootElement();
          root.dataset.open = "false";
          this.host.removeAttribute(ACTIVE_ATTR);
          const finalize = () => {
            try {
              this.schemaValue.onClose?.(result);
            } catch (error) {
              this.reportError(error);
            }
            this.resolveResult(result);
            this.destroy(false);
          };
          this.win.setTimeout(finalize, 300);
        }
        destroy(resolveIfNeeded = true) {
          if (this.destroyed) return;
          this.destroyed = true;
          for (const off of this.renderListeners.splice(0))
            try {
              off();
            } catch {}
          for (const off of this.listeners.splice(0))
            try {
              off();
            } catch {}
          const wasTop = this.isStackTop();
          activeHandles.delete(this.id);
          unregisterSurfaceFromStack(this);
          if (this.schemaValue.scrollLock !== false) unlockDocumentScroll(this.doc);
          this.host.remove();
          const remainingStack = getSurfaceStack(this.doc);
          if (wasTop && remainingStack.length) remainingStack[remainingStack.length - 1].focusFromStack();
          else if (
            !remainingStack.length &&
            this.schemaValue.restoreFocus !== false &&
            this.previousFocus instanceof HTMLElement &&
            this.previousFocus.isConnected
          )
            try {
              this.previousFocus.focus({ preventScroll: true });
            } catch {}
          if (resolveIfNeeded && !this.settled) {
            this.settled = true;
            this.resolveResult({
              action: "dismiss",
              values: this.cloneValues(this.valuesValue),
              reason: "api",
            });
          }
        }
        getRootElement() {
          const root = this.root.querySelector(".rm-root");
          if (!root) throw new Error("RodMenu root is not mounted.");
          return root;
        }
        reportError(error) {
          try {
            this.schemaValue.onError?.(error, this.context);
          } catch {}
          try {
            globalConfig.onError?.(error);
          } catch {}
          const message = error instanceof Error ? error.message : String(error);
          const mode = this.schemaValue.errorMode ?? (globalConfig.toasterErrors ? "both" : "inline");
          if (mode === "inline" || mode === "both") this.setGlobalError(message);
          if (mode === "toaster" || mode === "both") {
            if (
              !notifyToaster("error", this.schemaValue.title || "RodMenu", message) &&
              globalConfig.autoLoadDependencies
            )
              loadDependency("toaster");
          }
          try {
            console.error("[RodMenu]", error);
          } catch {}
        }
      }
      for (const name of ["elements", "toaster", "cipo", "broto"])
        if (dependencyPresent(name)) markDependency(name, "native", "window");
      const previousGlobal = rootWindow[GLOBAL_NAME];
      const readyPromise = globalConfig.autoLoadDependencies
        ? loadDependencies()
        : Promise.resolve({
            elements: { ...runtimeStatus.elements },
            toaster: { ...runtimeStatus.toaster },
            cipo: { ...runtimeStatus.cipo },
            broto: { ...runtimeStatus.broto },
          });
      const presetApi = {
        media(options) {
          const fields = [];
          if (options.source)
            fields.push({
              type: "media-preview",
              name: "sourcePreview",
              item: options.source,
              showSource: true,
            });
          fields.push({
            type: "media-picker",
            name: "selectedMedia",
            label: options.media.length === 1 ? "Mídia" : "Mídias",
            items: options.media,
            value: options.media.filter((item) => !item.disabled).map((item) => item.id),
            selectAll: options.media.length > 1,
            minSelected: 1,
          });
          if (options.channels?.length)
            fields.push({
              type: "channel-picker",
              name: "channel",
              label: "Canal",
              options: options.channels,
              searchable: options.channels.length > 8,
            });
          if (options.extraFields?.length) fields.push(...options.extraFields);
          const actions = options.actions || [
            {
              id: "cancel",
              label: "Cancelar",
              role: "cancel",
              variant: "ghost",
            },
            {
              id: "run",
              label: "Executar",
              role: "submit",
              variant: "primary",
              badge: (context) => {
                const selected = context.get("selectedMedia");
                return Array.isArray(selected) && selected.length > 1 ? selected.length : null;
              },
              disabledWhen: (values) =>
                !Array.isArray(values.selectedMedia) || values.selectedMedia.length === 0,
            },
          ];
          return api.open({
            title: options.title || "Mídia detectada",
            description: options.description || "Escolha o que fazer com a mídia encontrada.",
            presentation: options.presentation || "auto",
            anchor: options.anchor,
            fields,
            actions,
            initialValues: options.initialValues,
            store: options.store,
          });
        },
        settings(schema) {
          return api.open({
            ...schema,
            title: schema.title || "Configurações",
            store: schema.store || {
              persist: {
                key: `rod-menu:settings:${schema.id || "default"}`,
                storage: "local",
              },
            },
            actions: schema.actions || [
              {
                id: "reset",
                label: "Restaurar",
                role: "custom",
                variant: "ghost",
                close: false,
                handler: (context) => context.reset(),
              },
              {
                id: "done",
                label: "Concluir",
                role: "submit",
                variant: "primary",
              },
            ],
          });
        },
        history(options) {
          return api.open({
            title: options.title || "Histórico",
            description: options.description,
            presentation: options.presentation || "bottom-sheet",
            fields: [
              {
                type: "custom",
                name: "history",
                render(context) {
                  const list = createElement(context.host.ownerDocument, "div");
                  list.className = "rm-history-list";
                  options.items.forEach((item, index) => {
                    const row = createElement(context.host.ownerDocument, "div");
                    row.className = "rm-history-item";
                    const rendered = options.renderItem?.(item, index, context);
                    if (typeof rendered === "string") row.textContent = rendered;
                    else if (rendered) row.append(rendered);
                    else
                      try {
                        row.textContent = typeof item === "string" ? item : JSON.stringify(item);
                      } catch {
                        row.textContent = String(item);
                      }
                    list.append(row);
                  });
                  return list;
                },
              },
            ],
            actions: [
              {
                id: "close",
                label: "Fechar",
                role: "cancel",
                variant: "secondary",
              },
            ],
          });
        },
        savedSync(options) {
          let refreshImpl = () => void 0;
          let destroyed = false;
          const handle = api.open({
            title: options.title || "Saved / Bookmarks",
            description: options.description || "Selecione, confira e sincronize suas mídias.",
            presentation: options.presentation || "bottom-sheet",
            size: options.size || "md",
            store: { persist: false },
            fields: [
              {
                type: "custom",
                name: "savedSync",
                chrome: "bare",
                render(context) {
                  const doc = context.host.ownerDocument;
                  const root = createElement(doc, "div");
                  root.className = "rm-saved-sync";
                  const summary = createElement(doc, "div");
                  summary.className = "rm-saved-sync-summary";
                  const summaryTitle = createElement(doc, "strong");
                  const summaryDescription = createElement(doc, "small");
                  summary.append(summaryTitle, summaryDescription);
                  const stats = createElement(doc, "div");
                  stats.className = "rm-saved-sync-stats";
                  const statNodes = new Map();
                  for (const [key, label] of [
                    ["pending", "Pendentes"],
                    ["selected", "Selecionados"],
                    ["sent", "Enviados"],
                    ["unknown", "Sem check"],
                    ["visible", "Na tela"],
                    ["total", "Vistos"],
                  ]) {
                    const card = createElement(doc, "div");
                    card.className = "rm-saved-sync-stat";
                    const value = createElement(doc, "b");
                    const copy = createElement(doc, "span");
                    copy.textContent = label;
                    card.append(value, copy);
                    stats.append(card);
                    statNodes.set(key, value);
                  }
                  const commands = createElement(doc, "div");
                  commands.className = "rm-saved-sync-commands";
                  const commandButtons = new Map();
                  const reportSavedSyncError = (error) => {
                    try {
                      globalConfig.onError?.(error);
                    } catch {}
                    try {
                      notifyToaster(
                        "error",
                        options.title || "Saved / Bookmarks",
                        error instanceof Error ? error.message : String(error),
                      );
                    } catch {}
                  };
                  for (const command of options.commands) {
                    const button = createElement(doc, "button");
                    button.type = "button";
                    button.className = "rm-field-button rm-action rm-saved-sync-command";
                    button.dataset.variant = command.variant || "secondary";
                    button.dataset.command = command.id;
                    button.addEventListener("click", async () => {
                      if (button.disabled || destroyed) return;
                      button.dataset.loading = "true";
                      refreshImpl();
                      try {
                        await command.run({
                          snapshot: options.getSnapshot(),
                          refresh: refreshImpl,
                        });
                      } catch (error) {
                        reportSavedSyncError(error);
                      } finally {
                        button.dataset.loading = "false";
                        refreshImpl();
                      }
                    });
                    commandButtons.set(command.id, button);
                    commands.append(button);
                  }
                  root.append(summary, stats, commands);
                  refreshImpl = () => {
                    if (destroyed || !root.isConnected) return;
                    let snapshot;
                    try {
                      snapshot = options.getSnapshot();
                    } catch (error) {
                      reportSavedSyncError(error);
                      return;
                    }
                    const surfaceTitle = (options.title || "Saved / Bookmarks").trim();
                    const snapshotTitle = snapshot.title?.trim() || "";
                    const showSummaryTitle = !!snapshotTitle && snapshotTitle !== surfaceTitle;
                    summaryTitle.hidden = !showSummaryTitle;
                    summaryTitle.textContent = showSummaryTitle ? snapshotTitle : "";
                    summaryDescription.textContent = snapshot.description || options.description || "";
                    for (const key of ["pending", "selected", "sent", "unknown", "visible", "total"]) {
                      const node = statNodes.get(key);
                      if (node) node.textContent = String(Number(snapshot[key] ?? 0));
                    }
                    for (const command of options.commands) {
                      const button = commandButtons.get(command.id);
                      if (!button) continue;
                      button.textContent =
                        typeof command.label === "function" ? command.label(snapshot) : command.label;
                      const busy = button.dataset.loading === "true";
                      const disabled =
                        typeof command.disabled === "function"
                          ? command.disabled(snapshot)
                          : Boolean(command.disabled);
                      button.disabled = busy || Boolean(snapshot.syncing) || disabled;
                    }
                  };
                  requestAnimationFrame(refreshImpl);
                  return root;
                },
              },
            ],
            actions: [
              {
                id: "close",
                label: "Fechar",
                role: "cancel",
                variant: "secondary",
              },
            ],
            onClose(result) {
              destroyed = true;
              try {
                options.onClose?.(result);
              } catch (error) {
                try {
                  globalConfig.onError?.(error);
                } catch {}
              }
            },
          });
          Object.defineProperty(handle, "refresh", {
            value: () => refreshImpl(),
            enumerable: true,
          });
          return handle;
        },
        debug(options) {
          const tabs = [];
          if (options.summary !== void 0)
            tabs.push({
              id: "summary",
              label: "Resumo",
              fields: [
                {
                  type: "debug-json",
                  name: "debugSummary",
                  data: options.summary,
                  maxHeight: 360,
                },
              ],
            });
          if (options.media?.length)
            tabs.push({
              id: "media",
              label: "Mídia",
              badge: options.media.length,
              fields: [
                {
                  type: "media-picker",
                  name: "debugMedia",
                  items: options.media,
                  selectAll: false,
                },
              ],
            });
          if (options.providers?.length)
            tabs.push({
              id: "providers",
              label: "Providers",
              badge: options.providers.length,
              fields: [
                {
                  type: "provider-status",
                  name: "debugProviders",
                  providers: options.providers,
                },
              ],
            });
          if (options.requests?.length)
            tabs.push({
              id: "requests",
              label: "Requests",
              badge: options.requests.length,
              fields: [
                {
                  type: "request-log",
                  name: "debugRequests",
                  entries: options.requests,
                  maxHeight: 420,
                },
              ],
            });
          if (options.relay !== void 0)
            tabs.push({
              id: "relay",
              label: "Relay",
              fields: [
                {
                  type: "debug-json",
                  name: "debugRelay",
                  data: options.relay,
                  maxHeight: 420,
                },
              ],
            });
          if (options.logs !== void 0)
            tabs.push({
              id: "logs",
              label: "Logs",
              fields: [
                {
                  type: "debug-json",
                  name: "debugLogs",
                  data: options.logs,
                  maxHeight: 420,
                },
              ],
            });
          if (!tabs.length)
            tabs.push({
              id: "summary",
              label: "Resumo",
              fields: [
                {
                  type: "html",
                  name: "empty",
                  html: "<p>Sem dados de debug.</p>",
                },
              ],
            });
          return api.open({
            title: options.title || "Debug",
            description: options.description,
            presentation: options.presentation || "bottom-sheet",
            size: "lg",
            tabs,
            actions: [
              {
                id: "close",
                label: "Fechar",
                role: "cancel",
                variant: "secondary",
              },
            ],
          });
        },
        async channelPicker(options) {
          const result = await api.open({
            title: options.title || "Escolha o canal",
            description: options.description,
            presentation: options.presentation || "auto",
            anchor: options.anchor,
            fields: [
              {
                type: "channel-picker",
                name: "channel",
                options: options.channels,
                multiple: options.multiple,
                searchable: options.searchable,
                value: options.value,
                required: true,
              },
            ],
            actions: [
              {
                id: "cancel",
                label: "Cancelar",
                role: "cancel",
                variant: "ghost",
              },
              {
                id: "select",
                label: "Selecionar",
                role: "submit",
                variant: "primary",
              },
            ],
          }).result;
          return result.action === "select" ? result.values.channel : null;
        },
      };
      const api = {
        version: VERSION,
        get config() {
          return api.getConfig();
        },
        get runtime() {
          return Object.freeze({
            elements: { ...runtimeStatus.elements },
            toaster: { ...runtimeStatus.toaster },
            cipo: { ...runtimeStatus.cipo },
            broto: { ...runtimeStatus.broto },
          });
        },
        ready: readyPromise,
        presets: presetApi,
        aio: presetApi,
        open(schema) {
          return new SurfaceController(schema).handle;
        },
        async form(schema) {
          const actions = schema.actions || [
            {
              id: "cancel",
              label: "Cancelar",
              role: "cancel",
              variant: "secondary",
            },
            {
              id: "submit",
              label: "Continuar",
              role: "submit",
              variant: "primary",
            },
          ];
          const handle = api.open({
            ...schema,
            actions,
          });
          await handle.ready;
          return handle.result;
        },
        async confirm(options) {
          return (
            (
              await api.open({
                title: options.title,
                description: options.description,
                presentation: options.presentation,
                actions: [
                  {
                    id: "cancel",
                    label: options.cancelLabel || "Cancelar",
                    role: "cancel",
                    variant: "secondary",
                  },
                  {
                    id: "confirm",
                    label: options.confirmLabel || "Confirmar",
                    role: options.danger ? "destructive" : "submit",
                    variant: options.danger ? "danger" : "primary",
                  },
                ],
              }).result
            ).action === "confirm"
          );
        },
        async actions(options) {
          const result = await api.open({
            title: options.title,
            description: options.description,
            presentation: options.presentation,
            anchor: options.anchor,
            actions: [
              ...options.items.map((item) => ({
                id: item.value,
                label: item.label,
                icon: item.icon,
                badge: item.badge,
                shortcut: item.shortcut,
                variant: item.variant || "secondary",
                role: "custom",
                close: true,
              })),
              {
                id: "cancel",
                label: "Cancelar",
                variant: "ghost",
                role: "cancel",
              },
            ],
          }).result;
          return result.action === "dismiss" || result.action === "cancel" ? null : result.action;
        },
        configure(config) {
          globalConfig = {
            ...globalConfig,
            ...config,
            dependencyUrls: config.dependencyUrls
              ? {
                  ...globalConfig.dependencyUrls,
                  ...config.dependencyUrls,
                }
              : globalConfig.dependencyUrls,
            stack: config.stack
              ? {
                  ...globalConfig.stack,
                  ...config.stack,
                }
              : globalConfig.stack,
            gestures: config.gestures
              ? {
                  ...globalConfig.gestures,
                  ...config.gestures,
                }
              : globalConfig.gestures,
            keyboard: config.keyboard
              ? {
                  ...globalConfig.keyboard,
                  ...config.keyboard,
                }
              : globalConfig.keyboard,
            defaultSchema: config.defaultSchema
              ? {
                  ...globalConfig.defaultSchema,
                  ...config.defaultSchema,
                }
              : globalConfig.defaultSchema,
            theme: config.theme
              ? {
                  ...globalConfig.theme,
                  ...config.theme,
                }
              : globalConfig.theme,
            components: config.components
              ? {
                  ...globalConfig.components,
                  ...config.components,
                }
              : globalConfig.components,
            fieldTypes: config.fieldTypes
              ? {
                  ...globalConfig.fieldTypes,
                  ...config.fieldTypes,
                }
              : globalConfig.fieldTypes,
          };
          if (config.autoLoadDependencies === true) loadDependencies();
          if (globalConfig.refreshActiveOnConfigure) api.refreshAll();
          return api;
        },
        getConfig() {
          return Object.freeze({
            ...globalConfig,
            dependencyUrls: Object.freeze({ ...globalConfig.dependencyUrls }),
            stack: Object.freeze({ ...globalConfig.stack }),
            gestures: Object.freeze({ ...globalConfig.gestures }),
            keyboard: Object.freeze({ ...globalConfig.keyboard }),
            defaultSchema: Object.freeze({ ...globalConfig.defaultSchema }),
            theme: Object.freeze({ ...globalConfig.theme }),
            components: Object.freeze({ ...globalConfig.components }),
            fieldTypes: Object.freeze({ ...globalConfig.fieldTypes }),
          });
        },
        resetConfig() {
          globalConfig = {
            ...defaultConfig,
            dependencyUrls: { ...defaultDependencyUrls },
            stack: { ...defaultStackConfig },
            gestures: { ...defaultGestureConfig },
            keyboard: { ...defaultKeyboardConfig },
            defaultSchema: {},
            theme: {},
            components: {},
            fieldTypes: {},
          };
          registeredComponents.clear();
          registeredFieldTypes.clear();
          api.refreshAll();
          return api;
        },
        refreshAll() {
          for (const handle of Array.from(activeHandles.values()))
            try {
              handle.update({});
            } catch (error) {
              try {
                globalConfig.onError?.(error);
              } catch {}
            }
        },
        registerComponent(name, renderer) {
          if (!name || typeof renderer !== "function")
            throw new TypeError("registerComponent(name, renderer) requires a name and renderer function.");
          registeredComponents.set(name, renderer);
          if (globalConfig.refreshActiveOnConfigure) api.refreshAll();
          return api;
        },
        unregisterComponent(name) {
          const deleted = registeredComponents.delete(name);
          if (deleted && globalConfig.refreshActiveOnConfigure) api.refreshAll();
          return deleted;
        },
        getComponent(name) {
          return registeredComponents.get(name) || globalConfig.components[name];
        },
        registerFieldType(type, renderer) {
          if (!type || typeof renderer !== "function")
            throw new TypeError("registerFieldType(type, renderer) requires a type and renderer function.");
          registeredFieldTypes.set(type, renderer);
          if (globalConfig.refreshActiveOnConfigure) api.refreshAll();
          return api;
        },
        unregisterFieldType(type) {
          const deleted = registeredFieldTypes.delete(type);
          if (deleted && globalConfig.refreshActiveOnConfigure) api.refreshAll();
          return deleted;
        },
        hasFieldType(type) {
          return registeredFieldTypes.has(type) || typeof globalConfig.fieldTypes[type] === "function";
        },
        field(type, config) {
          return {
            ...config,
            type,
          };
        },
        loadDependencies,
        get(id) {
          return activeHandles.get(id);
        },
        activate(id) {
          const surface = getSurfaceStack(resolveDocument()).find((item) => item.id === id);
          return surface ? activateStackSurface(surface) : false;
        },
        stack() {
          return getSurfaceStack(resolveDocument())
            .map((surface) => activeHandles.get(surface.id))
            .filter((handle) => !!handle);
        },
        closeAll(reason = "replaced") {
          for (const handle of Array.from(activeHandles.values())) handle.dismiss(reason);
        },
        noConflict() {
          try {
            rootWindow[GLOBAL_NAME] = previousGlobal;
          } catch {}
          return api;
        },
      };
      publishEverywhere(api);
    })(window);

    function rodLibraries(host = globalThis) {
      const storage = host.RodStorage;
      const toaster = host.RodToaster;
      const menu = host.RodMenu;
      if (!storage?.create || !toaster || !menu?.open) throw new Error("Rod runtime libraries unavailable");
      return {
        storage,
        toaster,
        menu,
      };
    }

    var sheets = new WeakMap();
    function registerShadowStyles(root, styles) {
      let entries = sheets.get(root);
      if (!entries) {
        entries = new Map();
        sheets.set(root, entries);
      }
      const keys = [];
      for (const style of styles) {
        const css = typeof style === "string" ? style : style.css;
        if (!css) continue;
        let entry = entries.get(css);
        if (!entry) {
          const node = root.ownerDocument.createElement("style");
          node.textContent = css;
          root.prepend(node);
          entry = {
            node,
            refs: 0,
          };
          entries.set(css, entry);
        }
        entry.refs++;
        keys.push(css);
      }
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        for (const key of keys) {
          const entry = entries.get(key);
          if (entry && --entry.refs === 0) {
            entry.node.remove();
            entries.delete(key);
          }
        }
      };
    }
    function mountSolidShadow(component, options = {}) {
      const host = options.target ? void 0 : document.createElement("div");
      if (host) {
        host.dataset.userscriptsCfShadow = options.id ?? "";
        document.body.append(host);
      }
      const target = options.target ?? host;
      const owner =
        typeof ShadowRoot !== "undefined" && target instanceof ShadowRoot
          ? target
          : target instanceof HTMLElement
            ? (target.shadowRoot ?? target.attachShadow({ mode: "open" }))
            : null;
      if (!owner) throw new Error("A ShadowRoot is required to mount Solid UI");
      const releaseStyles = registerShadowStyles(owner, options.styles ?? []);
      const container = owner.ownerDocument.createElement("div");
      if (options.id) container.dataset.solidUi = options.id;
      owner.append(container);
      let dispose;
      try {
        dispose = render(component, container);
      } catch (error) {
        container.remove();
        releaseStyles();
        host?.remove();
        throw error;
      }
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        dispose?.();
        container.remove();
        releaseStyles();
        host?.remove();
      };
    }

    function createRuntime(definitions, bridge, host = window) {
      const rod = rodLibraries(host);
      const stores = new Map();
      const active = new Map();
      const state = new Map();
      const listeners = new Map();
      const failures = new Map();
      const undoHistory = [];
      let desiredURL = host.location.href;
      let scheduled;
      let closed = false;
      function publish(id, value) {
        state.set(id, value);
        for (const callback of listeners.get(id) || [])
          try {
            callback(value);
          } catch (error) {
            console.error("[Userscripts CF subscriber]", error);
          }
      }
      function context(definition) {
        const abort = new host.AbortController();
        const cleanups = [];
        let uiHost;
        let uiRoot;
        function ensureUIRoot() {
          if (uiRoot?.isConnected) return uiRoot;
          const parent = host.document.body || host.document.documentElement;
          if (!parent) throw new Error("Document root is not available");
          uiHost = host.document.createElement("div");
          uiHost.dataset.userscriptsCfUi = definition.id;
          uiHost.style.setProperty("all", "initial");
          uiHost.style.setProperty("position", "relative");
          uiHost.style.setProperty("z-index", "2147483000");
          uiRoot = uiHost.attachShadow({ mode: "open" });
          parent.append(uiHost);
          onDispose(() => {
            uiHost?.remove();
            uiHost = void 0;
            uiRoot = void 0;
          });
          return uiRoot;
        }
        function addStyle(css, target) {
          const node = host.document.createElement("style");
          node.textContent = String(css);
          target.append(node);
          onDispose(() => node.remove());
          return node;
        }
        const onDispose = (callback) => cleanups.push(callback);
        let store = stores.get(definition.id);
        if (!store) {
          store = rod.storage.create({
            namespace: "userscripts-cf/" + definition.id,
            backend: "auto",
          });
          stores.set(definition.id, store);
        }
        const storage = Object.freeze({
          async get(key, fallback) {
            const value = await store.get(key);
            if (value !== void 0) return value;
            const legacy = await bridge.call("get", {
              id: definition.id,
              key,
              fallback: void 0,
            });
            if (legacy !== void 0) {
              await store.set(key, legacy);
              return legacy;
            }
            return fallback;
          },
          async set(key, value) {
            await store.set(key, value);
            await bridge.call("set", {
              id: definition.id,
              key,
              value,
            });
          },
          async delete(key) {
            await store.delete(key);
            await bridge.call("delete", {
              id: definition.id,
              key,
            });
          },
        });
        return {
          id: definition.id,
          signal: abort.signal,
          storage,
          menu: rod.menu,
          toaster: rod.toaster,
          get url() {
            return new URL(desiredURL);
          },
          state: Object.freeze({
            get: () => state.get(definition.id),
            set: (value) => publish(definition.id, value),
            subscribe(callback) {
              const set = listeners.get(definition.id) || new Set();
              listeners.set(definition.id, set);
              set.add(callback);
              const off = () => set.delete(callback);
              onDispose(off);
              return off;
            },
          }),
          onDispose,
          listen(target, event, callback, options = {}) {
            target.addEventListener(event, callback, {
              ...options,
              signal: abort.signal,
            });
          },
          ui: Object.freeze({
            get root() {
              return ensureUIRoot();
            },
            get host() {
              ensureUIRoot();
              return uiHost;
            },
            mount(node) {
              ensureUIRoot().append(node);
              return node;
            },
            style(css) {
              return addStyle(css, ensureUIRoot());
            },
            registerStyles(...styles) {
              const release = registerShadowStyles(ensureUIRoot(), styles.flat());
              onDispose(release);
              return release;
            },
            mountSolid(component, options = {}) {
              const release = mountSolidShadow(component, {
                ...options,
                target: ensureUIRoot(),
              });
              onDispose(release);
              return release;
            },
          }),
          style(css) {
            return addStyle(css, ensureUIRoot());
          },
          pageStyle(css) {
            return addStyle(css, host.document.head || host.document.documentElement);
          },
          async dispose() {
            abort.abort();
            for (const cleanup of cleanups.reverse())
              try {
                await cleanup();
              } catch (error) {
                console.error("[Userscripts CF cleanup]", error);
              }
            cleanups.length = 0;
            listeners.delete(definition.id);
            state.delete(definition.id);
          },
        };
      }
      async function reconcile() {
        while (!closed) {
          const url = desiredURL;
          for (const [id, instance] of active) {
            if (matchesRoute(instance.definition, url)) continue;
            active.delete(id);
            await instance.context.dispose();
          }
          for (const definition of definitions) {
            if (closed || desiredURL !== url) break;
            if (
              active.has(definition.id) ||
              failures.get(definition.id) === url ||
              !matchesRoute(definition, url)
            )
              continue;
            const ctx = context(definition);
            try {
              const cleanup = await definition.module.init(ctx);
              if (typeof cleanup === "function") ctx.onDispose(cleanup);
              if (closed || desiredURL !== url) await ctx.dispose();
              else {
                active.set(definition.id, {
                  definition,
                  context: ctx,
                });
                failures.delete(definition.id);
              }
            } catch (error) {
              await ctx.dispose();
              failures.set(definition.id, url);
              console.error(`[Userscripts CF: ${definition.id}]`, error);
            }
          }
          if (desiredURL === url) break;
        }
      }
      function navigate() {
        if (closed) return Promise.resolve();
        desiredURL = host.location.href;
        if (!scheduled)
          scheduled = Promise.resolve()
            .then(reconcile)
            .finally(() => {
              scheduled = null;
            });
        return scheduled;
      }
      for (const method of ["pushState", "replaceState"]) {
        const original = host.history[method];
        const wrapper = function (...args) {
          const result = original.apply(this, args);
          navigate();
          return result;
        };
        host.history[method] = wrapper;
        undoHistory.push(() => {
          if (host.history[method] === wrapper) host.history[method] = original;
        });
      }
      host.addEventListener("popstate", navigate);
      host.addEventListener("hashchange", navigate);
      return {
        ready: navigate(),
        navigate,
        get active() {
          return [...active.keys()];
        },
        async dispose() {
          closed = true;
          host.removeEventListener("popstate", navigate);
          host.removeEventListener("hashchange", navigate);
          undoHistory.forEach((undo) => undo());
          await scheduled;
          for (const instance of active.values()) await instance.context.dispose();
          active.clear();
          failures.clear();
          state.clear();
          listeners.clear();
          for (const store of stores.values()) store.close?.();
          stores.clear();
          bridge.dispose?.();
        },
      };
    }

    function boot(bridge) {
      return createRuntime(
        [
          {
            id: "instagram-saved",
            name: "Instagram salvos → XTelegram",
            unified: false,
            world: "sandbox",
            entry: "src/userscripts/instagram-saved/index.tsx",
            matches: ["https://www.instagram.com/*"],
            exclude: [],
            grants: [
              "unsafeWindow",
              "GM_getValue",
              "GM_setValue",
              "GM.getValue",
              "GM.setValue",
              "GM_registerMenuCommand",
              "GM_unregisterMenuCommand",
              "GM_xmlhttpRequest",
              "GM.xmlHttpRequest",
            ],
            requires: ["https://rod.migos.club/menu/dist/menu.iife.min.js"],
            connect: ["xtelegram-cf.migos.club"],
            module: instagram_saved_default,
          },
        ],
        bridge,
      );
    }
    exports.boot = boot;
    return exports;
  })({});
  return UserscriptsCF;
}, "instagram-saved");
