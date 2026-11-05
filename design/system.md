# Sistema de diseño de Reporty

Sinopsis del sistema real del proyecto, capturado solo desde fuentes del repo. No incluye
valores inventados: cada entrada nombra el archivo donde se encontró.

**Fuentes leídas**

| Fuente | Aporte |
| --- | --- |
| `app/globals.css` | tokens `:root`, puente `@theme inline`, clases de componente (`auth-shell`, `page-container`, `card-shadow`, tonos semánticos) |
| `app/layout.tsx` | familia tipográfica Geist Sans (`GeistSans.variable` → `--font-geist-sans`) |
| `components.json` | shadcn/ui estilo `new-york`, base neutra, variables CSS activas, iconos Lucide |
| `components/ui/button.tsx` | variantes y tamaños de botón |
| `components/ui/card.tsx` | estructura y elevación de tarjeta |
| `components/ui/input.tsx`, `components/ui/label.tsx` | campos de formulario |
| `components/ui/tabs.tsx` | pestañas tipo píldora |
| `components/ui/alert.tsx` | avisos |
| `components/turnstile-widget.tsx` | widget de verificación y sus microcopias de estado |

---

## 1. Color

39 tokens de color en `:root` (`app/globals.css`). Todos se consumen como variables; ningún
componente escribe valores de color literales.

### 1.1 Base y superficies (19)

| Token | Valor | Uso |
| --- | --- | --- |
| `--background` | `oklch(94.463% 0.00213 14.416)` | fondo neutro claro fuera de las superficies |
| `--foreground` | `oklch(0.19 0.01 95)` | texto principal |
| `--card` | `oklch(1 0 0)` | superficie de tarjeta |
| `--card-foreground` | `oklch(0.19 0.01 95)` | texto sobre tarjeta |
| `--popover` | `oklch(1 0 0)` | superficie flotante |
| `--popover-foreground` | `oklch(0.19 0.01 95)` | texto sobre flotante |
| `--primary` | `oklch(0.57 0.12 157)` | acción principal, enlaces, acentos verdes |
| `--primary-foreground` | `oklch(0.985 0 0)` | texto sobre primario |
| `--secondary` | `#000000` | barra negra, pestaña activa, botón flotante |
| `--secondary-foreground` | `#ffffff` | texto sobre negro |
| `--muted` | `oklch(96.115% 0.00011 271.152)` | fondo de hover y bloques suaves |
| `--muted-foreground` | `oklch(0.45 0.028 157)` | texto secundario, placeholders, iconos |
| `--accent` | `oklch(0.93 0.03 157)` | realce verde claro |
| `--accent-foreground` | `oklch(0.3 0.05 157)` | texto sobre realce |
| `--destructive` | `oklch(0.57 0.18 25)` | error y acciones destructivas |
| `--destructive-foreground` | `oklch(0.985 0 0)` | texto sobre destructivo |
| `--border` | `oklch(78.892% 0.00009 271.152)` | bordes de tarjeta, campo y separadores |
| `--input` | `oklch(96.416% 0.00011 271.152)` | relleno interno de campos y listas de pestañas |
| `--ring` | `oklch(0.62 0.08 230)` | anillo de foco visible (azul) |

### 1.2 Semánticos y superficie sutil (6)

| Token | Valor | Uso |
| --- | --- | --- |
| `--surface-subtle` | `oklch(94.007% 0.00011 271.152)` | bloque apenas más oscuro que la tarjeta |
| `--semantic-info` | `oklch(0.56 0.11 240)` | información, puntos de ranking |
| `--semantic-success` | `oklch(0.57 0.12 157)` | éxito (mismo verde que primario) |
| `--semantic-warning` | `oklch(0.72 0.13 85)` | advertencia |
| `--semantic-danger` | `oklch(0.57 0.18 25)` | peligro (mismo valor que destructivo) |
| `--semantic-admin` | `oklch(0.5 0.1 285)` | rol administrador, acento de categoría |

### 1.3 Ranking, prioridad y mapa (14)

| Token | Valor |
| --- | --- |
| `--ranking-first` | `oklch(0.76 0.14 84)` |
| `--ranking-second` | `oklch(0.66 0.01 250)` |
| `--ranking-third` | `oklch(0.61 0.09 50)` |
| `--ranking-points` | `var(--semantic-info)` |
| `--priority-high` | `var(--semantic-danger)` |
| `--priority-medium` | `oklch(0.72 0.16 55)` |
| `--priority-low` | `var(--semantic-info)` |
| `--category-accent` | `var(--semantic-admin)` |
| `--map-heat-high` | `var(--semantic-danger)` |
| `--map-heat-medium` | `var(--semantic-warning)` |
| `--map-heat-low` | `var(--semantic-info)` |
| `--map-heat-neutral` | `var(--muted-foreground)` |
| `--map-marker-stroke` | `var(--card)` |
| `--map-marker-foreground` | `var(--card)` |

---

## 2. Tipografía

| Entrada | Valor | Fuente |
| --- | --- | --- |
| Familia | Geist Sans, expuesta como `--font-geist-sans` y consumida por `--font-sans` en `@theme inline` | `app/layout.tsx`, `app/globals.css` |
| Fallback del sistema | el proyecto no declara otras familias; Geist se sirve desde el paquete `geist/font/sans` (sin URL externa) | `app/layout.tsx` |
| Antialiasing | `antialiased` en `body`, con `font-feature-settings: "cv02","cv03","cv04","cv11"` | `app/globals.css` |

### Escala observada

| Rol | Clases | Fuente |
| --- | --- | --- |
| Etiqueta meta | `text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground` | `app/globals.css` (`.page-meta-label`) |
| Ayuda / estado | `text-xs text-muted-foreground` | `app/auth/page.tsx`, `components/turnstile-widget.tsx` |
| Cuerpo secundario | `text-sm leading-6 text-muted-foreground` | `app/globals.css` (`.section-copy`, `CardDescription`) |
| Cuerpo medio (desktop) | `md:text-base` | `app/globals.css` (`.section-copy`) |
| Título de tarjeta | `text-xl font-semibold tracking-tight leading-tight` | `app/auth/page.tsx`, `components/ui/card.tsx` |
| Título de sección | `text-2xl md:text-3xl lg:text-4xl font-semibold tracking-tight` | `app/globals.css` (`.section-title`) |
| Separador con texto | `text-xs uppercase tracking-[0.2em] text-muted-foreground` | `app/auth/page.tsx` |
| Eyebrow de sección | `text-[0.7rem] font-semibold uppercase tracking-[0.18em]` | `app/globals.css` (`.section-eyebrow`) |
| Pesos usados | `font-medium`, `font-semibold` | `components/ui/button.tsx`, `components/ui/label.tsx`, `components/ui/card.tsx` |

---

## 3. Espaciado, radio y elevación

| Grupo | Token | Valor | Fuente |
| --- | --- | --- | --- |
| Radio base | `--radius` | `0.75rem` | `app/globals.css` |
| Radio derivado | `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl` | `var(--radius)` (los cuatro) | `app/globals.css` |
| Radio píldora | `--radius-pill` | `999px` | `app/globals.css` |
| Radio de contenedor de página | `rounded-[2.25rem]` | `36px` | `app/globals.css` (`.page-container`) |
| Sombra de tarjeta | `--card-shadow` | `7px 7px 12px color-mix(in oklab, var(--foreground) 20%, transparent)` | `app/globals.css` |
| Sombra suave | `--elevation-soft` | `0 10px 30px color-mix(in oklab, var(--foreground) 12%, transparent)` | `app/globals.css` |
| Sombra de contenedor | `shadow-[0_22px_70px_-32px_color-mix(in_oklab,var(--foreground)_45%,transparent)]` | — | `app/globals.css` (`.page-container`) |
| Espacio de navegación inferior | `--bottom-nav-space` | `calc(4rem + env(safe-area-inset-bottom))` | `app/globals.css` |
| Espaciado de formulario | `space-y-4` (campos), `space-y-5` (bloques), `space-y-2` (etiqueta + control) | — | `app/auth/page.tsx` |
| Padding de tarjeta | `Card` `py-4`, `CardHeader` `px-5`, `CardContent` `px-5` | — | `components/ui/card.tsx` |

---

## 4. Reglas de componentes

### Botón (`components/ui/button.tsx`)

- Base: `inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium`,
  altura mínima por tamaño, `disabled:opacity-50 disabled:pointer-events-none`.
- Foco: `focus-visible:ring-2 ring-ring ring-offset-2 ring-offset-background`.
- Variantes en uso real: `default` (`bg-primary text-primary-foreground`), `outline`
  (`border-border bg-background text-foreground hover:bg-muted`), `muted` (iconos dentro de
  campos), `secondary`, `neutral`, `filter`, `floating`, `ghost`.
- Tamaños: `default` `min-h-10 px-4`, `sm` `min-h-9`, `lg` `min-h-11`, `icon` `size-10`,
  `icon-sm` `size-8`.
- Un botón de envío deshabilitado nunca cambia su etiqueta: sigue diciendo `Ingresar`.

### Tarjeta (`components/ui/card.tsx`)

- `bg-card text-card-foreground flex flex-col gap-4 rounded-[var(--radius)] border border-border py-4 shadow-[var(--card-shadow)]`.
- La sombra desplazada (7px/7px) es la firma visual del sistema: no se reemplaza por sombras difusas.
- `CardTitle` `leading-tight font-semibold tracking-tight`; `CardDescription` `text-sm text-muted-foreground leading-6`.

### Campo de texto (`components/ui/input.tsx`) y etiqueta (`components/ui/label.tsx`)

- `Input`: `min-h-10 rounded-[var(--radius-md)] border-input bg-input px-3 py-2 text-sm`.
- Foco: `focus-visible:border-foreground focus-visible:ring-2 ring-ring ring-offset-2`.
- Error: `aria-invalid:ring-destructive/20 aria-invalid:border-destructive`.
- Icono decorativo dentro del campo a la izquierda con `pl-10`; acción de ojo a la derecha con `pr-10`.
- `Label`: `text-sm font-medium`, siempre asociada por `htmlFor`.

### Pestañas (`components/ui/tabs.tsx`)

- Lista: `inline-flex rounded-[var(--radius-pill)] border border-border bg-input p-1 card-shadow`.
- Disparador activo: `data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground` (negro sobre blanco).
- Disparador inactivo: texto `--foreground` sobre `--input`, `min-h-9`.

### Aviso (`components/ui/alert.tsx`)

- `rounded-lg border px-4 py-3 text-sm`; variante `destructive`: texto en `--destructive` sobre `--card`.
- `AlertTitle` `font-medium tracking-tight` en una línea; `AlertDescription` `text-sm`.

### Cáscara de autenticación (`app/globals.css`)

- `.auth-shell`: columna flex, centrada en el eje seguro, `overflow-y: auto`, fondo de mapa
  (`--map-background`) cubierto con un degradado blanco `0.3 → 0.55`.
- La tarjeta se limita a `max-w-md` (`28rem`) y lleva `px-4 py-6` de respiro.
- `.page-container`: `rounded-[2.25rem] border-white/70 bg-card/88 backdrop-blur-sm`, ancho `80%` desde `md`.

### Verificación de seguridad (`components/turnstile-widget.tsx`)

- El widget se monta en un contenedor `min-h-[65px]` y se apoya en una línea de estado
  `text-xs` (`role="status"`, `aria-live="polite"`).
- Microcopias reales: `Verificación de seguridad` (en reposo),
  `Verificación de seguridad completada.` (con token),
  `No pudimos completar la verificación de seguridad.` (error),
  `No pudimos cargar la verificación de seguridad. Revisá tu conexión y recargá la página.` (sin script).
- En error aparece un botón `outline` `sm` con `Reintentar la verificación`.
- El token es de un solo uso: tras cada intento se pide un desafío nuevo (`resetSignal`).
- El envío permanece deshabilitado mientras no haya token.

### Contraste y foco

- Todos los controles interactivos llevan anillo `--ring` de 2 px con separación de 2 px.
- Texto secundario `--muted-foreground` sobre `--card` blanco: contraste AA verificado en las
  artboards (relación usada por el sistema, no se oscurece ni se aclara).
