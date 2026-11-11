# Deterministic text moderation
Route: inline implementation on main; no AI, APIs or external moderation services.
Base: current main after contextual text moderation removal.

## Specs
1. S1: "Implementá un filtro determinista de malas palabras en Reporty, utilizando AllProfanity (Aho-Corasick), compatible con nuestro stack Next.js + TypeScript."
2. S2: "Utilizar exclusivamente el diccionario en español, complementado con insultos y expresiones argentinas."
3. S3: "Detectar malas palabras, incluyendo variantes como p3lotudo, b0ludo, letras repetidas, mayúsculas y símbolos."
4. S4: "Crear un módulo reutilizable de moderación."
5. S5: "Validar los siguientes campos:\n\nReportes de incidentes: título y descripción.\n\nReportes de mascotas: descripción."
6. S6: "Ejecutar la validación obligatoriamente en el backend de Next.js (Server Actions o Route Handlers existentes), antes de guardar el reporte."
7. S7: "Si detecta insultos bloqueantes, impedir la publicación y mostrar un mensaje para que el usuario corrija el texto."
8. S8: "Evitar falsos positivos con expresiones coloquiales argentinas."
9. S9: "Importante: revisá la documentación y API real de AllProfanity antes de implementarla. Respetá la arquitectura y los formularios existentes. No utilizar IA, APIs externas, servicios pagos ni servidores adicionales."
10. S10: "Agregá pruebas básicas para ambos tipos de reportes y explicá brevemente los archivos modificados."

## Tasks
- T1 S1-S4: Add and configure AllProfanity in a reusable server-only moderation module. Commit: pending.
- T2 S5-S7: Integrate backend validation before persistence in incident and pet creation. Commit: pending.
- T3 S8-S10: Add focused tests, update user-facing docs/messages, and verify structurally. Commit: pending.

## Log
L1: Bueno, vamos con la siguiente feature: debido a q el analisis de textos mediante ia no funciono, osea daba falsos positivos y demas, vamos a probar con otra alternativa q no contiene ia ni apis: (Implementá un filtro determinista de malas palabras en Reporty, utilizando AllProfanity (Aho-Corasick), compatible con nuestro stack Next.js + TypeScript.

Requisitos:

Utilizar exclusivamente el diccionario en español, complementado con insultos y expresiones argentinas.

Detectar malas palabras, incluyendo variantes como p3lotudo, b0ludo, letras repetidas, mayúsculas y símbolos.

Crear un módulo reutilizable de moderación.

Validar los siguientes campos:

Reportes de incidentes: título y descripción.

Reportes de mascotas: descripción.

Ejecutar la validación obligatoriamente en el backend de Next.js (Server Actions o Route Handlers existentes), antes de guardar el reporte.

Si detecta insultos bloqueantes, impedir la publicación y mostrar un mensaje para que el usuario corrija el texto.

Evitar falsos positivos con expresiones coloquiales argentinas.

Importante: revisá la documentación y API real de AllProfanity antes de implementarla. Respetá la arquitectura y los formularios existentes. No utilizar IA, APIs externas, servicios pagos ni servidores adicionales.

Agregá pruebas básicas para ambos tipos de reportes y explicá brevemente los archivos modificados.)
