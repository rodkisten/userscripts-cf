import { createStudioRuntime } from "./studio-runtime.js";

export let Studio;

export function initializeOuterStudio() {
  Studio = createStudioRuntime();
}
