-- Donaciones recibidas por Mercado Pago (Checkout Pro).
-- Cada fila es un pago real: se crea cuando llega el webhook o cuando el donante vuelve
-- de Checkout Pro, siempre con datos leídos de la API de Mercado Pago. Nombre y mensaje
-- son privados: solo el servidor (service role) lee y escribe esta tabla.

create table if not exists public.donaciones (
  id uuid primary key default gen_random_uuid(),
  pago_id text not null unique,
  referencia uuid not null,
  monto numeric(12, 2) not null check (monto > 0),
  moneda text not null default 'ARS',
  estado text not null check (estado in ('aprobada', 'pendiente', 'rechazada')),
  estado_mp text not null,
  nombre text check (char_length(nombre) <= 80),
  mensaje text check (char_length(mensaje) <= 280),
  usuario_id uuid references public.profiles (id) on delete set null,
  aprobada_at timestamptz,
  agradecimiento_enviado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.donaciones is 'Pagos de donaciones de Mercado Pago. Solo service role.';
comment on column public.donaciones.pago_id is 'Id del pago en Mercado Pago.';
comment on column public.donaciones.referencia is 'external_reference de la preferencia que originó el pago.';
comment on column public.donaciones.estado_mp is 'Estado crudo devuelto por Mercado Pago (approved, pending, rejected, refunded...).';
comment on column public.donaciones.agradecimiento_enviado_at is 'Marca que reclama el envío de los emails de agradecimiento una sola vez.';

create index if not exists donaciones_created_at_idx on public.donaciones (created_at desc);
create index if not exists donaciones_estado_idx on public.donaciones (estado);

alter table public.donaciones enable row level security;

revoke all on table public.donaciones from anon, authenticated;
grant select, insert, update on table public.donaciones to service_role;

notify pgrst, 'reload schema';
