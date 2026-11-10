import { describe, expect, it, vi } from "vitest"

import {
  compartirHistoria,
  encuadrarFoto,
  partirEnLineas,
  datosHistoriaMascota,
  datosHistoriaReporte,
  tonoHexEstado,
  tonoHexPrioridad,
} from "./historia-instagram"

/** Medidor falso: cada carácter mide 10 px. */
const medir = (texto: string) => texto.length * 10

describe("encuadrarFoto", () => {
  it("recorta los costados de una foto apaisada para llenar la caja sin deformarla", () => {
    expect(encuadrarFoto(2000, 1000, 500, 500)).toEqual({ sx: 500, sy: 0, sw: 1000, sh: 1000 })
  })

  it("recorta arriba y abajo de una foto vertical", () => {
    expect(encuadrarFoto(1000, 2000, 500, 500)).toEqual({ sx: 0, sy: 500, sw: 1000, sh: 1000 })
  })
})

describe("partirEnLineas", () => {
  it("corta por palabras sin pasarse del ancho", () => {
    expect(partirEnLineas("bache en la esquina", medir, 100, 3)).toEqual(["bache en", "la esquina"])
  })

  it("respeta el máximo de líneas y termina la última con puntos suspensivos", () => {
    const lineas = partirEnLineas("uno dos tres cuatro cinco seis siete", medir, 90, 2)
    expect(lineas).toHaveLength(2)
    expect(lineas[1].endsWith("…")).toBe(true)
    expect(medir(lineas[1])).toBeLessThanOrEqual(90)
  })

  it("corta una palabra más larga que el ancho en lugar de desbordar", () => {
    const [linea] = partirEnLineas("Supercalifragilístico", medir, 100, 1)
    expect(medir(linea)).toBeLessThanOrEqual(100)
    expect(linea.endsWith("…")).toBe(true)
  })
})

describe("tonos de la historia", () => {
  it("usa los mismos tonos que los chips de la ficha", () => {
    expect(tonoHexPrioridad("Alta")).toBe("#CC3D3D")
    expect(tonoHexEstado("Reparado")).toBe("#278C5A")
    expect(tonoHexEstado("Pendiente")).toBe("#CA9D33")
    expect(tonoHexPrioridad("Desconocida")).toMatch(/^#/)
  })
})

describe("datosHistoriaReporte", () => {
  it("lleva prioridad, estado y categoría como chips, y la calle con su pin", () => {
    const datos = datosHistoriaReporte({
      titulo: "Bache",
      prioridad: "Alta",
      estado: "Pendiente",
      categoria: "Bache",
      direccion: "Bolívar 1450, Posadas",
      fotoUrl: null,
      url: "u",
    })

    expect(datos.chips).toEqual([
      { texto: "Alta", tono: "#CC3D3D" },
      { texto: "Pendiente", tono: "#CA9D33" },
      { texto: "Bache", tono: "#5E5A9A" },
    ])
    expect(datos.direccion).toBe("Bolívar 1450, Posadas")
    expect(datos.llamado).toBe("Mirá el reporte y sumá tu aporte en")
  })
})

describe("datosHistoriaMascota", () => {
  it("arma la historia de una mascota perdida con su estado en rojo y un llamado a avisar", () => {
    const datos = datosHistoriaMascota({
      especie: "Perro",
      estado: "Perdida",
      descripcion: "Golden con collar azul",
      direccion: null,
      fotoUrl: "/api/mascotas/4/foto",
      url: "https://reporty.com.ar/mascotas/4",
    })

    expect(datos.titulo).toBe("Perro perdido")
    expect(datos.chips).toEqual([{ texto: "Perdido", tono: "#CC3D3D" }])
    expect(datos.detalle).toBe("Golden con collar azul")
    expect(datos.direccion).toBeNull()
    expect(datos.llamado).toBe("¿Lo viste? Avisá desde la publicación en")
  })

  it("usa el verde y un llamado neutro cuando la mascota ya fue encontrada", () => {
    const datos = datosHistoriaMascota({ especie: "Gato", estado: "Encontrada", descripcion: "", direccion: null, fotoUrl: null, url: "u" })

    expect(datos.titulo).toBe("Gato encontrado")
    expect(datos.chips).toEqual([{ texto: "Encontrado", tono: "#278C5A" }])
    expect(datos.detalle).toBeNull()
    expect(datos.llamado).toBe("Mirá la publicación en")
  })
})

describe("datosHistoriaMascota con calle", () => {
  it("muestra la calle donde se vio la mascota, con su pin", () => {
    const datos = datosHistoriaMascota({ especie: "Perro", estado: "Perdida", descripcion: "Golden", direccion: "Bolívar 1450, Posadas", fotoUrl: null, url: "u" })
    expect(datos.direccion).toBe("Bolívar 1450, Posadas")
  })
})

describe("compartirHistoria", () => {
  const archivo = new File(["x"], "historia.png", { type: "image/png" })
  const url = "https://reporty.com.ar/reportes/85"

  it("abre el menú del sistema con la imagen y copia el link para el sticker", async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    const descargar = vi.fn()

    const resultado = await compartirHistoria(archivo, url, { share, canShare: () => true, clipboard: { writeText } }, descargar)

    expect(resultado).toBe("compartida")
    expect(share).toHaveBeenCalledWith({ files: [archivo] })
    expect(writeText).toHaveBeenCalledWith(url)
    expect(descargar).not.toHaveBeenCalled()
  })

  it("trata cerrar el menú como cancelación, sin descargar", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cerrado", "AbortError"))
    const descargar = vi.fn()

    expect(await compartirHistoria(archivo, url, { share, canShare: () => true }, descargar)).toBe("cancelada")
    expect(descargar).not.toHaveBeenCalled()
  })

  it("descarga la imagen cuando el navegador no puede compartir archivos", async () => {
    const descargar = vi.fn()
    const writeText = vi.fn().mockResolvedValue(undefined)

    expect(await compartirHistoria(archivo, url, { canShare: () => false, clipboard: { writeText } }, descargar)).toBe("descargada")
    expect(descargar).toHaveBeenCalledWith(archivo)
    expect(writeText).toHaveBeenCalledWith(url)
  })

  it("descarga si compartir falla por otro motivo", async () => {
    const share = vi.fn().mockRejectedValue(new Error("NotAllowed"))
    const descargar = vi.fn()

    expect(await compartirHistoria(archivo, url, { share, canShare: () => true }, descargar)).toBe("descargada")
    expect(descargar).toHaveBeenCalledWith(archivo)
  })
})
