-- Administración participa del flujo de evidencia y verificación de reparaciones
-- (L21): informa, confirma e impugna como cualquier cuenta habilitada. La regla de
-- elegibilidad vive en una sola función de apoyo, así que solo se reemplaza esa
-- función y las RPC de `20261106120000_evidencia_reparacion.sql` la aplican igual.
--
-- Se preservan todas las restricciones vigentes (S15, S6):
--   * Operador municipal (rol 4) no informa ni vota: cierra con sus herramientas.
--   * Invitado (rol 5) y sesiones anónimas quedan fuera.
--   * Se sigue exigiendo `auth.users.email_confirmed_at` (también para administración).
--   * El autor de la evidencia nunca confirma ni impugna su propia foto: la RPC
--     `registrar_verificacion_reparacion` mantiene el rechazo `PRE02` sin cambios.
--
-- La migración solo reemplaza una función: no toca tablas, datos históricos ni las
-- firmas de las RPC, por lo que es segura de aplicar sobre la base ya migrada.

create or replace function private.usuario_habilitado_para_reparacion(p_usuario_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = p_usuario_id
      -- Admin (1), Ciudadano (2), Interesado (3) y perfiles sin rol participan;
      -- Operador (4) e Invitado (5) siguen excluidos.
      and (p.rol_id is null or p.rol_id not in (4,5))
      and not coalesce(u.is_anonymous,false)
      and u.email_confirmed_at is not null
  )
$$;
comment on function private.usuario_habilitado_para_reparacion(uuid) is
'Habilita evidencia y verificación a administración y a cuentas registradas con email confirmado (nunca Operador, invitado ni sesión anónima).';

-- `create or replace` conserva la propiedad de la función, pero se reafirma el
-- privilegio para que la función privada siga fuera del alcance de los clientes.
revoke all on function private.usuario_habilitado_para_reparacion(uuid) from public, anon, authenticated;
