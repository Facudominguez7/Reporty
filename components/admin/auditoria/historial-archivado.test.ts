import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { HistorialArchivado } from "./historial-archivado"

// La acción del administrador depende de la sesión; acá solo hace falta que exista.
vi.mock("@/app/admin/auditoria/acciones", () => ({
  simularArchivadoAction: async () => {},
  diagnosticarConexionR2Action: async () => {},
  ejecutarArchivadoManualAction: async () => {},
}))
vi.mock("@/lib/auditoria-archivo/configuracion", () => ({ LIMITE_CORRIDA_MANUAL: 200 }))

const archivo = {
  id: "11111111-1111-4111-8111-111111111111",
  estado: "verificado",
  cantidadRegistros: 1234,
  primeraFecha: "2025-11-01T10:00:00+00:00",
  ultimaFecha: "2026-04-30T10:00:00+00:00",
  tamanoComprimido: Math.round(1.8 * 1024 * 1024),
  hashSha256: "a".repeat(64),
  rutaObjeto: "audit/v1/2025/11/audit-41-42-aaaaaaaaaaaaaaaa.jsonl.gz",
}

const metricas = {
  eventosArchivados: 1234,
  bytesEnR2: Math.round(1.8 * 1024 * 1024),
  elegibles: 400,
  eventosEnPostgres: 5000,
  espacioTablaBytes: 15 * 1024 * 1024,
  lotes: 1,
  lotesFallidos: 0,
  lotesPendientesPurga: 0,
}

function renderizar(props: Partial<Parameters<typeof HistorialArchivado>[0]> = {}) {
  return renderToStaticMarkup(createElement(HistorialArchivado, {
    archivos: [archivo],
    metricas,
    filtros: {},
    mostrarPruebas: true,
    diasRetencion: 180,
    eventoMasViejo: "2026-10-27T15:08:21+00:00",
    ahora: new Date("2026-11-09T12:00:00.000Z"),
    ...props,
  }))
}

describe("HistorialArchivado", () => {
  it("muestra métricas, período, tamaño y hash corto del lote", () => {
    const html = renderizar()

    expect(html).toContain("Historial archivado")
    expect(html).toContain("Consultá los períodos archivados y recuperá eventos sin restaurarlos")
    expect(html).toContain("Eventos archivados")
    expect(html).toContain("1.234")
    expect(html).toContain("Tamaño en R2")
    expect(html).toContain("1,8 MB")
    expect(html).toContain("Espacio liberable en PostgreSQL")
    expect(html).toContain("1,2 MB")
    expect(html).toContain("Estimación; no implica que ya se haya liberado.")
    expect(html).toContain("01/11/2025 – 30/04/2026")
    expect(html).toContain("1.234 eventos")
    expect(html).toContain("SHA-256")
    expect(html).toContain("aaaaaaaaaaaa")
    expect(html).toContain("Verificado")
    expect(html).toContain("1 lote")
    // El estado se lee sin esfuerzo: texto más grande que el badge por defecto y un punto de color.
    expect(html).toMatch(/text-\[0\.7rem\][^"]*tracking-\[0\.04em\][^"]*">\s*<span aria-hidden="true" class="size-\[7px\] rounded-full bg-current/)
  })

  it("enlaza la descarga y la recuperación solo por rutas del servidor", () => {
    const html = renderizar()

    expect(html).toContain(`/admin/auditoria/archivo/${archivo.id}`)
    expect(html).toContain(`/api/admin/auditoria/archivo/${archivo.id}/descarga`)
    expect(html).not.toMatch(/r2\.cloudflarestorage\.com|\.r2\.dev|X-Amz-Signature/)
    expect(html).not.toContain(archivo.rutaObjeto)
  })

  it("aclara que el dry-run no modifica nada, sin repetir que la página es de Admin", () => {
    const html = renderizar()

    expect(html).toContain("Ejecutar archivado (dry-run)")
    expect(html).toContain("El dry-run no modifica ni elimina datos.")
    expect(html).not.toMatch(/solo admin/i)
    expect(html).toContain('id="archivo-desde"')
    expect(html).toContain('id="archivo-hasta"')
    expect(html).toContain('name="desde"')
    expect(html).toContain('name="hasta"')
    expect(html).toContain('type="date"')
  })

  it("explica el resultado de la simulación sin prometer cambios", () => {
    expect(renderizar({ simulacion: "7" })).toContain("se archivarían 7 eventos anteriores al 13/05/2026")
    expect(renderizar({ simulacion: "error" })).toContain("revisá la configuración de Cloudflare R2")
  })

  it("explica por qué la simulación da cero y cuándo habrá algo para archivar", () => {
    const html = renderizar({ simulacion: "0" })

    expect(html).toContain("no hay eventos anteriores al 13/05/2026 (retención de 180 días)")
    expect(html).toContain("El primero será elegible el 25/04/2027")
    expect(html).toContain("No se modificó ni se eliminó nada.")
  })

  it("aclara el cero cuando todavía no hay eventos registrados", () => {
    expect(renderizar({ simulacion: "0", eventoMasViejo: null })).toContain("todavía no hay eventos de auditoría registrados")
  })

  it("muestra el estado vacío", () => {
    const html = renderizar({ archivos: [] })

    expect(html).toContain("Todavía no hay lotes archivados")
    expect(html).toContain("Los períodos archivados van a aparecer acá cuando haya lotes disponibles.")
    expect(html).toContain("0 lotes")
  })

  it("muestra los lotes sin archivo con las acciones deshabilitadas y su explicación", () => {
    const fallido = renderizar({ archivos: [{ ...archivo, id: "fallido", estado: "fallido", rutaObjeto: null }] })

    expect(fallido).toContain("Fallido")
    expect(fallido).toContain("El archivado falló; el archivo no está disponible.")
    expect(fallido).toContain("disabled")
    expect(fallido).not.toContain("/archivo/fallido")
    expect(fallido).not.toContain("/descarga")

    const subido = renderizar({ archivos: [{ ...archivo, id: "subido", estado: "subido" }] })

    expect(subido).toContain("Subido")
    expect(subido).toContain("Disponible después de verificar la integridad del archivo.")
    expect(subido).not.toContain("/archivo/subido")
  })

  it("informa el error de carga y aclara que los archivos son privados", () => {
    const html = renderizar({ hayError: true })

    expect(html).toContain("No pudimos cargar el historial archivado.")
    expect(html).toContain("bucket privado")
    expect(html).toContain("toda consulta y descarga se autoriza en el servidor")
    expect(html).toContain("Ningún archivo histórico se elimina automáticamente")
  })
})

describe("pruebas previas a producción", () => {
  it("ofrece el diagnóstico de R2 y una corrida real acotada, plegados", () => {
    const html = renderizar()

    expect(html).toContain("<details")
    expect(html).toContain("Probar antes de producción")
    expect(html).toContain("Probar conexión con R2")
    expect(html).toContain("Ejecutar corrida real (máx. 200)")
    expect(html).toContain("Estas acciones escriben en el bucket")
    expect(html).toContain("acá sirven para validar el ciclo completo en local")
  })

  it("informa el resultado del diagnóstico y de la corrida real", () => {
    expect(renderizar({ r2: "ok", r2Detalle: "Lectura, escritura e integridad verificadas." }))
      .toContain("Conexión con R2 verificada")
    expect(renderizar({ r2: "error", r2Detalle: "El token no tiene permiso de escritura (AccessDenied)." }))
      .toContain("El token no tiene permiso de escritura")
    expect(renderizar({ archivado: "ok", archivadoEventos: "12", archivadoPurgado: "0" }))
      .toContain("12 eventos archivados y 0 eliminados de PostgreSQL")
    expect(renderizar({ archivado: "error" }))
      .toContain("los eventos quedaron en PostgreSQL")
  })
})

describe("pruebas en producción", () => {
  it("no muestra el bloque de pruebas cuando está deshabilitado", () => {
    const html = renderizar({ mostrarPruebas: false })

    expect(html).not.toContain("Probar antes de producción")
    expect(html).not.toContain("Probar conexión con R2")
    expect(html).not.toContain("Ejecutar corrida real")
    // El dry-run no modifica nada y sigue disponible.
    expect(html).toContain("Ejecutar archivado (dry-run)")
  })
})

describe("dry-run separado de los filtros", () => {
  it("el dry-run no comparte formulario con el rango de fechas y explica qué simula", () => {
    const html = renderizar()
    const formularioFiltros = html.slice(html.indexOf('aria-label="Filtrar historial archivado"'))
    const finFiltros = formularioFiltros.indexOf("</form>")

    expect(formularioFiltros.slice(0, finFiltros)).not.toContain("dry-run")
    expect(html).toContain("Simula el próximo lote: eventos de más de 180 días (anteriores al 13/05/2026).")
    expect(html).toContain("El rango filtra solo la lista de lotes archivados.")
  })

  it("vuelve a la sección al aplicar filtros en lugar de saltar al principio", () => {
    expect(renderizar()).toContain('action="/admin/auditoria#lotes-archivados"')
    expect(renderizar()).toContain('id="lotes-archivados"')
  })
})
