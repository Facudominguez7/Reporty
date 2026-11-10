import type { Metadata } from "next"
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
      </div>
    </div>
  )
}
