import type { ReactNode } from "react"

import { AdminNav, type VariantePanel } from "@/components/admin/admin-nav"
import type { RoleId } from "@/lib/authz/catalog"

/** Estructura compartida por los paneles de trabajo. */
export function AdminDashboardShell({ children, email, roleId, pendingReviews, variante }: { children: ReactNode; email: string; roleId: RoleId | null; pendingReviews: number | null; variante?: VariantePanel }) {
  // Defensoría usa la región principal del layout raíz.
  const Contenido = variante === "defensoria" ? "div" : "main"

  return (
    <div className="admin-workspace min-h-full flex-1 bg-background lg:pl-64">
      <AdminNav email={email} roleId={roleId} pendingReviews={pendingReviews} variante={variante} />
      <Contenido className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
        {children}
      </Contenido>
    </div>
  )
}
