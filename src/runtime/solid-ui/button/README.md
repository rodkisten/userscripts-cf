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
- [x] Add real Solid Button/ButtonGroup/DropdownButton gallery in the design-system studio (variant, accent, loading and badge controls).\n- [ ] Expand the editor with size, radius and additional advanced variants.
- [x] Switch RodMenu footer action rendering to shared Button; preserve runAction validation, loading, badge, shortcut and close semantics.\n- [ ] Verify styling compatibility and typecheck/build for RodMenu integration.
- [x] Public package entry point, accessible IconButton and independent Badge package.\n- [ ] Shared theme configuration and comprehensive badge positioning.
- [ ] Add toggle, progress, confirm, copy and advanced button patterns.
- [ ] Verify keyboard, mobile Safari and Shadow DOM behavior.
- [ ] Update docs and playground with every subsequent user-visible change.

## New examples

The live Design System Studio includes `IconButton` with notification count and standalone `Badge` success/dot variants. Import `Badge, badgeCss` from `../badge`; register `badgeCss` in the same isolated style root as `buttonCss`. These are initial primitives, not yet validated by build/typecheck.
