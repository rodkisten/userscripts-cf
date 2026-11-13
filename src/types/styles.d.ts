declare module "*.module.css" {
  const classes: Record<string, string>;
  export const css: string;
  export default classes;
}
