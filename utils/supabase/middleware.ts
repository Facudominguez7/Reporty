import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import {
  LIMITE_SESION_ADMIN_MS,
  obtenerInicioAutenticacion,
  sesionVencida,
} from '@/lib/auth/session-expiry'
import { canAccessAdminPanel, canCreateReports, puedeOperarCuadrillas } from '@/lib/authz/roles'
import { GUEST_MODE_PARAM, GUEST_MODE_VALUE, NEW_REPORT_PATH } from '@/lib/routes/guest-report'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: DO NOT REMOVE auth.getUser()

  let {
    data: { user },
  } = await supabase.auth.getUser()

  // Absolute session expiry (issue #180): 30 days for regular users, 24 hours for admins.
  // Anonymous guest sessions are exempt. The profile is read only when the session is old
  // enough for the role to matter. An expired session is revoked and the request continues
  // without a user, so protected routes send it to /auth below.
  if (user && !user.is_anonymous) {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const inicioMs = obtenerInicioAutenticacion(session?.access_token, user.last_sign_in_at)
    const ahoraMs = Date.now()
    let rolId: number | null = null

    if (inicioMs !== null && ahoraMs - inicioMs >= LIMITE_SESION_ADMIN_MS) {
      const { data: perfil } = await supabase.from('profiles').select('rol_id').eq('id', user.id).single()
      rolId = perfil?.rol_id ?? null
    }

    if (sesionVencida({ inicioMs, ahoraMs, rolId })) {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) {
        // signOut keeps the cookies when the revocation request fails; clear them here so the
        // browser and the handlers that run later in this request no longer see the session.
        const cookiesAuth = request.cookies.getAll().filter(({ name }) => name.startsWith('sb-'))
        cookiesAuth.forEach(({ name }) => request.cookies.delete(name))
        supabaseResponse = NextResponse.next({ request })
        cookiesAuth.forEach(({ name }) => supabaseResponse.cookies.set(name, '', { path: '/', maxAge: 0 }))
      }
      user = null
    }
  }

  const redirectWithSupabaseCookies = (url: URL) => {
    const response = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
    return response
  }

  const pathname = request.nextUrl.pathname

  // Define which paths require authentication.
  // /reportes, the report detail, /mapa and /mis-reportes stay public: anyone can read a
  // report, and the detail page asks for a session only for actions such as voting.
  // /reportes/nuevo sends visitors without a session to /auth so they choose between signing
  // in and continuing as a guest; the guest choice returns with ?modo=invitado and the browser
  // opens the anonymous session only on submit.
  const protectedPaths = ['/dashboard', '/admin']
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/')
  const isNewReportWithoutGuestChoice =
    pathname === NEW_REPORT_PATH && request.nextUrl.searchParams.get(GUEST_MODE_PARAM) !== GUEST_MODE_VALUE
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p)) || isNewReportWithoutGuestChoice

  if (!user && isProtected) {
    // no user and trying to access a protected route -> redirect to login
    const url = request.nextUrl.clone()
    url.pathname = '/auth'
    url.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
    return redirectWithSupabaseCookies(url)
  }

  // Verificar permisos de rol para crear reportes y para operar cuadrillas.
  // Se comparte una única lectura de `profiles` entre ambas guardas.
  const rutaCrearReporte = request.nextUrl.pathname.startsWith('/reportes/nuevo')
  const rutaCuadrillas = request.nextUrl.pathname.startsWith('/dashboard/cuadrillas')

  if (user && isAdminRoute) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('rol_id')
      .eq('id', user.id)
      .single()

    if (!profileData || !canAccessAdminPanel(profileData.rol_id)) {
      const url = request.nextUrl.clone()
      url.pathname = '/mapa'
      return redirectWithSupabaseCookies(url)
    }
  }

  if (user && (rutaCrearReporte || rutaCuadrillas)) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('rol_id')
      .eq('id', user.id)
      .single()

    // Si falla la lectura del perfil, rolId queda null y ambas guardas deniegan (fail-closed).
    const rolId = profileData?.rol_id ?? null

    if (rutaCrearReporte && !canCreateReports(rolId)) {
      // Usuario autenticado pero sin permisos -> redirigir al mapa
      const url = request.nextUrl.clone()
      url.pathname = '/mapa'
      return redirectWithSupabaseCookies(url)
    }

    if (rutaCuadrillas && !puedeOperarCuadrillas(rolId)) {
      // Usuario autenticado pero sin permisos para operar cuadrillas -> redirigir al dashboard
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return redirectWithSupabaseCookies(url)
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
