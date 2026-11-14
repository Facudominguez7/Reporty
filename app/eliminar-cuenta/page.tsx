import type { Metadata } from "next"
import Link from "next/link"
import { Trash2 } from "lucide-react"

import { AvisoEliminacionCuenta } from "@/components/cuenta/aviso-eliminacion-cuenta"
import { ContactEmail, LegalDocument, type LegalSection } from "@/components/legal/legal-document"
import { CONFIRMACION_ELIMINAR_CUENTA } from "@/lib/cuenta/eliminacion"
import { pageMetadata } from "@/lib/seo/site"

export const metadata: Metadata = pageMetadata({
  title: "Eliminar tu cuenta",
  description: "Cómo eliminar tu cuenta de Reporty y qué datos se borran al hacerlo.",
  path: "/eliminar-cuenta",
})

const secciones: LegalSection[] = [
  {
    id: "pasos",
    title: "Cómo eliminar tu cuenta desde la app",
    content: (
      <>
        <ol>
          <li>
            Entrá a Reporty con tu cuenta y abrí <Link href="/dashboard">Mi cuenta</Link>. Si entraste como invitado, abrí{" "}
            <Link href="/mis-reportes">Mis reportes</Link>.
          </li>
          <li>Al final de la página tocá «Eliminar cuenta».</li>
          <li>
            Leé qué se va a borrar, escribí <strong>{CONFIRMACION_ELIMINAR_CUENTA}</strong> y tocá «Eliminar mi cuenta».
          </li>
        </ol>
        <p>La eliminación es inmediata y no se puede deshacer.</p>
      </>
    ),
  },
  {
    id: "datos",
    title: "Qué se borra",
    content: <AvisoEliminacionCuenta />,
  },
  {
    id: "sin-acceso",
    title: "Si no podés entrar a la app",
    content: (
      <p>
        Escribinos a <ContactEmail /> desde el email de tu cuenta y pedí que la eliminemos.
      </p>
    ),
  },
]

/**
 * Página pública que explica cómo eliminar la cuenta (Google Play exige un enlace web).
 *
 * @returns El documento con los pasos, lo que se borra y la vía alternativa por email.
 */
export default function EliminarCuentaPage() {
  return (
    <LegalDocument
      icon={<Trash2 className="size-4" />}
      title="Eliminar tu cuenta"
      description="Cómo eliminar tu cuenta de Reporty y qué pasa con tus datos."
      summary={<p>Podés eliminar tu cuenta cuando quieras desde la app. Se borra todo lo que publicaste.</p>}
      sections={secciones}
    />
  )
}
