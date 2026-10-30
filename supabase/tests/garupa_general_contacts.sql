-- Run with psql -v ON_ERROR_STOP=1 against an isolated database where the
-- report_contact_directory migration is applied but the Garupá migration is not.
-- The migration and all assertions are rolled back, including on success.
BEGIN;
CREATE TEMP TABLE contacts_before AS SELECT * FROM public.report_contact_directory;
\ir ../migrations/20261030135335_garupa_general_contacts.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.categorias) THEN
    RAISE EXCEPTION 'Category catalog is empty';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES ('Posadas'), ('Candelaria'), ('Garupá')) AS m(name)
    CROSS JOIN public.categorias AS c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.report_contact_directory d
      WHERE d.municipality = m.name AND d.category = c.nombre
        AND d.channel_type IN ('phone', 'email')
        AND d.verification_status <> 'disabled'
    )
  ) THEN
    RAISE EXCEPTION 'A municipality/category pair has no available phone or email';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES ('Bache'), ('Semaforo'), ('Arbol caido'), ('Alumbrado'),
      ('Residuos'), ('Seguridad'), ('Otros'), ('Agua')) AS c(name)
    CROSS JOIN (VALUES
      ('3764381434', 'https://www.lavozdegarupa.com.ar/inicio/noticia/6551/Municipalidad-de-Garup-Nuevo-Nmero-para-reclamos-3764-381434.html'),
      ('3764300019', 'https://garuapp.sgmgarupa.com/index.php')
    ) AS n(number, source)
    WHERE (SELECT count(*) FROM public.report_contact_directory d
      WHERE d.municipality = 'Garupá' AND d.category = c.name
        AND d.organization = 'Municipalidad de Garupá' AND d.channel_type = 'phone'
        AND d.channel_value = n.number AND d.source = n.source
        AND d.verification_status = 'pending' AND d.verified_at IS NULL
        AND d.priority > 1) <> 1
  ) THEN
    RAISE EXCEPTION 'Garupá provisional phone contact missing or incorrect';
  END IF;

  IF (SELECT count(*) FROM public.report_contact_directory
      WHERE municipality = 'Garupá' AND category = 'Agua' AND organization = 'SAMSA'
        AND channel_type = 'phone' AND channel_value IN ('08008889980', '3764428000')
        AND priority = 1 AND verification_status <> 'disabled') <> 2 THEN
    RAISE EXCEPTION 'Garupá SAMSA priority contacts missing';
  END IF;

  IF EXISTS (SELECT * FROM contacts_before EXCEPT SELECT * FROM public.report_contact_directory) THEN
    RAISE EXCEPTION 'An existing contact was changed or removed';
  END IF;
  IF (SELECT count(*) FROM public.report_contact_directory) <> (SELECT count(*) + 16 FROM contacts_before) THEN
    RAISE EXCEPTION 'Unexpected number of inserted contacts';
  END IF;
END $$;
ROLLBACK;
