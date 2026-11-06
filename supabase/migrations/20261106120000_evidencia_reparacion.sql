-- Evidencia fotográfica y verificación comunitaria de reparaciones (issue #145).
-- Frontera incremental: no se editan migraciones aplicadas ni se reclasifican
-- fotografías, votos o historiales anteriores. El flujo nuevo reemplaza el voto
-- comunitario «reparado»; el voto «no existe» y el cierre directo de Admin/Operador
-- siguen intactos. Ningún cliente escribe estado: todo pasa por RPC de service_role.

-- ============================================================================
-- Tablas nuevas
-- ============================================================================

-- Evidencia de reparación informada por una cuenta registrada. La foto se carga
-- en la cola privada de moderación y solo se publica cuando la moderación la
-- aprueba; los estados activos son «informada» y «en_verificacion».
create table public.evidencias_reparacion (
  id uuid primary key default gen_random_uuid(),
  reporte_id bigint not null references public.reportes(id) on delete restrict,
  autor_id uuid not null references public.profiles(id) on delete restrict,
  comentario text not null,
  estado text not null default 'informada'
    check (estado in ('informada','en_verificacion','validada','rechazada','revertida')),
  url text,
  bucket text check (bucket is null or bucket = 'reportes'),
  path text,
  thumbnail_url text,
  thumbnail_bucket text check (thumbnail_bucket is null or thumbnail_bucket = 'reportes'),
  thumbnail_path text,
  created_at timestamptz not null default clock_timestamp(),
  publicada_at timestamptz,
  resuelta_at timestamptz,
  resuelta_por uuid references public.profiles(id) on delete set null,
  motivo_resolucion text,
  check (char_length(btrim(comentario)) between 1 and 500),
  -- «informada» espera moderación: todavía no hay foto pública. La verificación
  -- exige foto publicada; una aprobación administrativa puede resolverla antes.
  check (estado <> 'informada' or publicada_at is null),
  check (estado <> 'en_verificacion' or publicada_at is not null),
  -- La foto pública se completa entera o queda ausente.
  check ((url is null) = (bucket is null) and (url is null) = (path is null)),
  check ((thumbnail_url is null) = (thumbnail_path is null)),
  -- Los estados resueltos conservan su fecha de resolución (S9).
  check ((estado in ('validada','rechazada','revertida')) = (resuelta_at is not null))
);
comment on table public.evidencias_reparacion is
'Evidencia fotográfica de reparación por reporte; estados informada→en_verificacion→validada|rechazada|revertida. Solo service_role escribe.';
comment on column public.evidencias_reparacion.estado is
'informada = foto en moderación; en_verificacion = foto publicada; validada|rechazada|revertida = resuelta.';
comment on column public.evidencias_reparacion.motivo_resolucion is
'Motivo legible de la resolución (impugnación aceptada, moderación o administración).';

-- Una sola evidencia activa por reporte (S7: evita duplicados y spam).
create unique index evidencias_reparacion_activa_unica
  on public.evidencias_reparacion (reporte_id)
  where estado in ('informada','en_verificacion');
create index evidencias_reparacion_autor_fecha
  on public.evidencias_reparacion (autor_id, created_at desc);

-- Confirmaciones e impugnaciones de una evidencia. Una cuenta deja una sola
-- verificación por evidencia, así que confirmar e impugnar se excluyen (S7).
create table public.verificaciones_reparacion (
  id uuid primary key default gen_random_uuid(),
  evidencia_id uuid not null references public.evidencias_reparacion(id) on delete restrict,
  usuario_id uuid not null references public.profiles(id) on delete restrict,
  tipo text not null check (tipo in ('confirmacion','impugnacion')),
  motivo text,
  estado text not null default 'pendiente' check (estado in ('pendiente','aceptada','descartada')),
  resuelta_at timestamptz,
  resuelta_por uuid references public.profiles(id) on delete set null,
  motivo_resolucion text,
  created_at timestamptz not null default clock_timestamp(),
  unique (evidencia_id, usuario_id),
  -- Solo las impugnaciones se resuelven y solo ellas llevan motivo (S4, S12).
  check (tipo = 'impugnacion' or (motivo is null and estado = 'pendiente')),
  check (tipo <> 'impugnacion' or char_length(btrim(coalesce(motivo,''))) between 1 and 500),
  check ((estado = 'pendiente') = (resuelta_at is null)),
  check (estado = 'pendiente' or resuelta_por is not null)
);
comment on table public.verificaciones_reparacion is
'Confirmaciones e impugnaciones por evidencia; una fila por usuario y evidencia. Solo service_role escribe.';
comment on column public.verificaciones_reparacion.motivo is
'Motivo obligatorio de la impugnación; nunca se reescribe al resolver.';
comment on column public.verificaciones_reparacion.motivo_resolucion is
'Motivo del administrador al aceptar o descartar la impugnación.';
create index verificaciones_reparacion_conteo
  on public.verificaciones_reparacion (evidencia_id, tipo, estado);

-- RLS sin políticas de cliente: el acceso queda denegado a anon/authenticated.
alter table public.evidencias_reparacion enable row level security;
alter table public.verificaciones_reparacion enable row level security;
revoke all on public.evidencias_reparacion, public.verificaciones_reparacion
  from public, anon, authenticated, service_role;
-- Sin DELETE: el historial de evidencias y verificaciones se conserva (S9).
grant select, insert, update on public.evidencias_reparacion, public.verificaciones_reparacion
  to service_role;

-- ============================================================================
-- Enlace con el sistema de moderación existente
-- ============================================================================

-- La cola de moderación pasa a tener dos destinos; «reporte» conserva el
-- comportamiento actual (fotos de reporte publicadas en fotos_reporte).
alter table public.moderacion_imagenes
  add column destino text not null default 'reporte'
    check (destino in ('reporte','evidencia_reparacion')),
  add column evidencia_id uuid references public.evidencias_reparacion(id) on delete restrict;
alter table public.moderacion_imagenes
  add constraint moderacion_imagenes_destino_coherente
  check ((destino = 'evidencia_reparacion') = (evidencia_id is not null));
create unique index moderacion_imagenes_evidencia_unica
  on public.moderacion_imagenes (evidencia_id)
  where evidencia_id is not null;
comment on column public.moderacion_imagenes.destino is
'reporte = foto del reporte (comportamiento histórico); evidencia_reparacion = foto de evidencia de reparación.';
comment on column public.moderacion_imagenes.evidencia_id is
'Evidencia de reparación asociada; obligatoria si destino = evidencia_reparacion.';

-- Rechazar una foto de evidencia NO retira el reporte: solo invalida la evidencia.
create or replace function moderacion_privada.retirar_reporte_rechazado()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_email text; v_invitado boolean; v_premio public.puntos_creacion_reporte%rowtype;
begin
  -- El retiro aplica únicamente a las fotos del reporte, nunca a la evidencia.
  if new.destino = 'evidencia_reparacion' then return new; end if;
  if new.decision <> 'REJECTED' or old.decision = 'REJECTED' then return new; end if;
  update public.reportes set deleted_at=coalesce(deleted_at,clock_timestamp())
    where id=new.reporte_id;
  update public.puntos_creacion_reporte set revertido_at=clock_timestamp()
    where reporte_id=new.reporte_id and revertido_at is null returning * into v_premio;
  if found then
    perform public.adjust_profile_points_atomic(v_premio.propietario_id,-v_premio.cantidad,
      'Retiro por fotografía rechazada');
  end if;
  select nullif(btrim(u.email),''), coalesce(u.is_anonymous,false) or p.rol_id=5
    into v_email,v_invitado from public.profiles p join auth.users u on u.id=p.id
    where p.id=new.propietario_id;
  insert into public.avisos_retiro_reporte(reporte_id,propietario_id,destinatario,estado,omision)
    values (new.reporte_id,new.propietario_id,
      case when v_invitado then null else v_email end,
      case when v_invitado or v_email is null then 'omitido' else 'pendiente' end,
      case when v_invitado then 'invitado' when v_email is null then 'sin_correo' end)
    on conflict (reporte_id) do nothing;
  return new;
end;
$$;

-- Propiedad: fotos de reporte siguen exigiendo al autor del reporte; la evidencia
-- exige que propietario y reporte coincidan con la evidencia referenciada.
create or replace function public.validar_propietario_moderacion()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_deleted timestamp; v_estado text;
begin
  if tg_op = 'UPDATE' and (new.id,new.reporte_id,new.propietario_id,new.hash_sha256,new.path_privado,
      new.destino,new.evidencia_id) is distinct from
      (old.id,old.reporte_id,old.propietario_id,old.hash_sha256,old.path_privado,
      old.destino,old.evidencia_id) then
    raise exception 'Identidad de evidencia inmutable';
  end if;
  if new.destino = 'evidencia_reparacion' then
    -- Mismo orden de bloqueo que las RPC: primero el reporte, después la evidencia.
    select deleted_at into v_deleted from public.reportes where id=new.reporte_id for update;
    if not found then raise exception 'Propietario o reporte inválido'; end if;
    select e.estado into v_estado from public.evidencias_reparacion e
      where e.id=new.evidencia_id and e.reporte_id=new.reporte_id
        and e.autor_id=new.propietario_id for update;
    if not found then raise exception 'Evidencia de reparación inválida'; end if;
    if tg_op = 'INSERT' then
      if v_deleted is not null or v_estado <> 'informada' then
        raise exception 'Evidencia de reparación inválida';
      end if;
    elsif v_deleted is not null and (new.decision <> 'REJECTED'
        or new.estado_publicacion <> 'rechazada') then
      -- Con el reporte retirado solo se admite mantenimiento terminal.
      raise exception 'Evidencia de reparación inválida';
    end if;
  else
    select deleted_at into v_deleted from public.reportes where id=new.reporte_id
      and usuario_id=new.propietario_id for update;
    if not found then raise exception 'Propietario o reporte inválido'; end if;
    if v_deleted is not null then
      -- Solo mantenimiento de evidencia ya rechazada; nunca tokens ni publicación.
      if tg_op <> 'UPDATE' then raise exception 'Propietario o reporte inválido'; end if;
      if old.decision <> 'REJECTED' or new.decision <> 'REJECTED'
        or old.estado_publicacion <> 'rechazada' or new.estado_publicacion <> 'rechazada'
        or new.token is distinct from old.token
        or new.publicado_at is distinct from old.publicado_at then
        raise exception 'Propietario o reporte inválido';
      end if;
    end if;
  end if;
  if new.path_privado <> new.propietario_id::text || '/' || new.id::text then
    raise exception 'Ruta privada inválida';
  end if;
  return new;
end;
$$;
comment on function public.validar_propietario_moderacion() is
'Verifica propiedad y ruta canónica bajo bloqueo del reporte; soporta fotos de reporte y evidencia de reparación.';

-- Publicación: las fotos de reporte siguen insertándose en fotos_reporte sin cambios;
-- la evidencia se publica en su propia fila y pasa a «en_verificacion».
create or replace function public.confirmar_publicacion_moderacion(
  p_id uuid, p_token uuid, p_url text, p_thumbnail_url text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_fila public.moderacion_imagenes%rowtype;
begin
  select * into v_fila from public.moderacion_imagenes where id = p_id for update;
  if not found or v_fila.estado_publicacion <> 'publicando' or v_fila.decision <> 'APPROVED'
    or p_token is null or v_fila.token is distinct from p_token then return false; end if;
  -- El trigger vuelve a bloquear y validar el reporte antes de insertar metadatos.
  update public.moderacion_imagenes set estado_publicacion = 'publicada', publicado_at = clock_timestamp()
  where id = p_id;
  if v_fila.destino = 'evidencia_reparacion' then
    -- Las fotos originales del reporte nunca se tocan (S9). La primera publicación
    -- habilita la verificación; una evidencia ya resuelta solo completa su foto.
    update public.evidencias_reparacion set url = p_url, bucket = 'reportes',
      path = p_id::text || '/' || p_token::text,
      thumbnail_url = p_thumbnail_url,
      thumbnail_bucket = case when p_thumbnail_url is not null then 'reportes' end,
      thumbnail_path = case when p_thumbnail_url is not null
        then p_id::text || '/' || p_token::text || '-miniatura' end,
      publicada_at = clock_timestamp(),
      estado = case when estado = 'informada' then 'en_verificacion' else estado end
    where id = v_fila.evidencia_id and publicada_at is null;
    if not found then raise exception 'Evidencia de reparación no disponible'; end if;
    return true;
  end if;
  insert into public.fotos_reporte(reporte_id, url, bucket, path,
    thumbnail_url, thumbnail_bucket, thumbnail_path)
  values (v_fila.reporte_id, p_url, 'reportes', p_id::text || '/' || p_token::text,
    p_thumbnail_url, case when p_thumbnail_url is not null then 'reportes' end,
    case when p_thumbnail_url is not null then p_id::text || '/' || p_token::text || '-miniatura' end);
  return true;
end;
$$;
comment on function public.confirmar_publicacion_moderacion(uuid, uuid, text, text) is
'Confirma token CAS: las fotos de reporte van a fotos_reporte y la evidencia se publica en su propia fila.';

-- Decisión de moderación: una foto de evidencia rechazada mueve la evidencia a
-- «rechazada» y deja el reporte pendiente (nunca lo retira).
create or replace function public.decidir_imagen_moderacion(
  p_id uuid, p_token uuid, p_decision text, p_motivos jsonb, p_administrador uuid default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_fila public.moderacion_imagenes%rowtype;
begin
  select * into v_fila from public.moderacion_imagenes where id = p_id for update;
  if not found or p_decision is null or p_decision not in ('APPROVED','REJECTED','REVIEW') then
    return false;
  end if;
  if p_administrador is not null then
    perform 1 from public.profiles where id = p_administrador and rol_id = 1 for share;
    if not found then raise exception 'Administrador no autorizado'; end if;
    if v_fila.estado_publicacion <> 'pendiente' then return false; end if;
  elsif v_fila.estado_publicacion <> 'reclamada' or p_token is null
        or v_fila.token is distinct from p_token then
    return false;
  end if;
  update public.moderacion_imagenes set decision = p_decision, motivos = p_motivos,
    administrador_id = p_administrador,
    revisado_at = case when p_administrador is not null then clock_timestamp() else null end,
    estado_publicacion = case p_decision when 'APPROVED' then 'publicando'
      when 'REJECTED' then 'rechazada' else 'pendiente' end,
    token = case when p_decision = 'APPROVED' then gen_random_uuid() else null end
  where id = p_id;
  if v_fila.destino = 'evidencia_reparacion' and p_decision = 'REJECTED' then
    -- Una evidencia ya resuelta conserva su resolución: la decisión de la foto
    -- queda registrada en la fila de moderación sin reabrir el reporte.
    update public.evidencias_reparacion set estado = 'rechazada',
      resuelta_at = clock_timestamp(),
      resuelta_por = coalesce(p_administrador, v_fila.administrador_id),
      motivo_resolucion = 'Fotografía rechazada por moderación'
    where id = v_fila.evidencia_id and estado in ('informada','en_verificacion');
  end if;
  return true;
end;
$$;
comment on function public.decidir_imagen_moderacion(uuid, uuid, text, jsonb, uuid) is
'Decisión CAS por token original o Admin DB=1; las fotos de evidencia rechazadas invalidan solo la evidencia.';

-- ============================================================================
-- Funciones privadas de apoyo
-- ============================================================================

-- Juego de tres confirmaciones independientes («inicialmente tres», S5) en un
-- solo lugar consultable por SQL y por el catálogo de TypeScript.
create function public.umbral_confirmaciones_reparacion()
returns integer language sql immutable set search_path = pg_catalog, public as $$
  select 3
$$;
comment on function public.umbral_confirmaciones_reparacion() is
'Cantidad de confirmaciones independientes que valida una reparación (tres).';

-- Participantes: cuentas registradas con email confirmado; quedan fuera
-- invitados, sesiones anónimas, Admin y Operador (S15).
create function private.usuario_habilitado_para_reparacion(p_usuario_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = p_usuario_id
      and (p.rol_id is null or p.rol_id not in (1,4,5))
      and not coalesce(u.is_anonymous,false)
      and u.email_confirmed_at is not null
  )
$$;
comment on function private.usuario_habilitado_para_reparacion(uuid) is
'Habilita evidencia y verificación solo a cuentas registradas con email confirmado (nunca Admin, Operador ni invitado).';

-- Administrador real de la aplicación (rol 1), nunca una sesión anónima.
create function private.es_administrador(p_usuario_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = p_usuario_id and p.rol_id = 1 and not coalesce(u.is_anonymous,false)
  )
$$;
comment on function private.es_administrador(uuid) is
'Autoriza acciones administrativas sobre evidencias de reparación.';

-- Registro de auditoría con actor, reporte, título y hora (S12).
create function private.registrar_auditoria_evidencia(
  p_accion text, p_actor uuid, p_reporte_id bigint)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_titulo text;
begin
  select r.titulo into v_titulo from public.reportes r where r.id = p_reporte_id;
  insert into public.audit_events(actor_id, report_id, report_title, action)
  values (p_actor, p_reporte_id, v_titulo, p_accion);
end;
$$;
comment on function private.registrar_auditoria_evidencia(text, uuid, bigint) is
'Escribe una fila de audit_events para una acción de evidencia de reparación.';

-- Transición transaccional e idempotente de cierre por reparación validada:
-- estado Reparado, puntos del autor una sola vez e historial (S5, S12, S9).
create function private.cerrar_reporte_por_reparacion(
  p_reporte_id bigint, p_actor uuid, p_comentario text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_autor uuid; v_estado integer;
begin
  select usuario_id, estado_id into v_autor, v_estado
    from public.reportes where id = p_reporte_id and deleted_at is null for update;
  if not found then raise exception 'Reporte no disponible para validar la reparación'; end if;
  if v_estado is distinct from 1 then return false; end if;
  update public.reportes set estado_id = 2 where id = p_reporte_id;
  if v_autor is not null then
    perform public.adjust_profile_points_atomic(v_autor, 5, 'Reparación validada por la comunidad');
  end if;
  insert into public.historial_estados(reporte_id, estado_anterior_id, estado_nuevo_id, usuario_id, comentario)
  values (p_reporte_id, v_estado, 2, p_actor, p_comentario);
  return true;
end;
$$;
comment on function private.cerrar_reporte_por_reparacion(bigint, uuid, text) is
'Cierra el reporte por reparación validada: idempotente, premia al autor una sola vez y registra historial.';

-- Cambio de resolución repetible: una repetición devuelve el estado actual.
create function private.resumen_verificaciones(p_evidencia_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object(
    'confirmaciones', count(*) filter (where tipo = 'confirmacion'),
    'impugnaciones', count(*) filter (where tipo = 'impugnacion'),
    'impugnaciones_pendientes', count(*) filter (where tipo = 'impugnacion' and estado = 'pendiente'))
  from public.verificaciones_reparacion where evidencia_id = p_evidencia_id
$$;
comment on function private.resumen_verificaciones(uuid) is
'Cuenta confirmaciones e impugnaciones (totales y pendientes) de una evidencia.';

revoke all on function private.usuario_habilitado_para_reparacion(uuid),
  private.es_administrador(uuid),
  private.registrar_auditoria_evidencia(text,uuid,bigint),
  private.cerrar_reporte_por_reparacion(bigint,uuid,text),
  private.resumen_verificaciones(uuid) from public, anon, authenticated;

-- ============================================================================
-- RPC de evidencia y verificación (security definer, solo service_role)
-- ============================================================================

-- Registra la evidencia y su foto en la cola privada de moderación. No cambia el
-- estado del reporte (S2) y respeta elegibilidad, evidencia activa y límite diario.
create function public.crear_evidencia_reparacion(
  p_reporte_id bigint, p_autor_id uuid, p_comentario text, p_hash_sha256 text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_estado integer; v_borrado timestamp; v_evidencia_id uuid := gen_random_uuid();
  v_moderacion_id uuid := gen_random_uuid(); v_path text; v_recientes integer;
begin
  if p_reporte_id is null or p_autor_id is null or p_comentario is null
    or char_length(btrim(p_comentario)) not between 1 and 500
    or p_hash_sha256 is null or p_hash_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'PRE11', message = 'Datos de la evidencia inválidos';
  end if;
  -- Orden de bloqueo fijo: reporte, después evidencia y verificación.
  select estado_id, deleted_at into v_estado, v_borrado
    from public.reportes where id = p_reporte_id for update;
  if not found or v_borrado is not null then
    raise exception using errcode = 'PRE05', message = 'Reporte no disponible para informar una reparación';
  end if;
  if v_estado is distinct from 1 then
    raise exception using errcode = 'PRE05', message = 'El reporte ya está cerrado';
  end if;
  if not private.usuario_habilitado_para_reparacion(p_autor_id) then
    raise exception using errcode = 'PRE01',
      message = 'Cuenta no habilitada: se requiere una cuenta registrada con email confirmado';
  end if;
  if exists (select 1 from public.evidencias_reparacion
    where reporte_id = p_reporte_id and estado in ('informada','en_verificacion')) then
    raise exception using errcode = 'PRE03',
      message = 'El reporte ya tiene una evidencia de reparación activa';
  end if;
  if exists (select 1 from public.moderacion_imagenes
    where reporte_id = p_reporte_id and hash_sha256 = p_hash_sha256) then
    raise exception using errcode = 'PRE03', message = 'Esa fotografía ya fue registrada en este reporte';
  end if;
  select count(*) into v_recientes from public.evidencias_reparacion
    where autor_id = p_autor_id and created_at > clock_timestamp() - interval '24 hours';
  if v_recientes >= 3 then
    raise exception using errcode = 'PRE04',
      message = 'Alcanzaste el límite de 3 evidencias de reparación por día';
  end if;
  insert into public.evidencias_reparacion(id, reporte_id, autor_id, comentario)
    values (v_evidencia_id, p_reporte_id, p_autor_id, btrim(p_comentario));
  v_path := p_autor_id::text || '/' || v_moderacion_id::text;
  insert into public.moderacion_imagenes(id, reporte_id, propietario_id, hash_sha256,
    path_privado, destino, evidencia_id)
    values (v_moderacion_id, p_reporte_id, p_autor_id, p_hash_sha256, v_path,
      'evidencia_reparacion', v_evidencia_id);
  perform private.registrar_auditoria_evidencia('evidence_submitted', p_autor_id, p_reporte_id);
  return jsonb_build_object('evidencia_id', v_evidencia_id, 'moderacion_id', v_moderacion_id,
    'path_privado', v_path, 'estado', 'informada', 'reporte_estado_id', v_estado);
end;
$$;
comment on function public.crear_evidencia_reparacion(bigint, uuid, text, text) is
'Informa una reparación con foto en moderación; no cambia el estado del reporte y rechaza duplicados y abuso diario.';

-- Registra una confirmación o impugnación. Con tres confirmaciones y sin
-- impugnaciones pendientes cierra el reporte una sola vez (S5, S12).
create function public.registrar_verificacion_reparacion(
  p_evidencia_id uuid, p_usuario_id uuid, p_tipo text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_reporte bigint; v_autor uuid; v_evidencia_estado text; v_reporte_estado integer;
  v_actual public.verificaciones_reparacion%rowtype;
  v_confirmaciones integer; v_impugnaciones integer; v_pendientes integer;
  v_cerrado boolean := false; v_repetida boolean := false;
begin
  if p_evidencia_id is null or p_usuario_id is null or p_tipo is null
    or p_tipo not in ('confirmacion','impugnacion') then
    raise exception using errcode = 'PRE11', message = 'Verificación de reparación inválida';
  end if;
  if p_tipo = 'impugnacion'
    and char_length(btrim(coalesce(p_motivo,''))) not between 1 and 500 then
    raise exception using errcode = 'PRE07',
      message = 'La impugnación requiere un motivo de hasta 500 caracteres';
  end if;
  select reporte_id into v_reporte from public.evidencias_reparacion where id = p_evidencia_id;
  if not found then
    raise exception using errcode = 'PRE05', message = 'Evidencia de reparación no disponible';
  end if;
  -- Orden de bloqueo fijo: reporte, evidencia, verificación.
  select estado_id into v_reporte_estado from public.reportes
    where id = v_reporte and deleted_at is null for update;
  if not found then
    raise exception using errcode = 'PRE05', message = 'Reporte no disponible para verificar la reparación';
  end if;
  select autor_id, estado into v_autor, v_evidencia_estado
    from public.evidencias_reparacion where id = p_evidencia_id for update;
  select * into v_actual from public.verificaciones_reparacion
    where evidencia_id = p_evidencia_id and usuario_id = p_usuario_id;
  if found then
    if v_actual.tipo <> p_tipo then
      raise exception using errcode = 'PRE06',
        message = 'Ya registraste una verificación distinta para esta evidencia';
    end if;
    -- Repetición idempotente: no cuenta de nuevo ni vuelve a cerrar.
    v_repetida := true;
  else
    if v_evidencia_estado <> 'en_verificacion' then
      raise exception using errcode = 'PRE05', message = 'La evidencia no está en verificación';
    end if;
    if v_reporte_estado is distinct from 1 then
      raise exception using errcode = 'PRE05', message = 'El reporte ya está cerrado';
    end if;
    if v_autor = p_usuario_id then
      raise exception using errcode = 'PRE02', message = 'No podés validar tu propia evidencia';
    end if;
    if not private.usuario_habilitado_para_reparacion(p_usuario_id) then
      raise exception using errcode = 'PRE01',
        message = 'Cuenta no habilitada: se requiere una cuenta registrada con email confirmado';
    end if;
    insert into public.verificaciones_reparacion(evidencia_id, usuario_id, tipo, motivo)
      values (p_evidencia_id, p_usuario_id, p_tipo,
        case when p_tipo = 'impugnacion' then btrim(p_motivo) end);
    perform private.registrar_auditoria_evidencia(
      case when p_tipo = 'confirmacion' then 'evidence_confirmed' else 'evidence_challenged' end,
      p_usuario_id, v_reporte);
  end if;
  select (r->>'confirmaciones')::integer, (r->>'impugnaciones')::integer,
         (r->>'impugnaciones_pendientes')::integer
    into v_confirmaciones, v_impugnaciones, v_pendientes
    from (select private.resumen_verificaciones(p_evidencia_id) as r) s;
  if not v_repetida and v_evidencia_estado = 'en_verificacion' and v_pendientes = 0
    and v_confirmaciones >= public.umbral_confirmaciones_reparacion() then
    update public.evidencias_reparacion set estado = 'validada', resuelta_at = clock_timestamp(),
      resuelta_por = p_usuario_id,
      motivo_resolucion = format('Reparación validada por %s confirmaciones', v_confirmaciones)
    where id = p_evidencia_id and estado = 'en_verificacion';
    if not found then
      raise exception using errcode = 'PRE09', message = 'La evidencia ya fue resuelta';
    end if;
    v_evidencia_estado := 'validada';
    -- El cierre por comunidad queda en historial_estados y en la tercera
    -- confirmación auditada; no se registra como aprobación administrativa.
    v_cerrado := private.cerrar_reporte_por_reparacion(v_reporte, p_usuario_id,
      format('Reparación validada por %s confirmaciones de usuarios', v_confirmaciones));
  end if;
  select estado_id into v_reporte_estado from public.reportes where id = v_reporte;
  return jsonb_build_object('evidencia_id', p_evidencia_id, 'tipo', p_tipo,
    'repetida', v_repetida, 'evidencia_estado', v_evidencia_estado,
    'reporte_estado_id', v_reporte_estado, 'cerrado', v_cerrado,
    'confirmaciones', v_confirmaciones, 'impugnaciones', v_impugnaciones,
    'impugnaciones_pendientes', v_pendientes);
end;
$$;
comment on function public.registrar_verificacion_reparacion(uuid, uuid, text, text) is
'Confirma o impugna una evidencia; tres confirmaciones sin impugnaciones pendientes cierran el reporte una sola vez.';

-- Resolución administrativa de una impugnación: aceptarla rechaza la evidencia;
-- descartarla reevalúa el umbral de confirmaciones (S5, S8).
create function public.resolver_impugnacion_reparacion(
  p_verificacion_id uuid, p_administrador_id uuid, p_decision text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_reporte bigint; v_evidencia uuid; v_tipo text; v_estado_verificacion text;
  v_reporte_estado integer; v_evidencia_estado text;
  v_confirmaciones integer; v_impugnaciones integer; v_pendientes integer;
  v_cerrado boolean := false; v_repetida boolean := false;
begin
  if p_verificacion_id is null or p_administrador_id is null or p_decision is null
    or p_decision not in ('aceptada','descartada') then
    raise exception using errcode = 'PRE11', message = 'Resolución de impugnación inválida';
  end if;
  select e.reporte_id into v_reporte from public.verificaciones_reparacion v
    join public.evidencias_reparacion e on e.id = v.evidencia_id where v.id = p_verificacion_id;
  if not found then
    raise exception using errcode = 'PRE05', message = 'Impugnación no disponible';
  end if;
  -- Orden de bloqueo fijo: reporte, evidencia, verificación.
  select estado_id into v_reporte_estado from public.reportes
    where id = v_reporte and deleted_at is null for update;
  if not found then
    raise exception using errcode = 'PRE05', message = 'Reporte no disponible para resolver la impugnación';
  end if;
  select evidencia_id, tipo, estado into v_evidencia, v_tipo, v_estado_verificacion
    from public.verificaciones_reparacion where id = p_verificacion_id for update;
  select estado into v_evidencia_estado from public.evidencias_reparacion
    where id = v_evidencia for update;
  if v_tipo <> 'impugnacion' then
    raise exception using errcode = 'PRE07', message = 'La verificación indicada no es una impugnación';
  end if;
  if not private.es_administrador(p_administrador_id) then
    raise exception using errcode = 'PRE08', message = 'Administrador no autorizado';
  end if;
  if v_estado_verificacion <> 'pendiente' then
    if v_estado_verificacion = p_decision then
      v_repetida := true;
    else
      raise exception using errcode = 'PRE07', message = 'La impugnación ya fue resuelta';
    end if;
  else
    update public.verificaciones_reparacion set estado = p_decision,
      resuelta_at = clock_timestamp(), resuelta_por = p_administrador_id,
      motivo_resolucion = nullif(btrim(coalesce(p_motivo,'')),'')
      where id = p_verificacion_id;
    if p_decision = 'aceptada' then
      if v_evidencia_estado <> 'en_verificacion' then
        raise exception using errcode = 'PRE09', message = 'La evidencia ya fue resuelta';
      end if;
      update public.evidencias_reparacion set estado = 'rechazada',
        resuelta_at = clock_timestamp(), resuelta_por = p_administrador_id,
        motivo_resolucion = coalesce(nullif(btrim(coalesce(p_motivo,'')),''),
          'Impugnación aceptada por administración')
        where id = v_evidencia and estado = 'en_verificacion';
      v_evidencia_estado := 'rechazada';
    end if;
    perform private.registrar_auditoria_evidencia(
      'evidence_challenge_resolved', p_administrador_id, v_reporte);
  end if;
  select (r->>'confirmaciones')::integer, (r->>'impugnaciones')::integer,
         (r->>'impugnaciones_pendientes')::integer
    into v_confirmaciones, v_impugnaciones, v_pendientes
    from (select private.resumen_verificaciones(v_evidencia) as r) s;
  -- Al descartar la impugnación, la reparación puede alcanzar el umbral.
  if not v_repetida and v_evidencia_estado = 'en_verificacion' and v_pendientes = 0
    and v_confirmaciones >= public.umbral_confirmaciones_reparacion() then
    update public.evidencias_reparacion set estado = 'validada', resuelta_at = clock_timestamp(),
      resuelta_por = p_administrador_id,
      motivo_resolucion = format('Reparación validada por %s confirmaciones', v_confirmaciones)
    where id = v_evidencia and estado = 'en_verificacion';
    if found then
      v_evidencia_estado := 'validada';
      -- El cierre por comunidad se registra en historial_estados, no como
      -- aprobación administrativa.
      v_cerrado := private.cerrar_reporte_por_reparacion(v_reporte, p_administrador_id,
        format('Reparación validada por %s confirmaciones de usuarios', v_confirmaciones));
    end if;
  end if;
  select estado_id into v_reporte_estado from public.reportes where id = v_reporte;
  return jsonb_build_object('verificacion_id', p_verificacion_id, 'decision', p_decision,
    'repetida', v_repetida, 'evidencia_estado', v_evidencia_estado,
    'reporte_estado_id', v_reporte_estado, 'cerrado', v_cerrado,
    'confirmaciones', v_confirmaciones, 'impugnaciones', v_impugnaciones,
    'impugnaciones_pendientes', v_pendientes);
end;
$$;
comment on function public.resolver_impugnacion_reparacion(uuid, uuid, text, text) is
'Resuelve una impugnación pendiente: aceptarla rechaza la evidencia; descartarla reevalúa el umbral.';

-- Decisión administrativa sobre la evidencia: aprobar (Reparado), rechazar o
-- revertir una validada (vuelve a Pendiente, historial y −5 puntos) (S8).
create function public.resolver_evidencia_reparacion_admin(
  p_evidencia_id uuid, p_administrador_id uuid, p_accion text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_reporte bigint; v_evidencia public.evidencias_reparacion%rowtype;
  v_reporte_estado integer; v_autor uuid; v_cerrado boolean := false;
  v_evidencia_estado text; v_revertido boolean := false; v_repetida boolean := false;
  v_confirmaciones integer; v_impugnaciones integer; v_pendientes integer;
  v_motivo text := nullif(btrim(coalesce(p_motivo,'')),'');
begin
  if p_evidencia_id is null or p_administrador_id is null or p_accion is null
    or p_accion not in ('aprobar','rechazar','revertir') then
    raise exception using errcode = 'PRE11', message = 'Acción administrativa inválida';
  end if;
  select reporte_id into v_reporte from public.evidencias_reparacion where id = p_evidencia_id;
  if not found then
    raise exception using errcode = 'PRE05', message = 'Evidencia de reparación no disponible';
  end if;
  -- Orden de bloqueo fijo: reporte, evidencia, verificación.
  select estado_id, usuario_id into v_reporte_estado, v_autor from public.reportes
    where id = v_reporte and deleted_at is null for update;
  if not found then
    raise exception using errcode = 'PRE05', message = 'Reporte no disponible para resolver la evidencia';
  end if;
  select * into v_evidencia from public.evidencias_reparacion
    where id = p_evidencia_id for update;
  if not private.es_administrador(p_administrador_id) then
    raise exception using errcode = 'PRE08', message = 'Administrador no autorizado';
  end if;
  if p_accion = 'aprobar' and v_reporte_estado = 3 then
    raise exception using errcode = 'PRE05', message = 'El reporte ya está cerrado';
  end if;
  if p_accion = 'aprobar' then
    if v_evidencia.estado = 'validada' then
      v_repetida := true;
    elsif v_evidencia.estado not in ('informada','en_verificacion') then
      raise exception using errcode = 'PRE09',
        message = 'La evidencia rechazada o revertida no se puede aprobar';
    else
      update public.evidencias_reparacion set estado = 'validada',
        resuelta_at = clock_timestamp(), resuelta_por = p_administrador_id,
        motivo_resolucion = coalesce(v_motivo, 'Aprobada por administración')
        where id = p_evidencia_id;
      v_cerrado := private.cerrar_reporte_por_reparacion(v_reporte, p_administrador_id,
        coalesce(v_motivo, 'Reparación aprobada por administración'));
      perform private.registrar_auditoria_evidencia('evidence_approved', p_administrador_id, v_reporte);
    end if;
  elsif p_accion = 'rechazar' then
    if v_evidencia.estado = 'rechazada' then
      v_repetida := true;
    elsif v_evidencia.estado in ('validada','revertida') then
      raise exception using errcode = 'PRE09',
        message = 'Revertí la validación antes de rechazar la evidencia';
    else
      update public.evidencias_reparacion set estado = 'rechazada',
        resuelta_at = clock_timestamp(), resuelta_por = p_administrador_id,
        motivo_resolucion = coalesce(v_motivo, 'Rechazada por administración')
        where id = p_evidencia_id;
      perform private.registrar_auditoria_evidencia('evidence_rejected', p_administrador_id, v_reporte);
    end if;
  else
    if v_evidencia.estado = 'revertida' then
      v_repetida := true;
    elsif v_evidencia.estado <> 'validada' then
      raise exception using errcode = 'PRE09',
        message = 'Solo se puede revertir una evidencia validada';
    else
      update public.evidencias_reparacion set estado = 'revertida',
        resuelta_at = clock_timestamp(), resuelta_por = p_administrador_id,
        motivo_resolucion = coalesce(v_motivo, 'Revertida por administración')
        where id = p_evidencia_id;
      if v_reporte_estado = 2 then
        update public.reportes set estado_id = 1 where id = v_reporte;
        if v_autor is not null then
          perform public.adjust_profile_points_atomic(v_autor, -5, 'Reparación revertida por administración');
        end if;
        insert into public.historial_estados(reporte_id, estado_anterior_id, estado_nuevo_id, usuario_id, comentario)
        values (v_reporte, 2, 1, p_administrador_id,
          coalesce(v_motivo, 'Reparación revertida por administración'));
        v_revertido := true;
      end if;
      perform private.registrar_auditoria_evidencia('evidence_reverted', p_administrador_id, v_reporte);
    end if;
  end if;
  select (r->>'confirmaciones')::integer, (r->>'impugnaciones')::integer,
         (r->>'impugnaciones_pendientes')::integer
    into v_confirmaciones, v_impugnaciones, v_pendientes
    from (select private.resumen_verificaciones(p_evidencia_id) as r) s;
  select estado into v_evidencia_estado from public.evidencias_reparacion where id = p_evidencia_id;
  select estado_id into v_reporte_estado from public.reportes where id = v_reporte;
  return jsonb_build_object('evidencia_id', p_evidencia_id, 'accion', p_accion,
    'repetida', v_repetida, 'evidencia_estado', v_evidencia_estado,
    'reporte_estado_id', v_reporte_estado, 'cerrado', v_cerrado, 'revertido', v_revertido,
    'confirmaciones', v_confirmaciones, 'impugnaciones', v_impugnaciones,
    'impugnaciones_pendientes', v_pendientes);
end;
$$;
comment on function public.resolver_evidencia_reparacion_admin(uuid, uuid, text, text) is
'Aprueba, rechaza o revierte una evidencia; revertir devuelve el reporte a Pendiente y descuenta los cinco puntos.';

-- ============================================================================
-- El voto comunitario «reparado» queda reemplazado por el flujo de evidencia
-- ============================================================================

-- Se conserva la rama de «no existe» sin cambios; solo se rechaza el voto nuevo
-- «reparado» (el historial de votos_reparado queda intacto, S15).
create or replace function public.registrar_voto_exclusivo(p_reporte_id bigint, p_usuario_id uuid, p_tipo text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_autor uuid; v_estado integer; v_borrado timestamptz;
  v_no boolean; v_si boolean; v_cambio boolean; v_primero boolean; v_total integer;
  v_reparados integer; v_cerrado boolean := false;
begin
  if p_tipo is null or p_tipo not in ('no_existe','reparado') or p_usuario_id is null then
    raise exception 'Voto inválido';
  end if;
  if p_tipo = 'reparado' then
    raise exception using errcode = 'PRE10',
      message = 'El voto reparado fue reemplazado por la verificación de evidencias de reparación';
  end if;
  select usuario_id,estado_id,deleted_at into v_autor,v_estado,v_borrado
    from public.reportes where id=p_reporte_id for update;
  if not found or v_borrado is not null or v_estado in (2,3) then
    raise exception 'Reporte cerrado o no disponible';
  end if;
  if p_tipo='no_existe' and v_autor=p_usuario_id then
    raise exception 'No podés votar no existe en tu propio reporte';
  end if;
  -- Todos los votos bloquean primero los perfiles distintos en orden global, antes
  -- de insertar (la FK también toma bloqueos) y antes de actualizar puntos.
  perform 1 from public.profiles where id in (p_usuario_id,v_autor) order by id for no key update;
  if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=p_usuario_id and (p.rol_id is null or p.rol_id not in (1,4,5)) and not coalesce(u.is_anonymous,false)) then
    raise exception 'Usuario no habilitado para votar';
  end if;
  select exists(select 1 from public.votos_no_existe where reporte_id=p_reporte_id and usuario_id=p_usuario_id),
         exists(select 1 from public.votos_reparado where reporte_id=p_reporte_id and usuario_id=p_usuario_id)
    into v_no,v_si;
  if v_no and v_si then raise exception using errcode = 'PVA01', message = 'Votos históricos ambiguos; requieren revisión'; end if;
  v_primero := not v_no and not v_si;
  v_cambio := (p_tipo='no_existe' and v_si) or (p_tipo='reparado' and v_no);
  if v_cambio then
    if v_no then delete from public.votos_no_existe where reporte_id=p_reporte_id and usuario_id=p_usuario_id;
    else delete from public.votos_reparado where reporte_id=p_reporte_id and usuario_id=p_usuario_id; end if;
  end if;
  if v_primero or v_cambio then
    if p_tipo='no_existe' then insert into public.votos_no_existe(reporte_id,usuario_id) values(p_reporte_id,p_usuario_id);
    else insert into public.votos_reparado(reporte_id,usuario_id) values(p_reporte_id,p_usuario_id); end if;
  end if;
  if v_primero then
    update public.profiles set puntos=coalesce(puntos,0)+1 where id=p_usuario_id returning puntos into v_total;
    if not found then raise exception 'Perfil inexistente'; end if;
  end if;
  select votos_reparado_count into v_reparados from public.reportes_vote_summary where reporte_id=p_reporte_id;
  if p_tipo='reparado' and v_reparados >= 5 then
    update public.reportes set estado_id=2 where id=p_reporte_id;
    if v_autor is not null then
      update public.profiles set puntos=coalesce(puntos,0)+5 where id=v_autor;
      if not found then raise exception 'Perfil del autor inexistente'; end if;
    end if;
    insert into public.historial_estados(reporte_id,estado_anterior_id,estado_nuevo_id,usuario_id,comentario)
      values(p_reporte_id,v_estado,2,p_usuario_id,format('Marcado como reparado por %s votos de usuarios',v_reparados));
    v_cerrado := true;
  end if;
  return jsonb_build_object('tipo',p_tipo,'primero',v_primero,'cambio',v_cambio,
    'estado_cambiado',v_cerrado,
    'votos_no_existe', (select votos_no_existe_count from public.reportes_vote_summary where reporte_id=p_reporte_id),
    'votos_reparado', v_reparados);
end $$;
comment on function public.registrar_voto_exclusivo(bigint,uuid,text) is
'Voto exclusivo serializado con premio atómico solo en el primer voto; el voto reparado ya no se acepta (lo reemplaza la evidencia de reparación).';

-- ============================================================================
-- Auditoría: se amplía el catálogo de acciones sin reescribir filas históricas
-- ============================================================================

alter table public.audit_events drop constraint audit_events_action_check;
alter table public.audit_events add constraint audit_events_action_check check (action in (
  'report_created','comment_created','vote_repaired','vote_not_exists',
  'evidence_submitted','evidence_confirmed','evidence_challenged',
  'evidence_challenge_resolved','evidence_approved','evidence_rejected','evidence_reverted'));

-- ============================================================================
-- Privilegios: RPC y tablas reservadas a service_role
-- ============================================================================

revoke all on function public.crear_evidencia_reparacion(bigint,uuid,text,text),
  public.registrar_verificacion_reparacion(uuid,uuid,text,text),
  public.resolver_impugnacion_reparacion(uuid,uuid,text,text),
  public.resolver_evidencia_reparacion_admin(uuid,uuid,text,text),
  public.umbral_confirmaciones_reparacion(),
  public.validar_propietario_moderacion(),
  public.confirmar_publicacion_moderacion(uuid,uuid,text,text),
  public.decidir_imagen_moderacion(uuid,uuid,text,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.crear_evidencia_reparacion(bigint,uuid,text,text),
  public.registrar_verificacion_reparacion(uuid,uuid,text,text),
  public.resolver_impugnacion_reparacion(uuid,uuid,text,text),
  public.resolver_evidencia_reparacion_admin(uuid,uuid,text,text),
  public.umbral_confirmaciones_reparacion(),
  public.validar_propietario_moderacion(),
  public.confirmar_publicacion_moderacion(uuid,uuid,text,text),
  public.decidir_imagen_moderacion(uuid,uuid,text,jsonb,uuid)
  to service_role;
