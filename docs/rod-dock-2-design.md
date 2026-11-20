# Rod Dock 2.0 · Decisões de arquitetura, UX e pacotes

> Especificação de referência do mantenedor (20/11/2026). **Obrigatório consultar antes de modificar Dock, Menu, Settings ou DevTools.** Este documento registra requisitos; não indica que estejam implementados.

## Arquitetura

- Trabalhar a partir da **main**, em branch nova; nunca reutilizar PR mergeado.
- **React 19 + TypeScript/TSX**, uma root por instância de runtime, superfícies com `createPortal`; sem Solid, sem `React.createElement` para UI, sem `any` no contexto.
- **Vaul** como drawer mobile; **Radix UI** para menus, formulários, tabs, scroll, diálogos e controles. Reutilizar `src/runtime/react-ui/Menu.tsx` e `RodMenuHost`.
- Design system compartilhado; componentes Radix disponíveis sob demanda, não renderizados todos juntos. Importações seletivas para bundles leves.
- Mobile-first: Safari no iPhone, Shadow DOM, safe areas, teclado virtual, gestos touch, foco acessível e scroll sem conflito.
- Seguir `AGENTS.md`, `docs/WORKBOARD.md`, `docs/react-only-migration.md`, `docs/react-single-root-portals.md`, `docs/context-and-optimization.md` e `docs/testing-policy.md`.

## Requisitos de UI

1. **Uma única Dock:** scripts, menus, formulários, configurações, console/REPL, DevTools, rede, DOM inspector e diagnósticos dentro dela. **Proibido criar botões/launchers flutuantes próprios para DevTools ou módulos.** Corrigir as ferramentas que hoje não funcionam.
2. **Launcher pequeno e discreto**, arrastável; posição persistida após reload e navegação. Limitar posição à viewport.
3. **Configurações da Dock:** lado (esquerda, centro, direita), altura/posição vertical, tamanho/densidade, opacidade durante scroll, auto-discrição e restaurar padrão. Persistir preferências e aplicá-las imediatamente.
4. **Opacidade inteligente:** diminuir durante a rolagem da página; restaurar quando cessar o scroll ou houver interação, sem atrapalhar o gesto.
5. **Pesquisa global fixa no topo:** scripts, comandos, ferramentas, ações e configurações, com teclado e touch; `cmdk` + `fuse.js`.
6. **Menus compactos, com rolagem interna:** altura máxima baseada em viewport e safe areas; cabeçalho, busca e tabbar visíveis; conteúdo independente e sem overflow na página.
7. **Vaul Drawer no mobile**, snap points e gestos; Radix Dialog ou painel adequado em telas maiores; portais dentro do ShadowRoot.
8. **DevTools somente dentro da Dock**, com console, Network, DOM e diagnósticos funcionais, estados de erro/carregamento e sem botões extras.
9. Visual consistente com Menu/Radix, controles pequenos e responsivos; não introduzir tamanhos enormes.

## Layout de referência

Launcher compacto → Vaul Drawer/Dialog → header + busca global sticky → tabs Scripts / DevTools / Rede / DOM / Configurações → conteúdo rolável → menus/context actions/form controls Radix. Preferências de posição e opacidade na aba Configurações.

## Dependências

- Drawer: `vaul`.
- Command palette: `cmdk`; fuzzy search existente: `fuse.js`.
- Animação: `motion`; ícones: `lucide-react`.
- Popover/posicionamento: `@floating-ui/react`.
- Formulários: `react-hook-form`, `@hookform/resolvers`, `zod`.
- Radix: ScrollArea, Tabs, DropdownMenu, ContextMenu, Select, Switch, Slider, Checkbox, RadioGroup, Popover, Tooltip, Accordion, Collapsible, Separator, Label, Toggle, ToggleGroup, NavigationMenu, Menubar, Progress, Avatar, AlertDialog, HoverCard, AspectRatio, além do Dialog já presente.
- Já presentes na main consultada: React, React DOM, Fuse.js, dnd-kit, Sonner, Radix Dialog e DropdownMenu. **Verificar package.json e lockfile antes de instalar:** usuário informou que já instalou Vaul, mas a versão da main consultada não o incluía.

### Instalação npm, em uma linha

```bash
npm install vaul cmdk motion lucide-react @floating-ui/react @radix-ui/react-scroll-area @radix-ui/react-tabs @radix-ui/react-dropdown-menu @radix-ui/react-context-menu @radix-ui/react-select @radix-ui/react-switch @radix-ui/react-slider @radix-ui/react-checkbox @radix-ui/react-radio-group @radix-ui/react-popover @radix-ui/react-tooltip @radix-ui/react-accordion @radix-ui/react-collapsible @radix-ui/react-separator @radix-ui/react-label @radix-ui/react-toggle @radix-ui/react-toggle-group @radix-ui/react-navigation-menu @radix-ui/react-menubar @radix-ui/react-progress @radix-ui/react-avatar @radix-ui/react-alert-dialog @radix-ui/react-hover-card @radix-ui/react-aspect-ratio react-hook-form @hookform/resolvers zod
```

## Checklist de implementação

- [ ] Confirmar instalação de Vaul/Radix e integrar portais ao ShadowRoot.
- [ ] Criar primitives de menu e form reutilizáveis com Radix.
- [ ] Refazer launcher compacto e persistir posição com limites de viewport.
- [ ] Implementar preferências de posição, opacidade, densidade e comportamento no scroll.
- [ ] Implementar drawer responsivo, pesquisa global e tabs com scroll interno.
- [ ] Integrar DevTools, REPL, Network, DOM e diagnósticos sem launchers extras.
- [ ] Verificar typecheck, build e smoke manual no Safari iPhone. Testes automatizados apenas de runtime/utilitários conforme `docs/testing-policy.md`.
- [ ] Atualizar README, Workboard e este documento com evidências por bloco completo.

**PRs:** incluir a URL real da conversa de origem na descrição; nunca inventar. Não declarar funcionalidades ou CI aprovados sem verificar.
