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

## CSS token fix

`--button-radius`, `--button-height`, and `--button-accent` are now read from ancestor styles with component fallbacks instead of being overwritten on every button. Optional size tokens: `--button-height-sm` and `--button-height-lg`. ButtonGroup filters its own configuration before forwarding HTML attributes. SplitButton renders a single dropdown chevron.

## Manual validation workflow

Run [Button · Typecheck & Build](https://github.com/rodkisten/userscripts-cf/actions/workflows/button-validation.yml) using **Run workflow**, selecting the desired branch and scope. The default validates TypeScript and the Design System bundle; `full` also builds the repository. No tests, deployment, or formatting gate. Failures are shown as separate actionable steps. A workflow file alone is not evidence of a successful run.

## Studio token controls

The interactive Studio now exposes button size (sm/md/lg), border radius (0–28px) and height (28–64px). These are applied as CSS custom properties on the gallery container; the JSON preview reflects the current values. The preview requires a successful Studio build and is not yet browser-verified.

## Studio presets and CSS export

Presets: Compact (30px/6px/blue), Default (38px/10px/purple), Touch (48px/16px/teal). Accent is reactive. **Copiar CSS** exports the current token declarations through Clipboard API and reports success or permission failure via an accessible status message. Browser validation remains pending.

## Consistency fixes

Badge no longer forwards `variant`, `count`, `max` or `children` as native span attributes. The split dropdown trigger renders one visible chevron even when its button has no text. Preset selection stays controlled and changes to individual tokens switch the editor to **Personalizado**. Build/typecheck are still unverified.

## SolidJS prop forwarding

Button, ButtonGroup, DropdownButton and Badge now use Solid's `splitProps` for reactive prop forwarding, keeping component-only properties out of DOM attributes and preventing duplicate `class`/`ref` forwarding. Typecheck and browser validation remain pending.

## Solid 2 runtime correction

Solid 2 RC does not export `splitProps`. Button, ButtonGroup, DropdownButton and Badge now share a reactive `omitProps` Proxy in `src/runtime/solid-ui/shared/omitProps.ts`, instead of importing `splitProps`. This resolves a source-level missing-symbol issue discovered after the earlier validation report; a new build is required to confirm the latest main.

## Group layout and icon-only trigger

ButtonGroup now reads `--button-radius` directly on the group, instead of relying on a private CSS variable defined only on individual child buttons. SplitButton uses a square icon-sized dropdown trigger with a visible chevron. Icon-sized buttons also display their children when no explicit icon is provided. Browser verification is still pending.

## Dropdown keyboard and mobile behavior

The shared `SolidDropdown` now prevents duplicate menus per trigger (reopening toggles closed), supports Home/End, ArrowUp/ArrowDown, Escape, ArrowLeft for submenu back navigation, and closes on Tab or pointerdown outside. It restores trigger focus on close and repositions on scroll/resize for mobile overflow layouts. Submenu transitions focus their first enabled item. These are source changes; Safari and assistive technology verification remain outstanding.

## Focus and touch refinement

Keyboard handling is scoped to focused dropdown descendants; Tab dismisses without stealing focus. Mobile viewport resize/scroll events reposition the menu when the virtual keyboard or zoom changes. Buttons have touch-action manipulation and hover/pressed feedback. Build and Safari checks remain pending for this commit.
