import Link from "next/link"
import { cn } from "@/lib/utils"

export function AdminReportesTabs({ selected }: { selected: "incidentes" | "mascotas" }) {
  return <div role="tablist" aria-label="Tipo de publicación" className="inline-flex rounded-lg border bg-muted p-1">
    {([["incidentes", "Incidentes", "/admin/reportes"], ["mascotas", "Mascotas", "/admin/reportes?vista=mascotas"]] as const).map(([value, label, href]) => <Link key={value} role="tab" aria-selected={selected === value} href={href} className={cn("rounded-md px-4 py-2 text-sm font-medium transition-colors", selected === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{label}</Link>)}
  </div>
}
