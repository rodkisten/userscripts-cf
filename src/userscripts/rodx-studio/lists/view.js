import { refresh } from "./render.js";

export let refreshScheduled;

export function initializeListsRefreshScheduled() {
  refreshScheduled = false;
}

export function scheduleRefresh() {
  if (refreshScheduled) return;
  refreshScheduled = true;
  setTimeout(() => {
    refreshScheduled = false;
    refresh();
  }, 240);
}

export let host;

export function initializeListsHost() {
  host = document.createElement("div");
}

export function initializeRodX_lists_74() {
  host.id = "x-lists-studio-root";
}

export let shadow;

export function initializeListsShadow() {
  shadow = host.attachShadow({
    mode: "open",
  });
}

export let style;

export function initializeListsStyle() {
  style = document.createElement("style");
}

export function initializeRodX_lists_77() {
  style.textContent = `
.overlay.open {
  position: relative !important;
  inset: auto !important;
  display: block !important;
  background: transparent !important;
  padding: 0 !important;
}
.panel {
  position: relative !important;
  inset: auto !important;
  width: 100% !important;
  height: auto !important;
  max-height: none !important;
  border: 0 !important;
  box-shadow: none !important;
}
.top {
  display: none !important;
}
.body {
  overflow: visible !important;
}
:host {
  all: initial;
  font:
    14px -apple-system,
    BlinkMacSystemFont,
    Inter,
    Arial,
    sans-serif;
  color: #f3f4f6;
}
*,
*::before,
*::after {
  box-sizing: border-box;
}
button,
input,
select,
textarea {
  font: inherit;
  font-size: 16px;
}
button {
  cursor: pointer;
  touch-action: manipulation;
}
button:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid #ff784e;
  outline-offset: 3px;
}
.fab {
  position: fixed;
  right: 16px;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  z-index: 2147483640;
  height: 54px;
  min-width: 54px;
  border-radius: 999px;
  background: #f97346;
  border: 1px solid #ff9d79;
  color: #161616;
  box-shadow: 0 8px 28px #0008;
  font-weight: 900;
  padding: 0 17px;
}
.overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483641;
  display: none;
  background: #0009;
}
.overlay.open {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.panel {
  display: flex;
  flex-direction: column;
  width: min(540px, 100%);
  height: 100%;
  height: 100dvh;
  background: #111214;
  color: #f4f5f6;
  border-left: 1px solid #38393d;
  box-shadow: -12px 0 50px #0009;
}
.top {
  padding: calc(12px + env(safe-area-inset-top, 0px)) 16px 12px;
  border-bottom: 1px solid #303236;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.brand {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.brand strong {
  font-size: 19px;
  letter-spacing: -0.7px;
}
.brand small,
.muted {
  color: #a1a1aa;
}
.tabs {
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid #303236;
  flex-shrink: 0;
}
.tabs button {
  background: transparent;
  color: #a1a1aa;
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 12px 14px;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 650;
}
.tabs button.on {
  color: white;
  border-color: #ff784e;
}
.body {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 16px calc(24px + env(safe-area-inset-bottom, 0px));
  flex: 1;
}
h3 {
  font-size: 16px;
  margin: 10px 0 12px;
  letter-spacing: -0.4px;
}
h4 {
  font-size: 13px;
  margin: 14px 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #a1a1aa;
}
p {
  line-height: 1.5;
  color: #d1d5db;
  margin: 7px 0 12px;
}
.small {
  font-size: 12px;
  line-height: 1.45;
  color: #a1a1aa;
}
.stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.row.wrap {
  flex-wrap: wrap;
}
.grp {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}
.field,
.select,
.textarea {
  width: 100%;
  border: 1px solid #414247;
  border-radius: 11px;
  padding: 11px 12px;
  color: white;
  background: #1d1f22;
  min-height: 44px;
}
.textarea {
  min-height: 90px;
  resize: vertical;
}
.field::placeholder {
  color: #777983;
}
.btn {
  background: #292b30;
  color: #fafafa;
  border: 1px solid #44464a;
  border-radius: 10px;
  padding: 9px 12px;
  min-height: 40px;
  font-size: 13px;
  font-weight: 700;
}
.btn.primary {
  background: #f97346;
  color: #191919;
  border-color: #f97346;
}
.btn.danger {
  background: #402526;
  border-color: #803b3e;
  color: #ffd0d0;
}
.btn.ghost {
  background: transparent;
}
.btn.mini {
  min-height: 32px;
  padding: 6px 8px;
  font-size: 12px;
}
.check {
  display: flex;
  gap: 9px;
  align-items: center;
  font-size: 13px;
  min-height: 36px;
}
.check input {
  width: 17px;
  height: 17px;
  accent-color: #f97346;
  flex-shrink: 0;
}
.card {
  border: 1px solid #35363b;
  background: #191b1e;
  border-radius: 13px;
  padding: 12px;
}
.card.active {
  border-color: #f97346;
}
.card strong {
  font-size: 14px;
  word-break: break-word;
}
.pill {
  background: #2c2e32;
  border-radius: 99px;
  padding: 4px 8px;
  font-size: 11px;
  color: #c4c4c8;
}
.items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #2b2d30;
  padding: 8px 0;
}
.item:last-child {
  border-bottom: 0;
}
.item a {
  color: #ffb092;
  text-decoration: none;
}
.mono {
  font:
    12px ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
}
.code {
  background: #08090a;
  padding: 12px;
  border: 1px solid #34363a;
  border-radius: 10px;
}
.notice {
  background: #272b30;
  border-radius: 9px;
  padding: 9px 12px;
  font-size: 12px;
  line-height: 1.4;
}
.notice.error {
  background: #3b1e21;
  color: #ffc0c5;
}
.notice.ok {
  background: #193029;
  color: #aaf3ce;
}
.footer {
  border-top: 1px solid #35363b;
  padding: 9px 16px calc(9px + env(safe-area-inset-bottom, 0px));
  color: #94969d;
  font-size: 11px;
}
.homebar {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 7px;
  overflow-x: auto;
  padding: 9px 12px;
  background: #111214;
  color: white;
  border-bottom: 1px solid #333;
  scrollbar-width: thin;
  overscroll-behavior-inline: contain;
}
.homebar .tablink {
  flex: 0 0 auto;
  background: #25272b;
  border: 1px solid #45464b;
  color: #f4f4f5;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 12px;
  text-decoration: none;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.homebar .tablink:active {
  background: #f97346;
  color: #151515;
}
.homebar .label {
  font-size: 11px;
  color: #fda17b;
  white-space: nowrap;
  font-weight: 800;
}
.xls-feed {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 12px;
  min-width: 0;
}
.xls-post {
  display: flex;
  gap: 10px;
  border: 1px solid #36383b;
  border-radius: 13px;
  padding: 11px;
  background: #181a1d;
  min-width: 0;
}
.xls-post .xls-avatar {
  height: 38px;
  width: 38px;
  border-radius: 50%;
  object-fit: cover;
  flex: 0 0 auto;
  background: #444;
}
.xls-post .xls-post-body {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.xls-post a {
  color: inherit;
  text-decoration: none;
}
.xls-post a:hover {
  text-decoration: underline;
}
.xls-post .xls-post-date {
  font-size: 11px;
  color: #8b919c;
}
.xls-post .xls-post-text {
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.45;
  margin: 7px 0;
}
.xls-post .xls-media {
  width: 100%;
  max-height: 420px;
  object-fit: contain;
  border-radius: 10px;
  background: #09090a;
  margin-top: 7px;
}
.xls-feed-status {
  font-size: 12px;
  color: #b7bac2;
  line-height: 1.5;
}
.quick-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483643;
  display: none;
  background: #0009;
}
.quick-backdrop.open {
  display: block;
}
.quick-picker {
  position: fixed;
  z-index: 2147483644;
  display: none;
  width: min(350px, calc(100vw - 16px));
  max-height: min(65dvh, 540px);
  background: #18191c;
  color: #f5f5f5;
  border: 1px solid #3e4147;
  border-radius: 16px;
  box-shadow: 0 18px 65px #000a;
  overflow: hidden;
  flex-direction: column;
}
.quick-picker.open {
  display: flex;
}
.quick-head {
  padding: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid #33363a;
}
.quick-head strong {
  font-size: 15px;
}
.quick-search {
  font-size: 16px;
  background: #282a2e;
  border: 1px solid #4a4c50;
  color: #fff;
  border-radius: 10px;
  padding: 11px 12px;
  width: 100%;
  outline-offset: 2px;
}
.quick-options {
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  min-height: 60px;
  flex: 1;
}
.quick-option {
  display: flex;
  width: 100%;
  text-align: left;
  align-items: center;
  gap: 10px;
  padding: 13px 14px;
  color: inherit;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #303236;
  min-height: 52px;
}
.quick-option:active {
  background: #33363c;
}
.quick-option .copy {
  font-size: 13px;
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
.quick-option small {
  display: block;
  font-size: 11px;
  color: #a8a8b0;
  margin-top: 4px;
}
.quick-option .checkmark {
  font-size: 12px;
  color: #8ce5c7;
}
.quick-status {
  border-top: 1px solid #33363a;
  padding: 9px 13px;
  color: #aaa;
  font-size: 11px;
  line-height: 1.4;
}
.quick-flags {
  display: flex;
  gap: 12px;
  padding: 7px 14px 10px;
  flex-wrap: wrap;
  border-bottom: 1px solid #303236;
}
.quick-flags label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
}
.quick-flags input {
  accent-color: #f97346;
  width: 17px;
  height: 17px;
}
.quick-toast {
  position: fixed;
  z-index: 2147483646;
  left: 50%;
  bottom: calc(26px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  background: #22262b;
  color: #fff;
  border: 1px solid #555;
  border-radius: 12px;
  padding: 11px 15px;
  font-size: 13px;
  max-width: calc(100vw - 32px);
  display: none;
  box-shadow: 0 10px 30px #0009;
}
.quick-toast.show {
  display: block;
}
@media (max-width: 600px) {
  .panel {
    border-left: 0;
  }
  .body {
    padding: 12px;
  }
  .fab {
    right: 12px;
    bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  }
  .quick-picker {
    left: 0 !important;
    top: auto !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100% !important;
    max-height: min(75dvh, 760px);
    border-radius: 20px 20px 0 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}
@media (prefers-reduced-motion: no-preference) {
  .panel {
    animation: appear 0.18s ease-out;
  }
  @keyframes appear {
    from {
      transform: translateX(14px);
      opacity: 0.6;
    }
    to {
      transform: none;
      opacity: 1;
    }
  }
}
`;
}
