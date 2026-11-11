import { Studio } from "../core/studio.js";
import { XDOM } from "../platform/selectors.js";

export let CompactLayout;

export function initializeDeckCompactLayout() {
  CompactLayout = (() => {
    let last = 0,
      profileKey = "";
    const marked = new Set();
    const add = (el, name) => {
      if (el) {
        el.classList.add(name);
        marked.add(el);
      }
    };
    const profilePath = () => {
      const match = location.pathname.match(
        /^\/([a-zA-Z0-9_]{1,15})(?:\/(?:media|with_replies|highlights|articles))?\/?$/,
      );
      return match &&
        !/^(home|search|explore|notifications|messages|settings|i|compose|lists|login|signup|communities)$/i.test(
          match[1],
        )
        ? match[1]
        : "";
    };
    function childOf(el, parent) {
      while (el?.parentElement && el.parentElement !== parent) el = el.parentElement;
      return el?.parentElement === parent ? el : null;
    }
    function style() {
      if (document.getElementById("rodx-compact-layout-css")) return;
      const node = document.createElement("style");
      node.id = "rodx-compact-layout-css";
      node.textContent = `
html.rodx-snap-enabled {
  scroll-snap-type: none !important;
}
:is(article,[role="article"])[data-testid="tweet"] {
  padding-inline: 6px !important;
  margin-inline: 0 !important;
  width: 100% !important;
  max-width: 100% !important;
  scroll-snap-align: none !important;
  scroll-margin-top: 60px;
  scroll-snap-stop: normal;
}
:is(article,[role="article"])[data-testid="tweet"][data-rodx-long="1"] {
  scroll-snap-align: none;
}
:is(article,[role="article"])[data-testid="tweet"] > div {
  padding-inline: 0 !important;
  margin-inline: 0 !important;
}
.rodx-edge-content {
  margin-inline: 0 !important;
  padding-inline: 0 !important;
  min-width: 0 !important;
  flex: 1 !important;
  max-width: 100% !important;
}
.rodx-avatar-gutter {
  display: none !important;
}
.rodx-glass-actions {
  background: rgba(100, 110, 120, 0.1) !important;
  -webkit-backdrop-filter: blur(18px) saturate(1.7);
  backdrop-filter: blur(18px) saturate(1.7);
  border: 1px solid #8e99a32b !important;
  border-radius: 18px !important;
  box-shadow: inset 0 1px 0 #ffffff16;
  display: flex !important;
  align-items: center !important;
  gap: 2px !important;
  margin: 4px 4px 2px !important;
  padding: 3px 5px !important;
  min-height: 34px;
  box-sizing: border-box;
  isolation: isolate;
}
.rodx-glass-actions > div {
  min-width: 0 !important;
  flex-shrink: 1 !important;
}
.rodx-mini-avatar {
  display: flex !important;
  flex: 0 0 26px !important;
  width: 26px !important;
  height: 26px !important;
  overflow: hidden;
  border-radius: 50%;
  margin: 0 3px 0 0 !important;
}
.rodx-mini-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
article[data-rodx-repeat="1"] .rodx-mini-avatar,
article[data-rodx-repeat="1"] .rodx-repeat-author {
  display: none !important;
}
.rodx-profile-name {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap !important;
  align-items: baseline !important;
  gap: 2px 8px !important;
  margin-block: 5px !important;
}
.rodx-profile-name > div {
  margin: 0 !important;
  min-width: 0 !important;
  flex-shrink: 1 !important;
}
.rodx-profile-detail:not(.rodx-detail-open) {
  display: none !important;
}
.rodx-profile-more {
  font:
    500 12px TwitterChirp,
    Arial,
    sans-serif;
  color: inherit;
  background: transparent;
  border: 1px solid #71767b55;
  border-radius: 15px;
  padding: 5px 10px;
  margin: 4px 0 7px;
  cursor: pointer;
}
.rodx-profile-overlay-row {
  position: relative !important;
  height: 0 !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: visible !important;
  display: block !important;
  z-index: 3;
}
.rodx-profile-avatar-slot {
  position: absolute !important;
  left: 8px !important;
  bottom: 12px !important;
  width: 68px !important;
  height: 68px !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  z-index: 2;
}
.rodx-profile-avatar-slot > a {
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
}
.rodx-profile-avatar-slot img {
  object-fit: cover;
}
.rodx-profile-action-slot {
  position: absolute !important;
  right: 6px !important;
  bottom: 12px !important;
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 4px !important;
  max-width: calc(100% - 88px) !important;
  margin: 0 !important;
  padding: 4px !important;
  border-radius: 24px;
  background: rgba(24, 28, 34, 0.32) !important;
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
  backdrop-filter: blur(20px) saturate(1.8);
  box-shadow:
    inset 0 1px 0 #ffffff45,
    0 3px 14px #0003;
  color: #fff !important;
  border: 1px solid #ffffff38;
}
.rodx-profile-action-slot button,
.rodx-profile-action-slot [role="button"] {
  min-height: 32px !important;
  margin: 0 !important;
  border-color: #ffffff50 !important;
  background: transparent !important;
  color: #fff !important;
}

.rodx-feed-filtered,
.rodx-who-to-follow {
  display: none !important;
}
:is(article,[role="article"])[data-testid="tweet"] {
  position: relative !important;
  overflow: visible !important;
}
:is(article,[role="article"])[data-testid="tweet"] .rodx-tweet-topbar {
  position: sticky !important;
  top: 58px !important;
  z-index: 12;
  justify-content: flex-end !important;
  min-height: 38px !important;
  margin: 3px 0 5px !important;
  padding: 3px 6px !important;
  flex: none !important;
  width: 100% !important;
  max-width: 100% !important;
}
.rodx-tweet-topbar .rodx-mini-avatar {
  display: flex !important;
  margin-right: auto !important;
  width: 30px !important;
  height: 30px !important;
  min-width: 30px !important;
  flex: 0 0 30px !important;
  pointer-events: auto !important;
  text-decoration: none;
  color: inherit;
}
article[data-rodx-repeat="1"] .rodx-tweet-topbar .rodx-mini-avatar {
  display: flex !important;
}
.rodx-tweet-topbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 30px;
  padding: 4px;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  touch-action: manipulation;
}
.rodx-tweet-topbar button[hidden] {
  display: none !important;
}
.rodx-tweet-topbar svg {
  width: 20px;
  height: 20px;
  fill: currentColor;
  pointer-events: none;
}
.rodx-tweet-topbar button[aria-pressed="true"] {
  color: #f91880;
}
.rodx-profile-identity-source {
  display: none !important;
}
.rodx-profile-identity {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 0;
  margin: 0;
  min-width: 0;
}
.rodx-profile-identity strong {
  font-size: 18px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
}
.rodx-profile-identity span {
  font-size: 13px;
  color: #71767b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rodx-profile-name {
  gap: 4px !important;
  flex-wrap: nowrap !important;
}
.rodx-profile-name > div {
  display: flex !important;
  flex-direction: row !important;
  align-items: baseline !important;
  gap: 5px !important;
  flex-wrap: wrap !important;
}
.rodx-profile-handle {
  font-size: 13px !important;
  opacity: 0.65;
  white-space: nowrap !important;
}
.rodx-profile-name > div > div {
  margin: 0 !important;
}
.rodx-profile-name {
  margin-bottom: 2px !important;
}

html,
body {
  max-width: 100% !important;
  overflow-x: hidden !important;
  overscroll-behavior-x: none;
}
@supports (overflow: clip) {
  html,
  body {
    overflow-x: clip !important;
  }
}
main,
[role="main"],
[data-testid="primaryColumn"] {
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box;
}
:is(article,[role="article"])[data-testid="tweet"] {
  scroll-margin-top: calc(var(--rodx-chrome-offset, 0px) + 4px) !important;
}
html.rodx-snap-enabled {
  scroll-padding-top: calc(var(--rodx-chrome-offset, 0px) + 4px) !important;
}
.rodx-tweet-topbar,
#rodx-active-tweetbar {
  background: var(--rodx-bar-bg, #000) !important;
  color: var(--rodx-bar-fg, inherit) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 0 !important;
  border-bottom: 1px solid #71767b35 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  isolation: auto !important;
  display: flex !important;
  align-items: center !important;
  gap: 4px !important;
  height: 40px !important;
  min-height: 40px !important;
  max-height: 40px !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  white-space: nowrap !important;
}
:is(article,[role="article"])[data-testid="tweet"] .rodx-tweet-topbar {
  position: relative !important;
  top: auto !important;
  z-index: 2 !important;
  margin: 0 0 4px !important;
  padding: 3px 1px !important;
  width: 100% !important;
  max-width: 100% !important;
  justify-content: flex-start !important;
}
.rodx-tweet-topbar .rodx-mini-avatar {
  margin: 0 !important;
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  flex: 0 0 28px !important;
  border-radius: 50% !important;
}
.rodx-topbar-author {
  display: flex !important;
  align-items: baseline !important;
  gap: 4px;
  min-width: 0 !important;
  flex: 1 1 auto !important;
  color: inherit;
  text-decoration: none;
  overflow: hidden;
  white-space: nowrap;
}
.rodx-topbar-author strong {
  font:
    700 13px TwitterChirp,
    Arial,
    sans-serif;
  min-width: 0;
  max-width: 66%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rodx-topbar-author span {
  font:
    12px TwitterChirp,
    Arial,
    sans-serif;
  color: #71767b;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rodx-tweet-topbar button {
  flex: 0 0 28px !important;
  min-width: 28px !important;
  width: 28px !important;
  height: 32px !important;
  border-radius: 4px !important;
  padding: 4px !important;
}
article.rodx-author-in-topbar [data-testid="User-Name"] {
  display: none !important;
}
#rodx-active-tweetbar {
  position: fixed !important;
  z-index: 1500 !important;
  padding: 3px 7px !important;
  margin: 0 !important;
}
#rodx-active-tweetbar[hidden] {
  display: none !important;
}
.rodx-topbar-floating-source {
  visibility: hidden !important;
}
[data-rodx-chrome="1"] {
  transition:
    translate 0.16s ease,
    opacity 0.16s ease;
}
html.rodx-chrome-hidden [data-rodx-chrome="1"] {
  translate: 0 calc(-1 * var(--rodx-chrome-rise, 300px)) !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
#rodx-search-anchors {
  max-width: 100vw !important;
  box-sizing: border-box;
  overflow-x: auto;
}
#rodx-feed-filters,
#rodx-search-deck-dock {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
@media (prefers-reduced-motion: reduce) {
  [data-rodx-chrome="1"] {
    transition: none;
  }
}

.rodx-tweet-topbar,
#rodx-active-tweetbar {
  background-color: var(--rodx-bar-bg, #000) !important;
  background-image: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  contain: paint !important;
}
.rodx-tweet-topbar .rodx-mini-avatar {
  position: relative !important;
  inset: auto !important;
  display: block !important;
  overflow: hidden !important;
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  max-width: 28px !important;
  max-height: 28px !important;
  flex: 0 0 28px !important;
  contain: paint !important;
}
.rodx-tweet-topbar .rodx-mini-avatar img {
  position: static !important;
  inset: auto !important;
  display: block !important;
  width: 28px !important;
  height: 28px !important;
  max-width: 28px !important;
  max-height: 28px !important;
  object-fit: cover !important;
  transform: none !important;
  filter: none !important;
}
.rodx-tweet-topbar::before,
.rodx-tweet-topbar::after {
  content: none !important;
}
[data-testid="cellInnerDiv"].rodx-feed-filtered-cell {
  display: none !important;
  height: 0 !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}
html,
html.rodx-snap-enabled,
body {
  scroll-snap-type: none !important;
}
:is(article,[role="article"])[data-testid="tweet"] .rodx-tweet-topbar {
  flex: 0 0 auto !important;
  align-self: stretch !important;
  min-width: 0 !important;
  width: auto !important;
  max-width: 100% !important;
}
.rodx-tweet-topbar .rodx-topbar-author {
  flex-basis: 0 !important;
  min-width: 0 !important;
}
@media (prefers-reduced-transparency: reduce) {
  .rodx-glass-actions {
    background: Canvas !important;
  }
  .rodx-profile-action-slot {
    background: #20252e !important;
  }
}
@media (prefers-reduced-motion: reduce) {
  html {
    scroll-snap-type: none;
  }
}
`;
      document.head.append(node);
    }
    function resetProfile() {
      for (const el of marked) {
        if (!el.isConnected) {
          marked.delete(el);
          continue;
        }
        for (const name of [...el.classList])
          if (name.startsWith("rodx-profile-") || name === "rodx-detail-open") el.classList.remove(name);
      }
      document.querySelectorAll(".rodx-profile-more,.rodx-profile-identity").forEach((el) => el.remove());
    }
    function profile() {
      const handle = profilePath();
      if (handle !== profileKey) {
        resetProfile();
        profileKey = handle;
      }
      if (!handle) return;
      const primary =
        document.querySelector('[data-testid="primaryColumn"]') ||
        document.querySelector('main,[role="main"]');
      if (!primary) return;
      const name = primary.querySelector('[data-testid="UserName"]');
      if (!name || name.closest("article")) return;
      add(name, "rodx-profile-name");
      let identity = primary.querySelector(".rodx-profile-identity");
      if (!identity) {
        identity = document.createElement("div");
        identity.className = "rodx-profile-identity";
        name.before(identity);
      }
      const display =
        (name.innerText || name.textContent)
          .split("\n")
          .map((v) => v.trim())
          .find((v) => v && !v.startsWith("@")) || handle;
      if (identity.dataset.handle !== handle) {
        identity.replaceChildren();
        identity.dataset.handle = handle;
        const title = document.createElement("strong");
        title.textContent = display.replace(new RegExp("@" + handle + "$", "i"), "").trim();
        const at = document.createElement("span");
        at.textContent = "@" + handle;
        identity.append(title, at);
        const badge = name.querySelector("svg");
        if (badge) {
          const clone = badge.cloneNode(true);
          clone.style.cssText = "width:18px;height:18px;fill:#1d9bf0";
          title.append(clone);
        }
      }
      add(name, "rodx-profile-identity-source");
      const handleNode = [...name.querySelectorAll("span,div")]
        .filter((el) => el.textContent.trim().toLowerCase() === "@" + handle.toLowerCase())
        .sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length)[0];
      if (handleNode) {
        let branch = handleNode;
        while (branch.parentElement && branch.parentElement !== name) branch = branch.parentElement;
        add(branch, "rodx-profile-handle");
      }
      const details = [
        ...primary.querySelectorAll(
          '[data-testid="UserProfileHeader_Items"],[data-testid="UserFacepile"],[data-testid="UserSocialContext"]',
        ),
      ].filter((el) => !el.closest("article"));
      for (const link of primary.querySelectorAll('a[href$="/followers_you_follow"]')) {
        if (!link.closest("article")) details.push(link);
      }
      for (const link of primary.querySelectorAll(
        'a[href$="/following"],a[href$="/verified_followers"],a[href$="/followers"]',
      )) {
        if (!link.closest("article")) details.push(link);
      }
      for (const el of primary.querySelectorAll("div,span")) {
        if (el.closest("article") || el.childElementCount > 2) continue;
        if (
          /^(?:não é seguido por ninguém que você segue|not followed by anyone you.re following)$/i.test(
            el.textContent.trim(),
          )
        )
          details.push(el);
      }
      const following = primary.querySelector('a[href$="/following"]'),
        followers = primary.querySelector('a[href$="/verified_followers"],a[href$="/followers"]');
      if (following && followers) {
        let row = following.parentElement;
        while (row && row !== primary && !row.contains(followers)) row = row.parentElement;
        if (
          row &&
          row !== primary &&
          !row.contains(name) &&
          !row.querySelector('[data-testid="UserDescription"]')
        )
          details.push(row);
      }
      for (const el of details) add(el, "rodx-profile-detail");
      let toggle = primary.querySelector(".rodx-profile-more");
      if (!toggle && details.length) {
        toggle = document.createElement("button");
        toggle.className = "rodx-profile-more";
        toggle.type = "button";
        toggle.textContent = "Ver mais";
        toggle.setAttribute("aria-expanded", "false");
        toggle.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const open = toggle.getAttribute("aria-expanded") !== "true";
          toggle.setAttribute("aria-expanded", String(open));
          toggle.textContent = open ? "Ver menos" : "Ver mais";
          primary
            .querySelectorAll(".rodx-profile-detail")
            .forEach((el) => el.classList.toggle("rodx-detail-open", open));
        };
        name.after(toggle);
      }
      if (toggle)
        toggle.style.cssText =
          "align-self:flex-start!important;width:auto!important;max-width:max-content!important;display:inline-flex!important;padding:3px 9px!important;margin:2px 0!important";
      const open = toggle?.getAttribute("aria-expanded") === "true";
      details.forEach((el) => el.classList.toggle("rodx-detail-open", open));
      const avatar = primary.querySelector('a[href="/' + handle + '/photo"]');
      const cover = primary.querySelector('a[href="/' + handle + '/header_photo"]');
      const action =
        primary.querySelector('[data-testid="userActions"]') ||
        primary.querySelector('[data-testid$="-follow"],[data-testid$="-unfollow"]');
      if (!avatar || !cover || !action) return;
      let row = avatar.parentElement;
      while (row && row !== primary && !row.contains(action)) row = row.parentElement;
      if (!row || row === primary || row.contains(name) || row.contains(cover)) return;
      const avatarSlot = childOf(avatar, row),
        actionSlot = childOf(action, row);
      if (!avatarSlot || !actionSlot || avatarSlot === actionSlot) return;
      add(row, "rodx-profile-overlay-row");
      add(avatarSlot, "rodx-profile-avatar-slot");
      add(actionSlot, "rodx-profile-action-slot");
    }
    function author(article) {
      const user = article.querySelector('[data-testid="User-Name"]');
      const link = [...(user?.querySelectorAll("a[href]") || [])].find((a) =>
        /^\/[A-Za-z0-9_]{1,15}$/.test(a.getAttribute("href") || ""),
      );
      return {
        user,
        link,
        key: link?.getAttribute("href")?.toLowerCase() || "",
      };
    }
    function tweets() {
      let previous = "";
      for (const article of Studio.dom.nodes(XDOM.tweet)) {
        if (
          article.parentElement?.closest("article") ||
          article.hidden ||
          getComputedStyle(article).display === "none"
        )
          continue;
        const { user, link, key } = author(article);
        const context = article.querySelector('[data-testid="socialContext"]')?.textContent || "";
        const identity = key ? key + ":" + context : "";
        article.dataset.rodxRepeat = identity && identity === previous ? "1" : "0";
        previous = identity;
        article.dataset.rodxLong = article.getBoundingClientRect().height > innerHeight * 0.9 ? "1" : "0";
        article
          .querySelectorAll(".rodx-repeat-author")
          .forEach((el) => el.classList.remove("rodx-repeat-author"));
        if (user)
          for (const a of user.querySelectorAll("a[href]"))
            if (a.getAttribute("href")?.toLowerCase() === key) a.classList.add("rodx-repeat-author");
        const avatar =
          article.querySelector('[data-testid^="UserAvatar-Container-"],[data-testid="Tweet-User-Avatar"]') ||
          article.querySelector('img[src*="profile_images"]')?.closest("a");
        if (avatar && user) {
          let row = avatar.parentElement;
          while (row && row !== article && !row.contains(user)) row = row.parentElement;
          if (row && row !== article) {
            const gutter = childOf(avatar, row),
              content = childOf(user, row);
            if (gutter && content && gutter !== content) {
              add(gutter, "rodx-avatar-gutter");
              add(content, "rodx-edge-content");
            }
          }
        }
        const like = article.querySelector('[data-testid="like"],[data-testid="unlike"]');
        const bar = like?.closest('[role="group"]');
        if (!bar || bar.closest("article") !== article) continue;
        bar.classList.remove("rodx-glass-actions");
        bar.querySelectorAll(".rodx-mini-avatar").forEach((el) => el.remove());
        // The tweet itself can be a horizontal React flex row. A full-width
        // sibling placed there consumes the content width. Mount inside the
        // existing column containing both author and native action group.
        let column = user?.parentElement;
        while (column && column !== article && !column.contains(bar)) column = column.parentElement;
        if (!column || column === article) continue;
        let top = article.querySelector(".rodx-tweet-topbar");
        if (!top) {
          top = document.createElement("div");
          top.className = "rodx-tweet-topbar rodx-glass-actions";
        }
        if (top.parentElement !== column) column.prepend(top);
        const image = avatar?.querySelector('img,div[style*="background-image"]');
        const sourceURL =
          avatar?.closest("a[href]")?.getAttribute("href") || link?.getAttribute("href") || key;
        let mini = top.querySelector(".rodx-mini-avatar");
        if (sourceURL && (!mini || mini.getAttribute("href") !== sourceURL)) {
          mini?.remove();
          mini = document.createElement("a");
          mini.className = "rodx-mini-avatar";
          mini.href = sourceURL;
          mini.title = "Abrir perfil";
          mini.setAttribute("aria-label", "Abrir perfil " + key.slice(1));
          mini.onclick = (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            const native = [
              ...article.querySelectorAll(
                '[data-testid="User-Name"] a[href],[data-testid="UserName"] a[href]',
              ),
            ].find((a) => a.getAttribute("href")?.toLowerCase() === key);
            if (native) native.click();
            else location.assign(mini.href);
          };
          if (image) {
            const img = document.createElement("img");
            const src =
              image.currentSrc ||
              image.getAttribute("src") ||
              image.style?.backgroundImage?.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
            if (src) img.src = src;
            img.alt = "";
            img.width = 28;
            img.height = 28;
            img.decoding = "async";
            mini.append(img);
          } else mini.textContent = "●";
          top.prepend(mini);
        }
        let authorLink = top.querySelector(".rodx-topbar-author");
        if (!authorLink) {
          authorLink = document.createElement("a");
          authorLink.className = "rodx-topbar-author";
          top.insertBefore(authorLink, top.querySelector("[data-proxy]"));
        }
        if (key) {
          authorLink.href = key;
          authorLink.title = "Abrir perfil " + key.slice(1);
          const display = (link?.textContent || key.slice(1)).trim();
          const signature = key + ":" + display;
          if (authorLink.dataset.author !== signature) {
            authorLink.replaceChildren();
            authorLink.dataset.author = signature;
            const name = document.createElement("strong");
            name.textContent = display;
            const at = document.createElement("span");
            at.textContent = "@" + key.slice(1);
            authorLink.append(name, at);
          }
          authorLink.onclick = (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            const native = [
              ...article.querySelectorAll(
                '[data-testid="User-Name"] a[href],[data-testid="UserName"] a[href]',
              ),
            ].find((a) => a.getAttribute("href")?.toLowerCase() === key);
            if (native) native.click();
            else location.assign(authorLink.href);
          };
        }
        article.classList.add("rodx-author-in-topbar");
        for (const [action, label, selector] of [
          ["repost", "Repostar", '[data-testid="retweet"],[data-testid="unretweet"]'],
          ["like", "Curtir", '[data-testid="like"],[data-testid="unlike"]'],
          [
            "bookmark",
            "Salvar",
            '[data-testid="bookmark"],[data-testid="removeBookmark"],.rodx-bookmark-btn',
          ],
          ["telegram", "Enviar ao Telegram", "button.rodx-tg-action:not(.rodx-tg-video-overlay)"],
        ]) {
          let proxy = top.querySelector('[data-proxy="' + action + '"]');
          if (!proxy) {
            proxy = document.createElement("button");
            proxy.type = "button";
            proxy.dataset.proxy = action;
            proxy.title = label;
            proxy.setAttribute("aria-label", label);
            top.append(proxy);
            proxy.onclick = (event) => {
              event.preventDefault();
              event.stopImmediatePropagation();
              const native = [...article.querySelectorAll(selector)].find((el) => !top.contains(el));
              native?.click();
            };
          }
          const native = [...article.querySelectorAll(selector)].find((el) => !top.contains(el));
          proxy.hidden = !native;
          if (native) {
            const svg = native.querySelector("svg");
            const icon = svg
              ? svg.outerHTML
              : {
                  repost: "↻",
                  like: "♡",
                  bookmark: "♧",
                  telegram: "➤",
                }[action];
            const pressed =
              native.getAttribute("aria-pressed") === "true" ||
              /unlike|unretweet|removeBookmark/.test(native.dataset.testid || "");
            const markup = icon;
            if (proxy.innerHTML !== markup) proxy.innerHTML = markup;
            proxy.setAttribute("aria-pressed", String(pressed));
          }
        }
      }
    }
    function scan() {
      const now = Date.now();
      if (now - last < 500) return;
      last = now;
      style();
      profile();
      tweets();
      for (const el of marked) if (!el.isConnected) marked.delete(el);
    }
    return {
      scan,
    };
  })();
}
