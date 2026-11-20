import { test } from "vitest";
import assert from "node:assert/strict";
import { reelPayload, classify, retryDelay, syncSaved } from "../src/userscripts/instagram-saved/core.ts";

const reel = (code = "abc") => ({
  media: {
    code,
    pk: "123",
    product_type: "clips",
    user: { username: "creator" },
    caption: { text: "Caption #tag" },
    video_versions: [
      { url: "https://cdn.example/low.mp4", width: 360, height: 640 },
      { url: "https://cdn.example/high.mp4", width: 1080, height: 1920 },
    ],
  },
});

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
  assert.equal(
    classify({ channels: { notSent: [{ channelId: "-1", reason: "already_sent" }] } }, ["-1"]).complete,
    true,
  );
});
test("paginates, deduplicates, persists confirmations and retries only incomplete items", async () => {
  let done = {},
    calls = 0,
    sent = [];
  const options = {
    channels: ["-1"],
    load: async () => done,
    save: async (value) => {
      done = { ...value };
    },
    pause: async () => {},
    fetchPage: async (cursor) =>
      cursor
        ? { items: [reel(), reel("other")], more_available: false }
        : { items: [reel(), reel()], more_available: true, next_max_id: "next" },
    sendBatch: async (items) => {
      calls++;
      sent.push(...items.map((i) => i.mediaId));
      return {
        results: items.map((_, index) =>
          calls === 1 ? { index, status: 429 } : { index, ok: true, channels: { inserted: ["-1"] } },
        ),
      };
    },
  };
  assert.equal(await syncSaved(options), 2);
  assert.deepEqual(sent, ["abc", "abc", "other"]);
  assert.equal(await syncSaved(options), 0);
  assert.equal(calls, 3);
});
test("partial delivery never marks entire reel done", async () => {
  let saved = false;
  await assert.rejects(
    syncSaved({
      channels: ["-1", "-2"],
      load: async () => ({}),
      save: async () => {
        saved = true;
      },
      pause: async () => {},
      fetchPage: async () => ({ items: [reel()] }),
      sendBatch: async () => ({ results: [{ index: 0, status: 400, channels: { inserted: ["-1"] } }] }),
    }),
    /não confirmada/,
  );
  assert.equal(saved, false);
});
test("backoff grows with retries and quantity and honors Retry-After", () => {
  assert.ok(retryDelay(2, 5, null, () => 0) > retryDelay(0, 1, null, () => 0));
  assert.equal(
    retryDelay(0, 1, "120", () => 0),
    120000,
  );
});


test("ignores inherited delivered keys and accepts only exact Relay acknowledgements", async () => {
  const delivered = { inherited: 123 };
  Object.setPrototypeOf(delivered, { abc: 456 });
  const sent = [];
  const options = {
    channels: ["-1"],
    load: async () => delivered,
    save: async () => {},
    pause: async () => {},
    fetchPage: async () => ({ items: [reel("abc")] }),
    sendBatch: async (items) => {
      sent.push(...items.map((item) => item.mediaId));
      return { results: [{ index: 0, channels: { inserted: ["-1"] } }] };
    },
  };
  assert.equal(await syncSaved(options), 1);
  assert.deepEqual(sent, ["abc"]);
  await assert.rejects(
    syncSaved({
      ...options,
      load: async () => ({}),
      sendBatch: async () => ({ results: [
        { index: 0, channels: { inserted: ["-1"] } },
        { index: 0, channels: { inserted: ["-1"] } },
      ] }),
    }),
    /ausente ou duplicada/,
  );
});

test("rejects cursor loops returning to the resumed position", async () => {
  await assert.rejects(
    syncSaved({
      channels: ["-1"],
      settings: { cursor: "resume" },
      load: async () => ({}),
      save: async () => {},
      pause: async () => {},
      fetchPage: async () => ({ items: [], more_available: true, next_max_id: "resume" }),
      sendBatch: async () => ({ results: [] }),
    }),
    /Cursor de salvos repetido/,
  );
});

test("aborts after an in-flight page request before delivery", async () => {
  const controller = new AbortController();
  let sent = false;
  await assert.rejects(
    syncSaved({
      channels: ["-1"],
      signal: controller.signal,
      load: async () => ({}),
      save: async () => {},
      pause: async () => {},
      fetchPage: async () => {
        controller.abort();
        return { items: [reel()] };
      },
      sendBatch: async () => {
        sent = true;
        return { results: [] };
      },
    }),
  );
  assert.equal(sent, false);
});

test("processes the entire page before checkpointing a session limit", async () => {
  const sent = [];
  const cursors = [];
  const result = await syncSaved({
    channels: ["-1"],
    settings: { maxItemsPerSession: 1, batchSize: 1 },
    load: async () => ({}),
    save: async () => {},
    pause: async () => {},
    onCursor: async (cursor) => cursors.push(cursor),
    fetchPage: async () => ({ items: [reel("one"), reel("two")], more_available: true, next_max_id: "next" }),
    sendBatch: async (items) => {
      sent.push(...items.map((item) => item.mediaId));
      return { results: items.map((_, index) => ({ index, channels: { inserted: ["-1"] } })) };
    },
  });
  assert.equal(result, 2);
  assert.deepEqual(sent, ["one", "two"]);
  assert.deepEqual(cursors, ["next"]);
});

test("rejects empty channel configuration instead of marking items delivered", async () => {
  assert.equal(classify({ channels: { inserted: [] } }, []).complete, false);
  let fetched = false;
  await assert.rejects(syncSaved({
    channels: [],
    load: async () => ({}),
    save: async () => {},
    pause: async () => {},
    fetchPage: async () => { fetched = true; return { items: [] }; },
    sendBatch: async () => ({ results: [] }),
  }), /canal válido/);
  assert.equal(fetched, false);
});

test("rejects surplus Relay acknowledgement entries", async () => {
  await assert.rejects(syncSaved({
    channels: ["-1"],
    load: async () => ({}),
    save: async () => {},
    pause: async () => {},
    fetchPage: async () => ({ items: [reel()] }),
    sendBatch: async () => ({ results: [
      { index: 0, channels: { inserted: ["-1"] } },
      { index: 999, channels: { inserted: ["-1"] } },
    ] }),
  }), /confirmação por item/);
});

test("channel ledger sends only missing destinations after channel changes", async () => {
  let ledger = {};
  const calls = [];
  const options = {
    channels: ["one", "two"],
    load: async () => ({}),
    save: async () => {},
    loadChannels: async () => ledger,
    saveChannels: async (value) => { ledger = structuredClone(value); },
    pause: async () => {},
    fetchPage: async () => ({ items: [reel()] }),
    sendBatch: async (items, channels) => {
      calls.push(channels);
      return { results: items.map((_, index) => ({ index, channels: { inserted: channels } })) };
    },
  };
  assert.equal(await syncSaved(options), 1);
  assert.deepEqual(calls, [["one", "two"]]);
  assert.equal(await syncSaved({ ...options, channels: ["two", "three"] }), 1);
  assert.deepEqual(calls, [["one", "two"], ["three"]]);
  assert.equal(await syncSaved({ ...options, channels: ["one", "three"] }), 0);
});

test("partial acknowledgements survive failure and are not resent on restart", async () => {
  let ledger = {};
  const calls = [];
  const options = {
    channels: ["one", "two"],
    load: async () => ({}),
    save: async () => {},
    loadChannels: async () => ledger,
    saveChannels: async (value) => { ledger = structuredClone(value); },
    pause: async () => {},
    fetchPage: async () => ({ items: [reel()] }),
    sendBatch: async (items, channels) => {
      calls.push(channels);
      return { results: items.map((_, index) => ({
        index, status: calls.length === 1 ? 400 : 200,
        channels: { inserted: calls.length === 1 ? ["one"] : ["two"] },
      })) };
    },
  };
  await assert.rejects(syncSaved(options), /não confirmada/);
  assert.deepEqual(Object.keys(ledger.abc), ["one"]);
  assert.equal(await syncSaved(options), 1);
  assert.deepEqual(calls, [["one", "two"], ["two"]]);
});

test("imports only exact legacy channel-set confirmations into the ledger", async () => {
  let ledger = {};
  const sent = [];
  const options = {
    channels: ["old-a", "old-b"],
    load: async () => ({ abc: 123 }),
    save: async () => {},
    loadChannels: async () => ledger,
    saveChannels: async (value) => { ledger = structuredClone(value); },
    pause: async () => {},
    fetchPage: async () => ({ items: [reel()] }),
    sendBatch: async (items, channels) => {
      sent.push(channels);
      return { results: items.map((_, index) => ({ index, channels: { inserted: channels } })) };
    },
  };
  assert.equal(await syncSaved(options), 0);
  assert.deepEqual(ledger.abc, { "old-a": 123, "old-b": 123 });
  assert.deepEqual(sent, []);
  assert.equal(await syncSaved({
    ...options, channels: ["old-b", "new"],
    load: async () => ({}),
  }), 1);
  assert.deepEqual(sent, [["new"]]);
});

test("rejects duplicate destination IDs before fetching Instagram", async () => {
  let fetched = false;
  await assert.rejects(syncSaved({
    channels: ["same", "same"],
    load: async () => ({}),
    save: async () => {},
    pause: async () => {},
    fetchPage: async () => { fetched = true; return { items: [] }; },
    sendBatch: async () => ({ results: [] }),
  }), /canal válido/);
  assert.equal(fetched, false);
});

test("does not overwrite an existing channel confirmation timestamp", async () => {
  let ledger = { abc: { first: 100 } };
  await syncSaved({
    channels: ["first", "second"],
    load: async () => ({}),
    save: async () => {},
    loadChannels: async () => ledger,
    saveChannels: async (value) => { ledger = structuredClone(value); },
    pause: async () => {},
    fetchPage: async () => ({ items: [reel()] }),
    sendBatch: async (items, channels) => ({
      results: items.map((_, index) => ({ index, channels: { inserted: channels } })),
    }),
  });
  assert.equal(ledger.abc.first, 100);
  assert.ok(ledger.abc.second > 100);
});
