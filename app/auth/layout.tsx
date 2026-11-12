import type { Metadata } from "next"

import { NO_INDEX } from "@/lib/seo/site"

// Private or form-only pages: useful to whoever is signed in, never as a search result.
export const metadata: Metadata = { robots: NO_INDEX }

// /auth lee `?next=` y `?error=` con useSearchParams, y la sesión decide adónde redirigir: se
// renderiza en cada pedido, como antes de que el encabezado dejara de leer cookies en el servidor.
export const dynamic = "force-dynamic"

export default function NoIndexLayout({ children }: { children: React.ReactNode }) {
  return children
}
