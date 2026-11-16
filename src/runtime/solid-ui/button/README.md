# Button system (SolidJS 2)

## Status

Initial implementation committed. Build and typecheck have **not** been verified. No tests requested.

## Components

- `Button`: default, secondary, outline, ghost, destructive, success, warning, link; sm/md/lg/icon; icon, iconEnd, badge, loading, autoLoading, loadingText.
- `ButtonGroup`: horizontal/vertical, attached/detached.
- `DropdownButton`: delegates to existing `menu.dropdown` / `ctx.menu.dropdown` compatible facade; no duplicate menu renderer.
- `SplitButton`: main action plus menu trigger.

## Styling

Import `buttonCss` and register through `ctx.ui.registerStyles(buttonCss)` when mounting in a Shadow Root. Tokens: `--button-accent`, `--button-radius`, `--button-height`.

## Example

```tsx
import { Button, ButtonGroup, DropdownButton, buttonCss } from "./Button";
ctx.ui.registerStyles(buttonCss);
<ButtonGroup attached>
  <Button icon="✓" autoLoading onClick={() => save()}>
    Save
  </Button>
  <DropdownButton items={[{ label: "Export", onSelect: exportData }]}>More</DropdownButton>
</ButtonGroup>;
```

## Remaining

- [ ] Verify Solid 2 typecheck and build; fix any compile/runtime issues.
- [x] Add real Solid Button/ButtonGroup/DropdownButton gallery in the design-system studio (variant, accent, loading and badge controls).
- [ ] Expand the editor with size, radius and additional advanced variants.
- [x] Switch RodMenu footer action rendering to shared Button; preserve runAction validation, loading, badge, shortcut and close semantics.
- [ ] Verify styling compatibility and typecheck/build for RodMenu integration.
- [x] Public package entry point, accessible IconButton and independent Badge package.
- [ ] Shared theme configuration and comprehensive badge positioning.
- [ ] Add toggle, progress, confirm, copy and advanced button patterns.
- [ ] Verify keyboard, mobile Safari and Shadow DOM behavior.
- [ ] Update docs and playground with every subsequent user-visible change.

## New examples

The live Design System Studio includes `IconButton` with notification count and standalone `Badge` success/dot variants. Import `Badge, badgeCss` from `../badge`; register `badgeCss` in the same isolated style root as `buttonCss`. These are initial primitives, not yet validated by build/typecheck.

## SplitButton integration update

The dropdown forwards its HTML button reference to the existing `menu.dropdown` positioning system. SplitButton keeps the primary action separate from the arrow-triggered menu and passes async/loading props only to the primary action. The Studio has a live SplitButton demo with async save and two menu actions. Typecheck/build and browser behavior remain unverified.

## DOM props and accessibility

The Button filters component-only props before forwarding native HTML attributes. DropdownButton filters `items`, `menu`, and `align` and declares `aria-haspopup="menu"`. SplitButton separates its primary action from the menu trigger. This is a code-level correction, **not a confirmed build pass**.

### Validation status

- [ ] Typecheck: not run (GitHub connector has no command execution and this environment cannot reach GitHub to clone).
- [ ] Build: not run for the same reason.
- [ ] Safari iPhone and menu positioning: not manually verified.
- [ ] Review native attributes, CSS precedence and async rejection behavior after compilation.

## Styling note

The button CSS uses explicit font properties so the component inherits the host font family without an invalid `font` shorthand. The tokens remain configurable on the component or its ancestor.
