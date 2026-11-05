# Observaciones de Turnstile
Rama: `turnstile/09-design` · Entrega: cadena existente; sin push ni merge autorizados.
Verificación: pruebas enfocadas, Vitest, lint y TypeScript; revisión según riesgo.

## Specs
- S1: "y las observaciones? no las vamos a corregir?"
- S2: "si, hacelo asi"

## Tasks
- T1 — S1-S2 — inline — pendiente de cierre — observabilidad y pruebas; commit a1f33d8, revisión nativa aprobada; falla preexistente de suite pendiente.
- T2 — S1-S2 — inline — hecho — reintento del widget (commit fe16c3d, revisión nativa review-992d4ac694d8f822 aprobada) y aviso en el diálogo de comentarios (commit de esta unidad); ambos verificados con Playwright.
- T3 — S1-S2 — inline — pendiente — completar pruebas justificadas y verificar el conjunto; commit pendiente.

## Log
- L1: y las observaciones? no las vamos a corregir?
- L2: si, hacelo asi
- L3: El usuario aceptó empezar por observabilidad y sus pruebas y abordar por separado los casos de interfaz. Las revisiones anteriores aprobaron sus candidatos; sus observaciones no bloqueantes son trabajo posterior, no reapertura de autoridad.
- L4: T1 en progreso: el guard registra categorías fijas de errores operativos sin datos de entrada. RED de configuración faltante observado antes del cambio; pruebas enfocadas 132 aprobadas. Lint y TypeScript aprobaron; Vitest general 699 aprobadas, 1 omitida y la falla preexistente report-contact-actions. Verificación independiente sin bloqueos; revisión nativa review-5cc6764dcec479c1 aprobada y reconocida, con advertencia de posible amplificación de logs.
- L5: T2. Un worker de comentarios fue cancelado al cerrarse la sesión y dejó `comments-section.tsx` sin compilar; su borrador se respaldó en `.git/respaldos-observaciones/` y el archivo se restauró. El widget ofrece reintento cuando la API de Cloudflare llega después de los 20 s: RED/GREEN en Vitest; el verificador independiente bloqueó por romper la firma posicional exportada de `esperarApiTurnstile`, corregida con sobrecargas (RED 4 → GREEN). Playwright en servidor aislado (puerto 3100, clave de prueba, API de Cloudflare simulada): agotamiento visible, reintento y un solo montaje con verificación completada. Diálogo de comentarios: regla `debeAvisarVerificacionVencida` (RED por módulo ausente → GREEN 5/5) y aviso accesible dentro del diálogo. Playwright con usuario temporal en Supabase local, reporte 74: antes del vencimiento sin aviso y botón habilitado; después, aviso con `role=alert` y botón deshabilitado; Cancelar conserva la selección. No se publicó ningún comentario; el usuario temporal se eliminó (0 usuarios de prueba, 0 perfiles) y se retiraron los worktrees de prueba. Ambas pruebas usan una API de Turnstile simulada: no verifican la integración real con Cloudflare.
- L6: Verificación final antes de commitear: lint sin errores (7 advertencias previas), tsc sin errores, Vitest 717 aprobadas, 1 omitida y la falla preexistente report-contact-actions. Revisión nativa del widget aprobada con observaciones no bloqueantes: R3-positional-options-ignored (turnstile-widget.tsx:419), R3-retry-wiring-unproved y R3-cancel-guard-overstated.
