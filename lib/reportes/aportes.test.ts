/** Contrato de la actividad comunitaria y las actualizaciones administrativas (S4). */
import { describe, expect, it } from "vitest"

import { mergeReportActivity } from "./aportes"

const TRANSICION = {
  id: 9,
  reporte_id: 4,
  estado_anterior_id: 1,
  estado_nuevo_id: 2,
  created_at: "2026-01-02T12:00:00Z",
  comentario: "Por votación",
  estado_nuevo: { id: 2, nombre: "Reparado" },
  usuario: { username: "Administradora" },
}

describe("actividad de reportes", () => {
  it("mantiene el contenido, detalle y usuario de una transición real", () => {
    expect(mergeReportActivity([], [TRANSICION])).toEqual([{
      kind: "status",
      id: "status-9",
      createdAt: "2026-01-02T12:00:00Z",
      content: "El reporte cambió a Reparado",
      detail: "Por votación",
      username: "Administradora",
      legacy: false,
    }])
  })

  it("muestra el comentario de una actualización sin transición y sin detalle", () => {
    const [entrada] = mergeReportActivity([], [{
      ...TRANSICION,
      estado_anterior_id: 1,
      estado_nuevo_id: 1,
      comentario: "La foto no corresponde al lugar",
    }])

    expect(entrada).toMatchObject({
      kind: "status",
      id: "status-9",
      content: "La foto no corresponde al lugar",
      username: "Administradora",
    })
    expect(entrada).toMatchObject({ detail: null })
  })

  it.each([null, "", "   "])("usa un texto administrativo cuando falta el comentario: %j", (comentario) => {
    const [entrada] = mergeReportActivity([], [{
      ...TRANSICION,
      estado_anterior_id: 1,
      estado_nuevo_id: 1,
      comentario,
    }])

    expect(entrada.content).toBe("Actualización realizada por administración.")
    expect(entrada).toMatchObject({ detail: null })
  })

  it("conserva el orden cronológico y los aportes al mezclar eventos", () => {
    const actividad = mergeReportActivity([
      { id: 1, reporte_id: 4, usuario_id: "u1", contenido: "Texto histórico libre", tipo_aporte: null, created_at: "2026-01-03T12:00:00Z", profiles: { username: "Ana" } },
      { id: 2, reporte_id: 4, usuario_id: "u2", contenido: "El problema sigue igual", tipo_aporte: "problema_sigue_igual", created_at: "2026-01-01T12:00:00Z", profiles: [{ username: "Sol" }] },
    ], [
      { ...TRANSICION, id: 10, estado_anterior_id: 1, estado_nuevo_id: 1, created_at: "2026-01-04T12:00:00Z", comentario: "Revisión cancelada" },
      TRANSICION,
    ])

    expect(actividad.map(({ id }) => id)).toEqual(["comment-2", "status-9", "comment-1", "status-10"])
    expect(actividad[0]).toMatchObject({ content: "El problema sigue igual", username: "Sol", legacy: false })
    expect(actividad[2]).toMatchObject({ content: "Texto histórico libre", username: "Ana", legacy: true })
    expect(actividad[3]).toMatchObject({ content: "Revisión cancelada" })
  })
})
