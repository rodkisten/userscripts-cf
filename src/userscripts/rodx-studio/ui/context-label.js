export function studioContextLabel(Studio) {
  const p = location.pathname,
    q = new URL(location.href).searchParams.get("q");
  if (p === "/search") return "Pesquisa · " + (q || "");
  const id = p.match(/\/(?:[\w]{1,15}\/)?lists\/(\d+)/)?.[1];
  if (id) {
    const row = Studio.services.lists?.all().find((row) => row.id === id);
    return "Lista · " + (row ? Studio.services.lists.displayName(row) : "lista " + id);
  }
  const user = p.match(/^\/([\w]{1,15})(?:\/(?:media|with_replies|highlights|articles))?\/?$/)?.[1];
  return user && !/^(home|explore|notifications|messages|settings|bookmarks|i)$/.test(user)
    ? "Perfil · @" + user
    : "";
}
