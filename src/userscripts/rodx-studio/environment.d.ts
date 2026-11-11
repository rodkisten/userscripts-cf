declare module "*.css?inline" {
  const css: string;
  export default css;
}
declare module "*.module.css" {
  const classes: Record<string, string>;
  export const css: string;
  export default classes;
}
declare module "*.svg?component" {
  const Icon: () => import("solid-js").Element;
  export default Icon;
}
declare const GM: any;
declare const GM_xmlhttpRequest: any;
declare const GM_download: any;
declare const GM_registerMenuCommand: any;
