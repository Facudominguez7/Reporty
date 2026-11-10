import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
import { guardarDireccionMascota } from "./direccion-mascota.server"

/** Cliente falso que registra el update sobre `mascotas_perdidas`. */
function clienteFalso(error: unknown = null) {
  const eq = vi.fn(async () => ({ error }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  return { cliente: { from } as never, from, update, eq }
}

describe("guardarDireccionMascota", () => {
  it("guarda la calle encontrada para esas coordenadas", async () => {
    const { cliente, from, update, eq } = clienteFalso()
    const buscar = vi.fn(async () => "Bolívar 1450, Posadas")

    expect(await guardarDireccionMascota(cliente, 4, -27.36, -55.89, buscar)).toBe("Bolívar 1450, Posadas")
    expect(buscar).toHaveBeenCalledWith(-27.36, -55.89)
    expect(from).toHaveBeenCalledWith("mascotas_perdidas")
    expect(update).toHaveBeenCalledWith({ direccion: "Bolívar 1450, Posadas" })
    expect(eq).toHaveBeenCalledWith("id", 4)
  })

  it("no escribe nada si no se encontró la calle", async () => {
    const { cliente, from } = clienteFalso()
    expect(await guardarDireccionMascota(cliente, 4, 0, 0, async () => null)).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it("nunca lanza: un error al guardar no rompe la publicación", async () => {
    const { cliente } = clienteFalso({ message: "permission denied" })
    await expect(guardarDireccionMascota(cliente, 4, 1, 1, async () => "Calle 1")).resolves.toBeNull()
  })
})
