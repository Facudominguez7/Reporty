/** Contratos del aviso por correo a los organismos del directorio de contactos. */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

const dobles = vi.hoisted(() => ({ sendOrganismo: vi.fn(), resolveMunicipio: vi.fn() }))
vi.mock("@/lib/notifications/report-notifications", () => ({ sendOrganismoNotificationEmail: dobles.sendOrganismo }))
vi.mock("@/lib/map/report-coverage", () => ({ resolveReportMunicipality: dobles.resolveMunicipio }))
import { notificarOrganismosDeReporte } from "./notificar-organismos"

const entrada = {
  reporteId: 7,
  titulo: "Bache en Bolívar 1450, Posadas",
  categoriaId: 1,
  descripcion: "Frente a la plaza",
  lat: -27.37,
  lon: -55.9,
}

const contactoEmail = {
  id: 3,
  organization: "Movilidad Urbana",
  channel_value: "movilidadurbana@posadas.gov.ar",
  verification_status: "pending",
  priority: 2,
}

/** Doble de la consulta encadenada al directorio de contactos. */
function directorio(filas: unknown[], error: unknown = null) {
  const consulta = {
    select: vi.fn(() => consulta),
    eq: vi.fn(() => consulta),
    neq: vi.fn(() => consulta),
    lte: vi.fn(() => consulta),
    then: (resolver: (valor: unknown) => unknown) => Promise.resolve({ data: filas, error }).then(resolver),
  }
  return { from: vi.fn(() => consulta), consulta }
}

beforeEach(() => {
  vi.clearAllMocks()
  dobles.resolveMunicipio.mockReturnValue("Posadas")
  dobles.sendOrganismo.mockResolvedValue({ data: { id: "correo" }, error: null })
})

describe("notificarOrganismosDeReporte", () => {
  it("busca canales de correo del municipio y la categoría del directorio", async () => {
    const doble = directorio([contactoEmail])
    await notificarOrganismosDeReporte(doble as unknown as SupabaseClient, entrada)
    const { consulta } = doble
    expect(consulta.eq).toHaveBeenCalledWith("municipality", "Posadas")
    expect(consulta.eq).toHaveBeenCalledWith("category", "Bache")
    expect(consulta.eq).toHaveBeenCalledWith("channel_type", "email")
    expect(consulta.neq).toHaveBeenCalledWith("verification_status", "disabled")
    // La Defensoría (prioridad 3, escalamiento) nunca es destinataria del aviso automático.
    expect(consulta.lte).toHaveBeenCalledWith("priority", 2)
  })

  it("envía un correo por cada canal y devuelve los destinatarios notificados", async () => {
    const supabase = directorio([contactoEmail, { ...contactoEmail, id: 5, channel_value: "otro@posadas.gov.ar" }]) as unknown as SupabaseClient
    await expect(notificarOrganismosDeReporte(supabase, entrada)).resolves.toEqual(["movilidadurbana@posadas.gov.ar", "otro@posadas.gov.ar"])
    expect(dobles.sendOrganismo).toHaveBeenCalledTimes(2)
    expect(dobles.sendOrganismo).toHaveBeenCalledWith(expect.objectContaining({
      destinatario: "movilidadurbana@posadas.gov.ar",
      organizacion: "Movilidad Urbana",
      reporteId: 7,
      reporteTitulo: "Bache en Bolívar 1450, Posadas",
      categoria: "Bache",
      descripcion: "Frente a la plaza",
    }))
    expect(dobles.sendOrganismo).toHaveBeenCalledWith(expect.objectContaining({ destinatario: "otro@posadas.gov.ar" }))
  })

  it("un fallo de envío no bloquea los demás avisos y sólo lista los confirmados", async () => {
    dobles.sendOrganismo.mockResolvedValueOnce({ data: null, error: new Error("provider error") })
    const supabase = directorio([contactoEmail, { ...contactoEmail, id: 5, channel_value: "otro@posadas.gov.ar" }]) as unknown as SupabaseClient
    await expect(notificarOrganismosDeReporte(supabase, entrada)).resolves.toEqual(["otro@posadas.gov.ar"])
    expect(dobles.sendOrganismo).toHaveBeenCalledTimes(2)
  })

  it("sin cobertura municipal no consulta el directorio ni envía nada", async () => {
    dobles.resolveMunicipio.mockReturnValue(null)
    const supabase = directorio([contactoEmail]) as unknown as SupabaseClient
    await notificarOrganismosDeReporte(supabase, entrada)
    expect(supabase.from).not.toHaveBeenCalled()
    expect(dobles.sendOrganismo).not.toHaveBeenCalled()
  })

  it.each([
    { nombre: "sin cobertura municipal", entradaAlterada: { lat: null, lon: null } },
    { nombre: "categoría sin nombre en el directorio", entradaAlterada: { categoriaId: 99 } },
  ])("$nombre devuelve lista vacía sin consultar ni enviar", async ({ entradaAlterada }) => {
    const supabase = directorio([contactoEmail]) as unknown as SupabaseClient
    await expect(notificarOrganismosDeReporte(supabase, { ...entrada, ...entradaAlterada })).resolves.toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
    expect(dobles.sendOrganismo).not.toHaveBeenCalled()
  })

  it("sin canales de correo disponibles no envía nada", async () => {
    const supabase = directorio([]) as unknown as SupabaseClient
    await expect(notificarOrganismosDeReporte(supabase, entrada)).resolves.toEqual([])
    expect(dobles.sendOrganismo).not.toHaveBeenCalled()
  })
})
