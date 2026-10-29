-- Catalogs the app needs to work, copied from production on 2026-10-21. No personal data.
-- `npm run db:setup -- --empty` loads this file for an empty local database; the production
-- copy already includes these rows.

INSERT INTO public.categorias VALUES (1, 'Bache');
INSERT INTO public.categorias VALUES (2, 'Semaforo');
INSERT INTO public.categorias VALUES (3, 'Arbol caido');
INSERT INTO public.categorias VALUES (4, 'Alumbrado');
INSERT INTO public.categorias VALUES (5, 'Residuos');
INSERT INTO public.categorias VALUES (6, 'Seguridad');
INSERT INTO public.categorias VALUES (7, 'Otros');
INSERT INTO public.categorias VALUES (8, 'Agua');
INSERT INTO public.estados VALUES (1, 'Pendiente');
INSERT INTO public.estados VALUES (2, 'Reparado');
INSERT INTO public.estados VALUES (3, 'Rechazado');
INSERT INTO public.prioridades VALUES (1, 'Alta');
INSERT INTO public.prioridades VALUES (2, 'Media');
INSERT INTO public.prioridades VALUES (3, 'Baja');
INSERT INTO public.roles VALUES (1, 'admin');
INSERT INTO public.roles VALUES (2, 'ciudadano');
INSERT INTO public.roles VALUES (3, 'interesado');
INSERT INTO public.roles VALUES (4, 'operador');
INSERT INTO public.roles VALUES (5, 'invitado');
SELECT pg_catalog.setval('public.categorias_id_seq', 8, true);
SELECT pg_catalog.setval('public.estados_id_seq', 2, true);
SELECT pg_catalog.setval('public.prioridades_id_seq', 3, true);
SELECT pg_catalog.setval('public.roles_id_seq', 4, true);

-- Public bucket for report photos, as in production: 100 KB per file, images only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('reportes', 'reportes', true, 102400, ARRAY['image/jpeg', 'image/png', 'image/webp']);
