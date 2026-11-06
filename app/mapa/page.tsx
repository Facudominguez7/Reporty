/**
 * Página del mapa interactivo de reportes
 * 
 * Este componente Server Component se encarga de:
 * - Cargar reportes reales desde Supabase con sus coordenadas y filtros, solo los pendientes:
 *   el mapa muestra únicamente problemas abiertos (reparados y rechazados siguen en /reportes)
 * - Renderizar el MapaClient con los datos
 * - Manejar los searchParams para los filtros
 */

import { MapaClient } from "./mapa-client"
import { getReportMapData, getCategorias, getPrioridades } from "@/database/queries/reportes/get-reportes"
import { getMascotasMapa } from "@/database/queries/mascotas/mapa"
import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo/site"

export const dynamic = "force-dynamic"

export const metadata: Metadata = pageMetadata({
  title: "Mapa de problemas urbanos en Posadas",
  description:
    "Mirá en el mapa los problemas urbanos pendientes que vecinos de Posadas, Misiones, reportaron cerca tuyo.",
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
  const params = await searchParams
  const { search, categoria, estado, prioridad } = params

  // Reports and filter options don't depend on each other, so they load at the same time.
  const [{ data: reportes, error }, { data: categorias }, { data: prioridades }, { data: mascotas, error: mascotasError }] = await Promise.all([
    getReportMapData({
      search,
      categoria,
      estado,
      prioridad,
      limite: 100, // Más reportes para el mapa
      soloPendientes: true,
    }),
    getCategorias(),
    getPrioridades(),
    getMascotasMapa(),
  ])

  return (
    <MapaClient
      reportes={reportes ?? []}
      categorias={categorias ?? []}
      // Todo el mapa está en Pendiente, así que no hay estado por el cual filtrar.
      estados={[]}
      prioridades={prioridades ?? []}
      mascotas={mascotas ?? []}
      petError={mascotasError?.message ?? null}
      error={error?.message ?? null}
    />
  )
}
