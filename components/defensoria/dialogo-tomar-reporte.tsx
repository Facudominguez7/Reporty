"use client"

/**
 * Diálogo compartido de toma de reporte (S1, S2, S5, S10): lo usa la bandeja de la
 * Defensoría para tomar sin salir del panel (S11) y la ficha pública para la entrada
 * directa desde el email. Encabeza el formulario con el número de reclamo del sistema
 * externo y avisa que el autor recibe email y «notificación en el celular» (S4: la UI
 * nunca dice «push»).
 */

import { useRef, useState } from "react"
import { BellRing, ShieldCheck } from "lucide-react"

import { tomarReporteDefensoriaAction } from "@/app/reportes/[id]/actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

type DialogoTomarReporteProps = {
  /** Reporte que se va a tomar; el rol se revalida en la server action (S10). */
  reporteId: number
  abierto: boolean
  /** Cierre pedido por el usuario (velo, Escape o Cancelar). No cierra mientras envía. */
  onCerrar: () => void
  /** Llamado con el número confirmado cuando la toma salió bien. */
  onTomado: (numeroReclamo: string) => void
}

/**
 * Diálogo de toma con el campo obligatorio de número de reclamo (S5) y la
 * consecuencia para el autor. El error de la action se anuncia con `role=alert`.
 *
 * @param props - Reporte, apertura, cierre y callback de toma concreta.
 * @returns El diálogo de toma listo para montar dentro de la bandeja o la ficha.
 */
export function DialogoTomarReporte({ reporteId, abierto, onCerrar, onTomado }: DialogoTomarReporteProps) {
  const formulario = useTomaReporte()

  const manejarCambio = (abiertoNuevo: boolean) => {
    if (formulario.enviando || abiertoNuevo) return
    formulario.limpiar()
    onCerrar()
  }

  return (
    <Dialog open={abierto} onOpenChange={manejarCambio}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-[var(--semantic-admin)]" aria-hidden="true" />
            Tomar este reporte
          </DialogTitle>
          <DialogDescription>
            El reporte queda «Tomado por la Defensoría del Pueblo» y no puede ser tomado por nadie más.
          </DialogDescription>
        </DialogHeader>
        <FormularioTomarReporte reporteId={reporteId} onTomado={onTomado} onCerrar={() => manejarCambio(false)} formulario={formulario} />
      </DialogContent>
    </Dialog>
  )
}

/** Conserva el borrador y el envío aunque cambie la presentación del formulario. */
export function useTomaReporte() {
  const [numeroReclamo, setNumeroReclamo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const bloqueo = useRef(false)

  /** Limpia el borrador cuando se abandona el reporte. */
  function limpiar() {
    setNumeroReclamo("")
    setError(null)
  }

  /** Ejecuta como máximo una toma simultánea desde esta bandeja. */
  async function confirmar(reporteId: number, onTomado: (numero: string) => void) {
    const numero = numeroReclamo.trim()
    if (bloqueo.current || !numero) return
    bloqueo.current = true
    setEnviando(true)
    setError(null)
    try {
      const resultado = await tomarReporteDefensoriaAction(reporteId, numero)
      if (!resultado.success) {
        setError(resultado.error)
        return
      }
      limpiar()
      onTomado(resultado.data.numeroReclamo)
    } catch {
      setError("No pudimos tomar el reporte. Intentá nuevamente.")
    } finally {
      bloqueo.current = false
      setEnviando(false)
    }
  }

  return { numeroReclamo, setNumeroReclamo, error, enviando, confirmar, limpiar }
}

/** Formulario de toma reutilizado en el diálogo y en el detalle de la bandeja. */
export function FormularioTomarReporte({ reporteId, onTomado, onCerrar, formulario }: Pick<DialogoTomarReporteProps, "reporteId" | "onTomado"> & { onCerrar?: () => void; formulario: ReturnType<typeof useTomaReporte> }) {
  const { numeroReclamo, setNumeroReclamo, error, enviando, confirmar } = formulario
  return (
    <form className="grid gap-3" onSubmit={(evento) => { evento.preventDefault(); void confirmar(reporteId, onTomado) }}>
      <label className="grid gap-1.5 text-sm font-medium">
        Número de reclamo
        <Input
          value={numeroReclamo}
          onChange={(event) => setNumeroReclamo(event.target.value)}
          autoComplete="off"
          disabled={enviando}
        />
        <span className="text-xs font-normal text-muted-foreground">
          El número que te dio el sistema interno de la Defensoría.
        </span>
      </label>
      <p className="flex gap-2 rounded-[var(--radius)] border border-border/60 bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        <BellRing className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Al confirmar, el autor recibe un <strong className="text-foreground">email</strong> y una{" "}
          <strong className="text-foreground">notificación en el celular</strong>, y el reporte pasa a figurar
          como «Tomado por la Defensoría».
        </span>
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {onCerrar && <Button type="button" variant="outline" disabled={enviando} onClick={onCerrar}>Cancelar</Button>}
        <Button
          type="submit"
          disabled={enviando || !numeroReclamo.trim()}
        >
          {enviando ? "Confirmando…" : "Confirmar y notificar"}
        </Button>
      </div>
    </form>
  )
}
