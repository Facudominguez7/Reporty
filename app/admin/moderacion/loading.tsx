import { Skeleton } from "@/components/ui/skeleton"

export default function AdminModeracionLoading() {
  return <div className="grid gap-5 lg:grid-cols-2" aria-label="Cargando revisiones">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-96 rounded-[var(--radius)]" />)}</div>
}
