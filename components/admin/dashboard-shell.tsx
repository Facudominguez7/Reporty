import type { ReactNode } from "react"

import { AdminNav } from "@/components/admin/admin-nav"
import type { RoleId } from "@/lib/authz/catalog"

export function AdminDashboardShell({ children, email, roleId }: { children: ReactNode; email: string; roleId: RoleId | null }) {
  return (
    <div className="admin-workspace min-h-full flex-1 bg-background lg:pl-64">
      <AdminNav email={email} roleId={roleId} />
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
        {children}
      </main>
    </div>
  )
}
