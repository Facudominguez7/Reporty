/**
 * Aviso automático por correo a los organismos del directorio de contactos cuando se publica un
 * reporte. Es best-effort: el llamador (`crearReporteWorkflow`) ya confirmó la creación y un fallo
 * de correo no debe afectarla, por lo que los errores de envío se tragan por contacto y los de
 * consulta se propagan para que el llamador decida.
 */
import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { sendOrganismoNotificationEmail } from "@/lib/notifications/report-notifications"
import { resolveReportMunicipality } from "@/lib/map/report-coverage"

/**
 * Nombres de categoría tal como los guarda `report_contact_directory` (sin tildes); difieren de
 * los nombres visibles del formulario, que sí las llevan.
 */
const CATEGORIAS_DIRECTORIO: Record<number, string> = {
  1: "Bache",
  2: "Semaforo",
  3: "Arbol caido",
  4: "Alumbrado",
  5: "Residuos",
  6: "Seguridad",
  7: "Otros",
  8: "Agua",
}

export type AvisoOrganismoInput = {
  reporteId: number
  titulo: string
  categoriaId: number
  descripcion: string | null
  lat: number | null
  lon: number | null
}

/**
 * Notifica por correo a cada canal de correo vigente del directorio para el municipio y la
 * categoría del reporte y devuelve las direcciones efectivamente notificadas, para que la
 * interfaz pueda mostrárselas a quien creó el reporte. Nunca es destinatario el canal de
 * escalamiento (prioridad 3, p. ej. Defensoría con otros canales): ese sigue siendo una opción
 * manual de seguimiento.
 *
 * @param supabase - Cliente de sesión; el directorio es de lectura pública.
 * @param input - Datos ya confirmados del reporte creado.
 * @returns Correos de los organismos a los que salió el aviso.
 */
export async function notificarOrganismosDeReporte(
  supabase: SupabaseClient,
  input: AvisoOrganismoInput,
): Promise<string[]> {
  const categoria = CATEGORIAS_DIRECTORIO[input.categoriaId]
  const municipio = input.lat !== null && input.lon !== null
    ? resolveReportMunicipality(input.lat, input.lon)
    : null
  if (!categoria || !municipio) return []

  const { data: contactos, error } = await supabase
    .from("report_contact_directory")
    .select("id, organization, channel_value")
    .eq("municipality", municipio)
    .eq("category", categoria)
    .eq("channel_type", "email")
    .neq("verification_status", "disabled")
    .lte("priority", 2)
  if (error) throw error
  if (!contactos?.length) return []

  // Un fallo de envío aislado no bloquea a los demás destinatarios del mismo reporte; sólo los
  // envíos resueltos se informan como enviados.
  const resultados = await Promise.allSettled(
    contactos.map((contacto) =>
      sendOrganismoNotificationEmail({
        destinatario: contacto.channel_value,
        organizacion: contacto.organization,
        reporteId: input.reporteId,
        reporteTitulo: input.titulo,
        categoria,
        descripcion: input.descripcion,
        contactoId: contacto.id,
      }),
    ),
  )
  const enviados = contactos
    .filter((_, indice) => {
      const resultado = resultados[indice]
      return resultado?.status === "fulfilled" && !resultado.value?.error && Boolean(resultado.value?.data)
    })
    .map((contacto) => contacto.channel_value)
  if (!enviados.length) throw new Error("No se pudo enviar el aviso a ningún organismo.")
  return enviados
}
