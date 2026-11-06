import { describe, expect, it } from "vitest"
import { buildMascotasPaginationUrl } from "./lista-mascotas-client"

describe("pet pagination URL", () => {
  it("sends only pet filters with the current offset, never incident filters", () => {
    expect(buildMascotasPaginationUrl(24, "vista=mascotas&tipo=gato&estadoMascota=encontrada&estado=pendiente&categoria=bache&search=x&searchMascota=collar%20azul"))
      .toBe("/api/mascotas?offset=24&limite=12&tipo=gato&estadoMascota=encontrada&searchMascota=collar+azul")
  })
})
