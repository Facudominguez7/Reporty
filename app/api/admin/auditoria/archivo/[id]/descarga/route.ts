import { NextResponse } from "next/server"

import { prepararDescargaArchivada } from "@/lib/auditoria-archivo/servicio-recuperacion"
import { createClient } from "@/utils/supabase/server"

/**
 * Descarga administrativa de un lote de auditoría archivado.
 *
 * La sesión y el rol Admin se validan en el servidor, y el archivo se sirve como
 * adjunto `.jsonl.gz` sin caché. Nunca se expone una URL del bucket ni una URL
 * pre-firmada: el objeto se lee con credenciales del servidor y se entrega solo
 * a un Admin autenticado.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Respuesta de error sin datos del lote. */
function error(cuerpo: string, estado: number) {
  return NextResponse.json({ error: cuerpo }, { status: estado, headers: { "Cache-Control": "no-store" } })
}

/**
 * Devuelve el archivo comprimido del lote pedido.
 *
 * @param _peticion request entrante (sin parámetros de entrada).
 * @param contexto parámetros de ruta; `id` es el identificador del lote.
 */
export async function GET(
  _peticion: Request,
  contexto: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return error("No autorizado.", 401)

  const { id } = await contexto.params
  const { unauthorized, descarga, error: errorDescarga } = await prepararDescargaArchivada(supabase, user.id, id)

  // Un lote ajeno se responde igual que uno inexistente: no se filtra su existencia.
  if (unauthorized) return error("No autorizado.", 403)
  if (!descarga) {
    return errorDescarga ? error("No pudimos leer el lote archivado.", 502) : error("El lote archivado no existe.", 404)
  }

  return new NextResponse(new Uint8Array(descarga.contenido), {
    status: 200,
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${descarga.nombre}"`,
      "Content-Length": String(descarga.tamano),
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
