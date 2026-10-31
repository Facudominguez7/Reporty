-- Preliminary directory: publication in the source is not verification of availability.
create table public.report_contact_directory (
  id bigint generated always as identity primary key,
  municipality text not null check (municipality in ('Posadas', 'Candelaria', 'Garupá')),
  category text not null check (category in ('Bache', 'Semaforo', 'Arbol caido', 'Alumbrado', 'Residuos', 'Seguridad', 'Otros', 'Agua')),
  organization text not null,
  channel_type text not null check (channel_type in ('phone', 'whatsapp', 'email', 'form')),
  channel_value text not null,
  purpose text not null,
  priority integer not null default 1,
  source text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'disabled')),
  verified_at date
);

create index report_contact_directory_lookup_idx on public.report_contact_directory (municipality, category, priority);
alter table public.report_contact_directory enable row level security;
revoke all on public.report_contact_directory from public, anon, authenticated;
grant select on public.report_contact_directory to anon, authenticated;
create policy "Public can read available report contacts" on public.report_contact_directory
  for select to anon, authenticated using (verification_status <> 'disabled');

-- Query shape: select * from report_contact_directory where municipality = ? and category = ? order by priority, id.
-- Pending contacts must be presented as unverified; no fallback across municipalities.
insert into public.report_contact_directory
  (municipality, category, organization, channel_type, channel_value, purpose, priority, source)
select municipality, category, organization, channel_type, channel_value, purpose, priority,
       'docs/directorio-contactos-reporty.md'
from (values
  ('Posadas', 'Alumbrado', 'Atención al Vecino', 'phone', '3764140677', 'Alumbrado público', 1),
  ('Posadas', 'Alumbrado', 'Energía de Misiones', 'whatsapp', '3764242514', 'Incidentes eléctricos', 2),
  ('Posadas', 'Bache', 'Obras Públicas', 'whatsapp', '3764680021', 'Baches', 1),
  ('Posadas', 'Bache', 'Atención al Vecino', 'phone', '3764140677', 'Baches', 2),
  ('Posadas', 'Arbol caido', 'Obras Públicas', 'phone', '3764680021', 'Árboles y ramas', 1),
  ('Posadas', 'Arbol caido', 'Servicios Públicos', 'whatsapp', '3764110709', 'Árboles y ramas', 2),
  ('Posadas', 'Residuos', 'Servicios Públicos', 'whatsapp', '3764110709', 'Residuos', 1),
  ('Posadas', 'Residuos', 'Atención al Vecino', 'phone', '3764140677', 'Residuos', 2),
  ('Posadas', 'Seguridad', 'Atención al Vecino', 'phone', '3764140677', 'Infraestructura o prevención no urgente', 1),
  ('Posadas', 'Semaforo', 'Atención al Vecino', 'phone', '3764140677', 'Semáforos', 1),
  ('Posadas', 'Semaforo', 'Movilidad Urbana', 'phone', '3764188865', 'Semáforos', 2),
  ('Posadas', 'Semaforo', 'Movilidad Urbana', 'email', 'movilidadurbana@posadas.gov.ar', 'Semáforos', 2),
  ('Posadas', 'Otros', 'Atención al Vecino', 'phone', '3764140677', 'Consulta general', 1),
  ('Posadas', 'Agua', 'EPRAC', 'phone', '3765046100', 'Escalamiento regulatorio de agua y cloacas', 2)
) as contacts(municipality, category, organization, channel_type, channel_value, purpose, priority);

insert into public.report_contact_directory
  (municipality, category, organization, channel_type, channel_value, purpose, priority, source)
select municipality, 'Agua', 'SAMSA', 'phone', number, 'Agua potable y cloacas; no desagües pluviales', 1,
       'docs/directorio-contactos-reporty.md'
from (values ('Posadas'), ('Garupá')) as municipalities(municipality)
cross join (values ('08008889980'), ('3764428000')) as numbers(number);

-- Defensoría is a follow-up option, never the first recipient.
insert into public.report_contact_directory
  (municipality, category, organization, channel_type, channel_value, purpose, priority, source)
select 'Posadas', category, 'Defensoría del Pueblo', channel_type, channel_value,
       'Seguimiento o escalamiento institucional', 3, 'docs/directorio-contactos-reporty.md'
from (values ('Bache'), ('Semaforo'), ('Arbol caido'), ('Alumbrado'), ('Residuos'), ('Seguridad'), ('Otros'), ('Agua')) as categories(category)
cross join (values ('whatsapp', '3764125611'), ('phone', '3764433241'), ('email', 'recepcion.defensoria.posadas@gmail.com')) as channels(channel_type, channel_value);

insert into public.report_contact_directory
  (municipality, category, organization, channel_type, channel_value, purpose, source)
select 'Candelaria', category, 'Municipalidad de Candelaria', channel_type, channel_value,
       'Contacto general; competencia por categoría pendiente de confirmar', 'docs/directorio-contactos-reporty.md'
from (values ('Bache'), ('Semaforo'), ('Arbol caido'), ('Alumbrado'), ('Residuos'), ('Seguridad'), ('Otros'), ('Agua')) as categories(category)
cross join (values ('phone', '3764493317'), ('email', 'sec.gob.candelaria@gmail.com')) as channels(channel_type, channel_value);
