# Scroll performance and page animations
Owner: Reporty
Status: active

## Specs
1. **S1** — "Algo que quiero que veas en todo el sitio (salvo toda la parte de admin) es porque se ve como lagueado, osea se ve como si fuese a bajos fps, es rarisimo, no se por que... siento q no es por tema de queries, nose se q es lo q lo hace lento, y tambien me gustaria agregarle animaciones, viste esas animaciones cuando vas scrolleando en una landing q van apareciendo? bueno eso.. pero no algo q la alente mas, primero veria el porque se ve como lento el sitio cdo scrolleas por ejemplo, tipo q se ve con bajos fps, en prod pasa lo mismo.., fijate, y bueno agregariamos animaciones en todas las pages, quizas la de mapa no, pero reportes, comunidad, crear, cuenta etc, si, y en sus subpaginas tambien"

## Tasks
- T1 (S1) — Audit shared scroll/rendering costs before animation work — commit pending; runtime trace unavailable
- T2 (S1) — Apply the smallest candidate performance correction — commit pending; removed fixed public background layers
- T3 (S1) — Add restrained scroll-reveal animations outside admin and map — commit pending
- T4 (S1) — Run focused checks and record runtime verification limits — commit pending
- T5 (S1) — Improve public loading skeleton feedback — commit pending

## Log
- L1 — "Algo que quiero que veas en todo el sitio (salvo toda la parte de admin) es porque se ve como lagueado, osea se ve como si fuese a bajos fps, es rarisimo, no se por que... siento q no es por tema de queries, nose se q es lo q lo hace lento, y tambien me gustaria agregarle animaciones, viste esas animaciones cuando vas scrolleando en una landing q van apareciendo? bueno eso.. pero no algo q la alente mas, primero veria el porque se ve como lento el sitio cdo scrolleas por ejemplo, tipo q se ve con bajos fps, en prod pasa lo mismo.., fijate, y bueno agregariamos animaciones en todas las pages, quizas la de mapa no, pero reportes, comunidad, crear, cuenta etc, si, y en sus subpaginas tambien"
- L2 — Code audit and explorer evidence identified fixed body/mobile background layers, global smooth scrolling, and shared blur as candidates. Removed `background-attachment: fixed` and changed the mobile public background pseudo-element from fixed to absolute in `app/globals.css`; runtime FPS and visual verification remain pending because Chrome DevTools tools are not exposed to this model session.
- L3 — The user reported no perceptible improvement. Reverted the fixed-background experiment and disabled `backdrop-filter` only for public `.page-container` surfaces, preserving admin behavior; runtime verification remains pending.
- L4 — Added CSS-native scroll-driven reveal animations using only opacity and transform, gated by `prefers-reduced-motion: no-preference` and `@supports (animation-timeline: view())`; scoped to public page content and incident cards, excluding admin and map. Also gated smooth scrolling behind the same motion preference.
- L5 — "Los skeleton de cada page podrias mejorarlos tambien, q se note q esta cargando algo entendes?"
