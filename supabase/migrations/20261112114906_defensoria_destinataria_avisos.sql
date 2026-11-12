-- La Defensoría del Pueblo pasó a recibir el aviso automático de todos los reportes de Posadas:
-- su canal de correo deja de ser escalamiento (prioridad 3) y entra al rango de destinatarios
-- automáticos (prioridad 2). Sus canales de WhatsApp y teléfono siguen en prioridad 3, porque
-- en la hoja de contactos siguen siendo instancia complementaria de seguimiento manual.
update public.report_contact_directory
set priority = 2
where municipality = 'Posadas'
  and organization = 'Defensoría del Pueblo'
  and channel_type = 'email'
  and priority = 3;
