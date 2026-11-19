import { mountView } from "../ui/solid-mount.tsx";
import { applyComponentStyle } from "../../../core/css.js";
import { RODX_SELECTORS, NATIVE_X_SELECTORS, DOM_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-layout-tweets-1.css?inline";
import { Studio } from "../core/studio.js";
import { XDOM } from "../platform/selectors.js";

// ============================================================================
// Constantes Semânticas e Mensagens
// ============================================================================
const ELEMENT_IDS = {
  compactLayoutStyle: "rodx-compact-layout-css",
} as const;

const CSS_CLASSES = {
  profileName: "rodx-profile-name",
  profileIdentity: "rodx-profile-identity",
  profileIdentitySource: "rodx-profile-identity-source",
  profileHandle: "rodx-profile-handle",
  profileDetail: "rodx-profile-detail",
  profileMore: "rodx-profile-more",
  detailOpen: "rodx-detail-open",
  profileOverlayRow: "rodx-profile-overlay-row",
  profileAvatarSlot: "rodx-profile-avatar-slot",
  profileActionSlot: "rodx-profile-action-slot",
  repeatAuthor: "rodx-repeat-author",
  avatarGutter: "rodx-avatar-gutter",
  edgeContent: "rodx-edge-content",
  glassActions: "rodx-glass-actions",
  tweetTopbar: "rodx-tweet-topbar",
  miniAvatar: "rodx-mini-avatar",
  topbarAuthor: "rodx-topbar-author",
  authorInTopbar: "rodx-author-in-topbar",
  rxTweetsClone: "rx-tweets-clone",
  rxTweetsToggle: "rx-tweets-toggle",
} as const;

const DATA_ATTRS = {
  repeat: "rodxRepeat",
  long: "rodxLong",
  handle: "handle",
  author: "author",
  proxy: "proxy",
  expanded: "aria-expanded",
  pressed: "aria-pressed",
} as const;

const UI_TEXTS = {
  moreText: "Ver mais",
  lessText: "Ver menos",
  openProfileTitle: "Abrir perfil",
  openProfileAriaPrefix: "Abrir perfil ",
  repostLabel: "Repostar",
  likeLabel: "Curtir",
  bookmarkLabel: "Salvar",
  telegramLabel: "Enviar ao Telegram",
} as const;

const REGEX_PATTERNS = {
  profilePath: /^\/([a-zA-Z0-9_]{1,15})(?:\/(?:media|with_replies|highlights|articles))?\/?$/,
  excludedProfileHandles:
    /^(home|search|explore|notifications|messages|settings|i|compose|lists|login|signup|communities)$/i,
  unfollowedRegex: /^(?:não é seguido por ninguém que você segue|not followed by anyone you.re following)$/i,
  backgroundImageUrl: /url\(["']?([^"')]+)["']?\)/,
  handleValidation: /^\/[A-Za-z0-9_]{1,15}$/,
} as const;

const PROXY_ACTIONS = [
  {
    action: "repost",
    label: UI_TEXTS.repostLabel,
    selector: '[data-testid="retweet"],[data-testid="unretweet"]',
    icon: "↻",
  },
  {
    action: "like",
    label: UI_TEXTS.likeLabel,
    selector: '[data-testid="like"],[data-testid="unlike"]',
    icon: "♡",
  },
  {
    action: "bookmark",
    label: UI_TEXTS.bookmarkLabel,
    selector: '[data-testid="bookmark"],[data-testid="removeBookmark"],.rodx-bookmark-btn',
    icon: "♧",
  },
  {
    action: "telegram",
    label: UI_TEXTS.telegramLabel,
    selector: "button.rodx-tg-action:not(.rodx-tg-video-overlay)",
    icon: "➤",
  },
] as const;

export interface CompactLayoutAPI {
  scan(): void;
}

export type CompactLayoutController = CompactLayoutAPI | undefined;

export let CompactLayout: CompactLayoutController;

export function initializeDeckCompactLayout(): void {
  CompactLayout = (() => {
    let last = 0;
    let profileKey = "";
    const marked = new Set<HTMLElement>();

    const add = (el: HTMLElement | null, name: string): void => {
      if (el) {
        el.classList.add(name);
        marked.add(el);
      }
    };

    const profilePath = (): string => {
      const match = location.pathname.match(REGEX_PATTERNS.profilePath);
      return match && !REGEX_PATTERNS.excludedProfileHandles.test(match[1]) ? match[1] : "";
    };

    function childOf(el: HTMLElement | null, parent: HTMLElement): HTMLElement | null {
      let current = el;
      while (current?.parentElement && current.parentElement !== parent) {
        current = current.parentElement;
      }
      return current?.parentElement === parent ? current : null;
    }

    function style(): void {
      if (document.getElementById(ELEMENT_IDS.compactLayoutStyle)) return;
      const node = document.createElement("style");
      node.id = ELEMENT_IDS.compactLayoutStyle;
      node.textContent = extractedCSS1;
      document.head.append(node);
    }

    function resetProfile(): void {
      for (const el of marked) {
        if (!el.isConnected) {
          marked.delete(el);
          continue;
        }
        for (const name of Array.from(el.classList)) {
          if (name.startsWith("rodx-profile-") || name === CSS_CLASSES.detailOpen) {
            el.classList.remove(name);
          }
        }
      }
      document
        .querySelectorAll<HTMLElement>(RODX_SELECTORS.profileIdentityControls)
        .forEach((el) => el.remove());
    }

    function profile(): void {
      const handle = profilePath();
      if (handle !== profileKey) {
        resetProfile();
        profileKey = handle;
      }
      if (!handle) return;

      const primary =
        document.querySelector<HTMLElement>(NATIVE_X_SELECTORS.primaryColumn) ||
        document.querySelector<HTMLElement>(DOM_SELECTORS.mainContent);
      if (!primary) return;

      const name = primary.querySelector<HTMLElement>(NATIVE_X_SELECTORS.profileUserName);
      if (!name || name.closest(DOM_SELECTORS.articles)) return;
      add(name, CSS_CLASSES.profileName);

      let identity = primary.querySelector<HTMLElement>(RODX_SELECTORS.profileIdentity);
      if (!identity) {
        identity = (<div className={CSS_CLASSES.profileIdentity} />) as HTMLDivElement;
        name.before(identity);
      }

      const display =
        (name.innerText || name.textContent || "")
          .split("\n")
          .map((v) => v.trim())
          .find((v) => v && !v.startsWith("@")) || handle;

      if (identity.dataset[DATA_ATTRS.handle] !== handle) {
        identity.replaceChildren();
        identity.dataset[DATA_ATTRS.handle] = handle;

        const title = (
          <strong>{display.replace(new RegExp("@" + handle + "$", "i"), "").trim()}</strong>
        ) as HTMLElement;

        const at = (<span>{"@" + handle}</span>) as HTMLSpanElement;

        identity.append(title, at);

        const badge = name.querySelector<HTMLElement>(DOM_SELECTORS.svgIcons);
        if (badge) {
          const badgeClone = badge.cloneNode(true) as HTMLElement;
          applyComponentStyle(badgeClone, CSS_CLASSES.rxTweetsClone, false);
          title.append(badgeClone);
        }
      }

      add(name, CSS_CLASSES.profileIdentitySource);

      const handleNode = Array.from(name.querySelectorAll<HTMLElement>(DOM_SELECTORS.textSpansAndDivs))
        .filter((el) => (el.textContent || "").trim().toLowerCase() === "@" + handle.toLowerCase())
        .sort(
          (a, b) =>
            a.querySelectorAll<HTMLElement>(DOM_SELECTORS.allElements).length -
            b.querySelectorAll<HTMLElement>(DOM_SELECTORS.allElements).length,
        )[0];

      if (handleNode) {
        let branch = handleNode;
        while (branch.parentElement && branch.parentElement !== name) {
          branch = branch.parentElement;
        }
        add(branch, CSS_CLASSES.profileHandle);
      }

      const details = Array.from(
        primary.querySelectorAll<HTMLElement>(NATIVE_X_SELECTORS.profileSocialDetails),
      ).filter((el) => !el.closest(DOM_SELECTORS.articles));

      for (const link of primary.querySelectorAll<HTMLElement>(NATIVE_X_SELECTORS.mutualFollowerLinks)) {
        if (!link.closest(DOM_SELECTORS.articles)) details.push(link);
      }
      for (const link of primary.querySelectorAll<HTMLElement>(NATIVE_X_SELECTORS.profileFollowLinks)) {
        if (!link.closest(DOM_SELECTORS.articles)) details.push(link);
      }
      for (const el of primary.querySelectorAll<HTMLElement>(DOM_SELECTORS.textDivsAndSpans)) {
        if (el.closest(DOM_SELECTORS.articles) || el.childElementCount > 2) continue;
        if (REGEX_PATTERNS.unfollowedRegex.test((el.textContent || "").trim())) {
          details.push(el);
        }
      }

      const following = primary.querySelector<HTMLElement>(NATIVE_X_SELECTORS.followingLinks);
      const followers = primary.querySelector<HTMLElement>(NATIVE_X_SELECTORS.followerLinks);

      if (following && followers) {
        let row = following.parentElement;
        while (row && row !== primary && !row.contains(followers)) {
          row = row.parentElement;
        }
        if (
          row &&
          row !== primary &&
          !row.contains(name) &&
          !row.querySelector<HTMLElement>(NATIVE_X_SELECTORS.profileDescription)
        ) {
          details.push(row);
        }
      }

      for (const el of details) {
        add(el, CSS_CLASSES.profileDetail);
      }

      let toggle = primary.querySelector<HTMLElement>(RODX_SELECTORS.profileMoreButton);
      if (!toggle && details.length) {
        toggle = (
          <button
            type="button"
            className={CSS_CLASSES.profileMore}
            aria-expanded="false"
            onClick={(event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              const isOpen = toggle!.getAttribute(DATA_ATTRS.expanded) !== "true";
              toggle!.setAttribute(DATA_ATTRS.expanded, String(isOpen));
              toggle!.textContent = isOpen ? UI_TEXTS.lessText : UI_TEXTS.moreText;
              primary
                .querySelectorAll<HTMLElement>(RODX_SELECTORS.profileDetail)
                .forEach((el) => el.classList.toggle(CSS_CLASSES.detailOpen, isOpen));
            }}
          >
            {UI_TEXTS.moreText}
          </button>
        ) as HTMLButtonElement;

        name.after(toggle);
      }

      if (toggle) applyComponentStyle(toggle, CSS_CLASSES.rxTweetsToggle, false);

      const isOpen = toggle?.getAttribute(DATA_ATTRS.expanded) === "true";
      details.forEach((el) => el.classList.toggle(CSS_CLASSES.detailOpen, isOpen));

      const avatar = primary.querySelector<HTMLElement>(NATIVE_X_SELECTORS.profilePhotoLinkByHandle(handle));
      const cover = primary.querySelector<HTMLElement>(NATIVE_X_SELECTORS.profileCoverLinkByHandle(handle));
      const action =
        primary.querySelector<HTMLElement>(NATIVE_X_SELECTORS.userActions) ||
        primary.querySelector<HTMLElement>(NATIVE_X_SELECTORS.followToggleButtons);

      if (!avatar || !cover || !action) return;

      let rowNode = avatar.parentElement;
      while (rowNode && rowNode !== primary && !rowNode.contains(action)) {
        rowNode = rowNode.parentElement;
      }

      if (!rowNode || rowNode === primary || rowNode.contains(name) || rowNode.contains(cover)) return;

      const avatarSlot = childOf(avatar, rowNode);
      const actionSlot = childOf(action, rowNode);

      if (!avatarSlot || !actionSlot || avatarSlot === actionSlot) return;

      add(rowNode, CSS_CLASSES.profileOverlayRow);
      add(avatarSlot, CSS_CLASSES.profileAvatarSlot);
      add(actionSlot, CSS_CLASSES.profileActionSlot);
    }

    function author(article: HTMLElement) {
      const user = article.querySelector<HTMLElement>(NATIVE_X_SELECTORS.tweetAuthorName);
      const link = Array.from(
        user?.querySelectorAll<HTMLAnchorElement>(DOM_SELECTORS.linksWithHref) || [],
      ).find((a) => REGEX_PATTERNS.handleValidation.test(a.getAttribute("href") || ""));
      return {
        user,
        link,
        key: link?.getAttribute("href")?.toLowerCase() || "",
      };
    }

    function tweets(): void {
      let previous = "";
      for (const article of Studio.dom.nodes(XDOM.tweet)) {
        if (
          article.parentElement?.closest(DOM_SELECTORS.articles) ||
          article.hidden ||
          getComputedStyle(article).display === "none"
        )
          continue;

        const { user, link, key } = author(article);
        const context =
          (article as ParentNode).querySelector<HTMLElement>(NATIVE_X_SELECTORS.socialContext)?.textContent ||
          "";
        const identity = key ? key + ":" + context : "";

        article.dataset[DATA_ATTRS.repeat] = identity && identity === previous ? "1" : "0";
        previous = identity;
        article.dataset[DATA_ATTRS.long] =
          article.getBoundingClientRect().height > innerHeight * 0.9 ? "1" : "0";

        (article as ParentNode)
          .querySelectorAll<HTMLElement>(RODX_SELECTORS.repeatedAuthor)
          .forEach((el) => el.classList.remove(CSS_CLASSES.repeatAuthor));

        if (user) {
          for (const a of user.querySelectorAll<HTMLAnchorElement>(DOM_SELECTORS.linksWithHref)) {
            if (a.getAttribute("href")?.toLowerCase() === key) {
              a.classList.add(CSS_CLASSES.repeatAuthor);
            }
          }
        }

        const avatar =
          (article as ParentNode).querySelector<HTMLElement>(NATIVE_X_SELECTORS.tweetAvatarContainers) ||
          (article as ParentNode)
            .querySelector<HTMLElement>(NATIVE_X_SELECTORS.profileImages)
            ?.closest<HTMLElement>(DOM_SELECTORS.anchors);

        if (avatar && user) {
          let rowNode = avatar.parentElement;
          while (rowNode && rowNode !== article && !rowNode.contains(user)) {
            rowNode = rowNode.parentElement;
          }
          if (rowNode && rowNode !== article) {
            const gutter = childOf(avatar, rowNode);
            const content = childOf(user, rowNode);
            if (gutter && content && gutter !== content) {
              add(gutter, CSS_CLASSES.avatarGutter);
              add(content, CSS_CLASSES.edgeContent);
            }
          }
        }

        const like = (article as ParentNode).querySelector<HTMLElement>(NATIVE_X_SELECTORS.likeToggleButtons);
        const bar = like?.closest<HTMLElement>(DOM_SELECTORS.actionGroups);
        if (!bar || bar.closest(DOM_SELECTORS.articles) !== article) continue;

        bar.classList.remove(CSS_CLASSES.glassActions);
        bar.querySelectorAll(RODX_SELECTORS.miniAvatar).forEach((el) => el.remove());

        let column = user?.parentElement;
        while (column && column !== article && !column.contains(bar)) {
          column = column.parentElement;
        }
        if (!column || column === article) continue;

        let top = (article as ParentNode).querySelector<HTMLElement>(RODX_SELECTORS.tweetTopbar);
        if (!top) {
          top = (
            <div className={`${CSS_CLASSES.tweetTopbar} ${CSS_CLASSES.glassActions}`} />
          ) as HTMLDivElement;
        }

        if (top.parentElement !== column) {
          column.prepend(top);
        }

        const image = avatar?.querySelector<HTMLElement>(DOM_SELECTORS.imageOrBackgroundImage);
        const sourceURL =
          avatar?.closest<HTMLAnchorElement>(DOM_SELECTORS.linksWithHref)?.getAttribute("href") ||
          link?.getAttribute("href") ||
          key;

        let mini = (top as ParentNode).querySelector<HTMLAnchorElement>(RODX_SELECTORS.miniAvatar);
        if (sourceURL && (!mini || mini.getAttribute("href") !== sourceURL)) {
          mini?.remove();
          mini = (
            <a
              className={CSS_CLASSES.miniAvatar}
              href={sourceURL}
              title={UI_TEXTS.openProfileTitle}
              aria-label={UI_TEXTS.openProfileAriaPrefix + key.slice(1)}
              onClick={(event: MouseEvent) => {
                event.preventDefault();
                event.stopImmediatePropagation();
                const native = Array.from(
                  (article as ParentNode).querySelectorAll<HTMLAnchorElement>(
                    NATIVE_X_SELECTORS.authorProfileLinks,
                  ),
                ).find((a) => a.getAttribute("href")?.toLowerCase() === key);
                if (native) native.click();
                else location.assign(mini!.href);
              }}
            >
              {image ? (
                <img
                  src={
                    image.getAttribute("src") ||
                    (image as HTMLImageElement).currentSrc ||
                    image.style?.backgroundImage?.match(REGEX_PATTERNS.backgroundImageUrl)?.[1] ||
                    ""
                  }
                  alt=""
                  width="28"
                  height="28"
                  decoding="async"
                />
              ) : (
                "●"
              )}
            </a>
          ) as HTMLAnchorElement;

          top.prepend(mini);
        }

        let authorLink = (top as ParentNode).querySelector<HTMLAnchorElement>(RODX_SELECTORS.topbarAuthor);
        if (!authorLink) {
          authorLink = (<a className={CSS_CLASSES.topbarAuthor} />) as HTMLAnchorElement;
          top.insertBefore(authorLink, top.querySelector(RODX_SELECTORS.proxyActions));
        }

        if (key) {
          authorLink.href = key;
          authorLink.title = UI_TEXTS.openProfileAriaPrefix + key.slice(1);
          const display = (link?.textContent || key.slice(1)).trim();
          const signature = key + ":" + display;

          if (authorLink.dataset[DATA_ATTRS.author] !== signature) {
            authorLink.replaceChildren();
            authorLink.dataset[DATA_ATTRS.author] = signature;

            const nameEl = (<strong>{display}</strong>) as HTMLElement;

            const atEl = (<span>{"@" + key.slice(1)}</span>) as HTMLSpanElement;

            authorLink.append(nameEl, atEl);
          }

          authorLink.onclick = (event: MouseEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            const native = Array.from(
              (article as ParentNode).querySelectorAll<HTMLAnchorElement>(
                NATIVE_X_SELECTORS.authorProfileLinks,
              ),
            ).find((a) => a.getAttribute("href")?.toLowerCase() === key);
            if (native) native.click();
            else location.assign(authorLink!.href);
          };
        }

        article.classList.add(CSS_CLASSES.authorInTopbar);

        for (const { action, label, selector, icon } of PROXY_ACTIONS) {
          let proxy = (top as ParentNode).querySelector<HTMLButtonElement>(
            RODX_SELECTORS.proxyActionByName(action),
          );
          if (!proxy) {
            proxy = (
              <button
                type="button"
                data-proxy={action}
                title={label}
                aria-label={label}
                onClick={(event: MouseEvent) => {
                  event.preventDefault();
                  event.stopImmediatePropagation();
                  const nativeEl = Array.from(
                    (article as ParentNode).querySelectorAll<HTMLElement>(selector),
                  ).find((el) => !top.contains(el));
                  nativeEl?.click();
                }}
              />
            ) as HTMLButtonElement;
            top.append(proxy);
          }

          const native = Array.from((article as ParentNode).querySelectorAll<HTMLElement>(selector)).find(
            (el) => !top.contains(el),
          );
          proxy.hidden = !native;
          if (native) {
            const svg = native.querySelector<HTMLElement>(DOM_SELECTORS.svgIcons);
            const markup = svg ? svg.cloneNode(true) : icon;
            const pressed =
              native.getAttribute(DATA_ATTRS.pressed) === "true" ||
              /unlike|unretweet|removeBookmark/.test(native.dataset.testid || "");

            mountView(proxy, () => markup);
            proxy.setAttribute(DATA_ATTRS.pressed, String(pressed));
          }
        }
      }
    }

    function scan(): void {
      const now = Date.now();
      if (now - last < 500) return;
      last = now;
      style();
      profile();
      tweets();
      for (const el of marked) {
        if (!el.isConnected) marked.delete(el);
      }
    }

    return Object.freeze({
      scan,
    });
  })();
}
