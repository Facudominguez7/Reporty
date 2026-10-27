export default function AdminReportesLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-6 animate-pulse">
        <div className="space-y-3 border-b border-border pb-6">
          <div className="h-4 w-28 rounded bg-muted" />
          <div className="h-9 w-52 rounded bg-muted" />
          <div className="h-4 w-80 max-w-full rounded bg-muted" />
        </div>
        <div className="h-24 rounded-[var(--radius)] border border-border bg-card" />
        <div className="space-y-3">
          {[1, 2, 3].map((item) => <div key={item} className="h-36 rounded-[var(--radius)] border border-border bg-card" />)}
        </div>
      </div>
    </div>
  )
}
