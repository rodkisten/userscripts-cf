import postcss from "postcss";

// Seletores com prefixos de vendor ou pseudo-elementos específicos que podem invalidar
// toda a lista de seletores em navegadores que não suportam um dos lados.
const UNSAFE_TO_MERGE_SELECTOR = /::?-(?:webkit|moz|ms|o)-|:host(?:-context)?\(|::slotted\(|::part\(/i;

// At-rules cujos filhos não devem ser mesclados entre si
const SKIP_ATRULE_CONTAINER = /^(?:keyframes|-webkit-keyframes|-moz-keyframes|font-face|property|counter-style|page)$/i;
const UNSAFE_ATRULE_PARENT = /^(?:scope|starting-style)$/i;

/**
 * Gera uma assinatura canônica para uma declaração CSS, preservando
 * case-sensitivity em Custom Properties (--var) e normalizando espaços.
 *
 * @param {import("postcss").Declaration} decl
 */
function declSignature(decl) {
  const prop = decl.prop.startsWith("--") ? decl.prop : decl.prop.toLowerCase();
  const value = decl.value.replace(/\s+/g, " ").trim();
  return JSON.stringify([prop, value, Boolean(decl.important)]);
}

/**
 * Gera assinatura do corpo de uma regra apenas se ela contiver exclusivamente declarações.
 * Retorna `null` se houver comentários internos, nested rules ou at-rules.
 *
 * @param {import("postcss").Rule} rule
 */
function ruleSignature(rule) {
  if (!rule.nodes || rule.nodes.length === 0) return null;
  const parts = [];
  for (const child of rule.nodes) {
    if (child.type !== "decl") return null;
    parts.push(declSignature(child));
  }
  return parts.join(";");
}

/**
 * Verifica se o seletor é seguro para ser combinado via vírgula sem risco
 * de invalidar a regra inteira em algum engine de browser ou alterar escopo.
 *
 * @param {string} selector
 */
function isSafeSelector(selector) {
  return !selector.includes("&") && !UNSAFE_TO_MERGE_SELECTOR.test(selector);
}

/**
 * Une listas de seletores evitando duplicatas exatas (ex: `.a` + `.a` -> `.a`).
 *
 * @param {string[]} prevSelectors
 * @param {string[]} nextSelectors
 */
function mergeSelectorLists(prevSelectors, nextSelectors) {
  const seen = new Set(prevSelectors.map((s) => s.trim()));
  const merged = [...prevSelectors.map((s) => s.trim())];
  for (const raw of nextSelectors) {
    const clean = raw.trim();
    if (!seen.has(clean)) {
      seen.add(clean);
      merged.push(clean);
    }
  }
  return merged.join(",");
}

/**
 * Mescla apenas regras CSS adjacentes com corpos de declaração idênticos e
 * mesma ancestralidade de at-rules, preservando a ordem da cascata.
 *
 * @param {string} css
 * @returns {{ css: string, merged: number }}
 */
export function deduplicateCSS(css) {
  const root = postcss.parse(css);
  let merged = 0;

  /** @param {import("postcss").Container} container */
  function visit(container) {
    if (!container.nodes) return;

    for (const node of [...container.nodes]) {
      if (node.parent !== container) continue;

      if (node.type === "atrule") {
        if (node.nodes && !SKIP_ATRULE_CONTAINER.test(node.name)) {
          visit(node);
        }
        continue;
      }

      if (node.type !== "rule" || !node.parent) continue;
      if (node.parent.type === "atrule" && UNSAFE_ATRULE_PARENT.test(node.parent.name)) continue;

      const previous = node.prev();
      if (!previous || previous.type !== "rule") continue;
      if (previous.nodes.length !== node.nodes.length) continue;

      if (!isSafeSelector(previous.selector) || !isSafeSelector(node.selector)) continue;

      const prevSig = ruleSignature(previous);
      if (!prevSig) continue;

      const currSig = ruleSignature(node);
      if (prevSig !== currSig) continue;

      previous.selector = mergeSelectorLists(previous.selectors, node.selectors);
      node.remove();
      merged++;
    }
  }

  visit(root);
  return { css: root.toString(), merged };
}
