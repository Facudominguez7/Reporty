import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, ArrowRight, EllipsisVertical, Globe, HousePlus, Share } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

const guides = {
  android: {
    name: "Android",
    browser: "Chrome",
    steps: [
      { icon: Globe, title: "Abrí Reporty en Chrome", text: "Si llegaste desde WhatsApp o Instagram, abrí esta página en Chrome para continuar." },
      { icon: EllipsisVertical, title: "Abrí el menú ⋮", text: "Está junto a la barra de direcciones. Buscá ‘Agregar a la pantalla principal’ o ‘Instalar aplicación’." },
      { icon: HousePlus, title: "Agregá Reporty", text: "Confirmá con ‘Instalar’ o ‘Agregar’. Según tu versión de Chrome, puede aparecer ‘Instalar y crear acceso directo’." },
    ],
  },
  ios: {
    name: "iPhone",
    browser: "Safari",
    steps: [
      { icon: Globe, title: "Abrí Reporty en Safari", text: "Si llegaste desde WhatsApp o Instagram, abrí esta página en Safari para continuar." },
      { icon: Share, title: "Tocá Compartir", text: "Buscá el cuadrado con una flecha hacia arriba. En algunas versiones está dentro del menú de la página." },
      { icon: HousePlus, title: "Añadí a pantalla de inicio", text: "Elegí ‘Añadir a pantalla de inicio’, activá ‘Abrir como app web’ si aparece y confirmá con ‘Añadir’." },
    ],
  },
} as const

export function InstallationGuide({ platform }: { platform: keyof typeof guides }) {
  const guide = guides[platform]
  return (
    <section className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6" aria-labelledby="install-title">
      <div className="page-container items-center justify-center gap-4 px-5 py-6 text-center sm:gap-6 sm:px-10 sm:py-10 md:w-fit md:flex-none">
        <div className="relative flex w-full items-center justify-center">
          <Link href="/" aria-label="Volver al inicio" title="Volver al inicio" className={buttonVariants({ variant: "secondary", size: "icon-sm", className: "absolute left-0" })}><ArrowLeft aria-hidden="true" /></Link>
          <Image src="/logos/logoSinBg.png" alt="Reporty" width={260} height={80} priority className="h-auto w-32 object-contain sm:w-44" />
        </div>
        <div className="section-stack w-full max-w-2xl">
          <h1 id="install-title" className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">Reporty en tu {guide.name}</h1>
          <ol className="mt-4 grid gap-3 text-left" aria-label={`Cómo agregar Reporty en ${guide.name}`}>
            {guide.steps.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-6" aria-hidden="true" /></span>
                <div><h2 className="text-sm font-semibold">{index + 1}. {title}</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">{text}</p></div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-primary">Listo: abrí Reporty desde su ícono en el inicio.</p>
        </div>
        <Link href="/mapa" className={buttonVariants({ size: "lg", className: "mt-1" })}>Explorar el mapa <ArrowRight aria-hidden="true" /></Link>
      </div>
    </section>
  )
}
