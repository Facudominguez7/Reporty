/** Verifica moderación únicamente contra el stack sintético aislado autorizado. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const trabajo = '.moderacion-pruebas-local'
const baseDatos = 'postgresql://postgres:postgres@127.0.0.1:55322/postgres'
const api = 'http://127.0.0.1:55321'
if (process.argv.includes('--help')) {
  console.log('Uso: node scripts/moderacion/verificar-rls.mjs\nRequiere stack sintético ReportyModeracionPruebas en .moderacion-pruebas-local, puertos 55321/55322, migraciones y catálogos aplicados. No inicia, resetea ni siembra datos. No lee .env. Limpia únicamente sus fixtures.')
  process.exit(0)
}
assert.deepEqual(process.argv.slice(2), [], 'No se aceptan destinos alternativos')
const configuracion = readFileSync(`${trabajo}/supabase/config.toml`, 'utf8')
assert.match(configuracion, /^project_id\s*=\s*"ReportyModeracionPruebas"\s*$/m)
assert.match(configuracion, /^port\s*=\s*55321\s*$/m)
assert.match(configuracion, /^port\s*=\s*55322\s*$/m)
/** Captura claves efímeras sin permitir que un error del CLI las vuelque a consola. */
function obtenerEstadoLocal() {
  try {
    return JSON.parse(execFileSync('npx', ['--no-install', 'supabase', 'status', '--workdir', trabajo, '--output', 'json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000,
    }))
  } catch {
    throw new Error('No se pudo capturar el estado del stack sintético')
  }
}
const estado = obtenerEstadoLocal()
assert.equal(estado.API_URL, api, 'API no aislada')
assert.equal(estado.DB_URL, baseDatos, 'Base no aislada')
assert.equal(new URL(api).hostname, '127.0.0.1')
assert.equal(new URL(baseDatos).port, '55322')
assert.ok(estado.JWT_SECRET && estado.SERVICE_ROLE_KEY && estado.ANON_KEY, 'Faltan claves locales')

/** Ejecuta SQL local con errores acotados, sin imprimir claves ni consultas sensibles. */
function sql(consulta) {
  try {
    return execFileSync('psql', [baseDatos, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', consulta], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000,
    }).trim()
  } catch {
    throw new Error('Falló SQL en el stack sintético; no se imprimen parámetros')
  }
}

/** Firma identidades exclusivamente con el secreto generado del stack local. */
function firmar(id, invitado = false) {
  const cabecera = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const cuerpo = Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', aud: 'authenticated',
    iss: `${api}/auth/v1`, exp: Math.floor(Date.now() / 1000) + 600, is_anonymous: invitado,
  })).toString('base64url')
  const firma = createHmac('sha256', estado.JWT_SECRET).update(`${cabecera}.${cuerpo}`).digest('base64url')
  return `${cabecera}.${cuerpo}.${firma}`
}

/** Envía una solicitud al único origen loopback permitido con timeout y sin redirecciones. */
async function solicitar(ruta, token = estado.SERVICE_ROLE_KEY, metodo = 'GET', cuerpo, tipo = 'application/json') {
  const destino = new URL(ruta, api)
  assert.equal(destino.origin, api)
  return fetch(destino, { method: metodo, redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { apikey: estado.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': tipo },
    body: cuerpo === undefined ? undefined : tipo === 'application/json' ? JSON.stringify(cuerpo) : cuerpo,
  })
}

/** Ejecuta RPC de servicio y exige éxito HTTP sin volcar respuestas sensibles. */
async function rpc(nombre, parametros, token = estado.SERVICE_ROLE_KEY) {
  const respuesta = await solicitar(`/rest/v1/rpc/${nombre}`, token, 'POST', parametros)
  assert.ok(respuesta.ok, `RPC ${nombre}: HTTP ${respuesta.status}`)
  return respuesta.json()
}

/** Sube bytes reales y exige éxito; no registra credenciales. */
async function subir(bucket, ruta, token) {
  const respuesta = await solicitar(`/storage/v1/object/${bucket}/${ruta}`, token, 'POST', imagen, 'image/png')
  assert.ok(respuesta.ok, `Carga permitida: HTTP ${respuesta.status}`)
}

const sufijo = randomUUID().replaceAll('-', '')
const propietario = randomUUID()
const administrador = randomUUID()
const segundoAdministrador = randomUUID()
const invitado = randomUUID()
const cola = randomUUID()
const reserva = randomUUID()
const ajeno = `prueba-moderacion-${sufijo}`
const politica = `prueba_moderacion_${sufijo}`
const privada = `${propietario}/${cola}`
const publica = `prueba-${sufijo}`
const imagen = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1kAAAAASUVORK5CYII=', 'base64')
const normal = firmar(propietario)
const admin = firmar(administrador)
const guest = firmar(invitado, true)
let reporte
let bucketCreado = false
const objetos = []

try {
  assert.equal(sql('select count(*) from public.reservas_moderacion'), '0', 'La base debe ser sintética sin reservas previas')
  sql(`insert into auth.users(id,email,is_anonymous) values
    ('${propietario}','${sufijo}-normal@ejemplo.invalid',false),
    ('${administrador}','${sufijo}-admin@ejemplo.invalid',false),
    ('${segundoAdministrador}','${sufijo}-admin-dos@ejemplo.invalid',false),
    ('${invitado}',null,true);
    update public.profiles set rol_id=1 where id in ('${administrador}','${segundoAdministrador}');
    create policy ${politica} on storage.objects for all to anon,authenticated using(true) with check(true);`)
  reporte = sql(`insert into public.reportes(usuario_id,titulo,lat,lon,estado_id)
    values('${propietario}','Prueba HTTP ${sufijo}',0,0,null) returning id`)
  assert.match(reporte, /^\d+$/)
  sql(`insert into public.moderacion_imagenes(id,reporte_id,propietario_id,hash_sha256,path_privado)
    values('${cola}',${reporte},'${propietario}','${'a'.repeat(64)}','${privada}')`)

  const creacion = await solicitar('/storage/v1/bucket', undefined, 'POST', { id: ajeno, name: ajeno, public: true })
  assert.ok(creacion.ok, `Crear bucket sintético: HTTP ${creacion.status}`)
  bucketCreado = true
  await subir('reportes-pendientes', privada, estado.SERVICE_ROLE_KEY)
  objetos.push(['reportes-pendientes', privada])
  const descargaServicio = await solicitar(`/storage/v1/object/authenticated/reportes-pendientes/${privada}`)
  assert.ok(descargaServicio.ok)
  assert.deepEqual(Buffer.from(await descargaServicio.arrayBuffer()), imagen)
  await subir('reportes', publica, estado.SERVICE_ROLE_KEY)
  objetos.push(['reportes', publica])
  sql(`insert into public.fotos_reporte(reporte_id,url)
    values(${reporte},'${api}/storage/v1/object/public/reportes/${publica}')`)
  const fotosIniciales = sql(`select count(*) from public.fotos_reporte where reporte_id=${reporte}`)
  const cuotasIniciales = sql('select count(*) from public.reservas_moderacion')
  const objetosIniciales = sql(`select count(*) from storage.objects where bucket_id in ('reportes','reportes-pendientes')`)

  for (const [nombre, token] of [['anon', estado.ANON_KEY], ['normal', normal], ['invitado', guest], ['admin', admin]]) {
    for (const modalidad of ['public', 'authenticated']) {
      const respuesta = await solicitar(`/storage/v1/object/${modalidad}/reportes-pendientes/${privada}`, token)
      assert.ok(!respuesta.ok, `${nombre}: evidencia privada descargable mediante ${modalidad}`)
    }
    const lecturaCola = await solicitar(`/rest/v1/moderacion_imagenes?id=eq.${cola}`, token)
    assert.ok(!lecturaCola.ok, `${nombre}: acceso directo a cola`)
    const aprobacion = await solicitar('/rest/v1/rpc/decidir_imagen_moderacion', token, 'POST', {
      p_id: cola, p_token: null, p_decision: 'APPROVED', p_motivos: [], p_administrador: administrador,
    })
    assert.ok(!aprobacion.ok, `${nombre}: RPC privilegiada accesible`)
    const cuota = await solicitar('/rest/v1/rpc/reservar_operaciones_moderacion', token, 'POST', { p_solicitud: reserva })
    assert.ok(!cuota.ok, `${nombre}: reserva privilegiada accesible`)
    if (nombre !== 'admin') {
      for (const bucket of ['reportes', 'reportes-pendientes']) {
        const carga = await solicitar(`/storage/v1/object/${bucket}/denegada-${sufijo}-${nombre}`, token, 'POST', imagen, 'image/png')
        assert.ok(!carga.ok, `${nombre}: bypass de Storage`)
      }
      const sustitucion = await solicitar(`/storage/v1/object/reportes/${publica}`, token, 'PUT', imagen, 'image/png')
      assert.ok(!sustitucion.ok, `${nombre}: reemplazo público directo permitido`)
      const metadatos = await solicitar('/rest/v1/fotos_reporte', token, 'POST', { reporte_id: Number(reporte), url: 'https://ejemplo.invalid/bypass' })
      assert.ok(!metadatos.ok, `${nombre}: bypass de metadatos`)
      const actualizacion = await solicitar(`/rest/v1/fotos_reporte?reporte_id=eq.${reporte}`, token, 'PATCH', { url: 'https://ejemplo.invalid/bypass' })
      assert.ok(!actualizacion.ok, `${nombre}: UPDATE directo de metadatos permitido`)
    }
    const fotos = await solicitar(`/rest/v1/fotos_reporte?reporte_id=eq.${reporte}&select=url,bucket,path`, token)
    assert.ok(fotos.ok)
    const filas = await fotos.json()
    assert.equal(filas.length, 1, `${nombre}: foto pendiente filtrada o legacy oculta`)
    assert.equal(filas[0].bucket, null)
    assert.ok(!JSON.stringify(filas).includes(privada))
  }
  assert.equal(sql(`select count(*) from public.fotos_reporte where reporte_id=${reporte}`), fotosIniciales)
  assert.equal(sql('select count(*) from public.reservas_moderacion'), cuotasIniciales)
  assert.equal(sql(`select count(*) from storage.objects where bucket_id in ('reportes','reportes-pendientes')`), objetosIniciales)
  assert.equal(sql(`select decision from public.moderacion_imagenes where id='${cola}'`), 'REVIEW')

  const legacy = await solicitar(`/storage/v1/object/public/reportes/${publica}`, estado.ANON_KEY)
  assert.ok(legacy.ok, 'URL legacy pública rota')
  assert.deepEqual(Buffer.from(await legacy.arrayBuffer()), imagen)
  // La misma política permisiva permite el bucket ajeno, pero no los protegidos.
  await subir(ajeno, publica, normal)
  objetos.push([ajeno, publica])
  const lecturaAjena = await solicitar(`/storage/v1/object/public/${ajeno}/${publica}`, estado.ANON_KEY)
  assert.ok(lecturaAjena.ok)
  assert.deepEqual(Buffer.from(await lecturaAjena.arrayBuffer()), imagen)

  const denegacion = await solicitar('/rest/v1/rpc/decidir_imagen_moderacion', undefined, 'POST', {
    p_id: cola, p_token: null, p_decision: 'APPROVED', p_motivos: [], p_administrador: propietario,
  })
  assert.ok(!denegacion.ok, 'Servicio aceptó administrador no autorizado')
  assert.equal(sql(`select decision from public.moderacion_imagenes where id='${cola}'`), 'REVIEW')
  const decisiones = await Promise.all(['APPROVED', 'REJECTED'].map((decision, indice) => rpc('decidir_imagen_moderacion', {
    p_id: cola, p_token: null, p_decision: decision, p_motivos: ['prueba concurrente'],
    p_administrador: indice === 0 ? administrador : segundoAdministrador,
  })))
  assert.equal(decisiones.filter(Boolean).length, 1, 'Dos decisiones concurrentes ganaron')
  assert.equal(sql(`select decision from public.moderacion_imagenes where id='${cola}'`), decisiones[0] ? 'APPROVED' : 'REJECTED')
  assert.equal(sql(`select administrador_id from public.moderacion_imagenes where id='${cola}'`),
    decisiones[0] ? administrador : segundoAdministrador)
  assert.equal(sql(`select revisado_at is not null from public.moderacion_imagenes where id='${cola}'`), 't')
  const reservas = await Promise.all([1, 2].map(() => rpc('reservar_operaciones_moderacion', { p_solicitud: reserva, p_operaciones: 2 })))
  assert.equal(reservas.filter(Boolean).length, 1, 'Reserva concurrente duplicada')
  assert.equal(sql(`select count(*) from public.reservas_moderacion where solicitud='${reserva}'`), '1')
  assert.equal(sql(`select operaciones from public.reservas_moderacion where solicitud='${reserva}'`), '2')
  console.log('OK: aislamiento HTTP con bytes reales, permisos, legacy, bucket ajeno, carreras administrativas y reserva única.')
} finally {
  let limpiezaFallida = false
  for (const [bucket, ruta] of objetos.reverse()) {
    try {
      const respuesta = await solicitar(`/storage/v1/object/${bucket}`, undefined, 'DELETE', { prefixes: [ruta] })
      if (!respuesta.ok) limpiezaFallida = true
    } catch { limpiezaFallida = true }
  }
  if (bucketCreado) {
    try {
      const respuesta = await solicitar(`/storage/v1/bucket/${ajeno}`, undefined, 'DELETE')
      if (!respuesta.ok) limpiezaFallida = true
    } catch { limpiezaFallida = true }
  }
  sql(`drop policy if exists ${politica} on storage.objects;
    delete from public.moderacion_imagenes where id='${cola}';
    delete from public.fotos_reporte where reporte_id in
      (select id from public.reportes where titulo='Prueba HTTP ${sufijo}');
    delete from public.reportes where titulo='Prueba HTTP ${sufijo}';
    delete from public.reservas_moderacion where solicitud='${reserva}';
    delete from auth.users where id in ('${propietario}','${administrador}','${segundoAdministrador}','${invitado}');`)
  assert.equal(sql(`select count(*) from storage.objects where name in
    ('${privada}','${publica}')`), '0', 'Quedaron objetos de prueba')
  assert.equal(sql(`select count(*) from public.reservas_moderacion where solicitud='${reserva}'`), '0')
  assert.equal(sql(`select count(*) from auth.users where id in ('${propietario}','${administrador}','${segundoAdministrador}','${invitado}')`), '0')
  assert.ok(!limpiezaFallida, 'Falló limpieza Storage de fixtures sintéticas')
}
