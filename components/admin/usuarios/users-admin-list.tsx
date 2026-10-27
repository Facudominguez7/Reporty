"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { LockKeyhole, UnlockKeyhole } from "lucide-react"
import { toast } from "sonner"

import type { AdminUser } from "@/database/queries/admin/admin-users"
import { updateUserAccessAction } from "@/app/admin/usuarios/actions"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

function formatDate(value: string | null) {
  if (!value) return "Nunca"
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date(value))
}

function isBlocked(user: AdminUser) {
  return Boolean(user.bannedUntil && Date.parse(user.bannedUntil) > Date.now())
}

export function UsersAdminList({ users }: { users: AdminUser[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pendingUser, setPendingUser] = useState<{ user: AdminUser; blocked: boolean } | null>(null)
  const [, startTransition] = useTransition()

  function toggleAccess(user: AdminUser) {
    setPendingUser({ user, blocked: !isBlocked(user) })
  }

  function confirmToggleAccess() {
    if (!pendingUser) return
    const { user, blocked } = pendingUser
    setPendingId(user.id)
    startTransition(async () => {
      const result = await updateUserAccessAction(user.id, blocked)
      setPendingId(null)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(blocked ? "Acceso reactivado" : "Acceso bloqueado")
      setPendingUser(null)
      router.refresh()
    })
  }

  return (
    <section className="grid gap-2 md:gap-3 md:grid-cols-2" aria-label="Listado de usuarios">
      {users.map((user) => {
        const blocked = isBlocked(user)
        return (
          <Card key={user.id}>
            <CardContent className="flex flex-col gap-2.5 p-3 md:gap-4 md:p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold md:text-base">{user.username || user.email || "Usuario sin correo"}</p>
                  <Badge variant="outline">{user.roleName}</Badge>
                  {user.isAnonymous && <Badge variant="secondary">Invitado</Badge>}
                  {blocked && <Badge variant="destructive">Bloqueado</Badge>}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground md:mt-1 md:text-sm">{user.email || "Sin correo"}</p>
                <p className="mt-0.5 text-[0.7rem] text-muted-foreground md:mt-1 md:text-xs">Alta: {formatDate(user.createdAt)} · Último acceso: {formatDate(user.lastSignInAt)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:gap-3 lg:justify-end">
                <span className="text-xs text-muted-foreground md:text-sm"><strong className="text-foreground">{user.reportCount}</strong> {user.reportCount === 1 ? "reporte" : "reportes"}</span>
                <Button type="button" variant={blocked ? "outline" : "destructive"} size="sm" disabled={pendingId === user.id} onClick={() => toggleAccess(user)}>
                  {blocked ? <UnlockKeyhole className="size-4" aria-hidden="true" /> : <LockKeyhole className="size-4" aria-hidden="true" />}
                  {pendingId === user.id ? "Procesando…" : blocked ? "Reactivar" : "Bloquear acceso"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
      {users.length === 0 && <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No hay usuarios con este filtro.</CardContent></Card>}
      <AlertDialog open={Boolean(pendingUser)} onOpenChange={(open) => !open && setPendingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingUser?.blocked ? "¿Bloquear acceso?" : "¿Reactivar acceso?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingUser?.blocked
                ? `La cuenta ${pendingUser.user.email || pendingUser.user.username || "seleccionada"} no podrá iniciar sesión hasta que la reactives.`
                : `La cuenta ${pendingUser?.user.email || pendingUser?.user.username || "seleccionada"} volverá a poder iniciar sesión.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingId === pendingUser?.user.id}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={pendingId === pendingUser?.user.id} onClick={confirmToggleAccess}>
              {pendingUser?.blocked ? "Bloquear acceso" : "Reactivar acceso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
