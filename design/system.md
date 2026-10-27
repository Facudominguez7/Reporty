# Reporty design system

## Sources
- `app/globals.css`: color, radius, shadow, spacing, and component tokens.
- `app/layout.tsx`: Geist Sans font variable.
- `components.json`: shadcn New York style, neutral base, CSS variables, Lucide icons.

## Colors
| Token | Value | Usage |
|---|---|---|
| `--background` | `oklch(94.463% 0.00213 14.416)` | App background |
| `--foreground` | `oklch(0.19 0.01 95)` | Primary text |
| `--card` | `oklch(1 0 0)` | Cards and panels |
| `--primary` | `oklch(0.57 0.12 157)` | Primary actions and active state |
| `--secondary` | `#000000` | Strong contrast surfaces |
| `--muted` | `oklch(96.115% 0.00011 271.152)` | Muted surfaces |
| `--muted-foreground` | `oklch(0.45 0.028 157)` | Secondary text |
| `--accent` | `oklch(0.93 0.03 157)` | Accent surfaces |
| `--destructive` | `oklch(0.57 0.18 25)` | Destructive actions |
| `--border` | `oklch(78.892% 0.00009 271.152)` | Borders |
| `--ring` | `oklch(0.62 0.08 230)` | Focus rings |
| `--semantic-info` | `oklch(0.56 0.11 240)` | Informational status |
| `--semantic-success` | `oklch(0.57 0.12 157)` | Success status |
| `--semantic-warning` | `oklch(0.72 0.13 85)` | Warning status |
| `--semantic-danger` | `oklch(0.57 0.18 25)` | Danger status |
| `--semantic-admin` | `oklch(0.5 0.1 285)` | Admin-specific accent |

## Typography
- `Geist Sans` from `app/layout.tsx` via `font-sans`.
- Existing utility typography and `antialiased` body treatment from `app/globals.css`.

## Shape and depth
- Base radius: `--radius: 0.75rem`.
- Small/medium/large/xl radii currently map to the base radius.
- Pill radius: `--radius-pill: 999px`.
- Soft elevation: `--elevation-soft`.
- Card shadow: `--card-shadow`.

## Components
- shadcn style: `new-york`, neutral base, CSS variables enabled (`components.json`).
- Use existing primitives in `components/ui/` before creating new ones.
- Use Lucide icons (`components.json`).
- Preserve visible focus styles and semantic landmarks.
- Responsive layouts should collapse navigation into a compact mobile control rather than forcing horizontal overflow.
