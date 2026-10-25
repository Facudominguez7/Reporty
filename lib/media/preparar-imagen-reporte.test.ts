/** Pruebas con archivos reales de la frontera de decodificación. */
import sharp from "sharp"
import { describe, expect, it, vi } from "vitest"
import { prepararImagenReporte } from "./preparar-imagen-reporte.server"
import { validateUploadedReportImage, validateUploadedReportThumbnail } from "./report-image-validation.server"
import { buildReportImagePublicUrl } from "./report-images"

/** Genera una imagen sintética sin acceder a archivos personales. */
async function imagen(formato: "jpeg" | "png" | "webp", ancho = 32) {
  const bytes = await sharp({ create: { width: ancho, height: 24, channels: 3, background: "red" } })[formato]().toBuffer()
  return new File([new Uint8Array(bytes)], `prueba.${formato}`, { type: `image/${formato}` })
}

describe("prepararImagenReporte", () => {
  it.each(["jpeg", "png", "webp"] as const)("decodifica %s y produce dos WebP acotados", async (formato) => {
    const archivo = await imagen(formato)
    const original = await validateUploadedReportImage(archivo)
    const resultado = await prepararImagenReporte(archivo)
    expect(original.width).toBe(32)
    expect(resultado.original.length).toBeLessThanOrEqual(102400)
    expect(resultado.miniatura.length).toBeLessThanOrEqual(102400)
    const metadatos = await sharp(resultado.original).metadata()
    expect(metadatos.format).toBe("webp")
    expect(metadatos.exif).toBeUndefined()
    expect((await sharp(resultado.miniatura).metadata()).width).toBeLessThanOrEqual(384)
  })
  it("rechaza tamaño antes de leer bytes", async () => {
    const archivo = new File([new Uint8Array(102401)], "grande.png", { type: "image/png" })
    const lectura = vi.spyOn(archivo, "arrayBuffer")
    await expect(prepararImagenReporte(archivo)).rejects.toThrow("100 KB")
    expect(lectura).not.toHaveBeenCalled()
  })
  it.each(["jpeg", "png", "webp"] as const)("rechaza %s truncado aunque tenga encabezado", async (formato) => {
    const archivo = await imagen(formato)
    const bytes = new Uint8Array(await archivo.arrayBuffer())
    await expect(prepararImagenReporte(new File([bytes.slice(0, Math.floor(bytes.length * 0.7))], archivo.name, { type: archivo.type }))).rejects.toThrow()
  })
  it("rechaza bytes inválidos, MIME falso y dimensiones excesivas", async () => {
    await expect(prepararImagenReporte(new File(["no es imagen"], "x.png", { type: "image/png" }))).rejects.toThrow()
    const archivo = await imagen("png")
    await expect(prepararImagenReporte(new File([await archivo.arrayBuffer()], "x.jpg", { type: "image/jpeg" }))).rejects.toThrow("formato real")
    await expect(prepararImagenReporte(await imagen("png", 1537))).rejects.toThrow()
  })
  it("rechaza WebP animado real", async () => {
    const pixeles = Buffer.from([255,0,0,255,0,0,255,0,0,255,0,0,0,0,255,0,0,255,0,0,255,0,0,255])
    const bytes = await sharp(pixeles, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp().toBuffer()
    expect((await sharp(bytes, { animated: true }).metadata()).pages).toBe(2)
    await expect(prepararImagenReporte(new File([new Uint8Array(bytes)], "animada.webp", { type: "image/webp" }))).rejects.toThrow()
  })
  it("elimina EXIF real y mantiene los contratos del validador compartido", async () => {
    const origen = await imagen("jpeg")
    const bytes = await sharp(await origen.arrayBuffer()).withMetadata().jpeg().toBuffer()
    expect((await sharp(bytes).metadata()).exif).toBeDefined()
    const preparado = await prepararImagenReporte(new File([new Uint8Array(bytes)], "exif.jpg", { type: "image/jpeg" }))
    expect((await sharp(preparado.original).metadata()).exif).toBeUndefined()
    expect((await validateUploadedReportThumbnail(await imagen("jpeg"))).type).toBe("image/jpeg")
    await expect(validateUploadedReportThumbnail(await imagen("png"))).rejects.toThrow("WebP o JPG")
  })
  it("conserva resolución pública canónica y fallback legacy", () => {
    expect(buildReportImagePublicUrl({ bucket: "reportes", path: "1/foto", publicUrl: "legacy" }, "https://sintetico.test")).toBe("https://sintetico.test/storage/v1/object/public/reportes/1/foto")
    expect(buildReportImagePublicUrl({ bucket: "reportes", path: "1/foto", publicUrl: "legacy" }, "")).toBe("legacy")
  })
})
