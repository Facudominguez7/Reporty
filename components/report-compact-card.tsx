import Image from "next/image"
import Link from "next/link"
import { Calendar, ChevronRight } from "lucide-react"

import {
  getCategoryIcon,
  getPriorityColor,
  getPriorityIcon,
  getStatusIcon,
} from "@/components/report-card"
import { ChipReporte, TONO_CATEGORIA, tonoEstado } from "@/components/report-detail/chip-reporte"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { withReportesReturnTo } from "@/lib/reportes/navigation"

/** Chips más chicos que los de la ficha: la tarjeta compacta tiene poco ancho a la derecha. */
const CLASE_CHIP_TARJETA = "h-5 max-w-24 overflow-hidden gap-1 px-2 text-[10px] sm:h-6 sm:max-w-[7.5rem] sm:text-[11px] md:text-[11px] [&_svg]:size-3"

type ReportCompactCardProps = {
  id: number
  title: string
  description?: string | null
  priority: string
  status: string
  createdAt: string
  image: string | null
  /** Optional category label; rendered only when provided. */
  category?: string
  isReportListing?: boolean
  returnTo?: string
}

export function ReportCompactCard({
  id,
  title,
  description,
  priority,
  status,
  createdAt,
  image,
  category,
  isReportListing = false,
  returnTo,
}: ReportCompactCardProps) {
  const href = returnTo ? withReportesReturnTo(`/reportes/${id}`, returnTo) : `/reportes/${id}`
  return (
    <Link href={href} className="group block">
      <Card className="incident-card overflow-hidden border-border/70 bg-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
        <CardContent className="px-3 py-0 sm:px-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="size-20 flex-none overflow-hidden rounded-[1.25rem] bg-surface-subtle shadow-inner sm:size-24">
              <Image
                src={image || "/placeholder.svg"}
                alt={title}
                width={96}
                height={96}
                sizes="(min-width: 640px) 96px, 76px"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <h2
                className={cn(
                  "line-clamp-1 font-bold tracking-tight text-foreground",
                  isReportListing ? "text-xs" : "text-sm sm:text-base",
                )}
                title={title}
              >
                {title}
              </h2>
              <p
                className={cn(
                  "line-clamp-1 text-muted-foreground",
                  isReportListing ? "text-[11px] leading-4" : "text-xs leading-5 sm:text-sm",
                )}
                title={description || undefined}
              >
                {description || "Sin descripción adicional."}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground sm:text-xs">
                <span className="inline-flex items-center gap-1 font-semibold" style={{ color: getPriorityColor(priority) }}>
                  {getPriorityIcon(priority, "size-3.5")}
                  Prioridad {priority.toLowerCase()}
                </span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <Calendar className="size-3.5 flex-none" />
                  {new Date(createdAt).toLocaleDateString("es-AR")}
                </span>
              </div>
            </div>

            <div className="flex min-w-0 flex-col items-end gap-1.5">
              <ChipReporte
                etiqueta="Estado"
                tono={tonoEstado(status)}
                icono={getStatusIcon(status)}
                valor={<span className="truncate">{status}</span>}
                className={CLASE_CHIP_TARJETA}
              />
              {category && (
                <ChipReporte
                  etiqueta="Categoría"
                  tono={TONO_CATEGORIA}
                  icono={getCategoryIcon(category)}
                  valor={<span className="truncate">{category}</span>}
                  className={CLASE_CHIP_TARJETA}
                />
              )}
            </div>

            <ChevronRight className="size-5 flex-none text-muted-foreground/70 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
