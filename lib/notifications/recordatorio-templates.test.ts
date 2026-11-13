import { describe, expect, it } from "vitest"

import {
  armarRecordatorioMascota,
  armarRecordatorioReporte,
  describirAntiguedad,
  nombrarMascota,
} from "./recordatorio-templates"

const base = { urlApp: "https://reporty.com.ar", nombreUsuario: "rosa_posadas", diasDesdePublicacion: 15 }

describe("describirAntiguedad", () => {
  it("usa semanas desde los 14 días y días antes", () => {
    expect(describirAntiguedad(15)).toBe("hace 2 semanas")
    expect(describirAntiguedad(28)).toBe("hace 4 semanas")
    expect(describirAntiguedad(10)).toBe("hace 10 días")
    expect(describirAntiguedad(1)).toBe("hace 1 día")
  })
})

describe("armarRecordatorioReporte", () => {
  const correo = armarRecordatorioReporte({ ...base, reporteId: 482, reporteTitulo: "Bache en Av. Uruguay y Junín", estadoActual: "Pendiente" })

  it("arma el asunto con el título del reporte", () => {
    expect(correo.asunto).toBe('¿Cómo sigue tu reporte "Bache en Av. Uruguay y Junín"?')
  })

  it("incluye saludo, antigüedad, estado y enlace al reporte en HTML y texto", () => {
    expect(correo.html).toContain("¡Hola rosa_posadas!")
    expect(correo.html).toContain("hace 2 semanas")
    expect(correo.html).toContain("PENDIENTE")
    expect(correo.html).toContain('href="https://reporty.com.ar/reportes/482"')
    expect(correo.html).toContain("Revisar mi reporte")
    expect(correo.texto).toContain("Revisar mi reporte: https://reporty.com.ar/reportes/482")
    expect(correo.texto).toContain("cada dos semanas")
  })

  it("escapa el título en el HTML", () => {
    const peligroso = armarRecordatorioReporte({ ...base, reporteId: 1, reporteTitulo: "<script>x</script>", estadoActual: "Pendiente" })
    expect(peligroso.html).not.toContain("<script>x</script>")
    expect(peligroso.html).toContain("&lt;script&gt;")
  })

  it("saluda de forma genérica cuando no hay nombre de usuario", () => {
    const sinNombre = armarRecordatorioReporte({ ...base, nombreUsuario: null, reporteId: 1, reporteTitulo: "Bache", estadoActual: "Pendiente" })
    expect(sinNombre.html).toContain("¡Hola vecino/a!")
  })
})

describe("armarRecordatorioMascota", () => {
  it("nombra a la mascota por su tipo y enlaza a la publicación", () => {
    const correo = armarRecordatorioMascota({ ...base, diasDesdePublicacion: 28, mascotaId: 37, tipoAnimal: "perro" })
    expect(correo.asunto).toBe("¿Hay novedades de tu perro?")
    expect(correo.html).toContain("Perro perdido")
    expect(correo.html).toContain("hace 4 semanas")
    expect(correo.html).toContain('href="https://reporty.com.ar/mascotas/37"')
    expect(correo.texto).toContain("Revisar la publicación: https://reporty.com.ar/mascotas/37")
  })

  it("usa «tu mascota» para tipos sin nombre propio", () => {
    expect(nombrarMascota("gato")).toEqual({ posesivo: "tu gato", titulo: "Gato perdido" })
    expect(nombrarMascota("otro")).toEqual({ posesivo: "tu mascota", titulo: "Mascota perdida" })
    expect(armarRecordatorioMascota({ ...base, mascotaId: 1, tipoAnimal: "otro" }).asunto).toBe("¿Hay novedades de tu mascota?")
  })
})
