import { batch, computed, effect, flushSync, signal } from "@rodkisten/broto";

const count = signal(2);
const doubled = computed(() => count() * 2);
const parity = computed(() => (count() % 2 === 0 ? "even" : "odd"));
const effectRuns = signal(0);

const countValue = requiredElement<HTMLElement>("#count-value");
const doubleValue = requiredElement<HTMLElement>("#double-value");
const labelValue = requiredElement<HTMLElement>("#label-value");
const effectRunsValue = requiredElement<HTMLElement>("#effect-runs");
const slider = requiredElement<HTMLInputElement>("#count-slider");
const graphStage = requiredElement<HTMLElement>(".graph-stage");

let renderPasses = 0;

effect(() => {
  const nextCount = count();
  countValue.textContent = String(nextCount);
  doubleValue.textContent = String(doubled());
  labelValue.textContent = parity();
  slider.value = String(nextCount);
  renderPasses += 1;
  effectRuns.set(renderPasses);
  graphStage.dataset.parity = parity();
});

effect(() => {
  effectRunsValue.textContent = String(effectRuns());
});

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-delta]")) {
  button.addEventListener("click", () => {
    count.update((value) => clamp(value + Number(button.dataset.delta ?? 0), 0, 24));
    flushSync();
    pulseGraph();
  });
}

slider.addEventListener("input", () => {
  count.set(Number(slider.value));
  flushSync();
  pulseGraph();
});

requiredElement<HTMLButtonElement>("#batch-button").addEventListener("click", () => {
  batch(() => {
    for (let index = 0; index < 5; index += 1) count.update((value) => clamp(value + 1, 0, 24));
  });
  flushSync();
  pulseGraph();
});

function pulseGraph(): void {
  graphStage.classList.remove("is-pulsing");
  requestAnimationFrame(() => graphStage.classList.add("is-pulsing"));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function requiredElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Broto landing element not found: ${selector}`);
  return element;
}
