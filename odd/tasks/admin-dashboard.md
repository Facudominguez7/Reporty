# Admin dashboard
Route and responsive administration surface for Reporty.
Read this document through `## Log` before implementing; preserve the existing shadcn/Tailwind conventions and server-side authorization boundaries.

## Specs

### S1 — Separate administrator workspace
> "La idea es hacer una ruta nueva que sea /admin por ejemplo, y que requeira inicio de sesion claramente, y bueno se verificaria q tengas el rol id 3 o 4 no se bien cual es el de admin q tenemos en supabase. Y luego lleve a un dashboard entero."

The implementation must use the repository's actual authorization catalog: Admin is `rol_id = 1`; `rol_id = 3` is Interesado and `rol_id = 4` is Operador. `/admin` is Admin-only.

### S2 — Responsive dashboard
> "Tiene que ser comodo para usarse tanto en desktop como en mobile"

The administration shell must provide usable navigation and content at desktop and mobile widths, using the existing shadcn/Tailwind stack and Reporty tokens from `app/globals.css`.

### S3 — Report operations
> "La idea es mostrar el listado de reportes, con opciones rapidas de cambio, como borrado del reporte, cambio de estado, obviamente rpesionandolo nos llevaria al detalle de ese reporte, etc."

Provide a paginated/filterable administrative report list with links to existing report details and guarded quick actions for status changes and soft deletion.

### S4 — Review queue
> "por otro lado un boton de revisiones pendientes, q serian las imagenes q hay q aprobar q quedaron pendientes"

Expose the existing private image moderation queue inside the admin workspace without weakening its server-side authorization or private-storage boundary.

### S5 — Users and metrics navigation
> "En el lado izquierdo tambien podriamos tener todo el listado de usuarios, cosa de bloquearlos si quisieramos, o darlos de baja nose."

Include navigation for users and metrics. User blocking/deletion must not be invented without a safe backend policy; keep unsupported actions unavailable until implemented with an explicit server-side boundary.

### S6 — Visual direction
> "obviamente evita colores y cosas q tenga esa iamgen porque es solo de referencia, nosotros usariamos nuestros colores principales de globalss.css."

Use the existing Reporty color variables, typography, radii, shadows, and shadcn components. The supplied image is structural inspiration only.

## Tasks
- T1 [S1-S2] Add Admin-only route guard, responsive layout, navigation, and dashboard overview. Route: `app/admin/**`; Commit: pending; Design: `design/admin-dashboard/01-command-center.html` chosen, other artboards remain alternatives.
- T2 [S3] Add admin report query/list with filters, pagination, and guarded quick actions. Route: `database/queries/admin/**`, `app/admin/reportes/**`, `components/admin/**`; Commit: pending.
- T3 [S4] Integrate existing moderation queue under `/admin/moderacion`. Route: `app/admin/moderacion/**`; Commit: pending.
- T4 [S5] Add safe user/metrics route boundaries and implement only supported metrics. Route: `app/admin/usuarios/**`, `app/admin/metricas/**`; Commit: pending.
- T5 [S1-S6] Verify responsive behavior, authorization, tests, lint, and build. Route: tests and docs; Commit: pending.

## Log
L1: "dale vamos. Tiene que ser comodo para usarse tanto en desktop como en mobile, yo nose si shadcn o ese tipo de librerias q venimos usando tienen compoenntes armados ya de dashboards como para que uses uno y bueno alli vayas modificandolo"
L2: Created `design/admin-dashboard/` with `01-command-center.html`, `02-report-operations.html`, and `03-mobile-first.html`; `01-command-center.html` is the chosen implementation direction and the others are alternatives.
L3: Implemented the Admin shell, `/admin/reportes`, `/admin/moderacion`, `/admin/metricas`, and a safe non-destructive `/admin/usuarios` boundary using shadcn/Tailwind and existing Reporty tokens.
L4: Verification: focused Vitest suites passed (3 files, 9 tests); scoped ESLint passed; `pnpm exec tsc --noEmit` passed; `pnpm run build` passed and generated `/admin`, `/admin/metricas`, `/admin/moderacion`, `/admin/reportes`, and `/admin/usuarios`; `git diff --check` passed. No commit created.
