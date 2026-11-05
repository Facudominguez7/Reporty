# Observaciones de Turnstile
Rama: `turnstile/09-design` · Entrega: cadena existente; sin push ni merge autorizados.
Verificación: pruebas enfocadas, Vitest, lint y TypeScript; revisión según riesgo.

## Specs
- S1: "y las observaciones? no las vamos a corregir?"
- S2: "si, hacelo asi"

## Tasks
- T1 — S1-S2 — inline — en curso — observabilidad y pruebas; commit pendiente.
- T2 — S1-S2 — inline — pendiente — contrastar y corregir casos confirmados de interfaz; commit pendiente.
- T3 — S1-S2 — inline — pendiente — completar pruebas justificadas y verificar el conjunto; commit pendiente.

## Log
- L1: y las observaciones? no las vamos a corregir?
- L2: si, hacelo asi
- L3: El usuario aceptó empezar por observabilidad y sus pruebas y abordar por separado los casos de interfaz. Las revisiones anteriores aprobaron sus candidatos; sus observaciones no bloqueantes son trabajo posterior, no reapertura de autoridad.
- L4: T1 en progreso: el guard registra categorías fijas de errores operativos sin datos de entrada. RED de configuración faltante observado antes del cambio; pruebas enfocadas 130 aprobadas. Lint y TypeScript aprobaron; Vitest general 699 aprobadas, 1 omitida y la falla preexistente report-contact-actions. Verificación independiente sin bloqueos, con advertencia de posible amplificación de logs y cobertura pendiente.
