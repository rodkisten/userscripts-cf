import { createElement } from "react";
import { useRuntime } from "../../core/runtime-context-react.js";

function Demo() {
  const ctx = useRuntime();
  return createElement("section", { role: "status", "data-runtime": "react" },
    `React runtime active: ${ctx.id}`);
}

export default {
  init(ctx) {
    ctx.ui.mountReact(createElement(Demo));
  },
};
