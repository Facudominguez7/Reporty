# Proveedor de moderación (T1: S2, S3, S8, S10)

## Contrato y límites de responsabilidad

`lib/moderation/sightengine.server.ts` exporta
`moderarImagen(archivo: Blob): Promise<ResultadoModeracion>`.
`tipos.ts` define `decision: APPROVED | REJECTED | REVIEW`, `motivos: string[]`,
`operaciones: number` y `proveedor: string`. `decision.ts` es puro y sustituible.
El adaptador no publica, autentica, valida archivos ni reserva cuota.
El consumidor debe reservar **2 operaciones antes de invocarlo**, aplicar deduplicación,
control global de 1 solicitud/segundo y mantener privada cualquier imagen no aprobada.
No hay reintentos automáticos, ni siquiera ante 429, timeout o errores de red.

## Configuración manual exclusiva del servidor

- `SIGHTENGINE_API_USER`, `SIGHTENGINE_API_SECRET`: credenciales reales, nunca públicas.
- `SIGHTENGINE_PLAN_FREE_CONFIRMADO=true`: confirmación manual exacta del plan Free.
  Sin esta confirmación o sin ambas credenciales no se realiza ninguna solicitud.
  Las credenciales no permiten detectar si la cuenta tiene facturación habilitada:
  verificar manualmente el plan y no activar pagos automáticos.
- `MODERACION_UMBRAL_REVISION`: predeterminado `0.5`.
- `MODERACION_UMBRAL_RECHAZO`: predeterminado `0.9`.

Los umbrales deben ser finitos, mayores que cero y menores o iguales que uno;
revisión debe ser menor que rechazo. Configuración inválida produce REVIEW sin red.
Probabilidades no equivalen a certezas. Igualar un umbral activa su regla.
Sexo explícito (`sexual_activity`, `sexual_display`) o contenido gráfico extremo
(`very_bloody`, `body_organ`, `corpse`) en el umbral de rechazo produce REJECTED.
Cualquier otro indicador en el umbral de revisión produce REVIEW, incluidas lesiones,
armas y violencia. **Armas solas nunca rechazan**. `nudity.none` por debajo del umbral
de revisión también requiere revisión. Solo una respuesta completa y segura aprueba.

## Evidencia oficial y campos consumidos

Fuentes verificadas por el orquestador; no se hicieron llamadas reales de clasificación.

- https://sightengine.com/docs/ : POST fijo a
  `https://api.sightengine.com/1.0/check.json`; multipart con `media`, `models`,
  `api_user`, `api_secret`. Modelos: `nudity-2.1,weapon,gore-2.0,violence`.
- https://sightengine.com/docs/advanced-nudity-detection-model-2.1 :
  `nudity.{sexual_activity,sexual_display,erotica,very_suggestive,suggestive,mildly_suggestive,none}`.
- https://sightengine.com/docs/weapon-firearm-knife-detection :
  `weapon.classes.{firearm,firearm_gesture,firearm_toy,knife}`.
- https://sightengine.com/docs/gore-disgusting-horrific-content-detection :
  `gore.prob`, `gore.classes.{very_bloody,slightly_bloody,body_organ,serious_injury,superficial_injury,corpse,skull,unconscious,body_waste,other}`.
- https://sightengine.com/docs/violence-detection-model :
  `violence.prob`, `violence.classes.{physical_violence,firearm_threat,combat_sport}`.

La respuesta combinada debe incluir `status: "success"` y los cuatro objetos.
Todos los indicadores anteriores deben ser números finitos en [0,1]; campos ausentes,
null, cadenas, NaN, infinitos o valores fuera de rango producen REVIEW.
Campos opcionales no usados (`suggestive_classes`, `firearm_action`, `gore.type`, etc.)
no se requieren. No se inventan indicadores ni se interpreta su ausencia como cero.

https://sightengine.com/docs/api-error-codes-and-responses documenta
`status: "failure"`, `request.operations` y `error.{type,code,message}`;
los tipos incluyen `usage_limit`, `plan_error`, `api_error`, `credentials_error`
y `media_error`. Todos producen REVIEW. Nunca se devuelve ni registra `error.message`,
excepciones remotas, credenciales o cuerpos de respuesta.
HTTP no exitoso, JSON inválido, redirección y timeout también producen REVIEW.
El límite total de ocho segundos incluye recepción y análisis del cuerpo; se aborta
la solicitud y no se reintenta.

## Consumo y costo cero

https://sightengine.com/faq/what-is-an-operation documenta dos grupos facturables:
`nudity` (1) y `weapon/gore/violence` (1): **2 operaciones por imagen estática**.
Cuentas legacy anteriores a 2025 pueden diferir.
https://sightengine.com/pricing y https://sightengine.com/faq/if-exceed-a-plan :
Free ofrece **2000 operaciones/mes, 500/día, 1 solicitud/segundo**, archivos hasta 12 MB,
límites duros y sin vencimiento. No multiplicar cuentas gratuitas.
Con dos operaciones por imagen, los máximos teóricos son 1000 imágenes/mes y 250/día,
compartidos con cualquier otro consumo de la cuenta.

`request.operations` se conserva cuando es entero seguro no negativo, incluso cero
u otro valor inesperado. Un valor distinto de 2 añade `operaciones_inesperadas`
y obliga REVIEW; nunca se sustituye por una estimación silenciosa.
Consumo ausente o inválido devuelve `operaciones: 0` junto a
`operaciones_desconocidas`: **no significa que la solicitud fue gratuita**.
El consumidor debe conservar la reserva completa cuando el consumo sea desconocido;
no liberar presupuesto por timeouts. Ausencia de configuración sí evita todo consumo.
La reserva, persistencia, auditoría y reconciliación corresponden a SQL/integración.

## Alternativa evaluada y pruebas

NSFWJS puede servir de ayuda visual gratuita, pero el navegador puede omitirlo y el
payload de modelos aumenta descarga/latencia. No se instala: no sustituye la barrera
servidor ni detecta todas las categorías requeridas. Tampoco se agregan modelos
pesados al servidor de Hostinger ni nuevas dependencias.

Las pruebas usan exclusivamente fetch simulado y respuestas oficiales mínimas.
Cubren decisiones, límites, campos malformados, consumo, configuración, errores,
timeout del cuerpo y ausencia de reintentos. Storage, RLS, publicación, autorización,
concurrencia y compatibilidad legacy requieren las unidades SQL/integración separadas.
