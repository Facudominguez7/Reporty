/** @type {import('next').NextConfig} */
const nextConfig = {
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
