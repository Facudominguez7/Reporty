-- Notificaciones push (Web Push con VAPID) para la web, la PWA y la app Android (TWA).
--
-- Regla de producto: cada persona puede activar las notificaciones push en uno o más
-- dispositivos y elegir, por tipo, cuáles recibe: cambios de estado de sus reportes, comentarios
-- en sus reportes, avisos de sus mascotas y, solo administradores, contenido para moderar.
-- Las push son un complemento de los correos: si fallan, el correo y la acción siguen igual.
--
-- Las dos tablas son privadas (solo service role): el servidor valida la sesión y escribe con
-- el cliente de servicio, como el resto de las mutaciones. Las claves foráneas a auth.users con
-- ON DELETE CASCADE hacen que eliminar_cuenta_usuario las borre sin tener que conocerlas.

-- Un dispositivo suscripto. El endpoint identifica la suscripción en el servicio push del
-- navegador; si el servicio responde 404/410, la suscripción venció y se borra.
create table if not exists public.suscripciones_push (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null check (length(p256dh) between 1 and 200),
  auth text not null check (length(auth) between 1 and 100),
  creada_at timestamptz not null default now(),
  actualizada_at timestamptz not null default now()
);

create index if not exists suscripciones_push_usuario_idx on public.suscripciones_push (usuario_id);

comment on table public.suscripciones_push is
  'Dispositivos con notificaciones push activas. Solo el servidor (service role) lee y escribe.';

-- Preferencias por tipo. Sin fila, todos los tipos están activos: activar las push en un
-- dispositivo ya es el consentimiento; los interruptores sirven para apagar tipos puntuales.
create table if not exists public.preferencias_push (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  estado_reporte boolean not null default true,
  comentarios boolean not null default true,
  mascotas boolean not null default true,
  moderacion boolean not null default true,
  actualizada_at timestamptz not null default now()
);

comment on table public.preferencias_push is
  'Tipos de notificación push que cada persona quiere recibir. Solo el servidor (service role).';

alter table public.suscripciones_push enable row level security;
alter table public.preferencias_push enable row level security;

revoke all on table public.suscripciones_push from public, anon, authenticated;
revoke all on table public.preferencias_push from public, anon, authenticated;

grant select, insert, update, delete on table public.suscripciones_push to service_role;
grant select, insert, update, delete on table public.preferencias_push to service_role;
