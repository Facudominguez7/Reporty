import { Skeleton } from "@/components/ui/skeleton"

type SectionHeaderSkeletonProps = {
  action?: boolean
}

function SectionHeaderSkeleton({ action = false }: SectionHeaderSkeletonProps) {
  return (
    <div className="section-heading flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="min-w-0 space-y-1">
          <Skeleton className="h-5 w-48 max-w-[55vw]" />
          <Skeleton className="h-3 w-64 max-w-[65vw]" />
        </div>
      </div>
      {action && <Skeleton className="h-9 w-24 shrink-0 rounded-[var(--radius-pill)]" />}
    </div>
  )
}

function ReportCardSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-sm md:p-5">
      <Skeleton className="size-20 shrink-0 rounded-[var(--radius-md)] md:size-24" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  )
}

export function MapLoadingSkeleton({ className }: { className?: string }) {
  return <Skeleton className={`h-full w-full rounded-[var(--radius-lg)] ${className ?? ""}`} />
}

export function ReportesLoadingSkeleton() {
  return (
    <div className="page-shell">
      <div className="page-container page-stack">
        <section className="space-y-3">
          <SectionHeaderSkeleton action />
          <div className="grid grid-cols-3 gap-1 rounded-[var(--radius-pill)] bg-muted p-1">
            <Skeleton className="h-9 rounded-[var(--radius-pill)]" />
            <Skeleton className="h-9 rounded-[var(--radius-pill)]" />
            <Skeleton className="h-9 rounded-[var(--radius-pill)]" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, index) => <ReportCardSkeleton key={index} />)}
          </div>
        </section>
      </div>
    </div>
  )
}

export function CuadrillasLoadingSkeleton() {
  return (
    <div className="page-shell">
      <div className="page-container page-stack">
        <section className="space-y-4">
          <SectionHeaderSkeleton action />
          <div className="grid grid-cols-2 gap-2 rounded-[var(--radius-pill)] bg-muted p-1">
            <Skeleton className="h-9 rounded-[var(--radius-pill)]" />
            <Skeleton className="h-9 rounded-[var(--radius-pill)]" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-sm">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-9 w-28 rounded-[var(--radius-pill)]" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export function NuevoReporteLoadingSkeleton() {
  return (
    <div className="page-shell">
      <div className="page-container space-y-6 md:space-y-8">
        <SectionHeaderSkeleton />
        <div className="space-y-6 rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-sm md:p-6">
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <div className="space-y-5">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-28 w-full" />
            <div className="grid gap-5 md:grid-cols-2">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
            <Skeleton className="h-[280px] w-full rounded-[var(--radius-lg)]" />
            <div className="flex justify-end">
              <Skeleton className="h-11 w-40 rounded-[var(--radius-pill)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ReporteDetalleLoadingSkeleton() {
  return (
    <div className="page-shell">
      <div className="page-container space-y-6">
        <SectionHeaderSkeleton />
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Skeleton className="aspect-video w-full rounded-[var(--radius-lg)]" />
          <div className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-sm">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function MapaLoadingSkeleton() {
  return (
    <div className="relative h-[100dvh] min-h-[32rem] overflow-hidden bg-background">
      <Skeleton className="h-full w-full rounded-none" />
    </div>
  )
}

export function ComunidadLoadingSkeleton() {
  return (
    <div className="page-shell">
      <div className="page-container page-stack">
        <section className="space-y-3">
          <SectionHeaderSkeleton />
          <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-pill)] bg-muted p-1">
            <Skeleton className="h-9 rounded-[var(--radius-pill)]" />
            <Skeleton className="h-9 rounded-[var(--radius-pill)]" />
          </div>
          <div className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-sm">
            <Skeleton className="h-5 w-56" />
            <div className="grid grid-cols-3 gap-2 py-2">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex flex-col items-center gap-2">
                  <Skeleton className="size-14 rounded-full sm:size-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-14" />
                </div>
              ))}
            </div>
          </div>
          <div className="divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-card shadow-sm">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 px-5 py-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export function DashboardLoadingSkeleton() {
  return (
    <div className="page-shell">
      <div className="page-container space-y-6 md:space-y-8 lg:space-y-10">
        <section className="space-y-3">
          <SectionHeaderSkeleton />
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-sm">
            <div className="flex items-center gap-4 p-4 md:p-6">
              <Skeleton className="size-16 shrink-0 rounded-full md:size-20" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-5 w-64 max-w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className="divide-y divide-border border-t">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex items-center gap-3 px-5 py-3">
                  <Skeleton className="size-4 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-5 w-10" />
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="section-stack">
          <SectionHeaderSkeleton action />
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => <ReportCardSkeleton key={index} />)}
          </div>
        </section>
      </div>
    </div>
  )
}

export function MisReportesLoadingSkeleton() {
  return (
    <div className="page-shell">
      <div className="page-container page-stack">
        <SectionHeaderSkeleton />
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => <ReportCardSkeleton key={index} />)}
        </div>
      </div>
    </div>
  )
}
