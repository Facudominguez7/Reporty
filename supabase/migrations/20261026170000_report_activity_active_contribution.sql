drop index public.idx_comentarios_reporte_usuario_aporte_unico;

create unique index idx_comentarios_reporte_usuario_aporte_unico
  on public.comentarios_reporte (usuario_id, reporte_id)
  where tipo_aporte is not null and deleted_at is null;
