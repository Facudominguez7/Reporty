/** Indica si la ruta usa la navegación propia de los paneles de trabajo. */
export function esRutaDePanel(ruta: string): boolean {
  return ["/admin", "/defensoria"].some((base) => ruta === base || ruta.startsWith(`${base}/`))
}

/** Indica si la ruta muestra el encabezado público con logo, Donar, contactos y ayuda. */
export function muestraEncabezadoSuperior(ruta: string): boolean {
  return !esRutaDePanel(ruta) && ruta !== "/" && ruta !== "/mapa" && !ruta.startsWith("/auth")
}
