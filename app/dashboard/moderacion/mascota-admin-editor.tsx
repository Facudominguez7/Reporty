"use client"
import { useState, useTransition, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { editarMascotaAction } from "./actions"
import type { EdicionMascotaAdmin } from "@/lib/moderation/administracion.server"

export function EditorMascotaAdmin({ mascota }: { mascota: EdicionMascotaAdmin }) {
  const [mensaje, setMensaje] = useState("")
  const [pendiente, startTransition] = useTransition()
  function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const cambio: EdicionMascotaAdmin = {
      id: mascota.id,
      tipoAnimal: String(form.get("tipoAnimal")) as EdicionMascotaAdmin["tipoAnimal"],
      descripcion: String(form.get("descripcion")), lat: Number(form.get("lat")), lon: Number(form.get("lon")),
      telefono: String(form.get("telefono")), estado: String(form.get("estado")) as EdicionMascotaAdmin["estado"],
    }
    startTransition(async () => {
      const resultado = await editarMascotaAction(cambio)
      setMensaje(resultado.mensaje)
    })
  }
  return <div className="grid gap-4">
  <form aria-label={`Editar publicación de mascota ${mascota.id}`}  onSubmit={guardar} className="grid gap-3 rounded-md border p-4">
    <label className="grid gap-1">Tipo de animal
      <select name="tipoAnimal" defaultValue={mascota.tipoAnimal} required>
        <option value="perro">Perro</option><option value="gato">Gato</option><option value="otro">Otro</option>
      </select>
    </label>
    <label className="grid gap-1">Descripción
      <textarea name="descripcion" defaultValue={mascota.descripcion} maxLength={5000} required />
    </label>
    <label className="grid gap-1">Latitud
      <input name="lat" type="number" step="any" min="-90" max="90" defaultValue={mascota.lat} required />
    </label>
    <label className="grid gap-1">Longitud
      <input name="lon" type="number" step="any" min="-180" max="180" defaultValue={mascota.lon} required />
    </label>
    <label className="grid gap-1">Teléfono público
      <input name="telefono" type="tel" inputMode="numeric" pattern="[0-9]+" maxLength={40} defaultValue={mascota.telefono} onChange={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/[^0-9]/g, "") }} aria-describedby="telefono-admin-ayuda" required />
      <span id="telefono-admin-ayuda">Ingresá solo números, sin espacios ni símbolos.</span>
    </label>
    <label className="grid gap-1">Estado
      <select name="estado" defaultValue={mascota.estado} required>
        <option value="perdida">Perdida</option><option value="encontrada">Encontrada</option>
      </select>
    </label>
    <Button type="submit" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar cambios"}</Button>
    <p role="status" aria-live="polite">{mensaje}</p>
  </form>
  </div>
}
