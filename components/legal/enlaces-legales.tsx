"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { muestraEncabezadoSuperior } from "@/lib/routes/encabezado"

const claseEnlace = "underline-offset-4 hover:text-foreground hover:underline"

/**
 * Línea con los enlaces a los términos y a la política de privacidad, al final del contenido
 * de las páginas con encabezado. Reporty no tiene footer: en el mapa los enlaces van en la
 * atribución de Leaflet.
 */
export function EnlacesLegales() {
  const pathname = usePathname()
  if (!muestraEncabezadoSuperior(pathname)) return null

  return (
    <nav aria-label="Enlaces legales" className="flex justify-center gap-2 px-4 py-4 text-xs text-muted-foreground">
      <Link href="/terminos" className={claseEnlace}>Términos y condiciones</Link>
      <span aria-hidden="true">·</span>
      <Link href="/privacidad" className={claseEnlace}>Política de privacidad</Link>
    </nav>
  )
}
