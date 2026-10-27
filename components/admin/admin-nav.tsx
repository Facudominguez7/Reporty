"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, FileText, History, Images, LayoutDashboard, Users, UsersRound } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { MouseEvent } from "react"

import { SignOutSection } from "@/components/sign-out-section"
import { canAccessAdminPanel, isAdminRole } from "@/lib/authz/roles"
import { ROLE_IDS, type RoleId } from "@/lib/authz/catalog"
import { cn } from "@/lib/utils"

type AdminNavItem = { href: string; label: string; icon: LucideIcon; count?: string }

const adminItems: AdminNavItem[] = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard },
  { href: "/admin/reportes", label: "Reportes", icon: FileText },
  { href: "/admin/moderacion", label: "Revisiones", icon: Images },
  { href: "/admin/usuarios", label: "Usuarios", icon: Users },
  { href: "/admin/metricas", label: "Métricas", icon: BarChart3 },
  { href: "/admin/auditoria", label: "Auditoría", icon: History },
]

const operatorItems: AdminNavItem[] = [
  { href: "/admin/operaciones", label: "Operaciones y cuadrillas", icon: UsersRound },
]

const interestedItems: AdminNavItem[] = [
  { href: "/admin/metricas", label: "Métricas", icon: BarChart3 },
]

function itemsForRole(roleId: RoleId | null) {
  if (isAdminRole(roleId)) return adminItems
  if (roleId === ROLE_IDS.OPERADOR) return operatorItems
  return interestedItems
}

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname.startsWith(href)
}

function AdminSession({ email, mobile = false }: { email: string; mobile?: boolean }) {
  return (
    <div className={cn(
      "border-secondary-foreground/10 text-xs text-secondary-foreground/60",
      mobile ? "mt-2 border-t px-3 pt-3" : "border-t px-4 py-4 lg:mt-auto lg:px-6 lg:py-5",
    )}>
      <p>Sesión administrativa</p>
      <p className="mt-1 truncate font-semibold text-secondary-foreground">{email}</p>
      <div className="mt-4 [&_section]:justify-start [&_button]:!w-full [&_button]:border-secondary-foreground/20 [&_button]:bg-secondary-foreground/10 [&_button]:text-secondary-foreground [&_button]:hover:bg-destructive [&_button]:hover:text-destructive-foreground">
        <SignOutSection />
      </div>
    </div>
  )
}

export function AdminNav({ email, roleId, pendingReviews }: { email: string; roleId: RoleId | null; pendingReviews: number | null }) {
  const pathname = usePathname()
  const items = itemsForRole(roleId).map((item) => item.href === "/admin/moderacion" && pendingReviews && pendingReviews > 0
    ? { ...item, count: String(pendingReviews) }
    : item)
  const closeMobileMenu = (event: MouseEvent<HTMLAnchorElement>) => {
    event.currentTarget.closest("details")?.removeAttribute("open")
  }

  if (!canAccessAdminPanel(roleId)) return null

  return (
    <aside className="border-b border-secondary-foreground/10 bg-secondary text-secondary-foreground lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-64 lg:flex-col lg:border-b-0">
      <div className="flex items-center justify-between gap-4 px-5 py-4 lg:block lg:px-6 lg:py-7">
        <Link href="/mapa" className="rounded-lg text-sm font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          REPORTY <span className="text-primary">/ ADMIN</span>
        </Link>
        <details className="group lg:hidden">
          <summary className="cursor-pointer list-none rounded-full border border-secondary-foreground/20 px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            Menú
          </summary>
          <nav aria-label="Navegación de administración móvil" className="absolute inset-x-0 z-20 grid gap-1 border-t border-secondary-foreground/10 bg-secondary p-3 shadow-xl">
            {items.map(({ href, label, icon: Icon, count }) => (
              <Link key={href} href={href} onClick={closeMobileMenu} aria-current={isActive(pathname, href) ? "page" : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-secondary-foreground/70 hover:bg-secondary-foreground/10 hover:text-secondary-foreground", isActive(pathname, href) && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground")}>
                <Icon className="size-4" aria-hidden="true" />
                <span className="flex-1">{label}</span>
                {count && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-background px-1.5 text-xs font-bold text-foreground" aria-label={`${count} revisiones pendientes`}>{count}</span>}
              </Link>
            ))}
            <AdminSession email={email} mobile />
          </nav>
        </details>
      </div>
      <nav aria-label="Navegación de administración" className="hidden gap-1 px-4 lg:grid">
        {items.map(({ href, label, icon: Icon, count }) => (
          <Link key={href} href={href} aria-current={isActive(pathname, href) ? "page" : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-secondary-foreground/70 transition-colors hover:bg-secondary-foreground/10 hover:text-secondary-foreground", isActive(pathname, href) && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground")}>
            <Icon className="size-4" aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {count && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-background px-1.5 text-xs font-bold text-foreground" aria-label={`${count} revisiones pendientes`}>{count}</span>}
          </Link>
        ))}
      </nav>
      <div className="hidden lg:mt-auto lg:block">
        <AdminSession email={email} />
      </div>
    </aside>
  )
}
