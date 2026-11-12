import { readFileSync } from "node:fs"
import type { Session, User } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

import { suscribirUsuarioDeSesion, type AuthDeEncabezado } from "./header-sesion"

const usuario = { id: "u-1", is_anonymous: false } as User

/** Auth falso: guarda el listener para disparar cambios de sesión desde la prueba. */
const authFalso = (sesionInicial: Session | null) => {
  let listener: ((evento: string, sesion: Session | null) => void) | null = null
  const desuscribir = vi.fn()
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: sesionInicial } })),
    onAuthStateChange: vi.fn((callback: (evento: string, sesion: Session | null) => void) => {
      listener = callback
      return { data: { subscription: { unsubscribe: desuscribir } } }
    }),
  }
  return { auth: auth as unknown as AuthDeEncabezado, emitir: (s: Session | null) => listener?.("SIGNED_IN", s), desuscribir }
}

describe("sesión del encabezado leída en el navegador", () => {
  it("informa el usuario de la sesión guardada y los cambios posteriores", async () => {
    const { auth, emitir } = authFalso({ user: usuario } as Session)
    const alCambiar = vi.fn()

    suscribirUsuarioDeSesion(auth, alCambiar)
    await Promise.resolve()
    await Promise.resolve()
    expect(alCambiar).toHaveBeenLastCalledWith(usuario)

    emitir(null)
    expect(alCambiar).toHaveBeenLastCalledWith(null)
  })

  it("informa null cuando no hay sesión", async () => {
    const { auth } = authFalso(null)
    const alCambiar = vi.fn()

    suscribirUsuarioDeSesion(auth, alCambiar)
    await Promise.resolve()
    await Promise.resolve()
    expect(alCambiar).toHaveBeenCalledWith(null)
  })

  it("deja de informar después de cancelar, incluida la lectura inicial pendiente", async () => {
    const { auth, emitir, desuscribir } = authFalso({ user: usuario } as Session)
    const alCambiar = vi.fn()

    const cancelar = suscribirUsuarioDeSesion(auth, alCambiar)
    cancelar()
    await Promise.resolve()
    await Promise.resolve()
    emitir({ user: usuario } as Session)

    expect(alCambiar).not.toHaveBeenCalled()
    expect(desuscribir).toHaveBeenCalledTimes(1)
  })

  it("el encabezado del layout no lee cookies en el servidor, así las páginas públicas pueden ser estáticas", () => {
    const codigo = readFileSync(new URL("./header.tsx", import.meta.url), "utf8")

    expect(codigo).not.toContain("@/utils/supabase/server")
    expect(codigo).not.toContain("getUser")
    expect(codigo).not.toMatch(/async function Header/)
  })
})
