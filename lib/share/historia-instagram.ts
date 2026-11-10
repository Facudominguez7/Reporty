/**
 * Imagen vertical (1080×1920) para compartir un reporte en historias de Instagram.
 *
 * Se dibuja en el navegador con un canvas: no usa CPU del Worker ni servicios pagos.
 * Instagram no permite que una web publique la historia ni adjunte el link, así que
 * se comparte la imagen con el menú del sistema y el link se copia al portapapeles
 * para pegarlo en el sticker «Enlace». Sin soporte para compartir archivos, la
 * imagen se descarga.
 *
 * Las zonas de arriba y abajo (~220 px) las tapa la interfaz de Instagram: el
 * contenido importante queda entre ellas.
 */

export const ANCHO_HISTORIA = 1080
export const ALTO_HISTORIA = 1920

/** Colores del tema (app/globals.css) convertidos de oklch a hex para el canvas. */
const COLORES = {
  fondo: "#EEECEC",
  tarjeta: "#FFFFFF",
  texto: "#15140F",
  secundario: "#5C5A55",
  primario: "#278C5A",
  peligro: "#CC3D3D",
  media: "#EF852E",
  info: "#297CAE",
  advertencia: "#CA9D33",
  categoria: "#5E5A9A",
  neutro: "#77756F",
}

/**
 * Tono de una prioridad; el mismo criterio que `tonoPrioridad` de los chips.
 *
 * @param prioridad - «Alta», «Media» o «Baja».
 */
export function tonoHexPrioridad(prioridad: string): string {
  if (prioridad === "Alta") return COLORES.peligro
  if (prioridad === "Media") return COLORES.media
  if (prioridad === "Baja") return COLORES.info
  return COLORES.neutro
}

/**
 * Tono de un estado; el mismo criterio que `tonoEstado` de los chips.
 *
 * @param estado - «Pendiente», «Reparado» o «Rechazado».
 */
export function tonoHexEstado(estado: string): string {
  if (estado === "Reparado") return COLORES.primario
  if (estado === "Pendiente") return COLORES.advertencia
  if (estado === "Rechazado") return COLORES.peligro
  return COLORES.neutro
}

/**
 * Recorte de la foto para llenar la caja sin deformarla (como `object-fit: cover`).
 *
 * @returns Rectángulo de la foto original a dibujar (`sx`, `sy`, `sw`, `sh`).
 */
export function encuadrarFoto(anchoFoto: number, altoFoto: number, anchoCaja: number, altoCaja: number) {
  const escala = Math.max(anchoCaja / anchoFoto, altoCaja / altoFoto)
  const sw = anchoCaja / escala
  const sh = altoCaja / escala
  return { sx: (anchoFoto - sw) / 2, sy: (altoFoto - sh) / 2, sw, sh }
}

/** Recorta un texto hasta que entre en el ancho, terminándolo con «…». */
function recortarConPuntos(texto: string, medir: (texto: string) => number, anchoMax: number): string {
  let recorte = texto.trimEnd()
  while (recorte.length > 0 && medir(`${recorte}…`) > anchoMax) recorte = recorte.slice(0, -1).trimEnd()
  return `${recorte}…`
}

/**
 * Parte un texto en líneas que entran en el ancho, cortando por palabras.
 *
 * @param medir - Mide el ancho de un texto (en el canvas, `ctx.measureText`).
 * @param maxLineas - Si el texto no entra, la última línea termina con «…».
 */
export function partirEnLineas(
  texto: string,
  medir: (texto: string) => number,
  anchoMax: number,
  maxLineas: number,
): string[] {
  const lineas: string[] = []
  let actual = ""

  for (const palabra of texto.trim().split(/\s+/)) {
    const candidata = actual ? `${actual} ${palabra}` : palabra
    if (medir(candidata) <= anchoMax) {
      actual = candidata
      continue
    }
    if (actual) lineas.push(actual)
    actual = palabra
    if (lineas.length === maxLineas) break
  }
  if (lineas.length < maxLineas && actual) lineas.push(actual)

  const sobra = lineas.length > maxLineas || lineas.join(" ").length < texto.trim().replace(/\s+/g, " ").length
  const visibles = lineas.slice(0, maxLineas)
  const ultima = visibles.length - 1
  if (sobra || medir(visibles[ultima] ?? "") > anchoMax) {
    visibles[ultima] = recortarConPuntos(visibles[ultima] ?? "", medir, anchoMax)
  }
  return visibles
}

/** Lo que muestra la historia. */
export type DatosHistoria = {
  titulo: string
  prioridad: string
  estado: string
  categoria: string
  direccion: string | null
  fotoUrl: string | null
  /** Link al reporte, se muestra sin «https://». */
  url: string
}

/** Carga una imagen con CORS para poder exportar el canvas después. */
function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image()
    imagen.crossOrigin = "anonymous"
    imagen.onload = () => resolver(imagen)
    imagen.onerror = () => rechazar(new Error(`No se pudo cargar ${src}`))
    imagen.src = src
  })
}

/** Rectángulo con esquinas redondeadas (camino, sin pintar). */
function rectanguloRedondeado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Chip con fondo tintado y texto en su tono, como `ChipReporte`. Devuelve su ancho. */
function dibujarChip(ctx: CanvasRenderingContext2D, x: number, y: number, texto: string, tono: string, fuente: string) {
  ctx.font = `600 34px ${fuente}`
  const ancho = ctx.measureText(texto).width + 56
  rectanguloRedondeado(ctx, x, y, ancho, 64, 32)
  ctx.fillStyle = `${tono}29`
  ctx.fill()
  ctx.fillStyle = tono
  ctx.textBaseline = "middle"
  ctx.fillText(texto, x + 28, y + 33)
  return ancho
}

/** Pin de ubicación simple, para no depender de emojis. */
function dibujarPin(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, 13, Math.PI, 0)
  ctx.lineTo(x, y + 26)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = COLORES.tarjeta
  ctx.beginPath()
  ctx.arc(x, y, 5, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Dibuja la historia completa en un canvas de 1080×1920.
 *
 * @param fuente - Familia tipográfica de la app (la toma de `document.body`).
 */
export async function generarImagenHistoria(datos: DatosHistoria, fuente: string, logoUrl = "/logos/logoSinBg.png"): Promise<Blob> {
  const canvas = document.createElement("canvas")
  canvas.width = ANCHO_HISTORIA
  canvas.height = ALTO_HISTORIA
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("El navegador no permite dibujar la imagen.")

  await document.fonts?.ready
  const [logo, foto] = await Promise.all([
    cargarImagen(logoUrl).catch(() => null),
    datos.fotoUrl ? cargarImagen(datos.fotoUrl).catch(() => null) : Promise.resolve(null),
  ])

  ctx.fillStyle = COLORES.fondo
  ctx.fillRect(0, 0, ANCHO_HISTORIA, ALTO_HISTORIA)

  // Tarjeta blanca, dentro de la zona que Instagram no tapa.
  const margen = 64
  const tarjeta = { x: margen, y: 230, w: ANCHO_HISTORIA - margen * 2, h: 1460 }
  ctx.save()
  ctx.shadowColor = "rgba(21, 20, 15, 0.12)"
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 12
  rectanguloRedondeado(ctx, tarjeta.x, tarjeta.y, tarjeta.w, tarjeta.h, 48)
  ctx.fillStyle = COLORES.tarjeta
  ctx.fill()
  ctx.restore()

  const interior = { x: tarjeta.x + 48, w: tarjeta.w - 96 }
  let y = tarjeta.y + 44

  if (logo) {
    const altoLogo = 84
    const anchoLogo = (logo.width / logo.height) * altoLogo
    ctx.drawImage(logo, (ANCHO_HISTORIA - anchoLogo) / 2, y, anchoLogo, altoLogo)
  }
  y += 84 + 40

  // Foto del reporte (o un bloque del color primario si no tiene).
  const altoFoto = 700
  ctx.save()
  rectanguloRedondeado(ctx, interior.x, y, interior.w, altoFoto, 32)
  ctx.clip()
  if (foto) {
    const { sx, sy, sw, sh } = encuadrarFoto(foto.width, foto.height, interior.w, altoFoto)
    ctx.drawImage(foto, sx, sy, sw, sh, interior.x, y, interior.w, altoFoto)
  } else {
    ctx.fillStyle = `${COLORES.primario}26`
    ctx.fillRect(interior.x, y, interior.w, altoFoto)
  }
  ctx.restore()
  y += altoFoto + 40

  let x = interior.x
  x += dibujarChip(ctx, x, y, datos.prioridad, tonoHexPrioridad(datos.prioridad), fuente) + 16
  x += dibujarChip(ctx, x, y, datos.estado, tonoHexEstado(datos.estado), fuente) + 16
  ctx.font = `600 34px ${fuente}`
  if (x + ctx.measureText(datos.categoria).width + 56 <= interior.x + interior.w) {
    dibujarChip(ctx, x, y, datos.categoria, COLORES.categoria, fuente)
  }
  y += 64 + 36

  ctx.fillStyle = COLORES.texto
  ctx.textBaseline = "top"
  ctx.font = `700 64px ${fuente}`
  for (const linea of partirEnLineas(datos.titulo, (t) => ctx.measureText(t).width, interior.w, 2)) {
    ctx.fillText(linea, interior.x, y)
    y += 76
  }
  y += 12

  if (datos.direccion) {
    dibujarPin(ctx, interior.x + 14, y + 18, COLORES.primario)
    ctx.fillStyle = COLORES.secundario
    ctx.font = `500 38px ${fuente}`
    const [direccion] = partirEnLineas(datos.direccion, (t) => ctx.measureText(t).width, interior.w - 48, 1)
    ctx.fillText(direccion, interior.x + 48, y)
  }

  // Llamado a la acción al pie de la tarjeta.
  const pie = { y: tarjeta.y + tarjeta.h - 48 - 170, h: 170 }
  rectanguloRedondeado(ctx, interior.x, pie.y, interior.w, pie.h, 32)
  ctx.fillStyle = COLORES.primario
  ctx.fill()
  ctx.fillStyle = COLORES.tarjeta
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `500 36px ${fuente}`
  ctx.fillText("Mirá el reporte y sumá tu aporte en", ANCHO_HISTORIA / 2, pie.y + 56)
  ctx.font = `700 44px ${fuente}`
  const enlace = datos.url.replace(/^https?:\/\//, "")
  ctx.fillText(partirEnLineas(enlace, (t) => ctx.measureText(t).width, interior.w - 48, 1)[0], ANCHO_HISTORIA / 2, pie.y + 114)
  ctx.textAlign = "start"

  return new Promise((resolver, rechazar) =>
    canvas.toBlob((blob) => (blob ? resolver(blob) : rechazar(new Error("No se pudo exportar la imagen."))), "image/png"),
  )
}

/** Partes de `navigator` que usa compartir la historia (inyectables en pruebas). */
export type NavegadorHistoria = {
  share?: (datos: { files: File[] }) => Promise<void>
  canShare?: (datos: { files: File[] }) => boolean
  clipboard?: { writeText: (texto: string) => Promise<void> }
}

export type ResultadoHistoria = "compartida" | "cancelada" | "descargada"

/**
 * Comparte la imagen con el menú del sistema (Instagram → Historia) o la descarga.
 * Siempre intenta copiar el link para pegarlo en el sticker «Enlace».
 *
 * @param descargar - Guarda el archivo cuando no se puede compartir.
 */
export async function compartirHistoria(
  archivo: File,
  url: string,
  nav: NavegadorHistoria,
  descargar: (archivo: File) => void,
): Promise<ResultadoHistoria> {
  // Sin `await`: Safari sólo acepta `share` pegado al toque, así que nada lo demora.
  void nav.clipboard?.writeText(url).catch(() => undefined)

  if (nav.share && nav.canShare?.({ files: [archivo] })) {
    try {
      await nav.share({ files: [archivo] })
      return "compartida"
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelada"
    }
  }

  descargar(archivo)
  return "descargada"
}

/** Descarga un archivo en el navegador con un enlace temporal. */
export function descargarArchivo(archivo: File) {
  const enlace = document.createElement("a")
  enlace.href = URL.createObjectURL(archivo)
  enlace.download = archivo.name
  enlace.click()
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000)
}
