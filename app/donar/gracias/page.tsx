import type { Metadata } from "next"
import Link from "next/link"
import { CheckCircle2, Clock3, HeartHandshake, XCircle } from "lucide-react"

import { PageTitleBar } from "@/components/page-title-bar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatearMonto } from "@/lib/donaciones/montos"
import type { EstadoDonacion } from "@/lib/donaciones/mercado-pago.server"
import { registrarDonacion } from "@/lib/donaciones/registro.server"
import { createAdminClient } from "@/utils/supabase/admin"

export const metadata: Metadata = { title: "Gracias por donar", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

type SearchParams = Promise<{ payment_id?: string; external_reference?: string }>

/**
 * Concilia el pago con el que el donante vuelve de Checkout Pro. Consulta Mercado Pago y
 * solo muestra el resultado si la referencia del pago coincide con la de la URL, así no se
 * puede espiar otro pago probando ids. Devuelve `null` si no hay nada que mostrar.
 */
async function conciliar(pagoId: string | undefined, referencia: string | undefined): Promise<{ estado: EstadoDonacion; monto: number } | null> {
  if (!pagoId || !referencia) return null
  try {
    const resultado = await registrarDonacion(createAdminClient(), pagoId)
    if (resultado.tipo !== "registrada" || resultado.donacion.referencia !== referencia) return null
    return { estado: resultado.donacion.estado, monto: resultado.donacion.monto }
  } catch (error) {
    console.error("No se pudo conciliar la donación", pagoId, error)
    return null
  }
}

const CONTENIDO: Record<EstadoDonacion | "desconocido", { icono: typeof CheckCircle2; clase: string; titulo: (monto: string) => string; texto: string }> = {
  aprobada: {
    icono: CheckCircle2,
    clase: "text-primary",
    titulo: (monto) => `¡Gracias por tu donación de ${monto}!`,
    texto: "Tu aporte ayuda a que Reporty siga siendo gratis para toda la ciudad.",
  },
  pendiente: {
    icono: Clock3,
    clase: "text-[var(--semantic-warning)]",
    titulo: (monto) => `Tu donación de ${monto} está pendiente`,
    texto: "Mercado Pago todavía está procesando el pago. Cuando se acredite lo vamos a registrar solos.",
  },
  rechazada: {
    icono: XCircle,
    clase: "text-destructive",
    titulo: () => "El pago no se completó",
    texto: "Mercado Pago no aprobó el pago. Podés intentarlo de nuevo con otro medio.",
  },
  desconocido: {
    icono: HeartHandshake,
    clase: "text-primary",
    titulo: () => "Gracias por apoyar a Reporty",
    texto: "Si completaste el pago, Mercado Pago nos va a avisar y lo vamos a registrar.",
  },
}

/**
 * Página a la que vuelve Checkout Pro después de pagar, con el estado real del pago.
 */
export default async function DonacionGraciasPage({ searchParams }: { searchParams: SearchParams }) {
  const { payment_id: pagoId, external_reference: referencia } = await searchParams
  const pago = await conciliar(pagoId, referencia)
  const contenido = CONTENIDO[pago?.estado ?? "desconocido"]
  const Icono = contenido.icono

  return (
    <div className="page-shell">
      <div className="page-container page-stack mx-auto max-w-xl">
        <PageTitleBar icon={<HeartHandshake className="size-4" />} title="Donaciones" />
        <Card>
          <CardContent className="space-y-4 p-5 sm:p-6">
            <Icono className={`size-10 ${contenido.clase}`} aria-hidden="true" />
            <h2 className="text-xl font-semibold tracking-tight">{contenido.titulo(pago ? formatearMonto(pago.monto) : "")}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{contenido.texto}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild className="rounded-full"><Link href="/mapa">Volver al mapa</Link></Button>
              {pago?.estado === "rechazada" && (
                <Button asChild variant="outline" className="rounded-full"><Link href="/donar">Intentar de nuevo</Link></Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
