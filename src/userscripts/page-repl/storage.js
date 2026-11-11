import { createDefaults } from "../../config/defaults.js";
import { RUNTIME_LIMITS } from "../../config/runtime.js";
export function createStorage(storage, origin) {
  const key = "workspace:" + origin;
  let timer;
  return {
    async read() {
      return await storage.get(key, createDefaults("replWorkspace"));
    },
    save(value) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void storage.set(key, value).catch(console.warn);
      }, RUNTIME_LIMITS.pageReplStorage.workspaceSaveDebounceMs);
    },
    dispose() {
      clearTimeout(timer);
    },
  };
}
