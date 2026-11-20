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

## Implementação inicial (branch docs/rod-dock-2-spec)

- [x] Primeira versão de Vaul Drawer com tabs, pesquisa compartilhada, ScrollArea e configurações de posição/opacidade persistidas.
- [ ] Integração completa de DevTools/Network/DOM e remoção dos launchers externos.
- [ ] Migrar todos os formulários para Radix, adicionar cmdk e verificar compatibilidade com Safari.
- [ ] Regenerar lockfile com npm install, executar typecheck/build e corrigir eventuais falhas antes de merge.

## Bloco 2: biblioteca de primitives e busca

- [x] Catálogo compartilhado de Radix primitives, Vaul, cmdk, Motion, Floating UI, React Hook Form e Zod em `src/runtime/react-ui/primitives.ts`.
- [x] Pesquisa cmdk com sugestões Fuse; controles Select/Slider/Tooltip Radix nas configurações.
- [ ] Versões fixas e lockfile devem ser sincronizados por `npm install` antes do merge. Sem execução de testes a pedido do mantenedor; typecheck/build ainda pendentes.

## Bloco 3: painel Rede integrado

- [x] Aba Rede dentro da Dock, usando Resource Timing/PerformanceObserver com filtro, duração, tamanho de transferência e atualização manual. **Não é ainda um interceptor completo de fetch/XHR**, nem disponibiliza headers/body/status.
- [ ] Integrar interceptores existentes e ferramentas DOM/console sem launchers adicionais; preservar política de isolamento e privacidade.
- [ ] Sincronizar lockfile; executar typecheck e build antes de qualquer merge. Nenhum teste novo solicitado.

## Bloco 4: DOM dentro da Dock

- [x] Aba DOM com seletor CSS, lista limitada a 100 elementos, seleção visual, cópia de HTML e modo de apontar elementos na página; Escape cancela a seleção.
- [ ] Unificar com o inspector legado de CodeMirror, rede completa e console; retirar seus launchers próprios.
- [ ] Lockfile e compilação continuam pendentes. Não executar testes conforme solicitação.

## Bloco 5: console na Dock

- [x] Aba Console com captura de console.log/info/warn/error/debug, filtro de severidade, busca, limite de 200 registros e limpeza.
- [x] Campo de inspeção limitado a caminhos de propriedades globais, sem eval/execução arbitrária.
- [ ] Avaliar isolamento da instrumentação e coexistência com outros wrappers de console antes do merge.
- [ ] Lockfile, typecheck e build pendentes. Sem testes a pedido do mantenedor.

## Bloco 6: robustez de integração

- [x] Wrappers do console preservam a função original, consultam o listener React atual e só restauram o método quando ainda são donos dele; falhas de escrita em métodos imutáveis não derrubam a Dock.
- [x] Corrigida regex da inspeção de propriedades globais; direção do drawer reage a resize e orientação do dispositivo.
- [ ] Console global ainda requer mecanismo central compartilhado para múltiplas instâncias; o wrapper atual deve ser revisado antes do merge.
- [ ] npm lockfile, typecheck/build, integração completa dos DevTools e limpeza de launchers pendentes. Sem testes conforme solicitado.

## Bloco 7: consolidação sobre a main

- [x] Código de Dock 2.0 transportado para branch nova baseada na main atual.
- [x] Inspeção de propriedades globais: corrigido escape de regex; seletor DOM volta à Dock quando cancelado com Escape.
- [ ] Rodar build/typecheck e regenerar lockfile; não executar testes a pedido do mantenedor.
- [ ] Migrar DevTools legados e desativar seus launchers após confirmar equivalência funcional.

## Bloco 8: correção do inspetor e segurança

- [x] Regex de inspeção corrigida para aceitar caminhos `location.href` e `document.title`.
- [x] Leitura de propriedades sem invocar getters e com bloqueio de `constructor`, `prototype` e `__proto__`.
- [x] Destaque DOM acompanha scroll e mudanças de layout enquanto a aba está aberta.
- [ ] Lockfile e typecheck/build continuam sem validação; nenhuma suíte de testes executada.

## Bloco 9: pesquisa acionável e arraste resiliente

- [x] Seleção de ação pelo cmdk/Fuse executa callback registrado, em vez de somente navegar à aba Ferramentas.
- [x] Pesquisa limpa após escolha de resultado e mantém navegação entre abas.
- [x] Launcher filtra pelo pointerId, cancela listeners no pointercancel e desmontagem, evitando vazamento após arraste interrompido.
- [ ] Typecheck/build e lockfile continuam pendentes. Nenhum teste executado.

## Bloco 10: formulários Radix e cópia DOM

- [x] Controles de ativação dos scripts migrados de checkbox nativo para Radix Checkbox, com rótulo acessível e foco visível.
- [x] Cópia de HTML com limite de 12.000 caracteres, feedback de sucesso/erro e opção manual quando Clipboard API não estiver disponível.
- [ ] Migrar demais formulários e integrar DevTools completos; sincronizar lockfile e validar build/typecheck. Sem testes conforme solicitado.

## Regra obrigatória: validade de TSX antes de commit

- [x] Adicionar verificação de sintaxe com parser TypeScript para arquivos React/TSX alterados; identificar \\n literal fora de strings e comentários.
- [x] Corrigir import ausente de `RodMenu`, portal de menu para Shadow DOM e estrutura de Radix Checkbox.
- [ ] Executar `npm run check:react-syntax` antes de **cada** futuro commit que modifique React/TSX. Não confundir esta análise sintática com testes automatizados.
- [ ] Regenerar package-lock e validar typecheck/build. Não executar suítes de testes.

## Bloco 12: robustez do DOM picker e Resource Timing

- [x] Picker ignora elementos da própria Dock no ShadowRoot e no host.
- [x] Destaque DOM limpa referência ao fechar a Dock fora da seleção.
- [x] Leitura de Resource Timing tolera falhas sem derrubar o painel.
- [ ] Validar parser TSX e compilação em ambiente com dependências instaladas. Sem testes.

## Validação automática global no workflow Validate changed userscripts

- [x] Parser TypeScript verifica todos os arquivos TS, TSX, MTS e CTS do repositório, não apenas a Dock.
- [x] Reparação conservadora de `\\n` inválido, fora de strings e comentários, somente quando a análise sintática fica limpa.
- [x] Prettier e segunda verificação antes de commit/push do bot na branch do PR.
- [x] PRs de forks não recebem push; falhas sintáticas não são publicadas.
- [ ] A execução real no GitHub Actions e a instalação do lockfile ainda precisam ser verificadas.
