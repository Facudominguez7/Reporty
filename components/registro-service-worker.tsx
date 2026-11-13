"use client"

import { useEffect } from "react"

/**
 * Registra el service worker de Reporty (`public/sw.js`) en producción.
 *
 * En desarrollo no se registra para no interferir con la recarga en caliente de Next.
 * `updateViaCache: "none"` hace que el navegador busque siempre la última versión de sw.js.
 *
 * @returns Nada: el componente no renderiza contenido.
 */
export function RegistroServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => console.error("No se pudo registrar el service worker", error))
  }, [])

  return null
}
