import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"

import { ErrorConfiguracionArchivo, leerSecretoCron } from "@/lib/auditoria-archivo/configuracion"
import { crearDependenciasArchivado } from "@/lib/auditoria-archivo/datos-archivado"
import { ejecutarArchivado, type ResumenArchivado } from "@/lib/auditoria-archivo/servicio-archivado"

/**
 * Ejecución programada del archivo histórico de auditoría.
 *
 * - `GET` es siempre `dry-run`: informa qué se archivaría sin reclamar, subir ni
 *   borrar nada, así que se puede llamar sin riesgo desde un monitoreo.
 * - `POST` ejecuta una corrida real acotada (`?limite=` entre 1 y 5000).
 *
 * Autenticación: `Authorization: Bearer <AUDIT_ARCHIVE_CRON_SECRET>` comparado en
 * tiempo constante. Sin secreto configurado el endpoint responde 503 y no hace
 * nada; ningún usuario público puede disparar el archivado.
 *
 * El procesamiento por invocación es acotado a propósito: no se depende de una
 * request larga. Si quedan eventos elegibles, la corrida siguiente los toma.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Respuesta JSON sin caché: los resúmenes no se guardan en intermediarios. */
function respuesta(cuerpo: Record<string, unknown>, estado = 200) {
  return NextResponse.json(cuerpo, {
    status: estado,
    headers: { "Cache-Control": "no-store" },
  })
}

/**
 * Compara el token del pedido con el secreto configurado en tiempo constante.
 *
 * @param peticion request entrante.
 * @param secreto secreto esperado, ya validado.
 */
function autorizado(peticion: Request, secreto: string): boolean {
  const cabecera = peticion.headers.get("authorization") ?? ""
  const [esquema, token] = cabecera.split(" ")
  if (esquema?.toLowerCase() !== "bearer" || !token) return false

  const esperado = Buffer.from(secreto, "utf8")
  const recibido = Buffer.from(token, "utf8")
  if (esperado.length !== recibido.length) return false
  return timingSafeEqual(esperado, recibido)
}

/** Lee y acota el límite pedido por query string; `undefined` deja el del entorno. */
function leerLimite(peticion: Request): number | undefined {
  const crudo = new URL(peticion.url).searchParams.get("limite")
  if (!crudo || !/^\d+$/.test(crudo)) return undefined
  const limite = Number(crudo)
  return limite > 0 ? limite : undefined
}

/**
 * Prepara la corrida: valida el secreto y ejecuta el archivado.
 *
 * @param peticion request entrante.
 * @param modo `dry-run` para informar o `real` para archivar.
 */
async function ejecutar(peticion: Request, modo: "dry-run" | "real"): Promise<NextResponse> {
  let secreto: string
  try {
    secreto = leerSecretoCron()
  } catch (error) {
    if (error instanceof ErrorConfiguracionArchivo) {
      // Sin secreto no hay ejecución posible: se informa sin exponer detalles.
      return respuesta({ error: "El archivo de auditoría no está configurado." }, 503)
    }
    throw error
  }

  if (!autorizado(peticion, secreto)) {
    return respuesta({ error: "No autorizado." }, 401)
  }

  let resumen: ResumenArchivado
  try {
    resumen = await ejecutarArchivado(
      { modo, ejecutor: "cron", limite: leerLimite(peticion) },
      crearDependenciasArchivado(),
    )
  } catch (error) {
    const detalle = error instanceof Error ? error.name : "ErrorDesconocido"
    return respuesta({ error: "La corrida del archivo no pudo ejecutarse.", detalle }, 500)
  }

  return respuesta(resumen, resumen.ok ? 200 : 502)
}

/** `GET`: simulación sin efectos. */
export async function GET(peticion: Request): Promise<NextResponse> {
  return ejecutar(peticion, "dry-run")
}

/** `POST`: corrida real acotada. */
export async function POST(peticion: Request): Promise<NextResponse> {
  return ejecutar(peticion, "real")
}
