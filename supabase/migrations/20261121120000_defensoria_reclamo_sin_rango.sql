-- S5: el número externo es obligatorio, sin rango de longitud.
-- Los espacios coinciden con String.trim(). Se aplica a escrituras nuevas sin
-- bloquear la migración por valores históricos que permitía la regla anterior.
alter table public.reclamos_defensoria
  drop constraint reclamos_defensoria_numero_reclamo_check,
  add constraint reclamos_defensoria_numero_reclamo_check
  check (btrim(numero_reclamo, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> '') not valid;

comment on column public.reclamos_defensoria.numero_reclamo is
  'Texto libre no vacío del sistema externo de la Defensoría. No se edita después de confirmar.';
