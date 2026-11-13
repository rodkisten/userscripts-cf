import test from "node:test";
import assert from "node:assert/strict";
import { boundedAudio } from "../src/userscripts/gonewild/services.ts";
import { parseTags } from "../src/userscripts/gonewild/domain.ts";

test("Soundgasm tags preserve explicit single tags and ignore Markdown links", () => {
  assert.deepEqual(parseTags("[M4M] Title [Comfort]", "Tags: [Sleep]\n[script](https://example.com)"), [
    "M4M",
    "Comfort",
    "Sleep",
  ]);
});
test("waveform transport cancels a stream when its byte limit is exceeded", async (t) => {
  let cancelled = false;
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(2));
            controller.enqueue(new Uint8Array(2));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  );
  await assert.rejects(
    boundedAudio("https://media.soundgasm.net/sounds/fixture.m4a", new AbortController().signal, 3),
    /excede/,
  );
  assert.equal(cancelled, true);
});
