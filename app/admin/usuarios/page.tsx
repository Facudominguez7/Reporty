import Link from "next/link"
import { ChevronLeft, ChevronRight, ShieldCheck, Users } from "lucide-react"
import { redirect } from "next/navigation"

import { Card, CardContent } from "@/components/ui/card"
import { UsersAdminList } from "@/components/admin/usuarios/users-admin-list"
import { getAdminUsers, type AdminUserFilter } from "@/database/queries/admin/admin-users"

export const metadata = { title: "Usuarios · Administración", robots: { index: false, follow: false } }

type SearchParams = Promise<{ page?: string; filtro?: string; q?: string }>

function pageNumber(value?: string) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1
}

function userFilter(value?: string): AdminUserFilter {
  return value === "guests" || value === "all" ? value : "accounts"
}

export default async function AdminUsuariosPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const page = pageNumber(params.page)
  const filter = userFilter(params.filtro)
  const search = params.q?.trim() ?? ""
  const result = await getAdminUsers(page, filter, search)
  if (result.unauthorized) redirect("/mapa")

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Usuarios</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Listado de cuentas registradas y acceso reversible para moderar usuarios.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-accent px-3 py-1.5 text-sm font-medium text-primary"><Users className="size-4" /> {result.total ?? result.users.length} usuarios</span>
        </div>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-sm font-semibold">Filtrar usuarios</p><p className="mt-1 text-xs text-muted-foreground">Por defecto se muestran las cuentas con correo.</p></div>
          <form method="get" className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <input name="q" defaultValue={search} placeholder="Nombre o correo" className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-56" aria-label="Buscar usuario por nombre o correo" />
            <select name="filtro" defaultValue={filter} className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-64" aria-label="Filtrar usuarios por tipo">
              <option value="accounts">Con correo / cuentas</option>
              <option value="guests">Sin correo / invitados</option>
              <option value="all">Todos los usuarios</option>
            </select>
            <button type="submit" className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Aplicar</button>
          </form>
        </CardContent>
      </Card>

      <UsersAdminList users={result.users} />

      {(page > 1 || result.hasNext) && <nav aria-label="Paginación de usuarios" className="flex items-center justify-between gap-4 text-sm">
        {page > 1 ? <Link className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline" href={`/admin/usuarios?filtro=${filter}${search ? `&q=${encodeURIComponent(search)}` : ""}&page=${page - 1}`}><ChevronLeft className="size-4" /> Anteriores</Link> : <span />}
        <span className="text-muted-foreground">Página {page}</span>
        {result.hasNext ? <Link className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline" href={`/admin/usuarios?filtro=${filter}${search ? `&q=${encodeURIComponent(search)}` : ""}&page=${page + 1}`}>Siguientes <ChevronRight className="size-4" /> </Link> : <span />}
      </nav>}

      <Card className="border-[var(--semantic-admin)]/25 bg-[var(--semantic-admin)]/5">
        <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--semantic-admin)]" /><p>El listado y las acciones se ejecutan exclusivamente del lado servidor. Bloquear el acceso es reversible; no se ofrece eliminación permanente de cuentas.</p></CardContent>
      </Card>
    </div>
  )
}
