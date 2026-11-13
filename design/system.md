# Reporty — Design System

Fuente única de tokens: `app/globals.css` (Tailwind v4, `@theme inline`). Sync regenerado al diseñar `intro-app/`.

## Colores

| Token | Valor (oklch) | Uso |
| --- | --- | --- |
| `--background` | `94.463% 0.00213 14.416` | Blanco cálido de fondo de superficie |
| `--foreground` | `0.19 0.01 95` | Texto principal (carbón cálido) |
| `--card` / `--card-foreground` | `1 0 0` / `0.19 0.01 95` | Superficies de tarjeta |
| `--primary` | `0.57 0.12 157` | Verde marca (≈ `#2e7d5b`, coincide con `themeColor` TWA) |
| `--primary-foreground` | `0.985 0 0` | Texto sobre verde |
| `--secondary` / `--secondary-foreground` | `#000000` / `#ffffff` | Fondo raíz `html` y barra de estado/navegación (negro) |
| `--muted` / `--muted-foreground` | `96.115% 0.00011 271.152` / `0.45 0.028 157` | Fondos neutros y texto secundario verdoso |
| `--accent` / `--accent-foreground` | `0.93 0.03 157` / `0.3 0.05 157` | Verde muy claro |
| `--destructive` (+ `-foreground`) | `0.57 0.18 25` / `0.985 0 0` | Peligro |
| `--border` / `--input` | `78.892% 0.00009 271.152` / `96.416% 0.00011 271.152` | Bordes y campos |
| `--ring` | `0.62 0.08 230` | Foco |
| `--surface-subtle` | `94.007% 0.00011 271.152` | Sutil sobre tarjeta |
| `--semantic-info` | `0.56 0.11 240` | Informativo / ranking-points / heat-low |
| `--semantic-success` | `0.57 0.12 157` | Igual al primario |
| `--semantic-warning` | `0.72 0.13 85` | Advertencia / heat-medium |
| `--semantic-danger` | `0.57 0.18 25` | Igual al destructive / heat-high / priority-high |
| `--semantic-admin` | `0.5 0.1 285` | Violeta admin / category-accent |
| `--pet-type` | `0.48 0.17 330` | Fucsia tipo mascota |
| `--ranking-first/second/third` | `0.76 0.14 84` / `0.66 0.01 250` / `0.61 0.09 50` | Oro / plata / bronce |

Alias semánticos: `--priority-high|medium|low`, `--map-heat-high|medium|low|neutral`, `--map-marker-stroke|foreground`.

## Tipografía

- `--font-sans: var(--font-geist-sans)` — **Geist Sans** (fuente del sistema del proyecto; en artboards usar pila system-ui).
- `font-feature-settings: "cv02","cv03","cv04","cv11"` en `body`.
- Escalas usadas: `.page-meta-label` (xs semibold uppercase tracking 0.14em), `.section-title` (2xl–4xl semibold tracking-tight), `.section-eyebrow` (0.7rem semibold uppercase tracking 0.18em).

## Espaciado y radios

- `--radius: 0.75rem` — único radio base; `radius-sm|md|lg|xl` todos apuntan a `0.75rem`.
- `--radius-pill: 999px` para píldoras (eyebrow, section-heading).
- Radios especiales de composición: `.page-container` y welcome usan `rounded-[2.25rem]`.
- Navegación inferior reserva `--bottom-nav-space: calc(4rem + env(safe-area-inset-bottom))`.

## Sombras

- `--elevation-soft: 0 10px 30px color-mix(foreground 12%)`.
- `--card-shadow: 7px 7px 12px color-mix(foreground 20%)` — sombra offset característica (`.card-shadow`).

## Componentes y reglas

- `.page-container`: tarjeta madre redondeada `2.25rem`, borde `white/70`, `bg-card/88`, `sm:px-6 md:w-[80%]`, sombra profunda difusa; en móvil sin backdrop-filter.
- Fondo global: imagen de mapa (`/mapas/mapaMobile.webp` móvil, `mapaDesktop.webp` ≥768px) tras un velo blanco 30–55% (`body::after` en móvil con `.app-header`).
- `.section-heading-icon`: círculo `size-9` verde con icono blanco.
- Tonos por tarjeta: `.tone-info|success|warning|danger-card` = fondo `color-mix` 10% + borde 25%.
- `.incident-list`: grilla 1 col móvil → 2 xl:3, gap 3–4.
- Mapa: controles Leaflet con fondo `--card`, borde `--border`, radio `--radius`, zoom 2.5rem.

## Animación (prefers-reduced-motion: no-preference)

| Keyframes | Valores |
| --- | --- |
| `reporty-reveal-up` | `opacity 0→1`, `translateY(1rem)→0`, 520–600 ms `cubic-bezier(0.22,1,0.36,1)` |
| `reporty-home-enter` | `translateY(1.25rem) scale(0.985)→0/1`, 700 ms, mismo easing (welcome) |
| Stagger de entrada | delays en cascada 70–280 ms (hijos de `.page-container` / `.incident-list`) |
| `reporty-skeleton-shimmer` | gradiente 105°, 1.7 s infinito (delays 100/180 ms) |
| `.scroll-reveal` | transición 520 ms al entrar en viewport |
| Splash TWA nativo | fondo `#2e7d5b`, fade `splashScreenFadeOutDuration: 300` ms |
