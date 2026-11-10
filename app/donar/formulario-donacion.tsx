"use client"

import { useState, useTransition } from "react"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  formatearMonto,
  LARGO_MAXIMO_MENSAJE,
  LARGO_MAXIMO_NOMBRE,
  MONTO_MINIMO_DONACION,
  MONTOS_DONACION,
} from "@/lib/donaciones/montos"
import { cn } from "@/lib/utils"
import { iniciarDonacionAction } from "./actions"

const OTRO = "otro" as const

/**
 * Calcula el monto elegido: uno de los sugeridos o el que el donante escribió en «Otro».
 * Devuelve `null` si «Otro» todavía no tiene un número.
 */
export function montoElegido(eleccion: number | typeof OTRO, otro: string): number | null {
  if (eleccion !== OTRO) return eleccion
  const limpio = otro.replace(/\D/g, "")
  return limpio ? Number(limpio) : null
}

/**
 * Formulario de donación: elige el monto, deja nombre y mensaje opcionales y lleva al
 * donante a Checkout Pro de Mercado Pago.
 */
export function FormularioDonacion() {
  const [eleccion, setEleccion] = useState<number | typeof OTRO>(MONTOS_DONACION[1])
  const [otro, setOtro] = useState("")
  const [nombre, setNombre] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()

  const monto = montoElegido(eleccion, otro)
  const textoBoton = monto ? `Donar ${formatearMonto(monto)} con Mercado Pago` : "Donar con Mercado Pago"

  /** Crea el pago en el servidor y redirige a Mercado Pago. */
  const donar = (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!monto) {
      setError("Escribí cuánto querés donar.")
      return
    }
    setError(null)
    iniciar(async () => {
      const resultado = await iniciarDonacionAction({ monto, nombre, mensaje })
      if (resultado.ok) {
        window.location.assign(resultado.urlPago)
      } else {
        setError(resultado.error)
      }
    })
  }

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <form onSubmit={donar} className="space-y-5" noValidate>
          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-medium">Elegí un monto</legend>
            <div className="grid grid-cols-3 gap-2">
              {[...MONTOS_DONACION, OTRO].map((opcion) => {
                const activa = eleccion === opcion
                return (
                  <Button
                    key={opcion}
                    type="button"
                    variant={activa ? "default" : "outline"}
                    aria-pressed={activa}
                    className={cn("min-h-11 rounded-full", !activa && "bg-card")}
                    onClick={() => setEleccion(opcion)}
                  >
                    {opcion === OTRO ? "Otro" : formatearMonto(opcion)}
                  </Button>
                )
              })}
            </div>
            {eleccion === OTRO && (
              <div className="space-y-2">
                <Label htmlFor="monto-otro">Tu monto en pesos</Label>
                <Input
                  id="monto-otro"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={`Desde ${formatearMonto(MONTO_MINIMO_DONACION)}`}
                  value={otro}
                  onChange={(evento) => setOtro(evento.target.value.replace(/\D/g, "").slice(0, 7))}
                  autoFocus
                />
              </div>
            )}
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="donacion-nombre">Tu nombre (opcional)</Label>
            <Input id="donacion-nombre" maxLength={LARGO_MAXIMO_NOMBRE} autoComplete="name" value={nombre} onChange={(evento) => setNombre(evento.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="donacion-mensaje">Mensaje (opcional)</Label>
            <Textarea id="donacion-mensaje" rows={3} maxLength={LARGO_MAXIMO_MENSAJE} placeholder="Dejanos unas palabras" value={mensaje} onChange={(evento) => setMensaje(evento.target.value)} />
            <p className="text-xs text-muted-foreground">Tu nombre y tu mensaje solo los ve el equipo de Reporty.</p>
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <div className="space-y-2">
            <Button type="submit" size="lg" className="w-full rounded-full" disabled={enviando}>
              {enviando ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Abriendo Mercado Pago…</> : textoBoton}
            </Button>
            <p className="text-center text-xs text-muted-foreground">Te llevamos a Mercado Pago para pagar de forma segura. Reporty no ve los datos de tu tarjeta.</p>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
