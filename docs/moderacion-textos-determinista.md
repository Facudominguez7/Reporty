# Moderación determinista de textos

Reporty valida ciertos textos en el backend antes de guardar publicaciones. La validación no usa IA, APIs externas ni servicios pagos.

## Alcance

- Reportes de incidentes: título y descripción.
- Mascotas perdidas: descripción.
- Diccionario incorporado: español de AllProfanity.
- Complemento local: insultos explícitos y expresiones argentinas bloqueantes.
- Algoritmo: Aho-Corasick.
- Evasiones activadas: mayúsculas, leetspeak, símbolos, letras repetidas, letras separadas y variantes Unicode. El módulo además colapsa repeticiones de tres o más letras antes de una segunda pasada, para cubrir formas como `putooos`.

Las expresiones coloquiales seguras no se agregan al diccionario argentino. El filtro bloquea únicamente coincidencias del diccionario de insultos y devuelve un mensaje genérico; no expone la palabra detectada al usuario.

## Flujo

1. La Server Action recibe y valida la entrada.
2. El módulo server-only `lib/moderation/texto-determinista.server.ts` revisa los campos textuales.
3. Si hay lenguaje ofensivo, la acción devuelve `El texto contiene lenguaje ofensivo. Corregilo antes de publicar.`.
4. Los workflows vuelven a validar como defensa en profundidad antes de persistir.

La dependencia se mantiene en `package.json` como `allprofanity@2.4.0`. El paquete se configura para cargar exclusivamente español; se limpian los idiomas que AllProfanity carga por defecto antes de cargar el diccionario permitido.
