-- Privacidad de los reclamos de la Defensoría del Pueblo (S9 del feature
-- odd/tasks/defensoria-reclamos.md, tarea T10).
--
-- El número de reclamo solo lo ve el autor del reporte y el panel autorizado de la
-- Defensoría. Esta migración:
-- Restringe las columnas y filas del reclamo, retira su vista pública y
-- quita del historial los comentarios de tomas que incluían el número.

drop policy if exists "reclamos_defensoria_public_read" on public.reclamos_defensoria;

revoke select on table public.reclamos_defensoria from anon, authenticated;

-- Grant por columna para authenticated: el número y la fecha del reclamo, sin tomado_por
-- (quién tomó es dato interno del staff; la app de aplicación no lo necesita).
grant select (reporte_id, numero_reclamo, tomado_at) on table public.reclamos_defensoria to authenticated;

create policy "reclamos_defensoria_autor_o_defensoria_select"
  on public.reclamos_defensoria
  for select to authenticated
  using (
    exists (
      select 1 from public.reportes r
      where r.id = reclamos_defensoria.reporte_id and r.deleted_at is null
        and (
          r.usuario_id = (select auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = (select auth.uid()) and p.rol_id = 6
          )
        )
    )
  );

comment on table public.reclamos_defensoria is
  'Tomas de la Defensoría del Pueblo: un único reclamo por reporte con el número emitido por su sistema externo. Lectura restringida (S9): solo el autor del reporte y el staff de la Defensoría (rol 6) pueden leer el número; el público ve únicamente el estado Tomado por Defensoría. Escritura solo service role desde la acción de tomar.';

comment on policy "reclamos_defensoria_autor_o_defensoria_select" on public.reclamos_defensoria is
  'S9: el número de reclamo solo lo ve el autor del reporte y la Defensoría autorizada. Anónimos no tienen grant ni policy.';

-- ---------------------------------------------------------------------------------------------
-- 3) La vista pública deja de existir: ninguna lectura pública pasa por ella.
--    El código de aplicación que la consultaba (mapa) fue retirado junto con esta migración.
-- ---------------------------------------------------------------------------------------------

drop view if exists public.reclamos_defensoria_publico;

-- Las tomas anteriores incluían el número en el historial público.
update public.historial_estados
set comentario = 'Tomado por la Defensoría del Pueblo'
where estado_nuevo_id = 4 and comentario ~* 'reclamo';
