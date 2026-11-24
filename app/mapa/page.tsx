/**
 * Página del mapa interactivo de reportes
 * 
 * Este componente Server Component se encarga de:
 * - Cargar por zona (#281) los reportes pendientes, tomados por la Defensoría y reparados de
 *   la primera vista: toda Posadas, o la zona del reporte al llegar desde su detalle. Después
 *   el mapa pide en el navegador la zona que se está viendo. Los rechazados nunca se muestran.
 * - Renderizar el MapaClient con los datos
 * - Manejar los searchParams para los filtros
 */

import { MapaClient } from "./mapa-client"
import { getCategorias, getPrioridades } from "@/database/queries/reportes/get-reportes"
import { cargarZonaMapa } from "@/database/queries/reportes/mapa-por-zona"
import { getMascotasMapa } from "@/database/queries/mascotas/mapa"
import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo/site"
import { cookies } from "next/headers"
import { COOKIE_CAPA_PREFERIDA, normalizarCapa } from "@/lib/preferencias/capa"
import { leerFocoReporte, ZOOM_FOCO_REPORTE, type FocoReporte } from "@/lib/map/foco-reporte"
import { POSADAS_BOUNDS, POSADAS_MIN_ZOOM } from "@/lib/map/initial-view"
import { ajustarZonaAlMapa, type ZonaMapa } from "@/lib/map/zona"

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

/** Medio lado, en grados, de la zona que se carga alrededor de un reporte en foco (~1 km). */
const RADIO_ZONA_FOCO = 0.01

/**
 * Zona y zoom de la primera vista: toda Posadas, o alrededor del reporte en foco.
 *
 * @param foco - Reporte al que se llega desde su detalle, si lo hay.
 * @returns Zona ajustada al mapa y su zoom.
 */
function primeraZona(foco: FocoReporte | null): { zona: ZonaMapa; zoom: number } {
  const [sur, oeste, norte, este] = POSADAS_BOUNDS
  const ciudad = { zona: ajustarZonaAlMapa({ oeste, sur, este, norte }, POSADAS_MIN_ZOOM)!, zoom: POSADAS_MIN_ZOOM }
  if (!foco) return ciudad
  const zona = ajustarZonaAlMapa({
    oeste: foco.lon - RADIO_ZONA_FOCO,
    sur: foco.lat - RADIO_ZONA_FOCO,
    este: foco.lon + RADIO_ZONA_FOCO,
    norte: foco.lat + RADIO_ZONA_FOCO,
  }, ZOOM_FOCO_REPORTE)
  return zona ? { zona, zoom: ZOOM_FOCO_REPORTE } : ciudad
}

/**
 * Página servidor que carga reportes con coordenadas y las opciones de filtro, y renderiza el componente cliente del mapa con esos datos.
 *
 * @param props.searchParams - Promise de un objeto con propiedades opcionales `search`, `categoria`, `estado` y `prioridad` que se usan como filtros para los reportes.
 * @returns El elemento React que renderiza MapaClient con el contenido de la primera zona (puntos o grupos), las listas de categorías, estados y prioridades (o arreglos vacíos) y un mensaje de error o `null`.
 */
export default async function MapaPage({ searchParams }: MapaPageProps) {
  // Obtener los parámetros de búsqueda
  const [params, almacenCookies] = await Promise.all([searchParams, cookies()])
  const { search, categoria, estado, prioridad } = params
  const focoReporte = leerFocoReporte(params)
  // Al llegar desde un reporte se muestran incidentes; si no, la última capa elegida.
  const capaInicial = focoReporte ? "reportes" : normalizarCapa(almacenCookies.get(COOKIE_CAPA_PREFERIDA)?.value)

  // Reports and filter options don't depend on each other, so they load at the same time.
  const [{ data: contenidoInicial, error }, { data: categorias }, { data: prioridades }, { data: mascotas, error: mascotasError }] = await Promise.all([
    cargarZonaMapa({ ...primeraZona(focoReporte), filtros: { search, categoria, estado, prioridad } }),
    getCategorias(),
    getPrioridades(),
    getMascotasMapa(),
  ])

  return (
    <MapaClient
      contenidoInicial={contenidoInicial}
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
