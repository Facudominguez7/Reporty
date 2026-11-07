export function buildReportesReturnTo(search: string): string {
  return search ? `/reportes?${search}` : "/reportes"
}

export function withReportesReturnTo(detailHref: string, returnTo: string): string {
  return `${detailHref}?${new URLSearchParams({ returnTo }).toString()}`
}

export function resolveReportesReturnTo(returnTo: string | null, fallback: string): string {
  return returnTo === "/reportes" || returnTo?.startsWith("/reportes?") ? returnTo : fallback
}
