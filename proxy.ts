import { NextResponse, type NextRequest } from 'next/server'

import { cuadrillasHabilitadas } from '@/lib/features'
import { updateSession } from '@/utils/supabase/middleware'

const RUTA_CUADRILLAS = '/dashboard/cuadrillas'

/**
 * Páginas públicas que se generan como HTML estático: ni ellas ni el layout leen la sesión, así
 * que refrescarla acá sólo gastaría CPU y una llamada a Supabase en cada visita. Una ruta que
 * empiece a leer la sesión (o que tenga server actions) tiene que salir de esta lista.
 */
const RUTAS_ESTATICAS_SIN_SESION = new Set(['/', '/terminos', '/privacidad', '/crear'])

/**
 * Corre antes de cada ruta: apaga las rutas de cuadrillas deshabilitadas, deja pasar sin sesión
 * las páginas estáticas públicas y refresca la sesión de Supabase en el resto.
 *
 * @param request - Pedido entrante.
 * @returns La respuesta que continúa, reescribe o redirige el pedido.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (RUTAS_ESTATICAS_SIN_SESION.has(pathname)) {
    return NextResponse.next()
  }

  // While crews are turned off their routes must not exist. The pages under /dashboard stream
  // from loading.tsx and would answer 404 with a 200 status, so the check runs here, before
  // rendering: a path under a private folder (`_`) never matches a route, so Next answers 404.
  if (!cuadrillasHabilitadas() && (pathname === RUTA_CUADRILLAS || pathname.startsWith(`${RUTA_CUADRILLAS}/`))) {
    return NextResponse.rewrite(new URL('/_cuadrillas-deshabilitadas', request.url))
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}