import type { ReactNode } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function AdminStatCard({ label, value, note, icon, className }: { label: string; value: string; note: string; icon: ReactNode; className?: string }) {
  return (
    <Card className={cn("gap-3", className)}>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--semantic-admin)]/25 bg-[var(--semantic-admin)]/10 text-[var(--semantic-admin)]" aria-hidden="true">{icon}</span>
        </div>
        <div>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{note}</p>
        </div>
      </CardContent>
    </Card>
  )
}
