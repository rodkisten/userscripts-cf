export function studioListIndex(Studio) {
  const profile = document.querySelector(
    'a[data-testid="AppTabBar_Profile_Link"],a[data-testid="SideNav_AccountSwitcher_Button"]',
  );
  const fromLink = profile?.getAttribute("href")?.match(/^\/([\w]{1,15})\/?$/)?.[1];
  const label = Studio.state.deck?.accountLabel?.replace(/^@/, "");
  const user = fromLink || (/^[\w]{1,15}$/.test(label || "") ? label : "");
  return user ? "/" + user + "/lists" : "/i/lists";
}
