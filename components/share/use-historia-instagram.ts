"use client"

import { useRef } from "react"

import { compartirHistoria, descargarArchivo, type ResultadoHistoria } from "@/lib/share/historia-instagram"

/**
 * Prepara y comparte la imagen de la historia de Instagram de una ficha.
 *
 * La imagen se genera al abrir el menú «Compartir» (`preparar`), así al tocar
 * «Historia de Instagram» (`compartir`) ya está lista: Safari sólo acepta
 * `navigator.share` pegado al toque.
 *
 * @param crear - Genera el archivo PNG de la historia.
 * @param avisar - Recibe el resultado, o `"error"` si la imagen no se pudo armar.
 */
export function useHistoriaInstagram(
  crear: () => Promise<File>,
  avisar: (resultado: ResultadoHistoria | "error") => void,
) {
  const pendiente = useRef<Promise<File> | null>(null)

  /** Genera la imagen una sola vez; si falla, el próximo intento la rehace. */
  const preparar = () => {
    if (pendiente.current) return
    const promesa = crear()
    promesa.catch(() => {
      pendiente.current = null
    })
    pendiente.current = promesa
  }

  /** Abre el menú del sistema con la imagen, o la descarga si no se puede compartir. */
  const compartir = async () => {
    preparar()
    try {
      avisar(await compartirHistoria(await pendiente.current!, navigator, descargarArchivo))
    } catch {
      avisar("error")
    }
  }

  return { preparar, compartir }
}
