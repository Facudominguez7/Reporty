import Link from "next/link"

import { badgeVariants } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ReportStatusCounts } from "@/database/queries/reportes/get-reportes"

type EstadoReportesProps = {
  searchParams: Record<string, string | undefined>
  counts: ReportStatusCounts
}

const statusOptions = [
  { label: "Todos", value: null, countKey: "all" },
  { label: "Resueltos", value: "Reparado", countKey: "resolved" },
  { label: "Pendientes", value: "Pendiente", countKey: "pending" },
] as const

function buildStatusHref(searchParams: Record<string, string | undefined>, value: string | null) {
  const params = new URLSearchParams()

  for (const [key, paramValue] of Object.entries(searchParams)) {
    if (paramValue) params.set(key, paramValue)
  }

  if (value) params.set("estado", value)
  else params.delete("estado")

  const query = params.toString()
  return query ? `/reportes?${query}` : "/reportes"
}

export function EstadoReportes({ searchParams, counts }: EstadoReportesProps) {
  const currentStatus = searchParams.estado?.toLowerCase() ?? "all"

  return (
    <nav aria-label="Filtrar reportes por estado" className="w-full pb-2">
      <div className="card-shadow grid w-full grid-cols-3 items-center gap-1 rounded-[var(--radius-pill)] bg-input p-1 !text-foreground">
        {statusOptions.map((option) => {
          const isActive = option.value === null
            ? currentStatus === "all"
            : currentStatus === option.value.toLowerCase()
          const activeVariant = option.value === "Reparado"
            ? "reparado"
            : option.value === "Pendiente"
              ? "pendiente"
              : "secondary"

          return (
            <Link
              key={option.label}
              href={buildStatusHref(searchParams, option.value)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex w-full min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-pill)] border border-transparent px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? cn(
                      badgeVariants({ variant: activeVariant }),
                      "w-full text-sm font-medium normal-case tracking-normal"
                    )
                  : "!text-foreground hover:bg-background hover:!text-foreground"
              )}
            >
              {option.label}
              <span className="text-xs font-normal opacity-70">({counts[option.countKey]})</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
