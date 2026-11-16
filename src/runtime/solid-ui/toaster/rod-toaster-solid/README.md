# RodToaster SolidJS (v4.9.2)

Implementação declarativa do **Rod Super Toaster** reescrita para **SolidJS v2**, utilizando **CSS Variables (Design Tokens)** e **CSS Modules** em uma **estrutura de diretórios plana (*flat*, sem `src/`)**.

---

## 📋 Visão Geral da Migração

- **Reatividade Granular (SolidJS v2)**: Substituição de mutações imperativas de DOM por `createSignal`, `<For>`, `<Show>`, `<Switch>/<Match>` e `<Portal>`.
- **Estrutura Plana (*Flat*)**: Todos os módulos, componentes, stores e folhas de estilo residem na raiz do pacote sem subpastas aninhadas.
- **CSS Variables (`tokens.css`)**: Todos os tokens de superfície, borda, tipografia e paletas semânticas (`--rod-success-*`, `--rod-error-*`, `--rod-warning-*`, `--rod-info-*`, `--rod-debug-*`) configuráveis por tema (`dark`, `light`, `auto`).
- **CSS Modules (`Toaster.module.css`)**: Escopo local em tempo de build sem injeção manual de tags `<style>`.

---

## 📁 Estrutura do Projeto

```text
rod-toaster-solid/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
├── index.ts                  # API pública (toast.*) e auto-mount do Portal
├── types.ts                  # Contratos TypeScript estritos
├── tokens.css                # Design tokens e paletas dark/light
├── Toaster.module.css        # Estilos encapsulados via CSS Modules
├── toasterStore.ts           # Store reativo de fila, pilha, timers e deduplicação
├── taskManager.ts            # Orquestrador de Tasks, Promise, Retry, Groups e persistência
├── SvgIcon.tsx               # Biblioteca vetorial inline
├── ToastItem.tsx             # Card individual (progresso, detalhes, ações, expansão)
├── MultiLoadingView.tsx      # Painel de operações em lote com progresso agregado
├── ActionDialogView.tsx      # Diálogos interativos (confirm, prompt, select)
├── PickerView.tsx            # Seletor visual de imagens e vídeos
├── ObjectInspectorView.tsx   # Inspetor recursivo de objetos e primitivos
└── ToasterProvider.tsx       # Host <Portal> com toolbar e pilha colapsável
```

---

## 🚀 Instalação e Build

```bash
npm install
npm run typecheck
npm run build
```

---

## 💡 Exemplos de Uso

### Notificações Básicas e Semânticas

```ts
import { toast } from 'rod-toaster-solid';

toast('Operação concluída');
toast.success('Arquivo salvo com sucesso');
toast.error(new Error('Falha na conexão com o servidor'));
toast.warning('Sessão expira em 2 minutos');
toast.info({ title: 'Atualização disponível', description: 'Versão 2.1 pronta.' });
```

### Tasks, Promises e Retries

```ts
await toast.promise(fetch('/api/sync'), {
  loading: 'Sincronizando dados...',
  success: 'Sincronização concluída!',
  error: (err) => `Erro: ${String(err)}`,
});

const task = toast.task({
  title: 'Exportando relatório',
  cancellable: true,
  async run({ setProgress }) {
    setProgress(0.4, 'Processando linhas...');
    await new Promise((r) => setTimeout(r, 800));
    setProgress(1, 'Finalizado');
  },
});
```

### Diálogos Interativos e Media Picker

```ts
const confirmed = await toast.confirm({
  title: 'Excluir registro?',
  description: 'Essa ação não pode ser desfeita.',
});

const name = await toast.prompt({
  title: 'Renomear projeto',
  inputLabel: 'Novo nome',
  required: true,
});

const selectedMedia = await toast.picker({
  title: 'Selecione as mídias',
  items: ['/img/1.jpg', '/img/2.jpg', '/video/demo.mp4'],
  multiple: true,
});
```


### Integração no runtime: `ctx.toast.promise`

O runtime usa **somente** este pacote como implementação do Toast. `ctx.toast` e
`ctx.toaster` são aliases da mesma instância. Não importe outro toaster.

```ts
const result = await ctx.toast.promise(
  fetch('/api/sync').then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<{ count: number }>;
  }),
  {
    loading: 'Sincronizando...',
    success: ({ count }) => `${count} itens sincronizados`,
    error: (error) => `Falha: ${String(error)}`,
  },
);
```

Também aceita uma função com contexto de task, `signal` para cancelamento e
`setProgress` para progresso entre 0 e 1:

```ts
await ctx.toast.promise(
  async ({ signal, setProgress }) => {
    setProgress(0.2, 'Iniciando');
    const response = await fetch('/api/export', { signal });
    if (!response.ok) throw new Error('Falha na exportação');
    setProgress(1, 'Concluído');
    return response.blob();
  },
  { loading: 'Exportando...', success: 'Exportação concluída', error: 'Erro na exportação' },
);
```

A operação é executada **uma única vez**, a Promise original resolve com o
resultado ou rejeita com o erro original, e o Toast reflete o resultado.
