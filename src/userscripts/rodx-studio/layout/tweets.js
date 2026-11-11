import { cssDeclarations } from "../../../core/css.js";
import inlineCSS1 from "../../../styles/inline/userscripts-rodx-studio-layout-tweets-1.css?inline";
import inlineCSS2 from "../../../styles/inline/userscripts-rodx-studio-layout-tweets-2.css?inline";
import { CSS_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-layout-tweets-1.css?inline";
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
      node.textContent = extractedCSS1;
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
      document.querySelectorAll(CSS_SELECTORS.profileIdentityControls).forEach((el) => el.remove());
    }
    function profile() {
      const handle = profilePath();
      if (handle !== profileKey) {
        resetProfile();
        profileKey = handle;
      }
      if (!handle) return;
      const primary =
        document.querySelector(CSS_SELECTORS.primaryColumn) ||
        document.querySelector(CSS_SELECTORS.mainContent);
      if (!primary) return;
      const name = primary.querySelector(CSS_SELECTORS.profileUserName);
      if (!name || name.closest(CSS_SELECTORS.articles)) return;
      add(name, "rodx-profile-name");
      let identity = primary.querySelector(CSS_SELECTORS.profileIdentity);
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
        const badge = name.querySelector(CSS_SELECTORS.svgIcons);
        if (badge) {
          const clone = badge.cloneNode(true);
          clone.style.cssText = cssDeclarations(inlineCSS1);
          title.append(clone);
        }
      }
      add(name, "rodx-profile-identity-source");
      const handleNode = [...name.querySelectorAll(CSS_SELECTORS.textSpansAndDivs)]
        .filter((el) => el.textContent.trim().toLowerCase() === "@" + handle.toLowerCase())
        .sort(
          (a, b) =>
            a.querySelectorAll(CSS_SELECTORS.allElements).length -
            b.querySelectorAll(CSS_SELECTORS.allElements).length,
        )[0];
      if (handleNode) {
        let branch = handleNode;
        while (branch.parentElement && branch.parentElement !== name) branch = branch.parentElement;
        add(branch, "rodx-profile-handle");
      }
      const details = [...primary.querySelectorAll(CSS_SELECTORS.profileSocialDetails)].filter(
        (el) => !el.closest(CSS_SELECTORS.articles),
      );
      for (const link of primary.querySelectorAll(CSS_SELECTORS.mutualFollowerLinks)) {
        if (!link.closest(CSS_SELECTORS.articles)) details.push(link);
      }
      for (const link of primary.querySelectorAll(CSS_SELECTORS.profileFollowLinks)) {
        if (!link.closest(CSS_SELECTORS.articles)) details.push(link);
      }
      for (const el of primary.querySelectorAll(CSS_SELECTORS.textDivsAndSpans)) {
        if (el.closest(CSS_SELECTORS.articles) || el.childElementCount > 2) continue;
        if (
          /^(?:não é seguido por ninguém que você segue|not followed by anyone you.re following)$/i.test(
            el.textContent.trim(),
          )
        )
          details.push(el);
      }
      const following = primary.querySelector(CSS_SELECTORS.followingLinks),
        followers = primary.querySelector(CSS_SELECTORS.followerLinks);
      if (following && followers) {
        let row = following.parentElement;
        while (row && row !== primary && !row.contains(followers)) row = row.parentElement;
        if (
          row &&
          row !== primary &&
          !row.contains(name) &&
          !row.querySelector(CSS_SELECTORS.profileDescription)
        )
          details.push(row);
      }
      for (const el of details) add(el, "rodx-profile-detail");
      let toggle = primary.querySelector(CSS_SELECTORS.profileMoreButton);
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
            .querySelectorAll(CSS_SELECTORS.profileDetail)
            .forEach((el) => el.classList.toggle("rodx-detail-open", open));
        };
        name.after(toggle);
      }
      if (toggle) toggle.style.cssText = cssDeclarations(inlineCSS2);
      const open = toggle?.getAttribute("aria-expanded") === "true";
      details.forEach((el) => el.classList.toggle("rodx-detail-open", open));
      const avatar = primary.querySelector(CSS_SELECTORS.profilePhotoLinkByHandle(handle));
      const cover = primary.querySelector(CSS_SELECTORS.profileCoverLinkByHandle(handle));
      const action =
        primary.querySelector(CSS_SELECTORS.userActions) ||
        primary.querySelector(CSS_SELECTORS.followToggleButtons);
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
      const user = article.querySelector(CSS_SELECTORS.tweetAuthorName);
      const link = [...(user?.querySelectorAll(CSS_SELECTORS.linksWithHref) || [])].find((a) =>
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
          article.parentElement?.closest(CSS_SELECTORS.articles) ||
          article.hidden ||
          getComputedStyle(article).display === "none"
        )
          continue;
        const { user, link, key } = author(article);
        const context = article.querySelector(CSS_SELECTORS.socialContext)?.textContent || "";
        const identity = key ? key + ":" + context : "";
        article.dataset.rodxRepeat = identity && identity === previous ? "1" : "0";
        previous = identity;
        article.dataset.rodxLong = article.getBoundingClientRect().height > innerHeight * 0.9 ? "1" : "0";
        article
          .querySelectorAll(CSS_SELECTORS.repeatedAuthor)
          .forEach((el) => el.classList.remove("rodx-repeat-author"));
        if (user)
          for (const a of user.querySelectorAll(CSS_SELECTORS.linksWithHref))
            if (a.getAttribute("href")?.toLowerCase() === key) a.classList.add("rodx-repeat-author");
        const avatar =
          article.querySelector(CSS_SELECTORS.tweetAvatarContainers) ||
          article.querySelector(CSS_SELECTORS.profileImages)?.closest(CSS_SELECTORS.anchors);
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
        const like = article.querySelector(CSS_SELECTORS.likeToggleButtons);
        const bar = like?.closest(CSS_SELECTORS.actionGroups);
        if (!bar || bar.closest(CSS_SELECTORS.articles) !== article) continue;
        bar.classList.remove("rodx-glass-actions");
        bar.querySelectorAll(CSS_SELECTORS.miniAvatar).forEach((el) => el.remove());
        // The tweet itself can be a horizontal React flex row. A full-width
        // sibling placed there consumes the content width. Mount inside the
        // existing column containing both author and native action group.
        let column = user?.parentElement;
        while (column && column !== article && !column.contains(bar)) column = column.parentElement;
        if (!column || column === article) continue;
        let top = article.querySelector(CSS_SELECTORS.tweetTopbar);
        if (!top) {
          top = document.createElement("div");
          top.className = "rodx-tweet-topbar rodx-glass-actions";
        }
        if (top.parentElement !== column) column.prepend(top);
        const image = avatar?.querySelector(CSS_SELECTORS.imageOrBackgroundImage);
        const sourceURL =
          avatar?.closest(CSS_SELECTORS.linksWithHref)?.getAttribute("href") ||
          link?.getAttribute("href") ||
          key;
        let mini = top.querySelector(CSS_SELECTORS.miniAvatar);
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
            const native = [...article.querySelectorAll(CSS_SELECTORS.authorProfileLinks)].find(
              (a) => a.getAttribute("href")?.toLowerCase() === key,
            );
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
        let authorLink = top.querySelector(CSS_SELECTORS.topbarAuthor);
        if (!authorLink) {
          authorLink = document.createElement("a");
          authorLink.className = "rodx-topbar-author";
          top.insertBefore(authorLink, top.querySelector(CSS_SELECTORS.proxyActions));
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
            const native = [...article.querySelectorAll(CSS_SELECTORS.authorProfileLinks)].find(
              (a) => a.getAttribute("href")?.toLowerCase() === key,
            );
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
          let proxy = top.querySelector(CSS_SELECTORS.proxyActionByName(action));
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
            const svg = native.querySelector(CSS_SELECTORS.svgIcons);
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
