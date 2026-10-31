create unique index moderacion_imagenes_reemplazo_activo_unico
  on public.moderacion_imagenes (reemplaza_foto_id)
  where reemplaza_foto_id is not null
    and estado_publicacion in ('pendiente', 'reclamada', 'publicando');
