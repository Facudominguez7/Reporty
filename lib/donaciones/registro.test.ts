import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

import { ORIGEN_DONACION, type PagoMercadoPago } from "@/lib/donaciones/mercado-pago.server"
import { registrarDonacion } from "@/lib/donaciones/registro.server"

const REFERENCIA = "3f1c8a52-7d4e-4b8a-9c11-2b6f0e9d4a10"
const USUARIO = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d"

/** Pago aprobado de prueba; los cambios pisan los valores por defecto. */
function pago(cambios: Partial<PagoMercadoPago> = {}): PagoMercadoPago {
  return {
    id: 77,
    status: "approved",
    transaction_amount: 2000,
    currency_id: "ARS",
    external_reference: REFERENCIA,
    date_approved: "2026-11-10T15:00:00.000-03:00",
    metadata: { origen: ORIGEN_DONACION, nombre: "Ana", mensaje: "Fuerza", usuario_id: USUARIO },
    ...cambios,
  }
}

/**
 * Supabase falso que guarda lo que se escribe en `donaciones` y responde perfiles y
 * usuarios. `reclamos` simula la marca `agradecimiento_enviado_at` de cada pago.
 */
function supabaseFalso({ email = "ana@example.com", anonimo = false } = {}) {
  const filas = new Map<string, Record<string, unknown>>()
  const actualizaciones: Array<Record<string, unknown>> = []

  const servicio = {
    from(tabla: string) {
      if (tabla === "profiles") {
        return {
          select: (columnas: string) => ({
            eq: () => columnas === "email"
              ? Promise.resolve({ data: [{ email: "admin@example.com" }, { email: "admin@example.com" }, { email: " " }], error: null })
              : { maybeSingle: async () => ({ data: { username: "ana" }, error: null }) },
          }),
        }
      }
      return {
        upsert: async (fila: Record<string, unknown>) => {
          filas.set(String(fila.pago_id), { ...filas.get(String(fila.pago_id)), ...fila })
          return { error: null }
        },
        update: (cambios: Record<string, unknown>) => {
          actualizaciones.push(cambios)
          let soloSinMarca = false
          let pagoId = ""
          const consulta = {
            eq: (_columna: string, valor: string) => { pagoId = valor; return consulta },
            is: () => { soloSinMarca = true; return consulta },
            select: () => consulta,
            maybeSingle: async () => {
              const fila = filas.get(pagoId)
              if (!fila || (soloSinMarca && fila.agradecimiento_enviado_at)) return { data: null, error: null }
              Object.assign(fila, cambios)
              return { data: { pago_id: pagoId }, error: null }
            },
            then: (resolver: (valor: { error: null }) => void) => {
              const fila = filas.get(pagoId)
              if (fila) Object.assign(fila, cambios)
              resolver({ error: null })
            },
          }
          return consulta
        },
      }
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { id: USUARIO, email, is_anonymous: anonimo } }, error: null }) } },
  }

  return { servicio: servicio as unknown as SupabaseClient, filas, actualizaciones }
}

describe("registrarDonacion", () => {
  it("guarda la donación aprobada y avisa al donante y a los admins una sola vez", async () => {
    const { servicio, filas } = supabaseFalso()
    const agradecer = vi.fn(async () => undefined)
    const avisarAdmins = vi.fn(async () => undefined)
    const dependencias = { buscarPago: vi.fn(async () => pago()), agradecer, avisarAdmins }

    const resultado = await registrarDonacion(servicio, "77", dependencias)
    await registrarDonacion(servicio, "77", dependencias)

    expect(resultado.tipo).toBe("registrada")
    expect(filas.get("77")).toMatchObject({ pago_id: "77", monto: 2000, estado: "aprobada", estado_mp: "approved", nombre: "Ana", mensaje: "Fuerza", usuario_id: USUARIO, referencia: REFERENCIA })
    expect(filas.get("77")?.agradecimiento_enviado_at).toEqual(expect.any(String))
    expect(agradecer).toHaveBeenCalledTimes(1)
    expect(agradecer).toHaveBeenCalledWith({ destinatario: "ana@example.com", nombreUsuario: "ana", donacion: { pagoId: "77", monto: 2000, nombre: "Ana", mensaje: "Fuerza" } })
    expect(avisarAdmins).toHaveBeenCalledTimes(1)
    expect(avisarAdmins).toHaveBeenCalledWith({ destinatarios: ["admin@example.com"], donacion: expect.objectContaining({ pagoId: "77" }) })
  })

  it("no manda emails mientras el pago está pendiente", async () => {
    const { servicio, filas } = supabaseFalso()
    const agradecer = vi.fn()
    const avisarAdmins = vi.fn()

    await registrarDonacion(servicio, "77", { buscarPago: async () => pago({ status: "pending" }), agradecer, avisarAdmins })

    expect(filas.get("77")).toMatchObject({ estado: "pendiente", aprobada_at: null })
    expect(agradecer).not.toHaveBeenCalled()
    expect(avisarAdmins).not.toHaveBeenCalled()
  })

  it("no agradece al donante invitado pero sí avisa a los admins", async () => {
    const { servicio } = supabaseFalso({ anonimo: true, email: "" })
    const agradecer = vi.fn()
    const avisarAdmins = vi.fn(async () => undefined)

    await registrarDonacion(servicio, "77", { buscarPago: async () => pago(), agradecer, avisarAdmins })

    expect(agradecer).not.toHaveBeenCalled()
    expect(avisarAdmins).toHaveBeenCalledTimes(1)
  })

  it("si falla el envío, la donación queda registrada y la marca se libera para reintentar", async () => {
    const { servicio, filas } = supabaseFalso()
    const avisarAdmins = vi.fn().mockRejectedValueOnce(new Error("Resend caído")).mockResolvedValue(undefined)
    const dependencias = { buscarPago: async () => pago(), agradecer: vi.fn(async () => undefined), avisarAdmins }

    const primero = await registrarDonacion(servicio, "77", dependencias)
    expect(primero).toMatchObject({ tipo: "registrada", donacion: { estado: "aprobada", monto: 2000 }, avisoPendiente: true })
    expect(filas.get("77")).toMatchObject({ estado: "aprobada", agradecimiento_enviado_at: null })

    const segundo = await registrarDonacion(servicio, "77", dependencias)
    expect(segundo).toMatchObject({ tipo: "registrada", avisoPendiente: false })
    expect(avisarAdmins).toHaveBeenCalledTimes(2)
  })

  it("ignora pagos inexistentes o que no son donaciones sin escribir nada", async () => {
    const { servicio, filas } = supabaseFalso()

    await expect(registrarDonacion(servicio, "1", { buscarPago: async () => null })).resolves.toEqual({ tipo: "ignorada" })
    await expect(registrarDonacion(servicio, "1", { buscarPago: async () => pago({ metadata: {} }) })).resolves.toEqual({ tipo: "ignorada" })
    expect(filas.size).toBe(0)
  })
})
