"use client"

import { useEffect } from "react"

import { guardarCapaPreferida, type CapaPreferida } from "@/lib/preferencias/capa"

/**
 * Guarda como preferida la capa que la persona está viendo en la lista de reportes, así la
 * elección se mantiene al volver a la lista o al abrir el mapa. No pinta nada.
 *
 * @param capa - Capa visible en este momento.
 */
export function RecordarCapa({ capa }: { capa: CapaPreferida }) {
  useEffect(() => {
    guardarCapaPreferida(capa)
  }, [capa])

  return null
}
