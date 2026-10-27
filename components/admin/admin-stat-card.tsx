import type { ReactNode } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function AdminStatCard({ label, value, note, icon, className }: { label: string; value: string; note: string; icon: ReactNode; className?: string }) {
  return (
    <Card className={cn("gap-3", className)}>
      <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
          <span className="inline-flex size-8 items-center justify-center rounded-xl border border-[var(--semantic-admin)]/25 bg-[var(--semantic-admin)]/10 text-[var(--semantic-admin)] sm:size-9" aria-hidden="true">{icon}</span>
        </div>
        <div>
          <p className="text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
          <p className="mt-1 text-[0.65rem] text-muted-foreground sm:text-xs">{note}</p>
        </div>
      </CardContent>
    </Card>
  )
}
