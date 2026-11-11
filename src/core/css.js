// Inline declarations are authored as CSS rules and minified by Lightning CSS.
export function cssDeclarations(css) {
  return css.slice(css.indexOf("{") + 1, css.lastIndexOf("}"));
}
