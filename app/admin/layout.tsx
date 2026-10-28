import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AdminDashboardShell } from "@/components/admin/dashboard-shell"
import { canAccessAdminPanel, getUserRoleContext, isAdminRole } from "@/lib/authz/roles"
import { getCantidadRevisionesRechazoReportes } from "@/lib/moderation/report-status-reviews.server"
import { getPendingReviewCount } from "@/lib/moderation/pending-count.server"
import { createClient } from "@/utils/supabase/server"

export const metadata: Metadata = {
  title: "Administración",
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect("/auth?next=/admin")
  }

  const { data: roleContext } = await getUserRoleContext(supabase, authData.user.id)
  if (!canAccessAdminPanel(roleContext?.roleId)) {
    redirect("/mapa")
  }

  const pendingReviews = isAdminRole(roleContext?.roleId)
    ? await Promise.all([getPendingReviewCount(), getCantidadRevisionesRechazoReportes()]).then(([photos, reports]) =>
        photos === null || reports === null ? null : photos + reports,
      )
    : null

  return (
    <AdminDashboardShell email={authData.user.email ?? "Cuenta administrativa"} roleId={roleContext?.roleId ?? null} pendingReviews={pendingReviews}>
      {children}
    </AdminDashboardShell>
  )
}
