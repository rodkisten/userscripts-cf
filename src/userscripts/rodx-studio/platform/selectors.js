export let XDOM;

export function initializeOuterXDOM() {
  XDOM = Object.freeze({
    tweet: ':is(article,[role="article"])[data-testid="tweet"],article[data-testid="tweetDetail"]',
    author: '[data-testid="User-Name"],[data-testid="UserName"],[data-testid="user-name"]',
    userCell: '[data-testid="UserCell"],[data-testid="UserListItem"],[data-testid="user"][role="listitem"]',
    nativeSearch: 'input[data-testid="SearchBox_Search_Input"],input[role="searchbox"][name="q"]',
    primary: '[data-testid="primaryColumn"],main[role="main"],main,[role="main"]',
    listLink: 'a[href*="/lists/"]',
  });
}
