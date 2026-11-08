/**
 * Rutas de la aplicación que exigen una cuenta registrada.
 *
 * El acceso como invitado (sesión anónima) sirve para comentar y para reportar incidentes,
 * pero no para publicar mascotas perdidas: la base rechaza esas publicaciones de cuentas
 * anónimas. Cuando el destino de `/auth` es una de estas rutas, ofrecer «Invitado» deja a la
 * persona en un bucle entre `/auth` y la página, así que la pantalla de acceso no debe ofrecerlo.
 */

/** Rutas que necesitan una cuenta registrada, sin la barra final. */
const RUTAS_CON_CUENTA = ["/mascotas/nueva"] as const

/**
 * Indica si el destino de `/auth` exige una cuenta registrada.
 *
 * Ignora la barra final, los parámetros de la consulta y el hash, y un destino que no sea
 * interno de la aplicación nunca exige cuenta: no se navega hacia afuera desde acá.
 *
 * @param destino Valor del parámetro `next`, tal como llegó en la URL.
 * @returns `true` cuando el destino es una ruta que necesita cuenta registrada.
 */
export function requiereCuentaRegistrada(destino: string | null | undefined): boolean {
  if (!destino) return false
  const sinConsulta = destino.split(/[?#]/, 1)[0].trim()
  if (!sinConsulta.startsWith("/") || sinConsulta.startsWith("//")) return false
  const ruta = sinConsulta.length > 1 ? sinConsulta.replace(/\/+$/, "") : sinConsulta
  return RUTAS_CON_CUENTA.some((rutaConCuenta) => ruta === rutaConCuenta || ruta.startsWith(`${rutaConCuenta}/`))
}

/** Descripción de la tarjeta de acceso cuando el destino no exige cuenta registrada. */
export const DESCRIPCION_ACCESO_GENERAL =
  "Ingresá o registrate para comentar, votar y sumar puntos. Para reportar también podés continuar como invitado."

/** Descripción de la tarjeta de acceso cuando el destino exige cuenta registrada. */
export const DESCRIPCION_ACCESO_CON_CUENTA =
  "Para publicar una mascota perdida necesitás una cuenta con correo confirmado: ingresá o registrate."

/**
 * Elige la descripción de la tarjeta de acceso según lo que exija el destino.
 *
 * @param solicitaCuenta Resultado de `requiereCuentaRegistrada` para el destino actual.
 * @returns Texto visible de la tarjeta.
 */
export function descripcionAcceso(solicitaCuenta: boolean): string {
  return solicitaCuenta ? DESCRIPCION_ACCESO_CON_CUENTA : DESCRIPCION_ACCESO_GENERAL
}
