import { CSS_SELECTORS } from "../../../selectors.js";
export function studioListIndex(Studio) {
  const profile = document.querySelector(CSS_SELECTORS.currentAccountLinks);
  const fromLink = profile?.getAttribute("href")?.match(/^\/([\w]{1,15})\/?$/)?.[1];
  const label = Studio.state.deck?.accountLabel?.replace(/^@/, "");
  const user = fromLink || (/^[\w]{1,15}$/.test(label || "") ? label : "");
  return user ? "/" + user + "/lists" : "/i/lists";
}
