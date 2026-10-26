"use client"

/**
 * Componente cliente para la lista de reportes con funcionalidad "Cargar Más"
 * 
 * Maneja el estado de los reportes y permite cargar más vía API
 * respetando los filtros activos en la URL
 */

import { useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"

import { ReportCompactCard } from "@/components/report-compact-card"
import { ReportCard } from "@/components/report-card"
import { Loader2 } from "lucide-react"
import type { EstadoOperativo } from "@/lib/authz/catalog"
import { Button } from "@/components/ui/button"

export type ReportCardData = {
    id: number
    title: string
    description: string
    category: string
    priority: string
    status: string
    location: string
    author: string
    createdAt: string
    image: string | null
    estadoOperativo?: EstadoOperativo | null
    cuadrillaNombre?: string | null
    thumbnailImage: string | null
}

type ListaReportesClientProps = {
    initialReports: ReportCardData[]
    initialHasMore: boolean
    variant?: "default" | "compact"
}

/**
 * Lista de reportes con paginación infinita
 * 
 * @param initialReports - Reportes iniciales obtenidos del servidor (SSR)
 * @param initialHasMore - Indica si hay más reportes para cargar
 */
export function ListaReportesClient({
    initialReports,
    initialHasMore,
    variant = "default"
}: ListaReportesClientProps) {
    const searchParams = useSearchParams()
    const [reports, setReports] = useState<ReportCardData[]>(initialReports)
    const [hasMore, setHasMore] = useState(initialHasMore)
    const [isLoading, setIsLoading] = useState(false)
    const [offset, setOffset] = useState(initialReports.length)
    const [prevParamsKey, setPrevParamsKey] = useState(searchParams.toString())

    // Resetear cuando cambian los filtros (ajuste de estado durante el render)
    const paramsKey = searchParams.toString()
    if (prevParamsKey !== paramsKey) {
        setPrevParamsKey(paramsKey)
        setReports(initialReports)
        setHasMore(initialHasMore)
        setOffset(initialReports.length)
    }

    /**
     * Cargar más reportes desde la API
     */
    const cargarMas = useCallback(async () => {
        if (isLoading || !hasMore) return

        setIsLoading(true)

        try {
            // Construir URL con los filtros actuales
            const params = new URLSearchParams()
            params.set("offset", offset.toString())
            params.set("limite", "12")

            // Pasar los filtros activos
            const search = searchParams.get("search")
            const categoria = searchParams.get("categoria")
            const estado = searchParams.get("estado")
            const prioridad = searchParams.get("prioridad")

            if (search) params.set("search", search)
            if (categoria) params.set("categoria", categoria)
            if (estado) params.set("estado", estado)
            if (prioridad) params.set("prioridad", prioridad)

            const response = await fetch(`/api/reportes?${params.toString()}`)

            if (!response.ok) {
                throw new Error("Error al cargar reportes")
            }

            const result = await response.json()

            // Agregar nuevos reportes a la lista existente
            setReports(prev => [...prev, ...result.data])
            setHasMore(result.hasMore)
            setOffset(prev => prev + result.data.length)
        } catch (error) {
            console.error("Error al cargar más reportes:", error)
        } finally {
            setIsLoading(false)
        }
    }, [isLoading, hasMore, offset, searchParams])

    return (
        <>
            {reports.length > 0 && (
                <div className={variant === "compact" ? "incident-list incident-list--reportes" : "grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2"}>
                    {reports.map((report) => (
                        variant === "compact" ? (
                             <ReportCompactCard
                                 key={report.id}
                                 id={report.id}
                                 title={report.title}
                                 description={report.description}
                                 priority={report.priority}
                                 status={report.status}
                                 createdAt={report.createdAt}
                                 image={report.thumbnailImage ?? report.image}
                                 category={report.category}
                                 isReportListing
                             />
                        ) : (
                            <ReportCard
                                key={report.id}
                                id={report.id}
                                titulo={report.title}
                                descripcion={report.description}
                                categoria={report.category}
                                prioridad={report.priority}
                                estado={report.status}
                                imageUrl={report.image}
                                createdAt={report.createdAt}
                                autor={report.author}
                                estadoOperativo={report.estadoOperativo}
                                cuadrillaNombre={report.cuadrillaNombre}
                            />
                        )
                    ))}
                </div>
            )}

            {/* Botón para cargar más reportes */}
            {reports.length > 0 && (
                <div className={variant === "compact" ? "mt-6 flex justify-center" : "mt-10 flex justify-center"}>
                    {hasMore ? (
                        <Button
                            variant="default"
                            size="lg"
                            onClick={cargarMas}
                            disabled={isLoading}
                            className="min-w-56"
                        >
                            {isLoading ? (
                                <span className="inline-flex items-center gap-2">
                                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                                    Cargando reportes...
                                </span>
                            ) : (
                                "Cargar Más Reportes"
                            )}
                        </Button>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            No hay más reportes para mostrar
                        </p>
                    )}
                </div>
            )}
        </>
    )
}
