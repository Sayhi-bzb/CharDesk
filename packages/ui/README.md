# @chardesk/ui

Private CharDesk visual-system package. Product surfaces consume its theme and
primitives instead of owning colors, borders, radii, shadows, or interaction
states.

Native Hosts consume the React-free `@chardesk/ui/color-presets` entry for
`resolveColorPickerPalettes(appearance)`. It owns the ANSI16 RGB palette and
light/dark curated presets used by both color pickers; presentation stays in each Host.

The package defines one neutral surface ladder for page, embedded, floating,
overlay, and modal UI. Product code supplies layout only; shared recipes own
surface tone, contour, elevation, density, and interaction state.

```css
@import '@chardesk/ui/theme.css';
```

```tsx
import { Button, Separator, Surface } from '@chardesk/ui';
```

`@chardesk/ui/styles` is infrastructure-only and remains as a compatibility
export. Product code consumes primitives from the package root.

Run shadcn commands from the repository root. The root and package
`components.json` files route UI components and utilities into this workspace.
