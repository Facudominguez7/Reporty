-- Contrato de privacidad de los reclamos de la Defensoría del Pueblo (S9, tarea T10).
--
-- Verifica, sobre el esquema compuesto con las migraciones aplicadas, que:
--   1) anon y authenticated no tienen SELECT a nivel de tabla sobre reclamos_defensoria;
--   2) authenticated solo puede leer las columnas públicas del reclamo (sin tomado_por);
--   3) la vista pública reclamos_defensoria_publico ya no existe;
--   4) la policy vigente es «autor o Defensoría» y solo para authenticated;
--   5) la redacción del historial deja cero comentarios del estado 4 con «reclamo».
--
-- El ejecutor abre una transacción, compone el esquema vigente, ejecuta este
-- archivo y revierte: nada queda aplicado a la base local.
\set ON_ERROR_STOP on

-- Exige una condición verdadera; falla con el mensaje indicado.
create function pg_temp.exigir(ok boolean, mensaje text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', mensaje; end if; end $$;

-- 1) Sin SELECT de tabla para roles de aplicación; el anon ni siquiera tiene grant.
do $$
begin
  perform pg_temp.exigir(not has_table_privilege('anon', 'public.reclamos_defensoria', 'select'),
    'anon todavía puede leer reclamos_defensoria');
  perform pg_temp.exigir(not has_table_privilege('authenticated', 'public.reclamos_defensoria', 'select'),
    'authenticated tiene SELECT de tabla completa sobre reclamos_defensoria');
end $$;

-- 2) Grant por columna: número y fecha sí; quién tomó (tomado_por), no.
do $$
begin
  perform pg_temp.exigir(has_column_privilege('authenticated', 'public.reclamos_defensoria', 'numero_reclamo', 'select'),
    'authenticated no puede leer numero_reclamo');
  perform pg_temp.exigir(has_column_privilege('authenticated', 'public.reclamos_defensoria', 'tomado_at', 'select'),
    'authenticated no puede leer tomado_at');
  perform pg_temp.exigir(not has_column_privilege('authenticated', 'public.reclamos_defensoria', 'tomado_por', 'select'),
    'authenticated no debería leer tomado_por');
  perform pg_temp.exigir(not has_column_privilege('anon', 'public.reclamos_defensoria', 'numero_reclamo', 'select'),
    'anon no debería leer ninguna columna del reclamo');
end $$;

-- 3) La vista pública fue retirada: ninguna lectura pública pasa por ella.
do $$
begin
  perform pg_temp.exigir(to_regclass('public.reclamos_defensoria_publico') is null,
    'la vista pública reclamos_defensoria_publico sigue existiendo');
end $$;

-- 4) Policy vigente: «autor o Defensoría», SELECT, solo para authenticated.
do $$
declare v_roles text; v_comando text;
begin
  select array_to_string(roles, ', '), cmd
    into strict v_roles, v_comando
    from pg_policies
   where schemaname = 'public' and tablename = 'reclamos_defensoria';

  perform pg_temp.exigir(v_roles = 'authenticated',
    'la policy de reclamos_defensoria debe aplicar solo a authenticated, es: ' || coalesce(v_roles, '?'));
  perform pg_temp.exigir(v_comando = 'SELECT',
    'la policy vigente de reclamos_defensoria no es de SELECT');
  perform pg_temp.exigir(exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'reclamos_defensoria'
       and policyname = 'reclamos_defensoria_autor_o_defensoria_select'
  ), 'falta la policy reclamos_defensoria_autor_o_defensoria_select');
end $$;

-- 5) La redacción del historial deja el estado 4 sin números de reclamo expuestos.
do $$
begin
  perform pg_temp.exigir(not exists (
    select 1 from public.historial_estados
     where estado_nuevo_id = 4 and comentario is not null and comentario ~* 'reclamo'
  ), 'el historial del estado 4 todavía expone números de reclamo');
end $$;
