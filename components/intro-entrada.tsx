"use client"

/**
 * Intro de entrada de Reporty (artboard design/intro-app/03-palabra-que-sube.html):
 * pantalla superpuesta con el nombre letra por letra, subrayado verde que se traza
 * y un lema, que se funde hacia el contenido del mapa. Se muestra una sola vez por
 * sesión y se omite con `prefers-reduced-motion: reduce`.
 */

import { useEffect, useState } from "react"
import { CLAVE_INTRO_VISTA, evaluarMostrarIntro } from "@/lib/intro/entrada"

/** Letras del nombre de la marca, en orden de aparición. */
const LETRAS_MARCA = ["R", "e", "p", "o", "r", "t", "y"] as const

/** Retardo base de la primera letra, en milisegundos. */
const RETARDO_BASE_MS = 100
/** Separación entre letras, en milisegundos. */
const PASO_LETRA_MS = 60
/** Duración total: la salida arranca a los 2.05 s y dura 0.8 s. */
const DURACION_TOTAL_MS = 2900

/**
 * Pantalla de entrada animada del mapa. No renderiza nada cuando corresponde omitirla.
 *
 * @returns El overlay de entrada, o `null` si la regla de sesión/movimiento no la habilita.
 */
export function IntroEntrada() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let quitarSalida: ReturnType<typeof setTimeout> | undefined
    // La decisión corre diferida: coincide con la hydration del cliente y evita
    // un setState síncrono dentro del propio effect.
    const decidir = setTimeout(() => {
      // TWAs y PWA instaladas reportan display-mode: standalone; iOS Safari lo
      // expone como navigator.standalone.
      const modoInstalado =
        window.matchMedia("(display-mode: standalone)").matches ||
        Boolean("standalone" in window.navigator && window.navigator.standalone)
      const movimientoReducido = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches
      const yaVista = window.sessionStorage.getItem(CLAVE_INTRO_VISTA) !== null

      if (!evaluarMostrarIntro({ modoInstalado, movimientoReducido, yaVista })) {
        return
      }

      window.sessionStorage.setItem(CLAVE_INTRO_VISTA, "1")
      setVisible(true)
      quitarSalida = setTimeout(() => setVisible(false), DURACION_TOTAL_MS)
    }, 0)

    return () => {
      clearTimeout(decidir)
      if (quitarSalida !== undefined) {
        clearTimeout(quitarSalida)
      }
    }
  }, [])

  if (!visible) {
    return null
  }

  return (
    <div
      className="intro-entrada"
      role="img"
      aria-label="Pantalla de entrada de Reporty"
    >
      <span className="intro-icono intro-anim" style={{ animationDelay: "50ms" }}>
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M12 22s8-6.9 8-12.2A8 8 0 1 0 4 9.8C4 15.1 12 22 12 22Z"
            fill="var(--card)"
          />
          <circle cx="12" cy="9.4" r="3.1" fill="var(--primary)" />
        </svg>
      </span>
      <p className="intro-letras" aria-hidden="true">
        {LETRAS_MARCA.map((letra, indice) => (
          <span
            key={`${letra}-${indice}`}
            className="intro-anim"
            style={{
              animationDelay: `${RETARDO_BASE_MS + indice * PASO_LETRA_MS}ms`,
            }}
          >
            {letra}
          </span>
        ))}
      </p>
      <span
        className="intro-subrayado intro-anim-trazo"
        style={{ animationDelay: "800ms" }}
      />
      <p
        className="intro-lema intro-anim"
        style={{ animationDelay: "1000ms" }}
      >
        Tu ciudad, reportada y reparada
      </p>
    </div>
  )
}
