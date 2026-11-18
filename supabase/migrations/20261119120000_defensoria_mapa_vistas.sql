-- Mapa y ficha para «Tomado por Defensoría» (S8, S9 del feature odd/tasks/defensoria-reclamos.md).
--
-- 1) El mapa hoy muestra solo reportes Pendientes; si no se incluye el estado 4, el reporte
--    desaparece del mapa justo cuando más esperanza da. Se amplía el filtro del mapa en la app.
-- 2) La vista pública del estado operativo filtra r.estado_id = 1: un reporte tomado por
--    Defensoría perdería su chip operativo de cuadrilla si una cuadrilla trabajó antes.
--    El filtro pasa a incluir el estado 4 (mismo criterio: solo estados abiertos).
-- 3) Nueva vista pública con el número de reclamo (allowlist de columnas, security_invoker
--    false, lectura pública): la ficha y la bandeja leen el reclamo sin exponer tablas base.

-- La vista del estado operativo pasa a incluir los reportes tomados por Defensoría (estado 4),
-- que siguen abiertos administrativamente: su chip de cuadrilla no debe desaparecer.
CREATE OR REPLACE VIEW "public"."reportes_estado_operativo_publico" WITH ("security_invoker"='false') AS
 SELECT "a"."reporte_id",
    "a"."estado_operativo",
    "c"."nombre" AS "cuadrilla_nombre",
    "a"."updated_at" AS "actualizado_at"
   FROM (("public"."asignaciones_cuadrilla" "a"
     JOIN "public"."cuadrillas" "c" ON (("c"."id" = "a"."cuadrilla_id")))
     JOIN "public"."reportes" "r" ON (("r"."id" = "a"."reporte_id")))
  WHERE (("a"."estado_operativo" <> 'cerrada'::"text") AND ("r"."deleted_at" IS NULL) AND ("r"."estado_id" IN (1, 4)));

COMMENT ON VIEW "public"."reportes_estado_operativo_publico" IS
  'Proyeccion publica segura del estado operativo vigente de un reporte: expone solo reporte_id, estado_operativo, cuadrilla_nombre y actualizado_at (allowlist de columnas), nunca las tablas base. security_invoker = false es obligatorio porque asignaciones_cuadrilla/cuadrillas son staff-only bajo RLS: con true esta vista devolveria cero filas para ciudadanos y visitantes anonimos. La seguridad viene de la allowlist de columnas y del filtro r.estado_id IN (1, 4), no del RLS del invocador. El filtro garantiza que un reporte ya cerrado administrativamente (Reparado o Rechazado) nunca muestre un chip operativo desactualizado; el estado 4 (Tomado por Defensoria) sigue abierto y mantiene su chip.';

-- Número de reclamo público por reporte: mismo patrón de allowlist de la vista operativa.
-- Solo expone el identificador del reclamo y su fecha; nunca tomado_por ni datos de contacto.
CREATE OR REPLACE VIEW "public"."reclamos_defensoria_publico" WITH ("security_invoker"='false') AS
 SELECT "rd"."reporte_id",
    "rd"."numero_reclamo",
    "rd"."tomado_at"
   FROM "public"."reclamos_defensoria" "rd"
   JOIN "public"."reportes" "r" ON (("r"."id" = "rd"."reporte_id"))
  WHERE "r"."deleted_at" IS NULL;

COMMENT ON VIEW "public"."reclamos_defensoria_publico" IS
  'Proyeccion publica del reclamo de Defensoria por reporte: expone solo reporte_id, numero_reclamo y tomado_at (allowlist de columnas). Es la evidencia visible en la ficha y el mapa (S9); nunca expone tomado_por ni el contacto del autor. security_invoker = false porque reclamos_defensoria es staff-escritura; la lectura publica viene de la grant anon/authenticated sobre la vista.';

grant select on table public.reclamos_defensoria_publico to anon, authenticated;
