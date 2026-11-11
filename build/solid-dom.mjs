import { parse } from "@babel/parser";
import { Window } from "happy-dom";

// Solid's static templates normally use innerHTML. Build them into DOM factories
// instead, so the userscript UI also mounts on Trusted Types protected pages.
export function solidDOMTemplates() {
  return {
    name: "userscripts-solid-dom-templates",
    enforce: "post",
    transform(code, id) {
      if (!/page-repl\/.*\.tsx(?:\?|$)/.test(id)) return;
      const ast = parse(code, { sourceType: "module" });
      const aliases = new Set();
      for (const node of ast.program.body) {
        if (node.type !== "ImportDeclaration" || node.source.value !== "@solidjs/web") continue;
        for (const specifier of node.specifiers)
          if (specifier.imported?.name === "template") aliases.add(specifier.local.name);
      }
      if (!aliases.size) return;
      const window = new Window();
      const edits = [];
      function factory(html) {
        const template = window.document.createElement("template");
        template.innerHTML = html;
        let index = 0;
        const lines = [];
        function build(node) {
          const name = `node${index++}`;
          const literal = JSON.stringify;
          if (node.nodeType === 3)
            lines.push(`const ${name}=document.createTextNode(${literal(node.textContent)});`);
          else if (node.nodeType === 8)
            lines.push(`const ${name}=document.createComment(${literal(node.textContent)});`);
          else {
            const namespace = node.namespaceURI;
            lines.push(
              `const ${name}=document.createElementNS(${literal(namespace)},${literal(node.localName)});`,
            );
            for (const attr of node.attributes)
              lines.push(`${name}.setAttribute(${literal(attr.name)},${literal(attr.value)});`);
            for (const child of node.childNodes) lines.push(`${name}.appendChild(${build(child)});`);
          }
          return name;
        }
        const root = build(template.content.firstChild);
        return `(()=>{let cached;return ()=>{if(!cached){${lines.join("")}cached=${root};}return cached.cloneNode(true);};})()`;
      }
      function visit(node) {
        if (!node || typeof node !== "object") return;
        if (node.type === "CallExpression" && aliases.has(node.callee?.name)) {
          const argument = node.arguments[0];
          const html =
            argument?.type === "StringLiteral"
              ? argument.value
              : argument?.type === "TemplateLiteral" && !argument.expressions.length
                ? argument.quasis[0].value.cooked
                : null;
          if (html === null) throw Error("Solid template must be static: " + argument?.type);
          edits.push({ start: node.start, end: node.end, value: factory(html) });
          return;
        }
        for (const [key, value] of Object.entries(node)) {
          if (["loc", "start", "end"].includes(key)) continue;
          if (Array.isArray(value)) value.forEach(visit);
          else visit(value);
        }
      }
      visit(ast);
      window.happyDOM.abort();
      for (const edit of edits.sort((a, b) => b.start - a.start))
        code = code.slice(0, edit.start) + edit.value + code.slice(edit.end);
      return { code, map: null };
    },
  };
}
