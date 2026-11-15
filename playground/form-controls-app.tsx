import { createSignal, For, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { Combobox } from '../src/runtime/solid-ui/form-controls/Combobox';
import { TagsInput } from '../src/runtime/solid-ui/form-controls/TagsInput';
import type { ControlOption } from '../src/runtime/solid-ui/form-controls/options';

const options: ControlOption[] = [
  { value: 'filter:videos', label: 'Vídeos', group: 'Mídia' },
  { value: 'filter:images', label: 'Imagens', group: 'Mídia' },
  { value: 'filter:native_video', label: 'Vídeo nativo', group: 'Mídia' },
  { value: 'lang:pt', label: 'Português', group: 'Idioma' },
  { value: 'lang:en', label: 'Inglês', group: 'Idioma' },
  { value: '-filter:replies', label: 'Sem respostas', group: 'Filtros' },
  { value: 'min_faves:100', label: '100+ curtidas', group: 'Engajamento' },
];

function App() {
  const [selected, setSelected] = createSignal<string[]>(['filter:videos']);
  const [tags, setTags] = createSignal<string[]>(['typescript']);
  const [disabled, setDisabled] = createSignal(false);
  const [readonly, setReadonly] = createSignal(false);
  const [multiple, setMultiple] = createSignal(true);
  const [grouped, setGrouped] = createSignal(true);
  const [clearable, setClearable] = createSignal(true);
  const [placeholder, setPlaceholder] = createSignal('Pesquisar filtros…');
  const [emptyMessage, setEmptyMessage] = createSignal('Nenhum filtro encontrado');
  const [maxTags, setMaxTags] = createSignal(8);
  const [activeExample, setActiveExample] = createSignal<'combobox' | 'tags'>('combobox');
  const jsx = () => activeExample() === 'combobox'
    ? `<Combobox
  id="filters"
  options={options}
  value={selected()}
  onChange={setSelected}
  multiple={${multiple()}}
  grouped={${grouped()}}
  clearable={${clearable()}}
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
  const [raw, setRaw] = createSignal('');
  const [asyncValue, setAsyncValue] = createSignal('');
  const source = async (query: string, { signal }: { signal: AbortSignal }) => {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 250);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); }, { once: true });
    });
    return options.filter((option) => (option.label + option.value).toLowerCase().includes(query.toLowerCase()));
  };
  return (
    <main>
      <a href="/">← Userscripts</a>
      <p class="eyebrow">Design System / Form Controls / SolidJS</p>
      <h1>Form Controls Playground</h1>
      <p>Componentes reais do runtime SolidJS. Altere os valores para experimentar os estados e a API.</p>
      <div class="grid">
        <section class="card">
          <h2>Combobox múltiplo</h2>
          <label for="filters">Filtros da pesquisa</label>
          <Combobox id="filters" options={options} value={multiple() ? selected() : (selected()[0] ?? '')} onChange={(value) => setSelected(Array.isArray(value) ? value : value ? [value] : [])} multiple={multiple()} grouped={grouped()} clearable={clearable()} disabled={disabled()} readonly={readonly()} placeholder={placeholder()} emptyMessage={emptyMessage()} />
          <pre>{JSON.stringify(selected(), null, 2)}</pre>
        </section>
        <section class="card">
          <h2>TagsInput</h2>
          <label for="tags">Termos personalizados</label>
          <TagsInput id="tags" options={options} value={tags()} onChange={setTags} disabled={disabled()} readonly={readonly()} maxTags={maxTags()} placeholder={placeholder()} />
          <pre>{JSON.stringify(tags(), null, 2)}</pre>
        </section>
        <section class="card">
          <h2>Async · TanStack Query</h2>
          <label for="async">Sugestões assíncronas simuladas</label>
          <Combobox id="async" options={options} source={source} queryKey={['playground', 'async-options']} value={asyncValue()} onChange={(value) => setAsyncValue(String(value))} disabled={disabled()} clearable />
          <small>Simula 250 ms de latência e suporta cancelamento.</small>
          <pre>{JSON.stringify(asyncValue())}</pre>
        </section>
        <section class="card">
          <h2>Configurações</h2>
          <label class="toggle"><input type="checkbox" checked={disabled()} onChange={(event) => setDisabled(event.currentTarget.checked)} /> Desabilitar controles</label>
          <label class="toggle"><input type="checkbox" checked={readonly()} onChange={(event) => setReadonly(event.currentTarget.checked)} /> Somente leitura</label>
          <label class="toggle"><input type="checkbox" checked={multiple()} onChange={(event) => setMultiple(event.currentTarget.checked)} /> Seleção múltipla</label>
          <label class="toggle"><input type="checkbox" checked={grouped()} onChange={(event) => setGrouped(event.currentTarget.checked)} /> Agrupar opções</label>
          <label class="toggle"><input type="checkbox" checked={clearable()} onChange={(event) => setClearable(event.currentTarget.checked)} /> Permitir limpar</label>
          <label for="playground-placeholder">Placeholder</label>
          <input id="playground-placeholder" value={placeholder()} onInput={(event) => setPlaceholder(event.currentTarget.value)} />
          <label for="playground-empty">Mensagem sem resultados</label>
          <input id="playground-empty" value={emptyMessage()} onInput={(event) => setEmptyMessage(event.currentTarget.value)} />
          <label for="playground-max-tags">Limite de tags: {maxTags()}</label>
          <input id="playground-max-tags" type="range" min="1" max="20" value={maxTags()} onInput={(event) => setMaxTags(Number(event.currentTarget.value))} />
          <button type="button" onClick={() => { setSelected([]); setTags([]); setAsyncValue(''); }}>Limpar todos</button>
        </section>
        <section class="card wide">
          <h2>JSX ao vivo</h2>
          <div class="actions" role="group" aria-label="Exemplo de componente">
            <button type="button" aria-pressed={activeExample() === 'combobox'} onClick={() => setActiveExample('combobox')}>Combobox</button>
            <button type="button" aria-pressed={activeExample() === 'tags'} onClick={() => setActiveExample('tags')}>TagsInput</button>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(jsx())}>Copiar JSX</button>
          </div>
          <pre><code>{jsx()}</code></pre>
        </section>
        <section class="card wide">
          <h2>Twitter Search · Raw</h2>
          <label for="raw">Consulta editável</label>
          <textarea id="raw" rows="3" value={raw()} onInput={(event) => setRaw(event.currentTarget.value)} placeholder="filter:videos lang:pt typescript" />
          <div class="actions">
            <button type="button" onClick={() => setRaw([...selected(), ...tags()].join(' '))}>Gerar com filtros e tags</button>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(raw())}>Copiar</button>
          </div>
          <pre>{raw()}</pre>
          <small>Parser bidirecional e syntax highlighting permanecem planejados.</small>
        </section>
      </div>
    </main>
  );
}

const target = document.getElementById('app');
if (target) render(() => <App />, target);
