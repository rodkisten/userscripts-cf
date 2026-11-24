# Semantic theme contract

All shared UI components must use semantic Tailwind utilities or CSS custom properties. Never use literal colors or palette-specific utilities in components. Literal palette values belong only in theme definitions. Themes must be scoped to the userscript's Shadow DOM, including portals. Preserve semantic foreground/background pairs for contrast. Do not modify the host site's theme. Future per-script theme configuration must override semantic tokens on the local theme container, not global document styles.
