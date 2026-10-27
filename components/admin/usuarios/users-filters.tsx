"use client"

import { useState } from "react"
import { Filter, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { AdminUserFilter, AdminUserSort } from "@/database/queries/admin/admin-users"

type Props = {
  filter: AdminUserFilter
  search: string
  sort: AdminUserSort
}

export function UsersFilters({ filter, search, sort }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-2">
      <div className="flex justify-end md:hidden">
        <Button type="button" variant="filter" size="sm" className="w-full" onClick={() => setOpen((value) => !value)}>
          {open ? <X /> : <Filter />}
          {open ? "Ocultar filtros" : "Mostrar filtros"}
        </Button>
      </div>
      <Card className={open ? "block" : "hidden md:block"}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-sm font-semibold">Filtrar usuarios</p><p className="mt-1 text-xs text-muted-foreground">Por defecto se muestran las cuentas con correo.</p></div>
          <form method="get" className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <input name="q" defaultValue={search} placeholder="Nombre o correo" className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-56" aria-label="Buscar usuario por nombre o correo" />
            <select name="filtro" defaultValue={filter} className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-64" aria-label="Filtrar usuarios por tipo">
              <option value="accounts">Con correo / cuentas</option>
              <option value="guests">Sin correo / invitados</option>
              <option value="all">Todos los usuarios</option>
            </select>
            <select name="orden" defaultValue={sort} className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-52" aria-label="Ordenar usuarios">
              <option value="lastAccess">Último acceso</option>
              <option value="createdAt">Más recientes</option>
            </select>
            <button type="submit" className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Aplicar</button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
