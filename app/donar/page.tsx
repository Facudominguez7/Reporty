import type { Metadata } from "next"
import Link from "next/link"
import { HeartHandshake } from "lucide-react"

import { PageTitleBar } from "@/components/page-title-bar"
import { pageMetadata } from "@/lib/seo/site"
import { FormularioDonacion } from "./formulario-donacion"

export const metadata: Metadata = pageMetadata({
  title: "Donar",
  description: "Apoyá a Reporty con una donación por Mercado Pago. Reporty es gratis y tu aporte paga los servidores, los mapas y los avisos.",
  path: "/donar",
})

/**
 * Página pública para donar a Reporty con Mercado Pago. No requiere sesión.
 */
export default function DonarPage() {
  return (
    <div className="page-shell">
      <div className="page-container page-stack mx-auto max-w-xl">
        <PageTitleBar
          icon={<HeartHandshake className="size-4" />}
          title="Apoyá a Reporty"
          description="Reporty es gratis. Tu donación paga los servidores, los mapas y los avisos a los organismos."
        />
        <FormularioDonacion />
        <p className="text-center text-xs text-muted-foreground">
          Al donar aceptás los{" "}
          <Link href="/terminos#donaciones" className="font-medium text-primary underline-offset-4 hover:underline">
            términos de las donaciones
          </Link>
          . Las donaciones no son deducibles de impuestos.
        </p>
      </div>
    </div>
  )
}
