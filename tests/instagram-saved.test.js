import test from "node:test";
import assert from "node:assert/strict";
import { reelPayload, classify, retryDelay, syncSaved } from "../src/userscripts/instagram-saved/core.js";

const reel = (code = "abc") => ({ media: { code, pk: "123", product_type: "clips",
  user: { username: "creator" }, caption: { text: "Caption #tag" },
  video_versions: [{ url: "https://cdn.example/low.mp4", width: 360, height: 640 },
    { url: "https://cdn.example/high.mp4", width: 1080, height: 1920 }] } });

test("only reels; preserves caption, original author and stable shortcode identity", () => {
  const item = reelPayload(reel());
  assert.equal(item.mediaUrl, "https://cdn.example/high.mp4");
  assert.equal(item.mediaId, "abc");
  assert.equal(item.force, false);
  assert.match(item.caption, /Caption #tag\n\n@creator/);
  assert.equal(reelPayload({ product_type: "feed" }), null);
});
test("does not trust ok or arbitrary 409 without delivery evidence", () => {
  assert.equal(classify({ ok: true }, ["-1"]).complete, false);
  assert.equal(classify({ status: 409 }, ["-1"]).complete, false);
  assert.equal(classify({ channels: { notSent: [{ channelId: "-1", reason: "already_sent" }] } }, ["-1"]).complete, true);
});
test("paginates, deduplicates, persists confirmations and retries only incomplete items", async () => {
  let done = {}, calls = 0, sent = [];
  const options = {
    channels: ["-1"], load: async () => done, save: async value => { done = { ...value }; },
    pause: async () => {},
    fetchPage: async cursor => cursor ? { items: [reel(), reel("other")], more_available: false }
      : { items: [reel(), reel()], more_available: true, next_max_id: "next" },
    sendBatch: async items => {
      calls++;
      sent.push(...items.map(i => i.mediaId));
      return { results: items.map((_, index) => calls === 1 ? { index, status: 429 }
        : { index, ok: true, channels: { inserted: ["-1"] } }) };
    },
  };
  assert.equal(await syncSaved(options), 2);
  assert.deepEqual(sent, ["abc", "abc", "other"]);
  assert.equal(await syncSaved(options), 0);
  assert.equal(calls, 3);
});
test("partial delivery never marks entire reel done", async () => {
  let saved = false;
  await assert.rejects(syncSaved({ channels: ["-1", "-2"], load: async () => ({}),
    save: async () => { saved = true; }, pause: async () => {},
    fetchPage: async () => ({ items: [reel()] }),
    sendBatch: async () => ({ results: [{ index: 0, status: 400, channels: { inserted: ["-1"] } }] }),
  }), /não confirmada/);
  assert.equal(saved, false);
});
test("backoff grows with retries and quantity and honors Retry-After", () => {
  assert.ok(retryDelay(2, 5, null, () => 0) > retryDelay(0, 1, null, () => 0));
  assert.equal(retryDelay(0, 1, "120", () => 0), 120000);
});
