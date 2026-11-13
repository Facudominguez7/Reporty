/**
 * Origen de Supabase (API y realtime) para la CSP; en local puede ser el proxy de Tailscale.
 *
 * @returns El origen HTTPS de Supabase, o una lista vacía si la variable no está definida.
 */
function origenesSupabase() {
  try {
    const { origin, host } = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    return [origin, `wss://${host}`]
  } catch {
    return []
  }
}

/**
 * Política de contenido en modo Report-Only: registra en consola lo que bloquearía, sin
 * bloquear nada, para afinarla con tráfico real antes de pasarla a `Content-Security-Policy`.
 */
const politicaContenido = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${origenesSupabase().join(' ')} https://*.supabase.co wss://*.supabase.co https://*.google-analytics.com https://*.analytics.google.com`,
  'frame-src https://challenges.cloudflare.com',
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

/** Cabeceras de seguridad que se envían en todas las rutas. */
const cabecerasSeguridad = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Nadie embebe Reporty en un iframe: impide el clickjacking sobre login, votos y donaciones.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // La cámara y la ubicación las usa el propio sitio al reportar; el resto queda apagado.
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()' },
  // Sin includeSubDomains: no hay garantía de que todo subdominio del dominio sirva HTTPS.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'Content-Security-Policy-Report-Only', value: politicaContenido },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // No anunciar el framework en `x-powered-by`.
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: cabecerasSeguridad },
      // Los chunks de /_next/static traen hash de contenido en el nombre: son inmutables.
      // Sin esta regla, la cabecera global los dejaba en no-store y cada visita
      // re-descargaba todo el JS (enlentecía el primer paint del TWA/PWA). Next no
      // hereda las cabeceras entre reglas que matchean la misma URL: se repiten aqui.
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          ...cabecerasSeguridad,
        ],
      },
    ]
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },

  allowedDevOrigins: ['192.168.0.107', '*.ts.net', '**.ts.net'],
  // The home is the map. Serving it at `/` with a rewrite saves the browser the
  // extra round trip of a redirect before the page starts loading.
  // One host for search engines: www.reporty.com.ar would otherwise serve the same pages twice.
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.reporty.com.ar' }],
        destination: 'https://reporty.com.ar/:path*',
        permanent: true,
      },
    ]
  },
  async rewrites() {
    return [{ source: '/', destination: '/mapa' }]
  },
  experimental: {
    serverActions: {
      // Optimized photo (100 KB) + thumbnail (100 KB) + the form fields and multipart overhead.
      bodySizeLimit: '1mb',
    },
  },
}

// Exposes the Cloudflare bindings (IMAGES, R2, secrets) to `next dev`, so local development
// matches the Worker that @opennextjs/cloudflare builds for production.
if (process.env.NODE_ENV === 'development') {
  const { initOpenNextCloudflareForDev } = await import('@opennextjs/cloudflare')
  initOpenNextCloudflareForDev()
}

export default nextConfig
