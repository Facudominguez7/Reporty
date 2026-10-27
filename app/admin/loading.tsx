import { Skeleton } from "@/components/ui/skeleton"

export default function AdminLoading() {
  return (
    <div className="space-y-8" aria-label="Cargando administración">
      <div className="space-y-3"><Skeleton className="h-4 w-40" /><Skeleton className="h-10 w-72" /><Skeleton className="h-5 w-full max-w-xl" /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-36 rounded-[var(--radius)]" />)}</div>
      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]"><Skeleton className="h-80 rounded-[var(--radius)]" /><Skeleton className="h-80 rounded-[var(--radius)]" /></div>
    </div>
  )
}
