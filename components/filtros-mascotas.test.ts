import "./filtros-mascotas.test.tsx"
import { describe, expect, it } from "vitest"
import { buildMascotasFilterHref, prepareMascotasFilterApply } from "./filtros-mascotas"
import { buildEstadoMascotaHref } from "./estado-mascotas"

describe("pet filter navigation", () => {
  it("preserves incident criteria without reusing incident state as pet state", () => {
    expect(buildMascotasFilterHref("vista=mascotas&search=bache&categoria=otros&estado=pendiente&prioridad=alta&estadoMascota=perdida", "estadoMascota", "encontrada"))
      .toBe("/reportes?vista=mascotas&search=bache&categoria=otros&estado=pendiente&prioridad=alta&estadoMascota=encontrada")
  })
  it("applies a selected or cleared type only on confirmation and closes the drawer", () => {
    expect(prepareMascotasFilterApply("vista=mascotas&search=negro&estadoMascota=perdida&offset=24", "gato"))
      .toEqual({ href: "/reportes?vista=mascotas&search=negro&estadoMascota=perdida&tipo=gato", open: false })
    expect(prepareMascotasFilterApply("vista=mascotas&tipo=perro&estadoMascota=encontrada&offset=12", "all"))
      .toEqual({ href: "/reportes?vista=mascotas&estadoMascota=encontrada", open: false })
  })

  it("resets pagination and removes a cleared pet filter", () => {
    expect(buildMascotasFilterHref("vista=mascotas&tipo=gato&offset=24", "tipo", "all"))
      .toBe("/reportes?vista=mascotas")
  })

  it("changes pet status while preserving other filters and resetting pagination", () => {
    expect(buildEstadoMascotaHref("vista=mascotas&tipo=perro&offset=24&search=negro", "encontrada"))
      .toBe("/reportes?vista=mascotas&tipo=perro&search=negro&estadoMascota=encontrada")
    expect(buildEstadoMascotaHref("vista=mascotas&estadoMascota=perdida&offset=12", "all"))
      .toBe("/reportes?vista=mascotas")
  })
})
