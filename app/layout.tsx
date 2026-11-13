import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import Header from "@/components/header";
import { EnlacesLegales } from "@/components/legal/enlaces-legales";
import { RegistroServiceWorker } from "@/components/registro-service-worker";
import { ScrollReveal } from "@/components/scroll-reveal";
import { Toaster } from "@/components/ui/sonner";
import { gaIdFromEnv } from "@/lib/analytics/google-analytics";
import { BASE_OPEN_GRAPH, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo/site";

const gaId = gaIdFromEnv(process.env.NEXT_PUBLIC_GA_ID);

export const viewport: Viewport = {
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { ...BASE_OPEN_GRAPH, title: SITE_NAME, description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: SITE_DESCRIPTION },
  icons: {
    icon: [
      { url: "/favicon_io/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon_io/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon_io/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon_io/favicon.ico" },
    ],
    apple: "/favicon_io/apple-touch-icon.png",
  },
  manifest: "/favicon_io/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" data-scroll-behavior="smooth">
      <body className={`flex min-h-dvh flex-col font-sans ${GeistSans.variable}`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground"
        >
          Saltar al contenido
        </a>
        <Header />
        <ScrollReveal />
        <main id="main-content" className="app-main">{children}<EnlacesLegales /></main>
        <Toaster richColors position="top-center" />
        <RegistroServiceWorker />
      </body>
      {gaId && <GoogleAnalytics gaId={gaId} />}
    </html>
  );
}
