alter table public.moderacion_imagenes
  add column reemplaza_foto_id bigint;

alter table public.moderacion_imagenes
  add constraint moderacion_imagenes_reemplaza_foto_fkey
  foreign key (reemplaza_foto_id) references public.fotos_reporte(id) on delete set null;
