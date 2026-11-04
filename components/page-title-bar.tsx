/**
 * Módulo compartido para renderizar títulos de página con acciones opcionales.
 */

import type { ReactNode } from "react"

type PageTitleBarProps = {
  leading?: ReactNode
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

/**
 * Renderiza el encabezado de una sección como una barra de aplicación: contexto a la izquierda y acciones a la derecha.
 */
export function PageTitleBar({ leading, icon, title, description, actions }: PageTitleBarProps) {
  return (
    <div className="section-heading flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {leading && <div className="shrink-0">{leading}</div>}
        {icon && (
          <div className="section-heading-icon shrink-0" aria-hidden="true">
            {icon}
          </div>
        )}
        <div className="min-w-0 space-y-1">
          <h1 className="line-clamp-2 text-lg font-semibold tracking-tight text-foreground md:text-2xl">{title}</h1>
          {description && <p className="line-clamp-2 max-w-2xl text-xs leading-5 text-muted-foreground md:text-sm">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex min-w-0 shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
