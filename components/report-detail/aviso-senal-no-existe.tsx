import { ShieldCheck, Users } from "lucide-react"

import type { SenalNoExiste } from "@/lib/reportes/senal-no-existe"

/**
 * Aviso que acompaña los botones de voto: le dice al vecino que otros también marcaron el
 * reporte como «No existe», o que un administrador lo está revisando, sin mostrar números.
 *
 * @param senal - Señal calculada con `calcularSenalNoExiste`.
 * @param puedeVotar - Si quien mira tiene disponible el botón «No existe»; si no, no se lo invita a votar.
 */
export function AvisoSenalNoExiste({ senal, puedeVotar }: { senal: SenalNoExiste; puedeVotar: boolean }) {
  if (senal === "ninguna") return null

  if (senal === "en_revision") {
    return (
      <div role="status" className="tone-info-card flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] leading-[18px]">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--semantic-info)]" aria-hidden="true" />
        <p>
          <strong className="font-semibold">Varios vecinos dicen que este problema no existe.</strong>{" "}
          <span className="text-muted-foreground">Un administrador lo está revisando.</span>
        </p>
      </div>
    )
  }

  if (senal === "solo_vos") {
    return (
      <p role="status" className="w-full text-center text-xs text-muted-foreground">
        Tu voto quedó registrado.
      </p>
    )
  }

  const titulo = senal === "otros" ? "Otros vecinos también lo marcaron como «No existe»." : "Vos y otros vecinos lo marcaron."
  const detalle = senal === "otros"
    ? (puedeVotar ? "Si vos tampoco lo ves, sumá tu voto." : null)
    : "Si se juntan suficientes votos, un administrador lo revisa."

  return (
    <div role="status" className="tone-warning-card flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] leading-[18px]">
      <Users className="mt-0.5 size-4 shrink-0 text-[color:color-mix(in_oklch,var(--semantic-warning)_60%,var(--foreground))]" aria-hidden="true" />
      <p>
        <strong className="font-semibold">{titulo}</strong>
        {detalle && <> <span className="text-muted-foreground">{detalle}</span></>}
      </p>
    </div>
  )
}
