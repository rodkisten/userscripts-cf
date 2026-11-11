import { initializeLists } from "../bootstrap/initializeLists.js";
import { Studio } from "../core/studio.js";
export function createListsModule() {
  initializeLists();
  return Studio.services.lists;
}
