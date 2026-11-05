/**
 * Regresión del defecto visible en `/auth`: cada acción de la pantalla (ingreso, registro y
 * acceso como invitado) montaba su propio widget de Turnstile, así que el ingreso y el
 * invitado mostraban dos desafíos al mismo tiempo y cada uno guardaba su propio token.
 *
 * La dirección 03 conserva esa verificación única, pero la agrupa en una sola superficie con el
 * envío de la pestaña activa y suma `Invitado` como tercera pestaña, para que el acceso sin
 * cuenta no obligue a bajar hasta el final de la tarjeta.
 *
 * El entorno de pruebas del repo corre en `node` sin DOM, así que los eventos del navegador no
 * se pueden ejecutar acá. Estas pruebas verifican el cableado del componente sobre su código (la
 * misma técnica que ya usa `app/auth/signup-login.test.ts`) y cubren la estructura de la
 * tarjeta: cuántos desafíos monta la pantalla, dónde vive el grupo, qué token alimenta cada
 * formulario, dónde se reclama la verificación y cuándo se libera. La decisión de qué envío
 * acompaña a cada pestaña y cuándo queda bloqueado se prueba por comportamiento en
 * `tests/auth/envio-de-la-pestana.test.ts`; la concurrencia del reclamo, en
 * `tests/auth/verificacion-compartida.test.ts`.
 */
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/** Código de la pantalla de autenticación, único lugar donde vive la verificación. */
const fuentePagina = () => readFileSync(new URL("../../app/auth/page.tsx", import.meta.url), "utf8")

/**
 * Cuenta cuántas veces aparece una marca en el código.
 *
 * @param codigo - Código completo de la pantalla.
 * @param marca - Texto a contar.
 * @returns Cantidad de apariciones.
 */
const contar = (codigo: string, marca: string) => codigo.split(marca).length - 1

/**
 * Recorta el fragmento que va desde una marca hasta la primera aparición de otra.
 *
 * @param codigo - Código completo de la pantalla.
 * @param inicio - Marca que abre el fragmento.
 * @param fin - Marca que lo cierra; debe aparecer después de `inicio`.
 * @returns Fragmento recortado.
 */
const recortar = (codigo: string, inicio: string, fin: string) => {
  const desde = codigo.indexOf(inicio)
  const hasta = codigo.indexOf(fin, desde)

  expect(desde).toBeGreaterThan(-1)
  expect(hasta).toBeGreaterThan(desde)

  return codigo.slice(desde, hasta)
}

/** Fragmento del manejador que envía un formulario protegido. */
const manejadorDeEnvio = (codigo: string) =>
  recortar(codigo, "const enviarFormulario =", "\n  useEffect(() => {")

describe("verificación de seguridad compartida en /auth", () => {
  it("monta un único desafío fuera de los paneles y dentro del grupo de envío", () => {
    const codigo = fuentePagina()
    const desafio = codigo.indexOf("<TurnstileWidget")

    expect(contar(codigo, "<TurnstileWidget")).toBe(1)
    // Vive después de los tres paneles: cambiar de pestaña no lo desmonta ni pierde el token.
    expect(desafio).toBeGreaterThan(codigo.lastIndexOf("</TabsContent>"))
    // Y dentro del grupo que también contiene los botones que envían cada pestaña.
    expect(desafio).toBeGreaterThan(codigo.indexOf("function GrupoVerificacionYEnvio"))
    expect(desafio).toBeLessThan(codigo.indexOf('form="formulario-ingreso"'))
    expect(desafio).toBeLessThan(codigo.indexOf('form="formulario-registro"'))
  })

  it("agrupa el desafío con el envío de la pestaña activa en una sola superficie", () => {
    const codigo = fuentePagina()

    // Un único grupo, renderizado una vez y fuera de los paneles que se desmontan.
    expect(contar(codigo, "<GrupoVerificacionYEnvio")).toBe(1)
    expect(codigo.indexOf("<GrupoVerificacionYEnvio")).toBeGreaterThan(codigo.lastIndexOf("</TabsContent>"))
    // La superficie que el sistema de diseño pide para el grupo.
    expect(codigo).toContain('role="group"')
    expect(codigo).toContain('aria-label="Verificación de seguridad y envío"')
    expect(codigo).toContain("rounded-[var(--radius)] border border-border bg-surface-subtle p-3")
    // Los tres envíos cuelgan del grupo y comparten el mismo bloqueo.
    expect(contar(codigo, "disabled={envio.bloqueado}")).toBe(3)
  })

  it("ofrece ingreso, registro e invitado en la misma lista de pestañas", () => {
    const codigo = fuentePagina()

    // Las tres pestañas salen del módulo compartido, que es el que las prueba por comportamiento.
    expect(codigo).toContain("PESTANAS_AUTH.map")
    expect(codigo).toContain("ETIQUETAS_PESTANA[valor]")
    expect(codigo).toContain('className="grid w-full grid-cols-3"')
    expect(codigo).toContain("<TabsContent value=\"ingreso\"")
    expect(codigo).toContain("<TabsContent value=\"registro\"")
    expect(codigo).toContain("<TabsContent value=\"invitado\"")
    // El acceso como invitado ya no vive en una sección al final de la tarjeta.
    expect(codigo).not.toContain("¿Querés continuar como invitado?")
  })

  it("no repite la explicación del desafío que la dirección 03 elimina", () => {
    const codigo = fuentePagina()

    expect(codigo).not.toContain("La verificación de seguridad es una sola")
    expect(codigo).not.toContain('id="verificacion-compartida"')
  })

  it("mantiene el aviso de error del invitado junto a su pestaña", () => {
    const panelInvitado = recortar(
      fuentePagina(),
      '<TabsContent value="invitado"',
      "</TabsContent>",
    )

    expect(panelInvitado).toContain("Podés crear y seguir reportes, pero no comentar ni votar.")
    expect(panelInvitado).toContain("{guestError && (")
    expect(panelInvitado).toContain("<AlertDescription>{guestError}</AlertDescription>")
  })

  it("asocia cada envío con su formulario sin meter el desafío dentro de una pestaña", () => {
    const codigo = fuentePagina()

    expect(codigo).toContain('id="formulario-ingreso"')
    expect(codigo).toContain('id="formulario-registro"')
    // Los botones quedan fuera de su formulario y lo referencian por id: así el desafío puede
    // quedar arriba de ellos sin vivir dentro de un panel que se desmonta al cambiar de pestaña.
    expect(codigo.indexOf('form="formulario-ingreso"')).toBeGreaterThan(codigo.lastIndexOf("</form>"))
    expect(codigo.indexOf('form="formulario-registro"')).toBeGreaterThan(codigo.lastIndexOf("</form>"))
  })

  it("envía a los dos formularios el token de esa verificación", () => {
    const campos = fuentePagina().match(/name="captcha_token" value=\{(<[^>]*>|[^}])*\} \/>/g) ?? []

    expect(campos).toHaveLength(2)
    expect(campos.every((campo) => campo.includes("verificacion.token"))).toBe(true)
  })

  it("no guarda un token propio por acción", () => {
    const identificadores = fuentePagina().match(/\b\w*(?:login|signup|guest)Captcha\w*\b/gi) ?? []

    // Cualquier identificador por acción sería un token separado del compartido.
    expect(identificadores).toEqual([])
  })

  it("reclama la verificación en cada envío y cancela el envío sin reclamo", () => {
    const codigo = fuentePagina()
    const manejador = manejadorDeEnvio(codigo)

    expect(codigo).toContain('onSubmit={enviarFormulario("ingreso")}')
    expect(codigo).toContain('onSubmit={enviarFormulario("registro")}')
    // El reclamo ocurre dentro del evento, antes de que React llame a la acción del servidor.
    expect(manejador).toContain("reclamar(operacion)")
    expect(manejador.indexOf("evento.preventDefault()")).toBeGreaterThan(manejador.indexOf("if (!reclamacion)"))
    // El `FormData` del envío conserva el token reclamado aunque el estado ya esté vacío.
    expect(manejador).toContain("entregarTokenAlFormulario(evento.currentTarget, reclamacion.token)")
  })

  it("reinicia el desafío con cada reclamo", () => {
    const codigo = fuentePagina()

    // El widget se reinicia con el contador que la máquina de la verificación incrementa al
    // reclamar; ese incremento se prueba en `tests/auth/verificacion-compartida.test.ts`.
    expect(codigo).toContain("resetSignal={verificacion.desafios}")
  })

  it("libera la verificación cuando la operación termina", () => {
    const codigo = fuentePagina()

    expect(codigo).toContain('if (!loginPending) liberar("ingreso")')
    expect(codigo).toContain('if (!signupPending) liberar("registro")')
    // El invitado libera desde su propio flujo, que se prueba por comportamiento.
    expect(codigo).toContain("abrirSesionInvitada({")
  })

  it("entrega al grupo el estado que decide el bloqueo de la pestaña activa", () => {
    const grupo = recortar(
      fuentePagina(),
      "function GrupoVerificacionYEnvio",
      "\n/**\n * Agrupa una etiqueta accesible",
    )

    // El grupo delega la decisión en el módulo compartido, que la prueba por comportamiento.
    expect(grupo).toContain("envioDeLaPestana({")
    expect(grupo).toContain("pestana,")
    expect(grupo).toContain("verificacion,")
    expect(grupo).toContain("ingresoPendiente: loginPending")
    expect(grupo).toContain("registroPendiente: signupPending")
    expect(grupo).toContain("contrasenasCoinciden: passwordsMatch")
    expect(grupo).toContain("exigeDesafio: needsCaptcha")
    expect(grupo).toContain("captchaNoDisponible")
  })
})
