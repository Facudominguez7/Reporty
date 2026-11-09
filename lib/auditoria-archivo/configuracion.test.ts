import { describe, expect, it } from "vitest"

import {
  ErrorConfiguracionArchivo,
  endpointR2,
  leerConfiguracionArchivo,
  leerSecretoCron,
} from "./configuracion"
import { CLAVE_SECRETA_FALSA, CUENTA_FALSA, ENDPOINT_FALSO, ID_CLAVE_FALSA, SECRETO_CRON_FALSO } from "./__pruebas__/credenciales-falsas"

const entornoValido = {
  R2_ACCOUNT_ID: CUENTA_FALSA,
  R2_ACCESS_KEY_ID: ID_CLAVE_FALSA,
  R2_SECRET_ACCESS_KEY: CLAVE_SECRETA_FALSA,
  R2_BUCKET_NAME: "reporty-audit-archive",
  AUDIT_ARCHIVE_CRON_SECRET: SECRETO_CRON_FALSO,
  AUDIT_HOT_DAYS: "180",
}

describe("leerConfiguracionArchivo", () => {
  it("arma el endpoint oficial de Cloudflare y usa los valores del entorno", () => {
    const configuracion = leerConfiguracionArchivo(entornoValido)

    expect(configuracion).toEqual({
      cuentaR2: entornoValido.R2_ACCOUNT_ID,
      accessKeyId: entornoValido.R2_ACCESS_KEY_ID,
      secretAccessKey: entornoValido.R2_SECRET_ACCESS_KEY,
      bucket: "reporty-audit-archive",
      diasRetencion: 180,
      limitePorLote: 1000,
      purgaHabilitada: false,
      endpoint: ENDPOINT_FALSO,
    })
    expect(endpointR2(CUENTA_FALSA)).toBe(configuracion.endpoint)
  })

  it("rechaza variables faltantes nombrando solo las variables, nunca sus valores", () => {
    const incompleto = { ...entornoValido, R2_SECRET_ACCESS_KEY: undefined, R2_BUCKET_NAME: " " }

    let capturado: unknown
    try {
      leerConfiguracionArchivo(incompleto)
    } catch (error) {
      capturado = error
    }

    expect(capturado).toBeInstanceOf(ErrorConfiguracionArchivo)
    const error = capturado as ErrorConfiguracionArchivo
    expect(error.variablesFaltantes).toEqual(["R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"])
    expect(error.message).toContain("R2_SECRET_ACCESS_KEY")
    expect(error.message).not.toContain(entornoValido.R2_ACCESS_KEY_ID)
    expect(error.message).not.toContain(entornoValido.R2_SECRET_ACCESS_KEY)
  })

  it("acota la retención caliente y el tamaño del lote a un rango seguro", () => {
    expect(() => leerConfiguracionArchivo({ ...entornoValido, AUDIT_HOT_DAYS: "12" })).toThrow(ErrorConfiguracionArchivo)
    expect(() => leerConfiguracionArchivo({ ...entornoValido, AUDIT_HOT_DAYS: "4000" })).toThrow(ErrorConfiguracionArchivo)
    expect(() => leerConfiguracionArchivo({ ...entornoValido, AUDIT_HOT_DAYS: "180.5" })).toThrow(ErrorConfiguracionArchivo)
    expect(() => leerConfiguracionArchivo({ ...entornoValido, AUDIT_ARCHIVE_MAX_BATCH: "0" })).toThrow(ErrorConfiguracionArchivo)
    expect(() => leerConfiguracionArchivo({ ...entornoValido, AUDIT_ARCHIVE_MAX_BATCH: "5001" })).toThrow(ErrorConfiguracionArchivo)

    expect(leerConfiguracionArchivo({ ...entornoValido, AUDIT_HOT_DAYS: "365", AUDIT_ARCHIVE_MAX_BATCH: "250" })).toMatchObject({
      diasRetencion: 365,
      limitePorLote: 250,
    })
  })

  it("solo habilita la purga con el valor explícito true", () => {
    expect(leerConfiguracionArchivo({ ...entornoValido, AUDIT_ARCHIVE_PURGE_ENABLED: "true" }).purgaHabilitada).toBe(true)
    expect(leerConfiguracionArchivo({ ...entornoValido, AUDIT_ARCHIVE_PURGE_ENABLED: "1" }).purgaHabilitada).toBe(false)
    expect(leerConfiguracionArchivo({ ...entornoValido, AUDIT_ARCHIVE_PURGE_ENABLED: undefined }).purgaHabilitada).toBe(false)
  })

  it("rechaza credenciales con formato inválido y buckets fuera de la regla de R2", () => {
    expect(() => leerConfiguracionArchivo({ ...entornoValido, R2_ACCOUNT_ID: "no-es-una-cuenta" })).toThrow(ErrorConfiguracionArchivo)
    expect(() => leerConfiguracionArchivo({ ...entornoValido, R2_ACCESS_KEY_ID: "corta" })).toThrow(ErrorConfiguracionArchivo)
    expect(() => leerConfiguracionArchivo({ ...entornoValido, R2_SECRET_ACCESS_KEY: "corta" })).toThrow(ErrorConfiguracionArchivo)
    expect(() => leerConfiguracionArchivo({ ...entornoValido, R2_BUCKET_NAME: "Reporty_Audit" })).toThrow(ErrorConfiguracionArchivo)
  })
})

describe("leerSecretoCron", () => {
  it("exige un secreto suficientemente largo para autenticar la ejecución programada", () => {
    expect(leerSecretoCron(entornoValido)).toBe(SECRETO_CRON_FALSO)
    expect(() => leerSecretoCron({ ...entornoValido, AUDIT_ARCHIVE_CRON_SECRET: undefined })).toThrow(ErrorConfiguracionArchivo)
    expect(() => leerSecretoCron({ ...entornoValido, AUDIT_ARCHIVE_CRON_SECRET: "corto" })).toThrow(ErrorConfiguracionArchivo)
  })
})
