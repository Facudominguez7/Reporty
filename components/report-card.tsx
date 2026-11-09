import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ChipEstadoOperativo } from "@/components/cuadrillas/chip-estado-operativo"
import type { EstadoOperativo } from "@/lib/authz/catalog"
import { getCategoryIconComponent } from "@/lib/icons/category-icons"
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  Calendar,
  CheckCircle,
  User,
  X,
} from "lucide-react"

export type ReportCardProps = {
  id: number
  titulo: string
  descripcion?: string | null
  categoria: string
  prioridad: string
  estado: string
  imageUrl: string | null
  createdAt: string
  autor?: string
  estadoOperativo?: EstadoOperativo | null
  cuadrillaNombre?: string | null
}

export const getStatusVariant = (status: string): "reparado" | "pendiente" | "rechazado" | "outline" => {
  switch (status) {
    case "Reparado":
      return "reparado"
    case "Pendiente":
      return "pendiente"
    case "Rechazado":
      return "rechazado"
    default:
      return "outline"
  }
}

export const getStatusIcon = (status: string, className = "w-3 h-3") => {
  switch (status) {
    case "Reparado":
      return <CheckCircle className={className} />
    case "Rechazado":
      return <X className={className} />
    case "Pendiente":
      return <AlertCircle className={className} />
    default:
      return null
  }
}

export const getPriorityVariant = (priority: string): "alta" | "media" | "baja" | "outline" => {
  switch (priority) {
    case "Alta":
      return "alta"
    case "Media":
      return "media"
    case "Baja":
      return "baja"
    default:
      return "outline"
  }
}

export const getPriorityIcon = (priority: string, className = "w-3 h-3") => {
  switch (priority) {
    case "Alta":
      return <AlertTriangle className={className} aria-hidden="true" />
    case "Media":
      return <AlertCircle className={className} aria-hidden="true" />
    case "Baja":
      return <ArrowDown className={className} aria-hidden="true" />
    default:
      return null
  }
}

export const getCategoryIcon = (category: string, className = "w-3 h-3") => {
  const CategoryIcon = getCategoryIconComponent(category)
  return <CategoryIcon className={className} />
}

export const getPriorityColor = (priority: string): string => {
  switch (priority) {
    case "Alta":
      return "var(--priority-high)"
    case "Media":
      return "var(--priority-medium)"
    case "Baja":
      return "var(--priority-low)"
    default:
      return "var(--muted-foreground)"
  }
}

export const getStatusColor = (status: string): string => {
  switch (status) {
    case "Reparado":
      return "var(--semantic-success)"
    case "Pendiente":
      return "var(--semantic-warning)"
    case "Rechazado":
      return "var(--semantic-danger)"
    default:
      return "var(--muted-foreground)"
  }
}

export const getCategoryColor = (): string => "var(--category-accent)"

export function ReportCard({
  id,
  titulo,
  descripcion,
  categoria,
  prioridad,
  estado,
  imageUrl,
  createdAt,
  autor,
  estadoOperativo,
  cuadrillaNombre,
}: ReportCardProps) {
  return (
    <Link key={id} href={`/reportes/${id}`} className="block h-full w-full min-w-0">
      <Card className="h-full w-full min-w-0 overflow-hidden transition-colors hover:border-foreground/20">
        <div className="aspect-[16/10] overflow-hidden bg-surface-subtle">
          <img
            src={imageUrl || "/placeholder.svg"}
            alt={titulo}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>

        <CardContent className="flex h-full min-w-0 flex-col gap-3 pt-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant={getPriorityVariant(prioridad)} className="gap-1">
              {getPriorityIcon(prioridad)}
              {prioridad}
            </Badge>
            <Badge variant={getStatusVariant(estado)} className="gap-1">
              {getStatusIcon(estado)}
              {estado}
            </Badge>
            <Badge variant="category" className="gap-1">
              {getCategoryIcon(categoria)}
              {categoria}
            </Badge>
            <ChipEstadoOperativo estadoOperativo={estadoOperativo} cuadrillaNombre={cuadrillaNombre} />
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-semibold tracking-tight text-foreground line-clamp-2">
              {titulo}
            </h3>
            <p className="text-sm leading-6 text-muted-foreground line-clamp-2">
              {descripcion || "Sin descripción adicional."}
            </p>
          </div>

          <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 truncate">
              <User className="size-3.5 flex-none" />
              <span className="truncate">{autor || "Anónimo"}</span>
            </div>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <Calendar className="size-3.5 flex-none" />
              <span>{new Date(createdAt).toLocaleDateString("es-AR")}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
