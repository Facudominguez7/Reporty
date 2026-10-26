import Image from "next/image"
import Link from "next/link"
import { Calendar, ChevronRight } from "lucide-react"

import {
  getCategoryIcon,
  getPriorityColor,
  getPriorityIcon,
  getStatusIcon,
  getStatusVariant,
} from "@/components/report-card"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

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
}: ReportCompactCardProps) {
  return (
    <Link href={`/reportes/${id}`} className="group block">
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
              <Badge
                variant={getStatusVariant(status)}
                className="max-w-[7.5rem] gap-1 px-2 py-1 text-[9px] leading-3 sm:text-[10px]"
                title={status}
              >
                {getStatusIcon(status)}
                <span className="truncate">{status}</span>
              </Badge>
              {category && (
                <Badge
                  variant="category"
                  className="max-w-[7.5rem] gap-1 px-2 py-1 text-[9px] leading-3 sm:text-[10px]"
                  title={category}
                >
                  {getCategoryIcon(category, "size-3")}
                  <span className="truncate">{category}</span>
                </Badge>
              )}
            </div>

            <ChevronRight className="size-5 flex-none text-muted-foreground/70 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
