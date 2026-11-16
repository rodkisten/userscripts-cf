import { instrumentErrorCallbacks } from "../build/instrument-errors.mjs";
const presets = {
  event: 'button.addEventListener("click", async () => { await saveSettings(); });',
  timer: 'setTimeout(function () { throw new Error("Timer failed"); }, 1000);',
  nested: 'setTimeout(() => queueMicrotask(() => { throw Error("nested"); }), 100);',
  named: 'button.addEventListener("click", handler);\nbutton.removeEventListener("click", handler);',
};
const input = document.querySelector("#input");
const output = document.querySelector("#output");
const status = document.querySelector("#status");
const preset = document.querySelector("#preset");
function transform() {
  const result = instrumentErrorCallbacks(input.value, "/playground/example.js", { root: "/playground" });
  output.textContent = result.code;
  status.textContent = result.transformed + " callback(s) instrumentado(s)";
}
preset.addEventListener("change", () => { input.value = presets[preset.value]; transform(); });
document.querySelector("#transform").addEventListener("click", transform);
document.querySelector("#copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(output.textContent);
  status.textContent = "Resultado copiado";
});
input.value = presets.event;
transform();
