# RodMenu SolidJS (v2.3.0)

Implementação declarativa do motor de superfícies, menus e formulários **RodMenu** reescrita para **SolidJS v2**, utilizando **CSS Variables (Design Tokens)** e **CSS Modules** com tipagem estrita em TypeScript.

---

## 📋 Visão Geral da Migração

A versão original imperativa baseada em manipulação direta de DOM, Shadow DOM e strings CSS inline foi refatorada para uma arquitetura reativa moderna:

- **Reatividade Granular (SolidJS v2)**: Substituição de mutações manuais do DOM (`querySelector`, `dataset`, `replaceChildren`) por `createSignal`, `createMemo`, `<For>`, `<Show>` e `<Switch>/<Match>`.
- **CSS Variables (`src/styles/tokens.css`)**: Todos os tokens de design (`--rm-bg`, `--rm-panel`, `--rm-accent`, `--rm-radius`, `--rm-shadow`, etc.) foram extraídos para variáveis CSS globais e escopáveis por instância via prop `theme`.
- **CSS Modules (`Surface.module.css` & `Fields.module.css`)**: Isolamento de classes em tempo de compilação sem necessidade de injeção manual de tags `<style>` ou dependência de compilers externos (`Cipó`).
- **Gerenciamento de Pilha & Persistência**: Store reativo com suporte a hidratação assíncrona, debounce, versionamento de schema e adaptadores (`localStorage`, `sessionStorage` ou customizados).
- **Portais (`<Portal>`)**: Renderização isolada no topo da árvore DOM preservando o ciclo de vida reativo do SolidJS.

---

## 📁 Estrutura do Projeto

```text
rod-menu-solid/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
└── src/
    ├── index.ts                              # API pública imperativa/declarativa (open, form, confirm, actions)
    ├── types.ts                              # Definições completas de tipos, schemas, campos e contextos
    ├── styles/
    │   ├── tokens.css                        # Variáveis CSS (cores, tipografia, sombras, raios, z-index)
    │   ├── Surface.module.css                # Estilos de layout (bottom-sheet, modal, drawer, popover, header, footer)
    │   └── Fields.module.css                 # Estilos dos controles de formulário, abas, typeahead e mídia
    ├── store/
    │   ├── createMenuStore.ts                # Store reativo com Signals + persistência versionada
    │   └── stackManager.ts                   # Gerenciador reativo de pilha de múltiplas superfícies (z-index e foco)
    ├── components/
    │   ├── RodMenuProvider.tsx               # Host global (<RodMenuHost />) e controlador de montagem
    │   ├── Surface.tsx                       # Componente principal da superfície (gestos, atalhos, viewport, abas)
    │   ├── SectionRenderer.tsx               # Renderizador de seções colapsáveis e agrupamento de campos
    │   ├── FieldRenderer.tsx                 # Despachante reativo para os 23 tipos de campos nativos e customizados
    │   └── fields/
    │       ├── TypeaheadSelect.tsx           # Select e MultiSelect pesquisáveis com navegação por teclado
    │       └── MediaAndDiagnostics.tsx       # Campos ricos (media-preview, media-picker, provider-status, request-log, debug-json, channel-picker)
    └── presets/
        └── presets.tsx                       # Presets prontos (media, settings, history, savedSync, debug, channelPicker)
```

---

## 🚀 Instalação e Build

```bash
# Instalar dependências
npm install

# Verificar tipos TypeScript
npm run typecheck

# Gerar build de produção (ES Module + IIFE)
npm run build
```

---

## 💻 Como Usar

### 1. Uso Imperativo (Drop-in API)

A API `RodMenu` monta automaticamente o `<RodMenuHost />` no documento na primeira chamada:

```tsx
import { RodMenu } from 'rod-menu-solid';

async function abrirConfiguracoes() {
  const result = await RodMenu.form({
    title: 'Preferências de Download',
    description: 'Configure a qualidade e o comportamento padrão.',
    presentation: 'auto', // bottom-sheet no mobile, modal no desktop
    store: {
      persist: { key: 'user-prefs', storage: 'local' },
    },
    fields: [
      {
        type: 'select',
        name: 'quality',
        label: 'Qualidade de Vídeo',
        searchable: true,
        defaultValue: '1080p',
        options: [
          { value: '2160p', label: '4K Ultra HD', description: '60fps · MP4' },
          { value: '1080p', label: '1080p Full HD', description: 'Recomendado' },
          { value: '720p', label: '720p HD' },
        ],
      },
      {
        type: 'switch',
        name: 'autoSave',
        label: 'Salvar automaticamente',
        defaultValue: true,
      },
      {
        type: 'range',
        name: 'concurrency',
        label: 'Downloads simultâneos',
        min: 1,
        max: 8,
        defaultValue: 3,
      },
    ],
  });

  if (result.action === 'submit') {
    console.log('Valores salvos:', result.values);
  }
}
```

### 2. Uso Declarativo em Aplicações SolidJS

Você pode montar `<RodMenuHost />` diretamente na raiz da sua aplicação SolidJS ou renderizar `<Surface />` manualmente:

```tsx
import { RodMenuHost, RodMenu } from 'rod-menu-solid';

export function App() {
  return (
    <>
      <main>
        <button onClick={() => RodMenu.confirm({ title: 'Excluir item?', danger: true })}>
          Excluir
        </button>
      </main>
      <RodMenuHost />
    </>
  );
}
```

### 3. Presets Integrados (`RodMenu.presets`)

- **`RodMenu.presets.media(options)`**: Seletor de mídias com preview, seleção múltipla e escolha de canal.
- **`RodMenu.presets.settings(schema)`**: Modal/Sheet de configurações com persistência automática em `localStorage` e botão de restaurar padrão.
- **`RodMenu.presets.history(options)`**: Visualizador de histórico com renderização customizável.
- **`RodMenu.presets.savedSync(options)`**: Painel de sincronização com contadores reativos e comandos assíncronos.
- **`RodMenu.presets.debug(options)`**: Inspetor com abas para JSON, mídias, status de providers e log de requisições.
- **`RodMenu.presets.channelPicker(options)`**: Seletor rápido de canais com busca integrada.

---

## 🎨 Customização via CSS Variables

Sobrescreva os tokens globalmente ou por instância através da propriedade `theme` no schema:

| Variável CSS | Padrão | Descrição |
| :--- | :--- | :--- |
| `--rm-font` | `-apple-system, BlinkMacSystemFont, ...` | Família tipográfica da superfície |
| `--rm-bg` | `color-mix(in srgb, Canvas 94%, transparent)` | Cor de fundo base |
| `--rm-panel` | `color-mix(in srgb, Canvas 98%, transparent)` | Fundo do painel principal e rodapé |
| `--rm-elevated` | `color-mix(in srgb, Canvas 92%, CanvasText 8%)` | Fundo de cards, seções e botões secundários |
| `--rm-text` | `CanvasText` | Cor principal do texto |
| `--rm-muted` | `color-mix(in srgb, CanvasText 58%, transparent)` | Texto secundário, descrições e placeholders |
| `--rm-border` | `color-mix(in srgb, CanvasText 14%, transparent)` | Bordas de campos, divisores e containers |
| `--rm-accent` | `#ff7a18` | Cor de destaque primária |
| `--rm-accent-strong` | `#ff5b00` | Cor de destaque intensa (gradientes/badges) |
| `--rm-danger` | `#ff453a` | Cor de erro e ações destrutivas |
| `--rm-success` | `#30d158` | Cor de sucesso e indicadores positivos |
| `--rm-radius` | `26px` | Arredondamento das bordas do container |
| `--rm-shadow` | `0 28px 90px rgba(0, 0, 0, .24)...` | Sombra da superfície |
| `--rm-z` | `2147482500` | `z-index` base da pilha de superfícies |

Exemplo de tema customizado por instância:

```ts
RodMenu.open({
  title: 'Tema Esmeralda',
  theme: {
    accent: '#10b981',
    'accent-strong': '#059669',
    radius: '18px',
  },
  fields: [/* ... */],
});
```

---

## 🧩 Tipos de Campos Suportados

- **Texto & Números**: `text`, `email`, `password`, `search`, `url`, `tel`, `number`, `textarea`
- **Seleção**: `select` (nativo ou `searchable: true` typeahead), `multiselect` (chips ou `searchable: true`), `radio`, `checkbox-group`, `segmented`, `channel-picker`
- **Booleanos & Escalas**: `checkbox`, `switch`, `range`, `rating`
- **Data, Cor & Arquivos**: `date`, `datetime-local`, `time`, `month`, `week`, `color` (com `presets`), `file`
- **Mídia & Diagnóstico**: `media-preview`, `media-picker`, `provider-status`, `request-log`, `debug-json`
- **Estruturais & Customizados**: `button`, `html`, `divider`, `hidden`, `custom` (retornando `JSX.Element`)
