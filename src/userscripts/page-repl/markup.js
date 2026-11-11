// Static interface rendered with DOM APIs, including on Trusted Types pages.
const tree = [
  {
    tag: "button",
    attrs: {
      class: "launcher",
      "aria-label": "Abrir REPL JavaScript",
    },
    children: [">_"],
  },
  {
    tag: "section",
    attrs: {
      class: "panel",
      "aria-label": "REPL JavaScript",
      hidden: null,
    },
    children: [
      {
        tag: "header",
        attrs: {},
        children: [
          {
            tag: "strong",
            attrs: {},
            children: ["REPL · JavaScript"],
          },
          {
            tag: "button",
            attrs: {
              "data-action": "copy-report",
            },
            children: ["Relatório"],
          },
          {
            tag: "button",
            attrs: {
              "data-action": "close",
              "aria-label": "Fechar",
            },
            children: ["×"],
          },
        ],
      },
      {
        tag: "nav",
        attrs: {
          class: "tabs",
        },
        children: [
          {
            tag: "button",
            attrs: {
              "data-tab": "console",
              "aria-selected": "true",
            },
            children: ["Console"],
          },
          {
            tag: "button",
            attrs: {
              "data-tab": "methods",
            },
            children: ["Métodos"],
          },
          {
            tag: "button",
            attrs: {
              "data-tab": "history",
            },
            children: ["Histórico"],
          },
        ],
      },
      {
        tag: "div",
        attrs: {
          class: "view",
          "data-view": "console",
        },
        children: [
          {
            tag: "div",
            attrs: {
              class: "toolbar",
            },
            children: [
              {
                tag: "select",
                attrs: {
                  "aria-label": "Método",
                  "data-method": null,
                },
                children: [
                  {
                    tag: "option",
                    attrs: {
                      value: "auto",
                    },
                    children: ["Automático · testa antes, executa uma vez"],
                  },
                ],
              },
              {
                tag: "button",
                attrs: {
                  class: "primary",
                  "data-action": "run",
                },
                children: ["Executar"],
              },
              {
                tag: "button",
                attrs: {
                  "data-action": "stop",
                },
                children: ["Parar espera"],
              },
            ],
          },
          {
            tag: "div",
            attrs: {
              class: "editor-wrap",
            },
            children: [
              {
                tag: "textarea",
                attrs: {
                  "aria-label": "Código JavaScript",
                  spellcheck: "false",
                  autocapitalize: "off",
                  autocomplete: "off",
                  autocorrect: "off",
                },
                children: [],
              },
            ],
          },
          {
            tag: "div",
            attrs: {
              class: "completions",
              hidden: null,
            },
            children: [],
          },
          {
            tag: "div",
            attrs: {
              class: "options",
            },
            children: [
              {
                tag: "label",
                attrs: {},
                children: [
                  {
                    tag: "input",
                    attrs: {
                      "data-persist": null,
                      type: "checkbox",
                      checked: null,
                    },
                    children: [],
                  },
                  "Persistir variáveis",
                ],
              },
              {
                tag: "label",
                attrs: {},
                children: [
                  "Timeout ",
                  {
                    tag: "input",
                    attrs: {
                      "data-timeout": null,
                      type: "number",
                      min: "250",
                      max: "60000",
                      step: "250",
                    },
                    children: [],
                  },
                  "ms",
                ],
              },
              {
                tag: "button",
                attrs: {
                  "data-action": "complete",
                },
                children: ["Completar"],
              },
              {
                tag: "select",
                attrs: {
                  "aria-label": "Exemplos",
                  "data-example": null,
                },
                children: [
                  {
                    tag: "option",
                    attrs: {
                      value: "",
                    },
                    children: ["Exemplos…"],
                  },
                ],
              },
            ],
          },
          {
            tag: "p",
            attrs: {
              class: "hint",
              "data-syntax": null,
            },
            children: [
              "Await e última expressão retornam resultado. Use _, $, $$, $0 e ctx.vars. Declarações de topo persistidas viram propriedades mutáveis, inclusive const. Console capturado enquanto a execução aguarda o resultado.",
            ],
          },
          {
            tag: "div",
            attrs: {
              class: "row",
            },
            children: [
              {
                tag: "input",
                attrs: {
                  "data-url": null,
                  type: "url",
                  placeholder: "https://site.com/script.js",
                  "aria-label": "URL do JavaScript",
                },
                children: [],
              },
              {
                tag: "button",
                attrs: {
                  "data-action": "fetch-url",
                },
                children: ["URL → editor"],
              },
              {
                tag: "button",
                attrs: {
                  "data-action": "external",
                },
                children: ["Script src"],
              },
              {
                tag: "label",
                attrs: {},
                children: [
                  {
                    tag: "input",
                    attrs: {
                      "data-module": null,
                      type: "checkbox",
                    },
                    children: [],
                  },
                  "Módulo",
                ],
              },
            ],
          },
          {
            tag: "p",
            attrs: {
              class: "hint warning",
            },
            children: [
              "Parar/timeout cancelam a espera, não interrompem loops síncronos nem desfazem efeitos. “Executar em todos” repete seu código.",
            ],
          },
          {
            tag: "div",
            attrs: {
              class: "toolbar",
            },
            children: [
              {
                tag: "button",
                attrs: {
                  "data-action": "probe",
                },
                children: ["Testar compatibilidade"],
              },
              {
                tag: "button",
                attrs: {
                  "data-action": "run-all",
                },
                children: ["Executar em todos"],
              },
              {
                tag: "button",
                attrs: {
                  "data-action": "clear",
                },
                children: ["Limpar saída"],
              },
              {
                tag: "button",
                attrs: {
                  "data-action": "reset",
                },
                children: ["Nova sessão"],
              },
            ],
          },
          {
            tag: "div",
            attrs: {
              class: "output",
              "aria-live": "polite",
            },
            children: [],
          },
        ],
      },
      {
        tag: "div",
        attrs: {
          class: "view",
          "data-view": "methods",
          hidden: null,
        },
        children: [
          {
            tag: "p",
            attrs: {
              class: "hint",
            },
            children: [
              "OK confirma retorno pelo transporte, não equivalência entre todos os contextos. “Página esperada” indica o alvo do método; evidências aparecem nos detalhes. CSP e o gerenciador podem alterar o resultado. @sandbox raw/JavaScript/DOM exigem reinstalação; APIs chrome.scripting/userScripts precisam de uma extensão e não são concedidas por este userscript.",
            ],
          },
          {
            tag: "div",
            attrs: {
              class: "options",
            },
            children: [
              {
                tag: "label",
                attrs: {},
                children: [
                  {
                    tag: "input",
                    attrs: {
                      "data-advanced": null,
                      type: "checkbox",
                    },
                    children: [],
                  },
                  "Incluir javascript: (opcional)",
                ],
              },
              {
                tag: "button",
                attrs: {
                  "data-action": "probe",
                },
                children: ["Testar 27 estratégias"],
              },
            ],
          },
          {
            tag: "div",
            attrs: {
              class: "results",
            },
            children: [],
          },
        ],
      },
      {
        tag: "div",
        attrs: {
          class: "view",
          "data-view": "history",
          hidden: null,
        },
        children: [
          {
            tag: "p",
            attrs: {
              class: "hint",
            },
            children: ["Código armazenado localmente por site. Nada é executado ao abrir o histórico."],
          },
          {
            tag: "div",
            attrs: {
              "data-history": null,
            },
            children: [],
          },
          {
            tag: "div",
            attrs: {
              class: "toolbar",
            },
            children: [
              {
                tag: "button",
                attrs: {
                  "data-action": "export",
                },
                children: ["Exportar JSON"],
              },
              {
                tag: "button",
                attrs: {
                  "data-action": "import",
                },
                children: ["Importar JSON"],
              },
              {
                tag: "button",
                attrs: {
                  "data-action": "clear-history",
                },
                children: ["Apagar histórico"],
              },
            ],
          },
        ],
      },
      {
        tag: "footer",
        attrs: {},
        children: [
          {
            tag: "span",
            attrs: {
              class: "status",
            },
            children: ["Pronto."],
          },
          {
            tag: "small",
            attrs: {},
            children: ["Sem execução automática ao abrir"],
          },
        ],
      },
    ],
  },
];
export function createMarkup(document) {
  function build(item) {
    if (typeof item === "string") return document.createTextNode(item);
    const node = document.createElement(item.tag);
    for (const [key, value] of Object.entries(item.attrs)) node.setAttribute(key, value ?? "");
    for (const child of item.children) node.append(build(child));
    return node;
  }
  const fragment = document.createDocumentFragment();
  for (const item of tree) fragment.append(build(item));
  return fragment;
}
