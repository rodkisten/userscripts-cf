import { initializeOuterXDOM } from "../platform/selectors.js";
import { initializeOuterStudio } from "../core/studio.js";
import {
  initializeRodX_outer_13,
  initializeRodX_outer_14,
  initializeRodX_outer_15,
  initializeRodX_outer_16,
} from "./start-network.js";

export function initializeNetwork() {
  initializeOuterXDOM();
  initializeOuterStudio();
  initializeRodX_outer_13();
  initializeRodX_outer_14();
  initializeRodX_outer_15();
  initializeRodX_outer_16();
}
