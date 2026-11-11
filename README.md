# Userscripts CF

Código JavaScript do laboratório de distribuição modular do RodX para Tampermonkey e Cloudflare.

## Estrutura

- `labs/remote-release/`: loader Tampermonkey, módulos IIFE A/B, candidato inválido, gerador do Worker e testes.
- `diagnostics/`: diagnóstico de ponte com a página, storage GM e captura GraphQL fetch/XHR.

O RodX gigante ainda não foi migrado. Estes scripts são testes isolados; não substituem o script principal.

## Desenvolvimento

Requer Node.js 22 ou superior.

```sh
npm install
npm test
npm run format
```

`npm run build` gera `labs/remote-release/worker.mjs` selecionando A. `npm run build:b` seleciona B. Cada build inclui os três módulos, com URLs derivadas do SHA-256. O arquivo gerado não deve ser editado manualmente.

O workflow do GitHub executa os testes a cada push ou pull request e disponibiliza o Worker gerado como artefato. Ele **não faz deploy**: a integração automática com Cloudflare ainda não foi configurada.

## Laboratório publicado

https://rodx-loader-lab.kisten.workers.dev

A release A continua publicada. B só deve ser publicada depois de confirmar no iPhone que A foi instalada e ativada após recarregar.

Instale `labs/remote-release/RodX-Remote-Release-Lab.user.js` no Tampermonkey. Consulte `LEIA-ME.txt` para o procedimento completo. O loader valida SHA-256, testa o ciclo de vida e mantém snapshots no storage GM para ativação após reload e rollback.

O diagnóstico GraphQL mantém os dados completos no painel local. Evite publicar relatórios com credenciais, headers ou dados privados.
