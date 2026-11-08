"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { SlidersHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { FilterChipOption } from "@/components/filtros-reportes"

export function buildMascotasFilterHref(search: string, key: "tipo" | "estadoMascota", value: string) {
  const params = new URLSearchParams(search)
  if (value === "all") params.delete(key); else params.set(key, value)
  params.set("vista", "mascotas")
  params.delete("offset")
  return `/reportes?${params.toString()}`
}

export function prepareMascotasFilterApply(search: string, tipo: string) {
  return { href: buildMascotasFilterHref(search, "tipo", tipo), open: false }
}

const tipos = [
  { label: "Todos los animales", value: "all" },
  { label: "Perro", value: "perro" },
  { label: "Gato", value: "gato" },
  { label: "Otro", value: "otro" },
] as const

export function FiltrosMascotas() {
  const router = useRouter()
  const current = useSearchParams()
  const tipo = current.get("tipo") ?? "all"
  const [open, setOpen] = useState(false)
  const [draftTipo, setDraftTipo] = useState(tipo)

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setDraftTipo(tipo)
    setOpen(nextOpen)
  }

  function applyFilters() {
    const result = prepareMascotasFilterApply(current.toString(), draftTipo)
    router.replace(result.href)
    setOpen(result.open)
  }

  return <Drawer open={open} onOpenChange={handleOpenChange}>
    <DrawerTrigger asChild><Button type="button" variant="secondary" size="xs" className="size-9 p-0 sm:size-auto sm:px-2.5" aria-label={open ? "Cerrar filtros" : `Abrir filtros${tipo !== "all" ? ", 1 activos" : ""}`} aria-expanded={open}>{open ? <X aria-hidden="true" className="size-4" /> : <SlidersHorizontal aria-hidden="true" className="size-4" />}<span className="hidden sm:inline">{open ? "Cerrar" : tipo !== "all" ? "Filtros (1)" : "Filtros"}</span></Button></DrawerTrigger>
    <DrawerContent className="max-h-[85dvh] bg-card md:inset-x-[10%]">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="border-b border-border px-3 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DrawerTitle className="text-sm font-semibold tracking-tight md:text-base">Filtros</DrawerTitle>
              <DrawerDescription className="text-xs text-muted-foreground md:text-sm">Filtrá publicaciones por tipo de animal.</DrawerDescription>
            </div>
            {draftTipo !== "all" && <Button type="button" variant="secondary" size="sm" onClick={() => setDraftTipo("all")}>Limpiar</Button>}
          </div>
          {draftTipo !== "all" && <p className="pt-2 text-xs font-medium text-muted-foreground">1 filtro activo</p>}
        </div>
        <div className="space-y-5 py-2">
          <section className="space-y-5 px-3 pb-24" aria-label="Tipo de animal">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tipo de animal</h4>
                {draftTipo !== "all" && <span className="text-xs font-medium text-muted-foreground">1 seleccionado</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {tipos.map(({ label, value }) => <FilterChipOption key={value} label={label} selected={draftTipo === value} onSelect={() => setDraftTipo(value)} />)}
              </div>
            </div>
          </section>
          <div className="sticky bottom-0 z-10 mt-1 border-t border-border bg-card px-3 pb-[calc(max(env(safe-area-inset-bottom),1rem))] pt-3 shadow-[0_-10px_30px_rgba(15,23,42,0.12)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-5 -translate-y-full bg-gradient-to-t from-card via-card/90 to-transparent" aria-hidden="true" />
            <Button type="button" size="lg" onClick={applyFilters} className="w-full">Aplicar filtros</Button>
          </div>
        </div>
      </div>
    </DrawerContent>
  </Drawer>
}
