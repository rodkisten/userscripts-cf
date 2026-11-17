import { createMemo, createSignal, For, Show, onCleanup } from "solid-js";
import { css as comboboxCSS } from "../src/runtime/solid-ui/form-controls/Combobox.module.css";
import { css as controlsCSS } from "../src/runtime/solid-ui/form-controls/Controls.module.css";
import { css as fieldRendererCSS } from "../src/runtime/solid-ui/form-controls/StandaloneFieldRenderer.module.css";
import { EditorState } from "@codemirror/state";
import { createTwitterSearchEditor } from "./twitter-search-editor";
import { EditorView, drawSelection } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { render } from "@solidjs/web";
import { Combobox } from "../src/runtime/solid-ui/form-controls/Combobox";
import {
  Select,
  Checkbox,
  Switch,
  Slider,
  ColorPicker,
} from "../src/runtime/solid-ui/form-controls/Controls";
import { TagsInput } from "../src/runtime/solid-ui/form-controls/TagsInput";
import { Input, Textarea, NumberInput } from "../src/runtime/solid-ui/form-controls/TextControls";
import { StandaloneFieldRenderer } from "../src/runtime/solid-ui/form-controls/StandaloneFieldRenderer";
import { createFormSubmit } from "../src/runtime/solid-ui/form-controls/form-submit";
import { getFormControlsQueryClient } from "../src/runtime/solid-ui/form-controls/query-client";
import { SHARED_FIELD_TYPES } from "../src/runtime/solid-ui/form-controls/field-types";
import type { FormField } from "../src/runtime/solid-ui/form-controls/fields";
import type { ControlOption } from "../src/runtime/solid-ui/form-controls/options";
import {
  appendTwitterToken,
  parseTwitterSearch,
  removeTwitterToken,
  replaceTwitterToken,
} from "../src/runtime/solid-ui/form-controls/twitter-search";

const options: ControlOption[] = [
  { value: "filter:videos", label: "Vídeos", group: "Mídia" },
  { value: "filter:images", label: "Imagens", group: "Mídia" },
  { value: "filter:native_video", label: "Vídeo nativo", group: "Mídia" },
  { value: "lang:pt", label: "Português", group: "Idioma" },
  { value: "lang:en", label: "Inglês", group: "Idioma" },
  { value: "-filter:replies", label: "Sem respostas", group: "Filtros" },
  { value: "min_faves:100", label: "100+ curtidas", group: "Engajamento" },
];

function JsxPreview(props: { code: string }) {
  let host!: HTMLDivElement;
  let view: EditorView | undefined;
  createMemo(() => {
    const code = props.code;
    if (!view) {
      view = new EditorView({
        state: EditorState.create({
          doc: code,
          extensions: [
            javascript({ jsx: true, typescript: true }),
            oneDark,
            drawSelection(),
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
            EditorView.lineWrapping,
            EditorView.theme({
              "&": { "font-size": "13px", "border-radius": "12px", overflow: "hidden" },
              ".cm-scroller": { "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace" },
              ".cm-content": { padding: "14px 0" },
            }),
          ],
        }),
        parent: host,
      });
    } else {
      const previous = view.state.doc.toString();
      if (previous !== code) view.dispatch({ changes: { from: 0, to: previous.length, insert: code } });
    }
  });
  onCleanup(() => view?.destroy());
  return <div ref={host} aria-label="Código JSX com syntax highlighting" />;
}

function TwitterSearchEditor(props: { value: string; onChange(value: string): void }) {
  let host!: HTMLDivElement;
  let editor: ReturnType<typeof createTwitterSearchEditor> | undefined;
  queueMicrotask(() => {
    if (!host.isConnected) return;
    editor = createTwitterSearchEditor(host, props.value, props.onChange);
  });
  createMemo(() => { const value = props.value; editor?.setValue(value); });
  onCleanup(() => editor?.destroy());
  return <div ref={host} aria-label="Editor de busca do X com filtros interativos" />;
}

function App() {
  const [textDemo, setTextDemo] = createSignal("");
  const [advancedText, setAdvancedText] = createSignal(false);
  const [textareaDemo, setTextareaDemo] = createSignal("");
  const [numberDemo, setNumberDemo] = createSignal<number | "">(5);
  const [showErrors, setShowErrors] = createSignal(false);
  const [contextError, setContextError] = createSignal(false);
  const [asyncValidation, setAsyncValidation] = createSignal(false);
  const [validationOnBlur, setValidationOnBlur] = createSignal(false);
  const [feedbackState, setFeedbackState] = createSignal<"default" | "warning" | "success">("default");
  const [submitName, setSubmitName] = createSignal("");
  const [submitEmail, setSubmitEmail] = createSignal("");
  const [submitMessage, setSubmitMessage] = createSignal("");
  const submitFields = [
    {
      type: "text" as const,
      name: "name",
      label: "Nome",
      required: true,
      validate: async (value: unknown) => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return String(value ?? "").trim().length < 3 ? "Use pelo menos 3 caracteres." : null;
      },
    },
    {
      type: "email" as const,
      name: "email",
      label: "E-mail",
      required: true,
      validate: (value: unknown) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "")) ? null : "Informe um e-mail válido.",
    },
  ];
  const submitValues = () => ({ name: submitName(), email: submitEmail() });
  const formSubmit = createFormSubmit({
    fields: () => submitFields,
    values: submitValues,
    focusInvalid: (name) => document.getElementById(`submit-${name}`)?.focus(),
    onSubmit: async () => {
      setSubmitMessage("Formulário enviado com sucesso!");
    },
    onError: () => setSubmitMessage("Falha ao enviar formulário."),
  });
  const [basicSelect, setBasicSelect] = createSignal("first");
  const [basicCheckbox, setBasicCheckbox] = createSignal(true);
  const [basicSwitch, setBasicSwitch] = createSignal(false);
  const [basicSlider, setBasicSlider] = createSignal(40);
  const [basicColor, setBasicColor] = createSignal("#7c3aed");
  const [variant, setVariant] = createSignal<string>("text");
  const [variantValue, setVariantValue] = createSignal<unknown>("");
  const exampleOptions = [
    { label: "Primeira", value: "first" },
    { label: "Segunda", value: "second" },
    { label: "Terceira", value: "third" },
  ];
  const exampleField = (): FormField =>
    ({
      name: "demo",
      type: variant(),
      label: `Campo ${variant()}`,
      placeholder: "Digite ou selecione…",
      description: "Exemplo interativo e independente do RodMenu",
      options: exampleOptions,
      min: 0,
      max: 5,
      step: 1,
      rows: 3,
      text: "Executar ação",
      html: "Exemplo HTML em texto seguro",
      render: () => <strong>Campo customizado</strong>,
    }) as unknown as FormField;
  const exampleContext = {
    values: { demo: variantValue() },
    get errors() {
      return contextError() ? { demo: "Erro de validação vindo do contexto do formulário." } : {};
    },
    set: (_name: string, next: unknown) => setVariantValue(next),
  };
  const [selected, setSelected] = createSignal<string[]>(["filter:videos"]);
  const [tags, setTags] = createSignal<string[]>(["typescript"]);
  const [disabled, setDisabled] = createSignal(false);
  const [readonly, setReadonly] = createSignal(false);
  const [multiple, setMultiple] = createSignal(true);
  const [grouped, setGrouped] = createSignal(true);
  const [clearable, setClearable] = createSignal(true);
  const [fuzzy, setFuzzy] = createSignal(true);
  const [virtualize, setVirtualize] = createSignal(true);
  const [largeDataset, setLargeDataset] = createSignal(false);
  const demoOptions = () =>
    largeDataset()
      ? [
          ...options,
          ...Array.from({ length: 1500 }, (_, i) => ({
            value: `topic:${i}`,
            label: `Tópico ${i + 1}`,
            group: "Tópicos",
          })),
        ]
      : options;
  const [placeholder, setPlaceholder] = createSignal("Pesquisar filtros…");
  const [emptyMessage, setEmptyMessage] = createSignal("Nenhum filtro encontrado");
  const [maxTags, setMaxTags] = createSignal(8);
  const [activeExample, setActiveExample] = createSignal<"combobox" | "tags">("combobox");
  const jsx = () =>
    activeExample() === "combobox"
      ? `<Combobox
  id="filters"
  options={options}
  value={selected()}
  onChange={setSelected}
  multiple={${multiple()}}
  grouped={${grouped()}}
  clearable={${clearable()}}
  fuzzy={${fuzzy()}}
  virtualize={${virtualize()}}
  disabled={${disabled()}}
  readonly={${readonly()}}
  placeholder={${JSON.stringify(placeholder())}}
  emptyMessage={${JSON.stringify(emptyMessage())}}
/>`
      : `<TagsInput
  id="tags"
  options={options}
  value={tags()}
  onChange={setTags}
  disabled={${disabled()}}
  readonly={${readonly()}}
  maxTags={${maxTags()}}
  placeholder={${JSON.stringify(placeholder())}}
/>`;
  const [raw, setRaw] = createSignal("");
  const [editingToken, setEditingToken] = createSignal<number | null>(null);
  const [tokenDraft, setTokenDraft] = createSignal("");
  const [asyncValue, setAsyncValue] = createSignal("");
  const [asyncValueTwo, setAsyncValueTwo] = createSignal("");
  const [remoteRequests, setRemoteRequests] = createSignal(0);
  const [cacheSnapshot, setCacheSnapshot] = createSignal("Clique em Inspecionar cache");
  const queryClient = getFormControlsQueryClient();
  const inspectCache = () =>
    setCacheSnapshot(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((entry) => ({
            key: entry.queryKey,
            status: entry.state.status,
            updatedAt: entry.state.dataUpdatedAt,
          })),
        null,
        2,
      ),
    );
  const source = async (query: string, { signal }: { signal: AbortSignal }) => {
    setRemoteRequests((count) => count + 1);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 250);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Cancelled", "AbortError"));
        },
        { once: true },
      );
    });
    return options.filter((option) =>
      (option.label + option.value).toLowerCase().includes(query.toLowerCase()),
    );
  };
  return (
    <main>
      <a href="/">← Userscripts</a>
      <p class="eyebrow">Design System / Form Controls / SolidJS</p>
      <h1>Form Controls Playground</h1>
      <p>Componentes reais do runtime SolidJS. Altere os valores para experimentar os estados e a API.</p>
      <div class="grid">
        <section class="card wide" id="text-controls">
          <h2>Input · Textarea · NumberInput</h2>
          <p>Controles reutilizáveis, com erros acessíveis, estados e valores em tempo real.</p>
          <label class="toggle">
            <input
              type="checkbox"
              checked={showErrors()}
              onChange={(event) => setShowErrors(event.currentTarget.checked)}
            />{" "}
            Simular erros de validação
          </label>
          <label class="toggle">
            <input
              type="checkbox"
              checked={advancedText()}
              onChange={(event) => setAdvancedText(event.currentTarget.checked)}
            />
            Atributos avançados
          </label>
          <label for="demo-feedback-state">Estado visual</label>
          <select
            id="demo-feedback-state"
            value={feedbackState()}
            onChange={(event) =>
              setFeedbackState(event.currentTarget.value as "default" | "warning" | "success")
            }
          >
            <option value="default">Padrão</option>
            <option value="warning">Aviso</option>
            <option value="success">Sucesso</option>
          </select>
          <div class="grid">
            <Input
              id="demo-input"
              label="Nome"
              placeholder="Digite seu nome"
              value={textDemo()}
              onChange={setTextDemo}
              minLength={advancedText() ? 3 : undefined}
              pattern={advancedText() ? "[A-Za-zÀ-ÿ ]+" : undefined}
              autocomplete={advancedText() ? "name" : undefined}
              warning={
                !showErrors() && feedbackState() === "warning" ? "Confira o nome antes de salvar." : undefined
              }
              success={!showErrors() && feedbackState() === "success" ? "Nome verificado." : undefined}
              disabled={disabled()}
              readonly={readonly()}
              description="Exemplo com descrição acessível"
              error={showErrors() && !textDemo().trim() ? "Preencha o nome." : undefined}
            />
            <Textarea
              id="demo-textarea"
              label="Descrição"
              placeholder="Escreva uma descrição…"
              value={textareaDemo()}
              onChange={setTextareaDemo}
              minLength={advancedText() ? 10 : undefined}
              resize={advancedText() ? "none" : "vertical"}
              disabled={disabled()}
              readonly={readonly()}
              maxLength={180}
              showCount
              rows={4}
              error={showErrors() && !textareaDemo().trim() ? "Adicione uma descrição." : undefined}
            />
            <NumberInput
              id="demo-number"
              label="Quantidade"
              value={numberDemo()}
              onChange={setNumberDemo}
              disabled={disabled()}
              readonly={readonly()}
              min={1}
              max={10}
              step={1}
              description="Entre 1 e 10"
              error={
                showErrors() && (numberDemo() === "" || Number(numberDemo()) < 1 || Number(numberDemo()) > 10)
                  ? "Escolha um valor entre 1 e 10."
                  : undefined
              }
            />
          </div>
          <pre aria-live="polite">
            {JSON.stringify(
              { name: textDemo(), description: textareaDemo(), quantity: numberDemo() },
              null,
              2,
            )}
          </pre>
        </section>
        <section class="card wide" id="context-validation">
          <h2>Validação pelo contexto</h2>
          <p>O StandaloneFieldRenderer recebe o erro pelo contexto, sem duplicar a lógica no Input.</p>
          <label class="toggle">
            <input
              type="checkbox"
              checked={contextError()}
              onChange={(event) => setContextError(event.currentTarget.checked)}
            />
            Simular erro no contexto
          </label>
          <StandaloneFieldRenderer
            field={{
              type: "text",
              name: "demo",
              label: "Campo com validação",
              description: "Descrição fornecida pelo schema",
            }}
            context={exampleContext}
            value={variantValue()}
            onChange={setVariantValue}
          />
        </section>
        <section class="card wide" id="async-validation">
          <h2>Validação assíncrona do schema</h2>
          <p>
            Digite um nome. O validador aguarda 400 ms e rejeita nomes curtos ou reservados. Respostas antigas
            não sobrescrevem as novas.
          </p>
          <label class="toggle">
            <input
              type="checkbox"
              checked={asyncValidation()}
              onChange={(event) => setAsyncValidation(event.currentTarget.checked)}
            />
            Ativar validação assíncrona
          </label>
          <label class="toggle">
            <input
              type="checkbox"
              checked={validationOnBlur()}
              onChange={(event) => setValidationOnBlur(event.currentTarget.checked)}
            />{" "}
            Validar apenas após sair do campo
          </label>
          <StandaloneFieldRenderer
            validationMode={validationOnBlur() ? "blur" : "change"}
            field={{
              type: "text",
              name: "async-demo",
              label: "Nome de usuário",
              description: "Experimente admin, root ou um nome com menos de 3 letras",
              validate: async (value) => {
                if (!asyncValidation()) return null;
                await new Promise((resolve) => setTimeout(resolve, 400));
                const name = String(value ?? "").trim();
                if (name.length < 3) return "Digite pelo menos 3 caracteres.";
                if (["admin", "root"].includes(name.toLowerCase())) return "Este nome está reservado.";
                return null;
              },
            }}
            context={{ values: { "async-demo": textDemo() } }}
            value={textDemo()}
            onChange={setTextDemo}
          />
        </section>
        <section class="card wide" id="submit-validation">
          <h2>Validação no envio</h2>
          <p>Valida todos os campos, aguarda regras assíncronas e foca o primeiro inválido.</p>
          <form
            novalidate
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitMessage("");
              void formSubmit.submit();
            }}
          >
            <Input
              id="submit-name"
              label="Nome"
              value={submitName()}
              onChange={(value) => {
                formSubmit.markChanged("name");
                setSubmitName(value);
              }}
              onBlur={() => formSubmit.markBlurred("name")}
              error={formSubmit.errors().name}
              required
            />
            <Input
              id="submit-email"
              type="email"
              label="E-mail"
              value={submitEmail()}
              onChange={(value) => {
                formSubmit.markChanged("email");
                setSubmitEmail(value);
              }}
              onBlur={() => formSubmit.markBlurred("email")}
              error={formSubmit.errors().email}
              required
            />
            <p aria-live="polite">
              Nome: {formSubmit.dirty().name ? "alterado" : "intocado"} · E-mail:{" "}
              {formSubmit.touched().email ? "visitado" : "não visitado"}
            </p>
            <button type="submit" disabled={formSubmit.submitting()}>
              {formSubmit.submitting() ? "Validando e enviando…" : "Enviar formulário"}
            </button>
            <Show when={submitMessage()}>
              <p role="status">{submitMessage()}</p>
            </Show>
          </form>
        </section>
        <section class="card wide" id="basic-controls">
          <h2>Controles básicos · Componentes reais</h2>
          <p>Os mesmos controles usados pelo runtime, com valores reativos e estados disabled/readonly.</p>
          <div class="grid">
            <div>
              <label for="basic-select">Select</label>
              <Select
                id="basic-select"
                options={exampleOptions}
                value={basicSelect()}
                onChange={setBasicSelect}
                disabled={disabled() || readonly()}
              />
              <pre>{JSON.stringify(basicSelect())}</pre>
            </div>
            <div>
              <label class="toggle">
                <Checkbox
                  checked={basicCheckbox()}
                  onChange={setBasicCheckbox}
                  disabled={disabled() || readonly()}
                />
                Checkbox · Notificações
              </label>
              <pre>{JSON.stringify(basicCheckbox())}</pre>
            </div>
            <div>
              <label class="toggle">
                <Switch
                  checked={basicSwitch()}
                  onChange={setBasicSwitch}
                  disabled={disabled() || readonly()}
                />
                Switch · Ativar recurso
              </label>
              <pre>{JSON.stringify(basicSwitch())}</pre>
            </div>
            <div>
              <label for="basic-slider">Slider · {basicSlider()}</label>
              <Slider
                id="basic-slider"
                value={basicSlider()}
                min={0}
                max={100}
                step={5}
                onChange={setBasicSlider}
                disabled={disabled() || readonly()}
              />
              <pre>{JSON.stringify(basicSlider())}</pre>
            </div>
            <div>
              <label for="basic-color">ColorPicker</label>
              <ColorPicker
                id="basic-color"
                value={basicColor()}
                onChange={setBasicColor}
                presets={["#7c3aed", "#2563eb", "#059669", "#f97316", "#e11d48"]}
                disabled={disabled()}
                readonly={readonly()}
              />
              <pre>{JSON.stringify(basicColor())}</pre>
            </div>
          </div>
        </section>
        <section class="card">
          <h2>Combobox múltiplo</h2>
          <label for="filters">Filtros da pesquisa</label>
          <Combobox
            id="filters"
            options={demoOptions()}
            fuzzy={fuzzy()}
            virtualize={virtualize()}
            value={multiple() ? selected() : (selected()[0] ?? "")}
            onChange={(value) => setSelected(Array.isArray(value) ? value : value ? [value] : [])}
            multiple={multiple()}
            grouped={grouped()}
            clearable={clearable()}
            disabled={disabled()}
            readonly={readonly()}
            placeholder={placeholder()}
            emptyMessage={emptyMessage()}
          />
          <pre>{JSON.stringify(selected(), null, 2)}</pre>
        </section>
        <section class="card">
          <h2>TagsInput</h2>
          <label for="tags">Termos personalizados</label>
          <TagsInput
            id="tags"
            options={options}
            value={tags()}
            onChange={setTags}
            disabled={disabled()}
            readonly={readonly()}
            maxTags={maxTags()}
            placeholder={placeholder()}
          />
          <pre>{JSON.stringify(tags(), null, 2)}</pre>
        </section>
        <section class="card">
          <h2>Async · TanStack Query</h2>
          <label for="async">Sugestões assíncronas simuladas</label>
          <Combobox
            id="async"
            options={options}
            source={source}
            queryClient={queryClient}
            queryKey={["playground", "async-options"]}
            value={asyncValue()}
            onChange={(value) => setAsyncValue(String(value))}
            disabled={disabled()}
            clearable
          />
          <label for="async-shared">Segundo controle, mesmo cache</label>
          <Combobox
            id="async-shared"
            options={options}
            source={source}
            queryKey={["playground", "async-options"]}
            value={asyncValueTwo()}
            onChange={(value) => setAsyncValueTwo(String(value))}
            disabled={disabled()}
            clearable
          />
          <small>
            Os dois controles compartilham o QueryClient do módulo e a mesma queryKey. Em userscripts, use
            ctx.query.client para compartilhar o cache da instância do runtime. Simula 250 ms de latência e
            suporta cancelamento.
          </small>
          <output aria-live="polite">Requisições simuladas: {remoteRequests()}</output>
          <button type="button" onClick={inspectCache}>
            Inspecionar cache compartilhado
          </button>
          <button
            type="button"
            onClick={() => {
              queryClient.removeQueries({ queryKey: ["playground", "async-options"] });
              inspectCache();
            }}
          >
            Limpar cache da demonstração
          </button>
          <pre aria-live="polite">{cacheSnapshot()}</pre>
          <pre>{JSON.stringify(asyncValue())}</pre>
        </section>
        <section class="card">
          <h2>Configurações</h2>
          <label class="toggle">
            <input
              type="checkbox"
              checked={disabled()}
              onChange={(event) => setDisabled(event.currentTarget.checked)}
            />{" "}
            Desabilitar controles
          </label>
          <label class="toggle">
            <input
              type="checkbox"
              checked={readonly()}
              onChange={(event) => setReadonly(event.currentTarget.checked)}
            />{" "}
            Somente leitura
          </label>
          <label class="toggle">
            <input
              type="checkbox"
              checked={multiple()}
              onChange={(event) => setMultiple(event.currentTarget.checked)}
            />{" "}
            Seleção múltipla
          </label>
          <label class="toggle">
            <input
              type="checkbox"
              checked={grouped()}
              onChange={(event) => setGrouped(event.currentTarget.checked)}
            />{" "}
            Agrupar opções
          </label>
          <label class="toggle">
            <input
              type="checkbox"
              checked={clearable()}
              onChange={(event) => setClearable(event.currentTarget.checked)}
            />{" "}
            Permitir limpar
          </label>
          <label class="toggle">
            <input
              type="checkbox"
              checked={fuzzy()}
              onChange={(event) => setFuzzy(event.currentTarget.checked)}
            />{" "}
            Busca fuzzy (Fuse.js)
          </label>
          <label class="toggle">
            <input
              type="checkbox"
              checked={virtualize()}
              onChange={(event) => setVirtualize(event.currentTarget.checked)}
            />{" "}
            Virtualização (TanStack Virtual)
          </label>
          <label class="toggle">
            <input
              type="checkbox"
              checked={largeDataset()}
              onChange={(event) => {
                setLargeDataset(event.currentTarget.checked);
                setGrouped(false);
              }}
            />{" "}
            Dataset de 1.500 opções (desativa grupos)
          </label>
          <label for="playground-placeholder">Placeholder</label>
          <input
            id="playground-placeholder"
            value={placeholder()}
            onInput={(event) => setPlaceholder(event.currentTarget.value)}
          />
          <label for="playground-empty">Mensagem sem resultados</label>
          <input
            id="playground-empty"
            value={emptyMessage()}
            onInput={(event) => setEmptyMessage(event.currentTarget.value)}
          />
          <label for="playground-max-tags">Limite de tags: {maxTags()}</label>
          <input
            id="playground-max-tags"
            type="range"
            min="1"
            max="20"
            value={maxTags()}
            onInput={(event) => setMaxTags(Number(event.currentTarget.value))}
          />
          <button
            type="button"
            onClick={() => {
              setSelected([]);
              setTags([]);
              setAsyncValue("");
            }}
          >
            Limpar todos
          </button>
        </section>
        <section class="card wide">
          <h2>JSX ao vivo</h2>
          <div class="actions" role="group" aria-label="Exemplo de componente">
            <button
              type="button"
              aria-pressed={activeExample() === "combobox"}
              onClick={() => setActiveExample("combobox")}
            >
              Combobox
            </button>
            <button
              type="button"
              aria-pressed={activeExample() === "tags"}
              onClick={() => setActiveExample("tags")}
            >
              TagsInput
            </button>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(jsx())}>
              Copiar JSX
            </button>
          </div>
          <JsxPreview code={jsx()} />
        </section>
        <section class="card wide">
          <h2>29 campos · Renderer independente</h2>
          <p>Experimente todas as variantes sem inicializar RodMenu. O valor muda em tempo real.</p>
          <label for="variant-type">Tipo do campo</label>
          <select
            id="variant-type"
            value={variant()}
            onChange={(event) => {
              setVariant(event.currentTarget.value);
              setVariantValue("");
            }}
          >
            <For each={SHARED_FIELD_TYPES}>{(type) => <option value={type}>{type}</option>}</For>
          </select>
          <StandaloneFieldRenderer
            field={exampleField()}
            context={exampleContext}
            value={variantValue()}
            onChange={setVariantValue}
            id="variant-demo"
          />
          <pre aria-live="polite">{JSON.stringify({ type: variant(), value: variantValue() }, null, 2)}</pre>
          <JsxPreview
            code={`<StandaloneFieldRenderer field={{ type: "${variant()}", name: "demo" }} value={value} onChange={setValue} context={context} />`}
          />
        </section>
        <section class="card wide">
          <h2>Twitter Search · Raw</h2>
          <label>Consulta editável</label>
          <TwitterSearchEditor value={raw()} onChange={setRaw} />
          <small>Cursor livre entre termos. Filtros são pills removíveis; list: abre o seletor.</small>
          <div class="actions">
            <button type="button" onClick={() => setRaw([...selected(), ...tags()].join(" "))}>
              Gerar com filtros e tags
            </button>
            <button type="button" onClick={() => setRaw(appendTwitterToken(raw(), "filter:videos"))}>
              + Vídeos
            </button>
            <button type="button" onClick={() => setRaw(appendTwitterToken(raw(), "-filter:replies"))}>
              + Sem respostas
            </button>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(raw())}>
              Copiar
            </button>
          </div>
          <pre>{raw()}</pre>
          <small>
            Tokens sincronizados com a consulta raw. Clique em um token para editá-lo, Enter para salvar,
            Escape para cancelar.
          </small>
        </section>
      </div>
    </main>
  );
}

// The userscript CSS Modules pipeline exports styles as strings rather than
// injecting stylesheets. A standalone playground must install them explicitly.
const playgroundStyles = document.createElement("style");
playgroundStyles.dataset.rodPlaygroundStyles = "true";
playgroundStyles.textContent = [comboboxCSS, controlsCSS, fieldRendererCSS].join("\n");
document.head.append(playgroundStyles);

const target = document.getElementById("app");
if (target) {
  try {
    // Solid render mounts into the supplied container; it does not own or
    // remove server-rendered placeholders. Clear the bootstrap UI first.
    target.replaceChildren();
    render(() => <App />, target);
    queueMicrotask(() => {
      if (target.querySelector("main")) {
        (window as typeof window & { __rodPlaygroundReady?: () => void }).__rodPlaygroundReady?.();
      } else {
        window.dispatchEvent(
          new ErrorEvent("error", {
            error: new Error("SolidJS did not create the application root"),
            message: "SolidJS did not create the application root",
          }),
        );
      }
    });
  } catch (error) {
    window.dispatchEvent(new ErrorEvent("error", { error, message: String(error) }));
    throw error;
  }
}
