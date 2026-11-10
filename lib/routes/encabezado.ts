/**
 * Indica si la ruta muestra el encabezado superior (logo, Donar, contactos y ayuda).
 * El mapa, el inicio, el ingreso y el panel admin tienen su propia interfaz a pantalla completa.
 */
export function muestraEncabezadoSuperior(ruta: string): boolean {
  const esAdmin = ruta === "/admin" || ruta.startsWith("/admin/")
  return !esAdmin && ruta !== "/" && ruta !== "/mapa" && !ruta.startsWith("/auth")
}
