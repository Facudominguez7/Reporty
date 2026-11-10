/**
 * Configuración global de Vitest. Fuera de un Worker no existe el binding IMAGES de Cloudflare,
 * así que las pruebas usan un procesador sharp con el mismo contrato.
 */
import { vi } from "vitest"

vi.mock("@/lib/media/procesador-imagenes.server", async (original) => {
  const modulo = await original<typeof import("@/lib/media/procesador-imagenes.server")>()
  const { procesadorImagenesSharp } = await import("./tests/procesador-imagenes-sharp")
  return { ...modulo, obtenerProcesadorImagenes: async () => procesadorImagenesSharp }
})
