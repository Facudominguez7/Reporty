-- Recordatorio quincenal por correo al dueño de un reporte abierto o de una mascota perdida.
--
-- Regla de producto: cada 14 días desde la publicación (o desde el último recordatorio) se avisa
-- a quien creó un reporte que sigue en estado Pendiente, o una mascota aprobada que sigue
-- figurando como perdida. Los avisos se cortan solos cuando el reporte se cierra (Reparado o
-- Rechazado), se elimina, o la mascota aparece o se retira. Los invitados sin correo no reciben.
-- Cada persona recibe como máximo un recordatorio por día, aunque tenga varias publicaciones.
--
-- La tabla no tiene claves foráneas a propósito: eliminar_cuenta_usuario borra reportes y
-- mascotas sin conocerla, y una fila huérfana es inofensiva porque la consulta parte siempre de
-- las publicaciones vigentes.

create table if not exists public.recordatorios_publicacion (
  tipo text not null check (tipo in ('reporte', 'mascota')),
  entidad_id bigint not null,
  ultimo_envio_at timestamptz not null default now(),
  primary key (tipo, entidad_id)
);

comment on table public.recordatorios_publicacion is
  'Último recordatorio quincenal enviado por publicación. Solo la escribe el cron con service role.';

alter table public.recordatorios_publicacion enable row level security;
revoke all on table public.recordatorios_publicacion from anon, authenticated;

-- Publicaciones a las que les toca recordatorio, con todo lo que necesita el correo.
create or replace function public.recordatorios_pendientes(p_limite integer default 100)
returns table (
  tipo text,
  entidad_id bigint,
  titulo text,
  estado text,
  email text,
  username text,
  publicada_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidatos as (
    select
      'reporte'::text as tipo,
      r.id as entidad_id,
      r.titulo,
      e.nombre::text as estado,
      p.email,
      p.username,
      (r.created_at at time zone 'UTC') as publicada_at
    from public.reportes r
    join public.estados e on e.id = r.estado_id
    join public.profiles p on p.id = r.usuario_id
    where r.deleted_at is null
      and r.estado_id = 1
      and r.created_at <= (now() at time zone 'UTC') - interval '14 days'

    union all

    select
      'mascota'::text,
      m.id,
      m.tipo_animal,
      m.estado,
      p.email,
      p.username,
      m.publicada_at
    from public.mascotas_perdidas m
    join public.profiles p on p.id = m.propietario_id
    where m.estado = 'perdida'
      and m.moderacion_estado = 'aprobada'
      and m.retirada_at is null
      and m.publicada_at is not null
      and m.publicada_at <= now() - interval '14 days'
  )
  , avisados_hoy as (
    -- Personas que ya recibieron un recordatorio (de cualquier publicación) en las últimas 20 h.
    select distinct lower(btrim(c.email)) as email
    from candidatos c
    join public.recordatorios_publicacion rp
      on rp.tipo = c.tipo and rp.entidad_id = c.entidad_id
    where rp.ultimo_envio_at > now() - interval '20 hours'
  )
  , vencidos as (
    -- Un solo recordatorio por persona y por día: el resto sale en los días siguientes, así
    -- quien tiene muchas publicaciones abiertas no recibe una tanda de correos el mismo día,
    -- aunque la corrida se repita.
    select distinct on (lower(btrim(c.email))) c.*
    from candidatos c
    left join public.recordatorios_publicacion rp
      on rp.tipo = c.tipo and rp.entidad_id = c.entidad_id
    where nullif(btrim(c.email), '') is not null
      and (rp.ultimo_envio_at is null or rp.ultimo_envio_at <= now() - interval '14 days')
      and lower(btrim(c.email)) not in (select a.email from avisados_hoy a)
    order by lower(btrim(c.email)), c.publicada_at
  )
  select v.tipo, v.entidad_id, v.titulo, v.estado, btrim(v.email), v.username, v.publicada_at
  from vencidos v
  order by v.publicada_at
  limit greatest(1, least(coalesce(p_limite, 100), 500));
$$;

revoke all on function public.recordatorios_pendientes(integer) from public, anon, authenticated;
grant execute on function public.recordatorios_pendientes(integer) to service_role;
