import type { MascotaMapa } from "@/database/queries/mascotas/mapa"

export function buildMapaMascotasFilterHref(search: string, filtros: { tipo: string; estado: string; search: string }) {
  const params = new URLSearchParams(search)
  const apply = (key: string, value: string) => value && value !== "all" ? params.set(key, value) : params.delete(key)
  apply("tipoMascota", filtros.tipo)
  apply("estadoMascota", filtros.estado)
  apply("searchMascota", filtros.search.trim())
  return params.size ? `/mapa?${params}` : "/mapa"
}

export function filtrarMascotasMapa(mascotas: MascotaMapa[], filtros: { tipo: string; estado: string; search: string }) {
  const term = filtros.search.trim().toLocaleLowerCase("es")
  return mascotas.filter((pet) =>
    (filtros.tipo === "all" || pet.species.toLowerCase() === (filtros.tipo === "otro" ? "otro animal" : filtros.tipo)) &&
    (filtros.estado === "all" || pet.status.toLowerCase() === filtros.estado) &&
    (!term || `${pet.species} ${pet.description}`.toLocaleLowerCase("es").includes(term)),
  )
}
