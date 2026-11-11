import { Studio } from "../core/studio.js";
import { createSeekPreviews } from "./seek-preview.tsx";
import { state } from "../state/deck.js";

export let SeekPreviews;

export function initializeDeckSeekPreviews() {
  SeekPreviews = createSeekPreviews(Studio, () => state.visual);
}
