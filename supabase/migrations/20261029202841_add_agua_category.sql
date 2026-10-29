-- `db:setup` imports catalogs after migrations on a local reset; there, the lookup is empty.
-- Apply the new row when the existing catalog is present (production and populated local databases).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.categorias
    WHERE (id = 8 AND nombre <> 'Agua') OR (nombre = 'Agua' AND id <> 8)
  ) THEN
    RAISE EXCEPTION 'Agua must use category ID 8; resolve the conflicting categorias row first.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.categorias WHERE id = 7 AND nombre = 'Otros'
  ) THEN
    INSERT INTO public.categorias (id, nombre)
    VALUES (8, 'Agua')
    ON CONFLICT (id) DO NOTHING;

    PERFORM pg_catalog.setval(
      'public.categorias_id_seq'::regclass,
      GREATEST(COALESCE((SELECT MAX(id) FROM public.categorias), 1), 8),
      true
    );
  END IF;
END;
$$;
