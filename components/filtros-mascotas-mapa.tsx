"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { DrawerDescription, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { FilterChipOption } from "@/components/filtros-reportes"
import { buildMapaMascotasFilterHref } from "@/app/mapa/filtros-mascotas-mapa"

const tipos = [["all", "Todos"], ["perro", "Perro"], ["gato", "Gato"], ["otro", "Otro"]]
const estados = [["all", "Todos"], ["perdida", "Perdida"], ["encontrada", "Encontrada"]]

export function FiltrosMascotasMapa({ onApply }: { onApply: () => void }) {
  const router = useRouter()
  const current = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState(current.get("searchMascota") ?? "")
  const [tipo, setTipo] = useState(current.get("tipoMascota") ?? "all")
  const [estado, setEstado] = useState(current.get("estadoMascota") ?? "all")
  const count = Number(Boolean(search.trim())) + Number(tipo !== "all") + Number(estado !== "all")

  function apply() {
    const href = buildMapaMascotasFilterHref(current.toString(), { tipo, estado, search })
    startTransition(() => {
      router.replace(href, { scroll: false })
      onApply()
    })
  }

  function clear() { setSearch(""); setTipo("all"); setEstado("all") }

  return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
    <header className="border-b border-border px-4 pb-3 pt-1">
      <div className="flex items-start justify-between gap-3">
        <div><DrawerTitle className="text-sm font-semibold tracking-tight md:text-base">Filtros de mascotas</DrawerTitle><DrawerDescription className="text-xs text-muted-foreground md:text-sm">Filtrá por tipo, estado o texto.</DrawerDescription></div>
        {count > 0 && <Button type="button" variant="secondary" size="sm" onClick={clear}>Limpiar</Button>}
      </div>
      {count > 0 && <p className="pt-2 text-xs font-medium text-muted-foreground">{count} {count === 1 ? "filtro activo" : "filtros activos"}</p>}
    </header>
    <div className="space-y-5 px-4 py-4">
      <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Buscar mascotas<Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tipo o descripción" aria-label="Buscar mascotas" /></label>
      <section className="space-y-3" aria-label="Tipo de animal"><h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tipo de animal</h4><div className="flex flex-wrap gap-2">{tipos.map(([value, label]) => <FilterChipOption key={value} label={label} selected={tipo === value} onSelect={() => setTipo(value)} />)}</div></section>
      <section className="space-y-3" aria-label="Estado de la mascota"><h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Estado</h4><div className="flex flex-wrap gap-2">{estados.map(([value, label]) => <FilterChipOption key={value} label={label} selected={estado === value} onSelect={() => setEstado(value)} />)}</div></section>
    </div>
    <div className="sticky bottom-0 z-10 mt-auto border-t border-border bg-card px-4 pb-[calc(max(env(safe-area-inset-bottom),1rem))] pt-3 shadow-[0_-10px_30px_rgba(15,23,42,0.12)]">
      <Button type="button" size="lg" onClick={apply} disabled={isPending} className="w-full">Aplicar filtros</Button>
    </div>
  </div>
}
