// GitHub's native responsive navigation must remain untouched.
// In particular, hiding UnderlineNav actions breaks Safari mobile navigation.
export function fitGitHubNavigation(_ctx: unknown): () => void {
  return () => {};
}
