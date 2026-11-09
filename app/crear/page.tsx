import Link from "next/link"
import { FilePlus2, PawPrint } from "lucide-react"

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
          <div className="mx-auto grid w-full max-w-4xl grid-rows-2 gap-6 pb-4 sm:max-w-none sm:grid-rows-1 sm:grid-cols-2 sm:gap-8 sm:pb-6">
            {options.map(({ href, title, description, icon: Icon }) => (
              <Link
                prefetch={false}
                key={href}
                href={href}
                className="group flex min-h-56 flex-col items-center justify-center gap-5 rounded-3xl border border-border bg-card p-6 text-center text-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-64 sm:p-8"
              >
                <span className="flex size-28 items-center justify-center rounded-3xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15 sm:size-36" aria-hidden="true">
                  <Icon className="size-20 sm:size-28" />
                </span>
                <div className="max-w-xs space-y-1.5">
                  <span className="block text-lg font-semibold leading-snug sm:text-xl">{title}</span>
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
