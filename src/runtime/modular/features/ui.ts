import { mountSolidShadow, registerShadowStyles } from "../../solid-ui/shadow-mount";

/** UI implementation stays outside the base runtime dependency graph. */
export const createUIFeature = () => ({ mountSolidShadow, registerShadowStyles });
