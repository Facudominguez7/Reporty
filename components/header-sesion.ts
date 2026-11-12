"use client"

import { useEffect, useState } from "react"
import type { Session, User } from "@supabase/supabase-js"

import { createClient } from "@/utils/supabase/client"

/** Parte del cliente de Auth que usa el encabezado; las pruebas la reemplazan por una falsa. */
export type AuthDeEncabezado = {
  getSession: () => Promise<{ data: { session: Session | null } }>
  onAuthStateChange: (
    callback: (evento: string, sesion: Session | null) => void,
  ) => { data: { subscription: { unsubscribe: () => void } } }
}

/**
 * Lee el usuario de la sesión guardada en el navegador y avisa cada cambio posterior (ingreso,
 * salida, refresco). El encabezado sólo elige un enlace con este dato, así que alcanza con la
 * sesión local: no hace falta validarla contra Supabase como en las rutas protegidas.
 *
 * @param auth - Cliente de Auth del navegador.
 * @param alCambiar - Recibe el usuario, o `null` cuando no hay sesión.
 * @returns Función que cancela la suscripción y descarta la lectura inicial si sigue pendiente.
 */
export function suscribirUsuarioDeSesion(auth: AuthDeEncabezado, alCambiar: (usuario: User | null) => void): () => void {
  let activa = true

  auth.getSession().then(({ data }) => {
    if (activa) alCambiar(data.session?.user ?? null)
  })

  const { data } = auth.onAuthStateChange((_evento, sesion) => {
    if (activa) alCambiar(sesion?.user ?? null)
  })

  return () => {
    activa = false
    data.subscription.unsubscribe()
  }
}

/**
 * Usuario de la sesión para el encabezado. Se lee en el navegador para que el layout raíz no lea
 * cookies en el servidor: si lo hiciera, ninguna página podría servirse como HTML estático.
 *
 * @returns `undefined` mientras se lee la sesión, `null` sin sesión, o el usuario.
 */
export function useUsuarioDeSesion(): User | null | undefined {
  const [usuario, setUsuario] = useState<User | null | undefined>(undefined)

  useEffect(() => suscribirUsuarioDeSesion(createClient().auth, setUsuario), [])

  return usuario
}
