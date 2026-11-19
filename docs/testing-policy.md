# 🧪 Testing policy · React-only migration

**Status:** ACTIVE · 2026-11-19. The user's latest explicit instructions override older test plans.

## Allowed automated tests

- Runtime/context lifecycle, isolation, cleanup, storage, events, network and interceptors.
- Framework-independent utilities, parsers, Rod AST transformations, codemods, build scripts and configuration logic.
- TypeScript typechecks and production bundle/build verification remain mandatory.

## Do not create or run

- React or Solid UI/component tests, snapshots, visual tests, React Testing Library tests.
- Individual userscript UI, boot, integration or interaction suites.
- Tests whose primary purpose is rendering buttons, dialogs, menus, pages or playground views.

## Maintenance rules

- Never delete permitted runtime/utility coverage as a shortcut to green CI.
- Runtime/context API changes require Rod AST review and compatible fixture/test updates as specified by AGENTS.md.
- Playground is a real interactive demonstration of production React components, not an automated UI-test suite.
- Manual iPhone Safari smoke checks remain important, but are not Vitest suites.
- Before claiming CI success, verify the actual workflow run and commit SHA.
- If a workflow or package script still runs prohibited tests, update that script; documentation alone does not enforce this policy.
