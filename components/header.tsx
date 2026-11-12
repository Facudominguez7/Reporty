"use client"

import { HeaderClient } from "./header-client"
import { useUsuarioDeSesion } from "./header-sesion"

/**
 * Encabezado global. La sesión se lee en el navegador (`useUsuarioDeSesion`) y no en el servidor,
 * para que las páginas públicas (inicio, términos, privacidad) se sirvan como HTML estático en
 * vez de renderizarse en el worker en cada visita.
 *
 * @returns El encabezado con el enlace de cuenta que corresponde a la sesión.
 */
export default function Header() {
  return <HeaderClient user={useUsuarioDeSesion()} />
}
