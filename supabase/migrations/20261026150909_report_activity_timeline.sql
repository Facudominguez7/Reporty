alter table public.comentarios_reporte
  add column tipo_aporte text;

alter table public.comentarios_reporte
  add constraint comentarios_reporte_tipo_aporte_check
  check (
    tipo_aporte is null or tipo_aporte = any (array[
      'problema_sigue_igual',
      'problema_empeoro',
      'problema_mejoro_continua',
      'problema_ya_no_visible',
      'me_comunique_area_responsable',
      'comenzaron_trabajos',
      'trabajos_detenidos'
    ]::text[])
  );

create unique index idx_comentarios_reporte_usuario_aporte_unico
  on public.comentarios_reporte (usuario_id, reporte_id)
  where tipo_aporte is not null;
