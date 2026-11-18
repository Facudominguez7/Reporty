/**
 * Preferencia de capa (incidentes o mascotas) compartida entre la lista de reportes y el
 * mapa. Se guarda en una cookie para que el servidor de `/reportes` y `/mapa` la lea en
 * el primer render: si la persona pasó a «Mascotas» en un lado, el otro abre igual y la
 * elección se mantiene al volver.
 */

export const COOKIE_CAPA_PREFERIDA = "reporty_capa"

export type CapaPreferida = "reportes" | "mascotas"

/** Un año: la preferencia es una comodidad, no un dato sensible. */
const DURACION_COOKIE_SEGUNDOS = 60 * 60 * 24 * 365

/**
 * Normaliza el valor guardado en la cookie. Cualquier cosa desconocida vuelve a incidentes.
 *
 * @param valor - Valor crudo de la cookie, si existe.
 * @returns La capa preferida válida.
 */
export function normalizarCapa(valor: string | null | undefined): CapaPreferida {
  return valor === "mascotas" ? "mascotas" : "reportes"
}

/**
 * Decide qué vista muestra la lista de reportes. El parámetro `vista` explícito manda;
 * sin él se respeta la última capa elegida.
 *
 * @param vista - Parámetro `vista` de la URL (`mascotas` o `incidentes`).
 * @param cookie - Valor de la cookie de capa preferida.
 * @returns `true` si la lista debe mostrar mascotas.
 */
export function listadoMuestraMascotas(vista: string | undefined, cookie: string | null | undefined): boolean {
  if (vista === "mascotas") return true
  if (vista === "incidentes") return false
  return normalizarCapa(cookie) === "mascotas"
}

/**
 * Arma el texto `Set-Cookie` de la preferencia, apto para `document.cookie`.
 *
 * @param capa - Capa elegida.
 * @returns La cookie serializada.
 */
export function serializarCookieCapa(capa: CapaPreferida): string {
  return `${COOKIE_CAPA_PREFERIDA}=${capa}; Path=/; Max-Age=${DURACION_COOKIE_SEGUNDOS}; SameSite=Lax`
}

/**
 * Guarda la capa elegida desde el navegador. Si las cookies están bloqueadas no hace nada:
 * la app sigue funcionando con incidentes por defecto.
 *
 * @param capa - Capa elegida.
 */
export function guardarCapaPreferida(capa: CapaPreferida): void {
  try {
    document.cookie = serializarCookieCapa(capa)
  } catch {
    // Cookies bloqueadas: la preferencia simplemente no se recuerda.
  }
}
