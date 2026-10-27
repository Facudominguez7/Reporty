"use client"

import { useState } from "react"
import { Filter, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { AuditFilters } from "@/database/queries/admin/admin-audit"

export function AuditFiltersForm({ user, action, days }: AuditFilters) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-3">
      <Button type="button" variant="filter" className="w-full md:hidden" aria-expanded={open} aria-controls="audit-filters" onClick={() => setOpen(!open)}>
        {open ? <X aria-hidden="true" /> : <Filter aria-hidden="true" />}
        {open ? "Ocultar filtros" : "Mostrar filtros"}
      </Button>
      <form id="audit-filters" method="get" className={`${open ? "grid" : "hidden"} gap-3 rounded-xl border border-border bg-card p-4 md:grid md:grid-cols-[1fr_auto_auto_auto] md:items-end`}>
        <label className="grid gap-1 text-sm">Usuario
          <input name="usuario" defaultValue={user} placeholder="Nombre de usuario" className="min-h-10 min-w-0 rounded-md border border-input bg-background px-3" />
        </label>
        <label className="grid gap-1 text-sm">Acción
          <select name="accion" defaultValue={action ?? ""} className="min-h-10 rounded-md border border-input bg-background px-3">
            <option value="">Todas</option>
            <option value="report_created">Creó un reporte</option>
            <option value="comment_created">Comentó</option>
            <option value="vote_repaired">Votó reparado</option>
            <option value="vote_not_exists">Votó que no existe</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">Período
          <select name="periodo" defaultValue={days ?? ""} className="min-h-10 rounded-md border border-input bg-background px-3">
            <option value="">Todo</option><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option>
          </select>
        </label>
        <Button type="submit">Aplicar</Button>
      </form>
    </div>
  )
}
