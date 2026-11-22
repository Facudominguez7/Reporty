/**
 * Página del mapa interactivo de reportes
 * 
 * Este componente Server Component se encarga de:
 * - Cargar reportes pendientes y reparados con coordenadas desde Supabase.
 *   Los reportes rechazados no se muestran en el mapa.
 * - Renderizar el MapaClient con los datos
 * - Manejar los searchParams para los filtros
 */

import { MapaClient } from "./mapa-client"
import { getReportMapData, getCategorias, getPrioridades } from "@/database/queries/reportes/get-reportes"
import { getMascotasMapa } from "@/database/queries/mascotas/mapa"
import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo/site"
import { cookies } from "next/headers"
import { COOKIE_CAPA_PREFERIDA, normalizarCapa } from "@/lib/preferencias/capa"
import { leerFocoReporte } from "@/lib/map/foco-reporte"
import { REPORT_STATE_IDS } from "@/lib/authz/catalog"

export const dynamic = "force-dynamic"

export const metadata: Metadata = pageMetadata({
  title: "Mapa de problemas urbanos en Posadas",
  description:
    "Mirá en el mapa los problemas urbanos pendientes y reparados que vecinos de Posadas, Misiones, reportaron cerca tuyo.",
  path: "/mapa",
})

/**
 * Props del componente - searchParams de Next.js para filtros
 */
type MapaPageProps = {
  searchParams: Promise<{
    search?: string
    categoria?: string
    estado?: string
    prioridad?: string
    reporte?: string
    lat?: string
    lon?: string
  }>
}

/**
 * Página servidor que carga reportes con coordenadas y las opciones de filtro, y renderiza el componente cliente del mapa con esos datos.
 *
 * @param props.searchParams - Promise de un objeto con propiedades opcionales `search`, `categoria`, `estado` y `prioridad` que se usan como filtros para los reportes.
 * @returns El elemento React que renderiza MapaClient con los reportes (o un arreglo vacío), las listas de categorías, estados y prioridades (o arreglos vacíos) y un mensaje de error o `null`.
 */
export default async function MapaPage({ searchParams }: MapaPageProps) {
  // Obtener los parámetros de búsqueda
  const [params, almacenCookies] = await Promise.all([searchParams, cookies()])
  const { search, categoria, estado, prioridad } = params
  const focoReporte = leerFocoReporte(params)
  // Al llegar desde un reporte se muestran incidentes; si no, la última capa elegida.
  const capaInicial = focoReporte ? "reportes" : normalizarCapa(almacenCookies.get(COOKIE_CAPA_PREFERIDA)?.value)

  // Reports and filter options don't depend on each other, so they load at the same time.
  const [{ data: reportes, error }, { data: categorias }, { data: prioridades }, { data: mascotas, error: mascotasError }] = await Promise.all([
    getReportMapData({
      search,
      categoria,
      estado,
      prioridad,
      limite: 100, // Más reportes para el mapa
      estadosPermitidos: [REPORT_STATE_IDS.PENDIENTE, REPORT_STATE_IDS.REPARADO],
    }),
    getCategorias(),
    getPrioridades(),
    getMascotasMapa(),
  ])

  return (
    <MapaClient
      reportes={reportes ?? []}
      categorias={categorias ?? []}
      estados={[]}
      prioridades={prioridades ?? []}
      mascotas={mascotas ?? []}
      petError={mascotasError?.message ?? null}
      error={error?.message ?? null}
      capaInicial={capaInicial}
      focoReporte={focoReporte}
    />
  )
}
