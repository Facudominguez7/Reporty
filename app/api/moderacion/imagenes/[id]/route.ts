/** Proxy privado: autoriza cada solicitud y nunca entrega URLs de Storage. */
import { obtenerImagenPrivada } from "@/lib/moderation/administracion.server"
export const dynamic = "force-dynamic"
export const revalidate = 0
const cabeceras = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Vary": "Cookie", "X-Robots-Tag": "noindex, nofollow" }

/** Devuelve únicamente WebP verificado o un error uniforme sin revelar objetos a no administradores. */
export async function GET(_solicitud: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await contexto.params
    const bytes = await obtenerImagenPrivada(id)
    return new Response(new Uint8Array(bytes), { headers: { ...cabeceras, "Content-Type": "image/webp" } })
  } catch (error) {
    const estado = (error as { estado?: number })?.estado
    return new Response("Imagen no disponible", { status: [400, 401, 403, 404].includes(estado ?? 0) ? estado : 503, headers: cabeceras })
  }
}
