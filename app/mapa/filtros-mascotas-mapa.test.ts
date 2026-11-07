import { describe, expect, it } from "vitest"
import { buildMapaMascotasFilterHref, filtrarMascotasMapa } from "./filtros-mascotas-mapa"
import type { MascotaMapa } from "@/database/queries/mascotas/mapa"

const pets: MascotaMapa[] = [
  { id: 1, species: "Perro", description: "Collar rojo", status: "Perdida", createdAt: "2026-01-01", phone: "1", image: "/1", coordinates: [-34, -58] },
  { id: 2, species: "Gato", description: "Blanco", status: "Encontrada", createdAt: "2026-01-02", phone: "2", image: "/2", coordinates: [-34, -58] },
]

describe("pet map filters", () => {
  it("preserves incident filters while storing pet-specific map filters separately", () => {
    expect(buildMapaMascotasFilterHref("search=bache&estado=pendiente&tipoMascota=perro", { tipo: "gato", estado: "encontrada", search: "  blanco " }))
      .toBe("/mapa?search=bache&estado=pendiente&tipoMascota=gato&estadoMascota=encontrada&searchMascota=blanco")
    expect(buildMapaMascotasFilterHref("tipoMascota=gato&estadoMascota=perdida", { tipo: "all", estado: "all", search: "" })).toBe("/mapa")
  })
})

describe("filtrarMascotasMapa", () => {
  it("filters by type, status and case-insensitive text without changing unfiltered results", () => {
    expect(filtrarMascotasMapa(pets, { tipo: "perro", estado: "perdida", search: "COLLAR" }).map((pet) => pet.id)).toEqual([1])
    expect(filtrarMascotasMapa(pets, { tipo: "all", estado: "encontrada", search: "" }).map((pet) => pet.id)).toEqual([2])
    expect(filtrarMascotasMapa(pets, { tipo: "all", estado: "all", search: "" })).toEqual(pets)
  })
})
