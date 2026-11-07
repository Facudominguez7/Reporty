"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { MascotaCompactCard } from "@/components/mascota-compact-card"
import type { MascotaLista } from "@/database/queries/mascotas/listado"
import { buildReportesReturnTo } from "@/lib/reportes/navigation"

export function buildMascotasPaginationUrl(offset: number, search: string) {
  const current = new URLSearchParams(search)
  const query = new URLSearchParams({ offset: String(offset), limite: "12" })
  for (const key of ["tipo", "estadoMascota", "searchMascota"] as const) {
    const value = current.get(key)
    if (value) query.set(key, value)
  }
  return `/api/mascotas?${query.toString()}`
}

export function ListaMascotasClient({ initialPets, initialHasMore }: { initialPets: MascotaLista[]; initialHasMore: boolean }) {
  const params = useSearchParams()
  const [pets, setPets] = useState(initialPets)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)
  const returnTo = buildReportesReturnTo(params.toString())
  async function loadMore() {
    setLoading(true)
    try {
      const response = await fetch(buildMascotasPaginationUrl(pets.length, params.toString()))
      if (!response.ok) throw new Error("No se pudieron cargar más mascotas")
      const result = await response.json()
      setPets((current) => [...current, ...result.data])
      setHasMore(result.hasMore)
    } catch (error) { console.error("Error al cargar más mascotas:", error) }
    finally { setLoading(false) }
  }
  return <>
    <div className="incident-list grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">{pets.map((pet) => <MascotaCompactCard key={pet.id} pet={pet} returnTo={returnTo} />)}</div>
    {pets.length > 0 && <div className="mt-6 flex justify-center">{hasMore ? <Button onClick={loadMore} disabled={loading} className="min-w-56">{loading ? "Cargando mascotas..." : "Cargar más mascotas"}</Button> : <p className="text-sm text-muted-foreground">No hay más mascotas para mostrar</p>}</div>}
  </>
}
