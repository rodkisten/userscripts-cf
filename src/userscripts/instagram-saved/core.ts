export type Reel = { product_type?: string; code?: string; pk?: string | number; id?: string | number; video_versions?: Array<{url: string; width: number; height: number}>; caption?: {text?: string}; user?: {username?: string}; media?: Reel };
export type MediaPayload = { provider: string; mediaId: string; sourceUrl: string; pageUrl: string; mediaUrl: string; mediaType: string; force: boolean; caption: string; mediaVariants: Array<{mediaUrl: string; width: number; height: number}>; metadata: Record<string, unknown> };
export type Page = { items: Reel[]; status?: string; more_available?: boolean; next_max_id?: string };
export type DeliveryResult = { index: number; status?: number; channels?: { inserted?: string[]; covered?: string[]; notSent?: Array<{reason: string; channelId: string}> } };
export type SyncOptions = { fetchPage: (cursor: string) => Promise<Page>; sendBatch: (items: MediaPayload[]) => Promise<{results: DeliveryResult[]}>; load: () => Promise<Record<string, number>>; save: (done: Record<string, number>) => Promise<unknown>; channels: string[]; pause: (ms: number) => Promise<unknown>; signal?: AbortSignal; settings?: {cursor?: string; batchSize?: number; maxItemsPerSession?: number; delayMs?: number; jitterMs?: number}; onCursor?: (cursor: string) => Promise<unknown> };
export const SAVED_PATH = "/api/v1/feed/saved/posts/";
export const COLLECTION_PATH = (id: string) => `/api/v1/feed/collection/${encodeURIComponent(id)}/posts/`;

export function reelPayload(raw: Reel): MediaPayload | null {
  const m = raw.media || raw;
  if (m.product_type !== "clips" || !m.code) return null;
  const variants = (m.video_versions || []).filter((v) => /^https:\/\//.test(v.url || ""))
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  if (!variants.length) return null;
  const sourceUrl = `https://www.instagram.com/reel/${m.code}/`;
  return {
    provider: "instagram", mediaId: m.code, sourceUrl, pageUrl: sourceUrl,
    mediaUrl: variants[0].url, mediaType: "video", force: false,
    caption: [m.caption?.text, m.user?.username && `@${m.user.username}`, sourceUrl].filter(Boolean).join("\n\n"),
    mediaVariants: variants.map(v => ({ mediaUrl: v.url, width: v.width, height: v.height })),
    metadata: { instagramId: String(m.pk || m.id || ""), username: m.user?.username,
      originalCaption: m.caption?.text || "", width: variants[0].width, height: variants[0].height },
  };
}

export function classify(result: DeliveryResult | undefined, channels: string[]) {
  const c = result?.channels;
  const inserted = new Set(c?.inserted || []);
  const covered = new Set([...inserted, ...(c?.covered || []),
    ...(c?.notSent || []).filter((v) => v.reason === "already_sent").map((v) => v.channelId)]);
  return { complete: channels.every((c) => covered.has(c)), inserted: inserted.size > 0 };
}

export function retryDelay(attempt: number, count: number, retryAfter?: string | null, random = Math.random) {
  const seconds = Number(retryAfter);
  const date = Date.parse(retryAfter || "");
  const server = retryAfter && Number.isFinite(seconds) ? seconds * 1000
    : Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
  return Math.max(server, Math.min(60000, (900 + count * 120) * 2 ** attempt) + random() * 400);
}

export async function syncSaved({ fetchPage, sendBatch, load, save, channels, pause, signal, settings = {}, onCursor }: SyncOptions) {
  const done = await load();
  const seen = new Set<string>();
  let cursor = settings.cursor || "", count = 0, pages = 0;
  const limit = Math.max(1, Math.min(100, Number(settings.batchSize) || 5));
  const maxItems = Math.max(1, Math.min(10000, Number(settings.maxItemsPerSession) || 100));
  const cursors = new Set();
  do {
    signal?.throwIfAborted();
    const page = await fetchPage(cursor);
    if (!Array.isArray(page.items) || page.status === "fail") throw Error("Resposta de salvos inválida");
    const items = page.items.map(reelPayload).filter(Boolean).filter((item): item is MediaPayload => Boolean(item)).filter((item) => {
      if (seen.has(item.mediaId)) return false;
      seen.add(item.mediaId);
      return !done[item.mediaId];
    });
    for (let offset = 0; offset < items.length; offset += limit) {
      const batch = items.slice(offset, offset + limit);
      let pending = batch;
      for (let attempt = 0; pending.length && attempt < 4; attempt++) {
        signal?.throwIfAborted();
        const response = await sendBatch(pending);
        if (!Array.isArray(response.results)) throw Error("Relay sem confirmação por item");
        const retry: MediaPayload[] = [];
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
      await pause(Math.max(0, Number(settings.delayMs) || 0) + Math.random() * Math.max(0, Number(settings.jitterMs) || 0));
    }
    pages++;
    const next = page.next_max_id;
    if (!page.more_available) { await onCursor?.(""); break; }
    if (!next || cursors.has(next)) throw Error("Cursor de salvos repetido ou ausente");
    cursors.add(next);
    cursor = next;
    await onCursor?.(cursor);
    if (seen.size >= maxItems) break;
    await pause(Math.min(8000, 1000 + pages * 100));
  } while (true);
  return count;
}
