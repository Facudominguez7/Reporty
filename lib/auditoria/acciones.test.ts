import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  ACCIONES_AUDITORIA,
  ACCIONES_ARCHIVO,
  ACCIONES_EVIDENCIA,
  accionesPorGrupo,
  esAccionAuditoria,
  etiquetaAccion,
  fraseAccion,
} from "./acciones"

/**
 * Acciones que las migraciones permiten hoy en `audit_events`.
 *
 * Se leen del repositorio (no de git) para que el test falle cuando una migración
 * amplía el catálogo y este archivo se queda atrás.
 */
function accionesPermitidasPorLasMigraciones(): string[] {
  const directorio = join(process.cwd(), "supabase", "migrations")
  const acciones = new Set<string>()

  for (const nombre of readdirSync(directorio).sort()) {
    if (!nombre.endsWith(".sql")) continue
    const contenido = readFileSync(join(directorio, nombre), "utf8")
    for (const bloque of contenido.matchAll(/audit_events_action_check check \(action in \(([\s\S]*?)\)\)/g)) {
      for (const accion of bloque[1].matchAll(/'([a-z_]+)'/g)) acciones.add(accion[1])
    }
  }

  return [...acciones].sort()
}

describe("catálogo de acciones de auditoría", () => {
  it("describe todas las acciones que hoy permiten las migraciones", () => {
    const permitidas = accionesPermitidasPorLasMigraciones()

    expect(permitidas.length).toBeGreaterThanOrEqual(11)
    expect(ACCIONES_AUDITORIA.map((accion) => accion.valor).sort()).toEqual(permitidas)
  })

  it("describe las acciones de evidencia que el panel no mostraba", () => {
    for (const accion of [
      "evidence_submitted", "evidence_confirmed", "evidence_challenged",
      "evidence_challenge_resolved", "evidence_approved", "evidence_rejected", "evidence_reverted",
    ]) {
      expect(esAccionAuditoria(accion)).toBe(true)
      expect(fraseAccion(accion)).not.toBe("realizó una acción de auditoría")
    }
    expect(ACCIONES_EVIDENCIA).toHaveLength(7)
  })

  it("describe las operaciones administrativas del archivo histórico", () => {
    for (const accion of ["audit_archive_uploaded", "audit_archive_verified", "audit_archive_purged", "audit_archive_downloaded"]) {
      expect(esAccionAuditoria(accion)).toBe(true)
    }
    expect(ACCIONES_ARCHIVO).toHaveLength(4)
    expect(fraseAccion("audit_archive_purged")).toMatch(/archivado/)
  })

  it("no repite valores ni deja etiquetas vacías", () => {
    const valores = ACCIONES_AUDITORIA.map((accion) => accion.valor)

    expect(new Set(valores).size).toBe(valores.length)
    for (const accion of ACCIONES_AUDITORIA) {
      expect(accion.etiqueta.trim()).not.toBe("")
      expect(accion.frase.trim()).not.toBe("")
      expect(accion.frase.endsWith(".")).toBe(false)
    }
  })

  it("no rompe con una acción desconocida ni con valores fuera del catálogo", () => {
    expect(esAccionAuditoria("accion_del_futuro")).toBe(false)
    expect(esAccionAuditoria(undefined)).toBe(false)
    expect(fraseAccion("accion_del_futuro")).toBe("realizó una acción de auditoría")
    expect(etiquetaAccion("accion_del_futuro")).toBe("accion_del_futuro")
  })

  it("agrupa las acciones para el filtro del panel", () => {
    const grupos = accionesPorGrupo()

    expect(grupos.map((grupo) => grupo.grupo)).toEqual(["reportes", "evidencias", "archivo"])
    expect(grupos.flatMap((grupo) => grupo.acciones)).toHaveLength(ACCIONES_AUDITORIA.length)
  })
})
