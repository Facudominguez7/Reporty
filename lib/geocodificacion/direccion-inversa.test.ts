import { describe, expect, it, vi } from "vitest"

import { formatearDireccion, obtenerDireccion, type DireccionNominatim } from "./direccion-inversa"

/** Respuesta mínima de Nominatim con los campos de `address` que se pasen. */
function respuesta(address: Record<string, string> | undefined, ok = true) {
  return { ok, json: async () => (address ? { address } : { error: "Unable to geocode" }) } as Response
}

describe("formatearDireccion", () => {
  it("arma «calle altura, ciudad» cuando Nominatim conoce la altura", () => {
    expect(formatearDireccion({ road: "Avenida Uruguay", house_number: "2150", city: "Posadas" })).toBe(
      "Avenida Uruguay 2150, Posadas",
    )
  })

  it("usa sólo la calle y la localidad cuando no hay altura", () => {
    expect(formatearDireccion({ road: "Bolívar", town: "Garupá" })).toBe("Bolívar, Garupá")
  })

  it("quita el «Municipio de» que Nominatim antepone a la localidad", () => {
    expect(formatearDireccion({ road: "Tucumán", house_number: "1992", city: "Municipio de Posadas" })).toBe(
      "Tucumán 1992, Posadas",
    )
  })

  it("no inventa una calle: sin `road` no hay dirección", () => {
    expect(formatearDireccion({ suburb: "Villa Sarita", city: "Posadas" } as DireccionNominatim)).toBeNull()
  })
})

describe("obtenerDireccion", () => {
  it("consulta Nominatim en español, identificándose, y devuelve la dirección", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuesta({ road: "Bolívar", house_number: "1450", city: "Posadas" }))

    const direccion = await obtenerDireccion(-27.36708, -55.8961, fetchFalso)

    expect(direccion).toBe("Bolívar 1450, Posadas")
    const [url, opciones] = fetchFalso.mock.calls[0]
    expect(String(url)).toContain("/reverse?")
    expect(String(url)).toContain("lat=-27.36708")
    expect(String(url)).toContain("lon=-55.8961")
    expect(String(url)).toContain("accept-language=es")
    expect(opciones.headers["User-Agent"]).toMatch(/^Reporty/)
  })

  it("devuelve null si el servicio responde con error", async () => {
    expect(await obtenerDireccion(-27.3, -55.9, vi.fn().mockResolvedValue(respuesta(undefined, false)))).toBeNull()
  })

  it("devuelve null si la red falla o se agota el tiempo, sin lanzar", async () => {
    expect(await obtenerDireccion(-27.3, -55.9, vi.fn().mockRejectedValue(new Error("timeout")))).toBeNull()
  })

  it("devuelve null cuando Nominatim no encuentra nada", async () => {
    expect(await obtenerDireccion(-27.3, -55.9, vi.fn().mockResolvedValue(respuesta(undefined)))).toBeNull()
  })
})
