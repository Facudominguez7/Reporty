-- General contacts are provisional, not confirmed WhatsApp or category-specific channels.
insert into public.report_contact_directory
  (municipality, category, organization, channel_type, channel_value, purpose, priority, source, verification_status)
select 'Garupá', category, 'Municipalidad de Garupá', 'phone', number,
       'Contacto general; competencia por categoría pendiente de confirmar', 2, source, 'pending'
from (values ('Bache'), ('Semaforo'), ('Arbol caido'), ('Alumbrado'),
             ('Residuos'), ('Seguridad'), ('Otros'), ('Agua')) as categories(category)
cross join (values
  ('3764381434', 'https://www.lavozdegarupa.com.ar/inicio/noticia/6551/Municipalidad-de-Garup-Nuevo-Nmero-para-reclamos-3764-381434.html'),
  ('3764300019', 'https://garuapp.sgmgarupa.com/index.php')
) as channels(number, source);
