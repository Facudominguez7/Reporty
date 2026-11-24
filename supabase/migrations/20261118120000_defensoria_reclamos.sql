-- Reclamos Defensoría del Pueblo (S5, S6, S7, S10 del feature odd/tasks/defensoria-reclamos.md).
--
-- Rol staff nuevo (Defensoría, id 6) y estado nuevo (Tomado por Defensoría, id 4).
-- El estado es intermedio-terminal: la Defensoría solo toma el reporte y le asigna el
-- número de reclamo de su sistema externo; el cierre a Reparado sigue siendo de la
-- comunidad/administración (S6). El número de reclamo es texto libre (4 a 40 caracteres),
-- único por reporte y no editable una vez confirmado (S5).
--
-- Contacto del autor (S7, opción A): el teléfono se captura solo al momento de avisar a la
-- institución y vive en reportes (no en profiles). El email siempre existe por la cuenta;
-- la regla de producto es que al avisar quede como mínimo email o teléfono (S3).

-- Catálogo de roles: Defensoría del Pueblo, staff intermedio sin poderes de moderación.
insert into public.roles (id, nombre)
select 6, 'Defensoría'
where not exists (select 1 from public.roles where id = 6);

comment on table public.roles is
  'Catálogo de roles de la aplicación. 1=admin, 2=ciudadano, 3=interesado, 4=operador municipal, 5=invitado, 6=Defensoría del Pueblo (staff: solo toma reportes y asigna reclamos).';

-- Catálogo de estados: Tomado por Defensoría, entre Pendiente (1) y Reparado (2).
insert into public.estados (id, nombre)
select 4, 'Tomado por Defensoría'
where not exists (select 1 from public.estados where id = 4);

comment on table public.estados is
  'Catálogo de estados del reporte. 1=Pendiente, 2=Reparado, 3=Rechazado, 4=Tomado por Defensoría (intermedio-terminal: espera el cierre por evidencia, igual que Pendiente).';

-- Un reclamo por reporte: la toma es única y el número queda público en la ficha (S9).
create table if not exists public.reclamos_defensoria (
  reporte_id bigint not null primary key references public.reportes (id) on delete cascade,
  numero_reclamo text not null check (length(btrim(numero_reclamo)) between 4 and 40),
  tomado_por uuid not null references auth.users (id) on delete restrict,
  tomado_at timestamptz not null default now()
);

comment on table public.reclamos_defensoria is
  'Tomas de la Defensoría del Pueblo: un único reclamo por reporte con el número emitido por su sistema externo. Lectura pública (el número es visible en la ficha, S9); escritura solo service role desde la acción de tomar.';

comment on column public.reclamos_defensoria.numero_reclamo is
  'Texto libre del sistema externo de la Defensoría, 4 a 40 caracteres tras recortar espacios. No se edita después de confirmar.';

alter table public.reclamos_defensoria enable row level security;

revoke all on table public.reclamos_defensoria from public, anon, authenticated;
grant select on table public.reclamos_defensoria to anon, authenticated;
grant all on table public.reclamos_defensoria to service_role;

create policy "reclamos_defensoria_public_read"
  on public.reclamos_defensoria
  for select to anon, authenticated
  using (true);

-- Contacto del autor al avisar (S7): ambos nullable. La regla de producto «mínimo email o
-- teléfono» (S3) se valida en la app al momento de avisar: un constraint NOT NULL-fuerte en DB
-- rompería con los reportes existentes, que tienen ambas columnas en null.
-- El teléfono sigue la misma tolerancia de dígitos que mascotas_perdidas (1 a 40 caracteres).
alter table public.reportes
  add column if not exists email_contacto text,
  add column if not exists telefono_contacto text;

alter table public.reportes
  drop constraint if exists reportes_telefono_contacto_formato;
alter table public.reportes
  add constraint reportes_telefono_contacto_formato
  check (telefono_contacto is null or length(telefono_contacto) between 6 and 40);

comment on column public.reportes.email_contacto is
  'Email de contacto que el autor dejó al avisar a la institución. Para la regla mínimo email o teléfono (S3); viaja en el aviso al organismo pero no se muestra al público.';
comment on column public.reportes.telefono_contacto is
  'Teléfono de contacto que el autor dejó al avisar a la institución (opción A: se captura solo al avisar, no vive en profiles). Viaja en el aviso al organismo pero no se muestra al público.';
