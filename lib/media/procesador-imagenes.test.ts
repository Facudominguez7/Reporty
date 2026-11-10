/** Pruebas del procesador que usa el binding IMAGES de Cloudflare, con un binding simulado. */
import { describe, expect, it, vi } from "vitest"

vi.unmock("@/lib/media/procesador-imagenes.server")

import { crearProcesadorCloudflare, type BindingImagenes } from "./procesador-imagenes.server"

/** Crea un binding falso que registra las llamadas y devuelve bytes fijos. */
function bindingFalso() {
  const transformaciones: unknown[] = []
  const salidas: unknown[] = []
  const binding: BindingImagenes = {
    info: vi.fn(async () => ({ format: "image/png", fileSize: 10, width: 640, height: 480 })),
    input: vi.fn(() => {
      const manejador = {
        transform(opciones: unknown) {
          transformaciones.push(opciones)
          return manejador
        },
        async output(opciones: unknown) {
          salidas.push(opciones)
          return { response: () => new Response(new Uint8Array([1, 2, 3])) }
        },
      }
      return manejador
    }),
  }
  return { binding, transformaciones, salidas }
}

describe("crearProcesadorCloudflare", () => {
  it("lee formato y dimensiones con info()", async () => {
    const { binding } = bindingFalso()
    const info = await crearProcesadorCloudflare(binding).info(new Uint8Array([9]))
    expect(info).toEqual({ formato: "image/png", ancho: 640, alto: 480 })
    expect(binding.info).toHaveBeenCalledOnce()
  })

  it("codifica a WebP fijo, sin animación y sin redimensionar el original", async () => {
    const { binding, transformaciones, salidas } = bindingFalso()
    const bytes = await crearProcesadorCloudflare(binding).codificarWebp(new Uint8Array([9]), { calidad: 65 })
    expect(Array.from(bytes)).toEqual([1, 2, 3])
    expect(transformaciones).toEqual([])
    expect(salidas).toEqual([{ format: "image/webp", quality: 65, anim: false }])
  })

  it("achica la miniatura dentro del lado máximo sin agrandarla", async () => {
    const { binding, transformaciones } = bindingFalso()
    await crearProcesadorCloudflare(binding).codificarWebp(new Uint8Array([9]), { calidad: 80, ladoMaximo: 384 })
    expect(transformaciones).toEqual([{ width: 384, height: 384, fit: "scale-down" }])
  })

  it("rechaza dimensiones que el binding no puede informar", async () => {
    const { binding } = bindingFalso()
    vi.mocked(binding.info).mockResolvedValueOnce({ format: "image/svg+xml" })
    await expect(crearProcesadorCloudflare(binding).info(new Uint8Array([9]))).rejects.toThrow("dimensiones")
  })
})
