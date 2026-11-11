import { compileLocalRule, parseLocalDirectives } from "../feeds/local-rules.js";
import { html } from "../shared/text.js";

export function diagnosticSpans(query) {
  const text = String(query || "");
  const issues = [];
  const stack = [];
  const seen = new Map();
  let quote = -1,
    escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote >= 0) {
      if (c === '"' && !escaped) quote = -1;
      escaped = c === "\\" && !escaped;
      continue;
    }
    if (c === '"') {
      quote = i;
      escaped = false;
    }
    if (c === "(") stack.push(i);
    if (c === ")") {
      if (stack.length) stack.pop();
      else
        issues.push({
          start: i,
          end: i + 1,
          severity: "error",
          message: "Parêntese ) sem abertura",
          suggestion: "Remova ) ou adicione ( antes.",
        });
    }
  }
  if (quote >= 0)
    issues.push({
      start: quote,
      end: text.length,
      severity: "error",
      message: "Aspas abertas",
      suggestion: 'Feche a frase com ".',
    });
  for (const index of stack)
    issues.push({
      start: index,
      end: index + 1,
      severity: "error",
      message: "Parêntese ( não fechado",
      suggestion: "Acrescente ) no fim do grupo.",
    });
  if (/\bOR\s+(?:links|linksre|textre):|(?:links|linksre|textre):\S+\s+OR\b/i.test(text)) {
    issues.push({
      start: Math.max(0, text.search(/\bOR\b/i)),
      end: Math.max(1, text.search(/\bOR\b/i) + 2),
      severity: "error",
      message: "OR entre regra local e operador do X não é equivalente",
      suggestion:
        "Coloque as regras locais fora do grupo OR; elas funcionam como AND sobre os resultados carregados.",
    });
  }
  const localSpans = [];
  const localMatcher = /(links|linksre|textre):((?:\/(?:\\.|[^/\n])+\/[i]?)|[^\s()]+)/gi;
  for (const m of text.matchAll(localMatcher)) {
    const from = m.index,
      end = from + m[0].length;
    localSpans.push({
      from,
      end,
    });
    try {
      compileLocalRule({
        kind: m[1].toLowerCase(),
        pattern: m[2],
      });
    } catch (err) {
      issues.push({
        start: from,
        end,
        severity: "error",
        message: err.message,
        suggestion: "Use links:chat.whatsapp.com/** ou linksre:/chat\\.whatsapp\\.com/i",
      });
    }
  }
  const parts = parseLocalDirectives(text);
  if (parts.local.length && !parts.native.trim())
    issues.push({
      start: 0,
      end: text.length,
      severity: "error",
      message: "Regex de texto precisa de algum termo para o X carregar resultados",
      suggestion: "Exemplo: #assunto textre:/expressão/i. Regex é apenas um filtro local.",
    });
  const tokens = [...text.matchAll(/[^\s()]+/g)].filter(
    (t) => !localSpans.some((x) => t.index >= x.from && t.index < x.end),
  );
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i][0],
      index = tokens[i].index;
    if (
      /^(?:AND|OR|NOT)$/i.test(token) &&
      (i === 0 ||
        i === tokens.length - 1 ||
        (/^(?:AND|OR|NOT)$/i.test(tokens[i - 1]?.[0] || "") && !/^NOT$/i.test(token)))
    )
      issues.push({
        start: index,
        end: index + token.length,
        severity: "error",
        message: `Operador ${token} sem termo`,
        suggestion: "Coloque termos antes e depois do operador.",
      });
    if (/^-?#[\p{L}\p{N}_]+$/u.test(token)) {
      const key = token.toLocaleLowerCase();
      if (seen.has(key))
        issues.push({
          start: index,
          end: index + token.length,
          severity: "warning",
          message: `Hashtag repetida ${token}`,
          suggestion: "Remova a duplicata ou agrupe alternativas.",
        });
      else seen.set(key, index);
    }
  }
  return issues;
}

export function highlightWithIssues(text, issues) {
  let htmlOut = "";
  let from = 0;
  const sorted = issues.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start || b.end - a.end);
  for (const issue of sorted) {
    if (issue.start < from) continue;
    htmlOut += highlightQuery(text.slice(from, issue.start));
    htmlOut += `<span class="rodx-syntax-${issue.severity}" title="${html(issue.message)}">${highlightQuery(text.slice(issue.start, issue.end))}</span>`;
    from = issue.end;
  }
  return htmlOut + highlightQuery(text.slice(from));
}

export function highlightQuery(source) {
  // Treat negative tokens (including -#hashtag, -filter:x and NOT #hashtag)
  // separately from positive ones; never rewrite the query while coloring it.
  const tokens =
    String(source).match(
      /\s+|\(|\)|"(?:\\.|[^"\\])*"|\b(?:AND|OR|NOT)\b|-?(?:filter:[\w_]+|[\w_]+:[^\s()]+)|-?#[\p{L}\p{N}\p{M}_]+|[^\s()]+/giu,
    ) || [];
  let nextNegative = false;
  return tokens
    .map((token) => {
      const whitespace = /^\s+$/.test(token);
      const isOperator = /^(?:AND|OR|NOT)$/i.test(token);
      const negative = /^-\S/u.test(token) || (nextNegative && !whitespace);
      let cls = whitespace
        ? ""
        : negative || /^NOT$/i.test(token)
          ? "syn-negative"
          : isOperator
            ? "syn-bool"
            : /^#/u.test(token)
              ? "syn-tag"
              : /^(?:filter:|[\w_]+:)/i.test(token)
                ? "syn-filter"
                : /^"/.test(token)
                  ? "syn-phrase"
                  : /^[()]/.test(token)
                    ? "syn-paren"
                    : "";
      if (!whitespace) nextNegative = /^NOT$/i.test(token);
      return cls ? `<span class="${cls}">${html(token)}</span>` : html(token);
    })
    .join("");
}
