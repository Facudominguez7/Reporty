/** Integración opt-in exclusivamente contra ReportyModeracionPruebas, sin proveedor externo. */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import sharp from "sharp"
import { expect, it, vi } from "vitest"

const { moderarImagen } = vi.hoisted(() => ({ moderarImagen: vi.fn() }))
vi.mock("./sightengine.server", () => ({ moderarImagen }))
import { moderarYGuardarImagenReporte } from "./imagenes-reporte.server"

const trabajo = ".moderacion-pruebas-local"
const api = "http://127.0.0.1:55321"
const baseDatos = "postgresql://postgres:postgres@127.0.0.1:55322/postgres"

/** Verifica el destino antes de capturar claves efímeras; nunca lee archivos de entorno. */
function estadoAislado() {
  const configuracion = readFileSync(`${trabajo}/supabase/config.toml`, "utf8")
  expect(configuracion).toMatch(/^project_id\s*=\s*"ReportyModeracionPruebas"\s*$/m)
  expect(configuracion).toMatch(/^port\s*=\s*55321\s*$/m)
  expect(configuracion).toMatch(/^port\s*=\s*55322\s*$/m)
  let salida: string
  try {
    salida = execFileSync("npx", ["--no-install", "supabase", "status", "--workdir", trabajo, "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000 })
  } catch { throw new Error("Estado del stack sintético no disponible") }
  const estado = JSON.parse(salida) as Record<string, string>
  // No incluir el objeto de estado en errores: contiene credenciales locales efímeras.
  if (estado.API_URL !== api || estado.DB_URL !== baseDatos || !estado.SERVICE_ROLE_KEY || !estado.ANON_KEY) throw new Error("Destino sintético inválido")
  return estado
}

/** Ejecuta SQL únicamente contra el destino fijo, sin imprimir parámetros ni errores crudos. */
function sql(consulta: string) {
  try {
    return execFileSync("psql", [baseDatos, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", consulta], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 5000 }).trim()
  } catch { throw new Error("Falló consulta sintética local") }
}

/** Impide redirecciones y cualquier acceso HTTP fuera del único origen autorizado. */
const solicitar: typeof fetch = (entrada, opciones) => {
  const url = new URL(entrada instanceof Request ? entrada.url : String(entrada))
  if (url.origin !== api) throw new Error("Origen HTTP no autorizado")
  return fetch(entrada, { ...opciones, redirect: "error", signal: AbortSignal.timeout(5000) })
}

/** Genera una fotografía mínima válida enteramente en memoria. */
async function imagen(color: string) {
  const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: color } }).png().toBuffer()
  return new File([new Uint8Array(bytes)], "sintetica.png", { type: "image/png" })
}

it.skipIf(process.env.MODERACION_INTEGRACION_LOCAL !== "1")("publica y deduplica con Storage/SQL reales; REVIEW permanece privado", async () => {
  const estado = estadoAislado()
  const opciones = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: solicitar } }
  const servicio = createClient(api, estado.SERVICE_ROLE_KEY, opciones)
  const sesion = createClient(api, estado.ANON_KEY, opciones)
  let propietario: string = randomUUID()
  const correo = `${propietario}@ejemplo.invalid`
  const clave = randomUUID()
  let reporteId: number | undefined
  let usuarioCreado = false
  moderarImagen.mockReset().mockResolvedValue({ decision: "APPROVED", motivos: [], operaciones: 2, proveedor: "simulado" })
  try {
    // Usuario y sesión son sintéticos y reales en Auth local; no se imprimen sus credenciales.
    const creacion = await servicio.auth.admin.createUser({ email: correo, password: clave, email_confirm: true })
    expect(creacion.error === null).toBe(true)
    if (!creacion.data.user) throw new Error("Identidad sintética no creada")
    propietario = creacion.data.user.id
    usuarioCreado = true
    const ingreso = await sesion.auth.signInWithPassword({ email: correo, password: clave })
    expect(ingreso.error === null).toBe(true)
    const actor = await sesion.auth.getUser()
    expect(actor.data.user?.id).toBe(propietario)
    reporteId = Number(sql(`insert into public.reportes(usuario_id,titulo,lat,lon,estado_id) values('${propietario}','Integración sintética de imágenes',0,0,null) returning id`))
    expect(Number.isSafeInteger(reporteId) && reporteId > 0).toBe(true)
    const entrada = { reporteId, propietarioId: propietario, image: await imagen("red") }
    const primero = await moderarYGuardarImagenReporte(servicio, entrada)
    expect(primero).toMatchObject({ estado: "APPROVED", publicada: true })
    const filas = await servicio.from("moderacion_imagenes").select("*").eq("reporte_id", reporteId)
    expect(filas.error === null).toBe(true)
    expect(filas.data).toHaveLength(1)
    const fila = filas.data![0]
    const fotos = await servicio.from("fotos_reporte").select("*").eq("reporte_id", reporteId)
    expect(fotos.error === null).toBe(true)
    expect(fotos.data).toHaveLength(1)
    expect(fotos.data![0].path).toBe(`${fila.id}/${fila.token}`)
    expect(fotos.data![0].thumbnail_path).toBe(`${fila.id}/${fila.token}-miniatura`)
    for (const path of [`${fila.id}/${fila.token}`, `${fila.id}/${fila.token}-miniatura`]) {
      const respuesta = await solicitar(`${api}/storage/v1/object/public/reportes/${path}`)
      expect(respuesta.ok).toBe(true)
      const bytes = Buffer.from(await respuesta.arrayBuffer())
      expect(bytes.length).toBeLessThanOrEqual(102400)
      const metadatos = await sharp(bytes).metadata()
      expect(metadatos.format).toBe("webp")
      if (path.endsWith("-miniatura")) expect(metadatos.width).toBeLessThanOrEqual(384)
      else {
        const { createHash } = await import("node:crypto")
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(fila.hash_sha256)
      }
    }
    expect(sql(`select count(*) from storage.objects where bucket_id='reportes-pendientes' and name='${fila.path_privado}'`)).toBe("0")
    expect(sql(`select operaciones::text||':'||operaciones_reales::text from public.reservas_moderacion where solicitud='${fila.id}'`)).toBe("2:2")
    expect(fila.operaciones).toBe(2)
    expect(await moderarYGuardarImagenReporte(servicio, entrada)).toMatchObject({ publicada: true })
    expect(moderarImagen).toHaveBeenCalledTimes(1)
    expect(sql(`select count(*) from public.reservas_moderacion where solicitud='${fila.id}'`)).toBe("1")
    expect(sql(`select count(*) from public.fotos_reporte where reporte_id=${reporteId}`)).toBe("1")
    // Respeta el throttle global real; no modifica presupuestos ni reservas ajenas.
    await new Promise((resolver) => setTimeout(resolver, 1100))
    moderarImagen.mockResolvedValue({ decision: "REVIEW", motivos: ["arma_contextual"], operaciones: 2, proveedor: "simulado" })
    expect(await moderarYGuardarImagenReporte(servicio, { ...entrada, image: await imagen("blue") })).toMatchObject({ estado: "REVIEW", publicada: false })
    expect(moderarImagen).toHaveBeenCalledTimes(2)
    expect(sql(`select count(*) from public.reservas_moderacion r join public.moderacion_imagenes m on m.id=r.solicitud where m.reporte_id=${reporteId} and r.operaciones=2 and r.operaciones_reales=2 and r.registrado_at is not null`)).toBe("2")
    expect(sql(`select count(*) from public.fotos_reporte where reporte_id=${reporteId}`)).toBe("1")
    expect(sql(`select count(*) from storage.objects where bucket_id='reportes-pendientes' and name like '${propietario}/%'`)).toBe("1")
    expect(sql(`select count(*) from storage.objects o join public.moderacion_imagenes m on o.name like m.id::text||'/%' where o.bucket_id='reportes' and m.reporte_id=${reporteId} and m.decision='REVIEW'`)).toBe("0")
  } finally {
    if (reporteId !== undefined) {
      const { data: filas, error } = await servicio.from("moderacion_imagenes").select("id,path_privado,token").eq("reporte_id", reporteId)
      expect(error === null).toBe(true)
      for (const fila of filas ?? []) {
        const privado = await servicio.storage.from("reportes-pendientes").remove([fila.path_privado])
        expect(privado.error === null).toBe(true)
        if (fila.token) {
          const publico = await servicio.storage.from("reportes").remove([`${fila.id}/${fila.token}`, `${fila.id}/${fila.token}-miniatura`])
          expect(publico.error === null).toBe(true)
        }
        expect(sql(`select count(*) from storage.objects where (bucket_id='reportes-pendientes' and name='${fila.path_privado}') or (bucket_id='reportes' and name like '${fila.id}/%')`)).toBe("0")
      }
      sql(`delete from public.reservas_moderacion where solicitud in(select id from public.moderacion_imagenes where reporte_id=${reporteId}); delete from public.fotos_reporte where reporte_id=${reporteId}; delete from public.moderacion_imagenes where reporte_id=${reporteId}; delete from public.reportes where id=${reporteId} and usuario_id='${propietario}'`)
    }
    if (usuarioCreado) {
      await sesion.auth.signOut()
      const borrado = await servicio.auth.admin.deleteUser(propietario)
      expect(borrado.error === null).toBe(true)
      expect(sql(`select count(*) from auth.users where id='${propietario}'`)).toBe("0")
    }
  }
}, 25000)
