import Link from "next/link"
import { cn } from "@/lib/utils"

export function buildEstadoMascotaHref(search: string, value: string) {
  const params = new URLSearchParams(search)
  if (value === "all") params.delete("estadoMascota"); else params.set("estadoMascota", value)
  params.set("vista", "mascotas")
  params.delete("offset")
  return `/reportes?${params.toString()}`
}

const statuses = [
  { label: "Todos", value: "all", activeClass: "bg-secondary text-secondary-foreground" },
  { label: "Perdida", value: "perdida", activeClass: "bg-destructive text-destructive-foreground" },
  { label: "Encontrada", value: "encontrada", activeClass: "bg-primary text-primary-foreground" },
] as const

export function EstadoMascotas({ search }: { search: string }) {
  const params = new URLSearchParams(search)
  const active = params.get("estadoMascota") ?? "all"
  return <nav aria-label="Filtrar mascotas por estado" className="w-full">
    <div className="card-shadow grid w-full grid-cols-3 items-center gap-1 rounded-[var(--radius-pill)] bg-input p-1 !text-foreground">
      {statuses.map(({ label, value, activeClass }) => <Link key={value} href={buildEstadoMascotaHref(search, value)} aria-current={active === value ? "page" : undefined} className={cn("inline-flex min-h-9 w-full items-center justify-center rounded-[var(--radius-pill)] border border-transparent px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background", active === value ? activeClass : "text-foreground hover:bg-background")}>{label}</Link>)}
    </div>
  </nav>
}
