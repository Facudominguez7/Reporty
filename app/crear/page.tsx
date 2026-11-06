import Link from "next/link"
import { ArrowUpRight, FilePlus2, PawPrint } from "lucide-react"

import { PageTitleBar } from "@/components/page-title-bar"

const options = [
  {
    href: "/reportes/nuevo",
    title: "Crear reporte/incidencia",
    description: "Contá qué está pasando en tu zona",
    icon: FilePlus2,
  },
  {
    href: "/mascotas/nueva",
    title: "Cargar mascota perdida",
    description: "Ayudá a encontrar una mascota",
    icon: PawPrint,
  },
]

export default function CrearPage() {
  return (
    <div className="page-shell">
      <div className="page-container page-stack">
        <PageTitleBar
          icon={<FilePlus2 className="size-4" />}
          title="¿Qué querés crear?"
          description="Elegí qué tipo de publicación querés compartir."
        />
        <div className="flex flex-1 items-stretch">
          <div className="mx-auto grid w-full max-w-4xl grid-rows-2 gap-6 pb-4 sm:grid-rows-1 sm:grid-cols-2 sm:gap-8 sm:pb-6">
            {options.map(({ href, title, description, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex min-h-36 flex-col justify-center gap-5 rounded-3xl border border-border bg-card p-5 text-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-64 sm:p-8"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:size-14" aria-hidden="true">
                    <Icon className="size-6 sm:size-7" />
                  </span>
                  <ArrowUpRight className="size-5 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <span className="block text-base font-semibold leading-snug sm:text-lg">{title}</span>
                  <span className="block text-sm leading-5 text-muted-foreground">{description}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
