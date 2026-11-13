/**
 * Clave de sessionStorage que marca si ya se mostró la intro de entrada en esta sesión.
 */
export const CLAVE_INTRO_VISTA = "reporty-intro-vista"

/**
 * Condiciones del entorno del navegador que deciden si la intro corre.
 */
export type CondicionesIntro = {
  /** La app corre instalada: PWA en modo standalone o TWA (cuál también lo reporta). */
  modoInstalado: boolean
  /** El usuario prefiere movimiento reducido (prefers-reduced-motion: reduce). */
  movimientoReducido: boolean
  /** La intro ya se mostró en esta sesión (sessionStorage). */
  yaVista: boolean
}

/**
 * Decide si corresponde mostrar la intro de entrada de Reporty.
 *
 * Regla (artboard design/intro-app/03-palabra-que-sube.html): se muestra una sola vez
 * por sesión, solo cuando la app corre instalada, y nunca cuando el usuario prefiere
 * movimiento reducido.
 *
 * @param condiciones - Modo instalado, movimiento reducido y marca de sesión ya vista.
 * @returns `true` solo en sesión nueva, modo instalado y con movimiento permitido.
 */
export function evaluarMostrarIntro(condiciones: CondicionesIntro): boolean {
  return (
    condiciones.modoInstalado && !condiciones.movimientoReducido && !condiciones.yaVista
  )
}
