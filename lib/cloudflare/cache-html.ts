/**
 * Cabecera de caché del HTML que sale del Worker.
 *
 * Next pone `s-maxage=31536000` (un año) en las páginas estáticas y `stale-while-revalidate` de
 * 30 días en las ISR, y pisa lo que se configure en `next.config`. Eso le permite a cualquier caché
 * compartida (un proxy, un CDN) guardar el HTML viejo, que apunta a chunks que después de un
 * deploy ya no existen. Las páginas siguen saliendo rápido igual: OpenNext las sirve desde su
 * caché en R2, que no depende de esta cabecera.
 */

/** Cualquiera puede guardar el HTML, pero tiene que revalidarlo antes de usarlo. */
export const CACHE_HTML = "public, max-age=0, must-revalidate"

/**
 * Reemplaza la cabecera de caché de una respuesta HTML que habilita cachés compartidas
 * (`s-maxage`). Las páginas dinámicas, que ya son privadas, y lo que no es HTML (chunks, RSC,
 * imágenes) salen sin cambios.
 *
 * @param respuesta - Respuesta que armó OpenNext.
 * @returns La misma respuesta, o una copia con `Cache-Control: CACHE_HTML`.
 */
export function sinCacheCompartidaDeHtml(respuesta: Response): Response {
  const tipo = respuesta.headers.get("content-type") ?? ""
  const cache = respuesta.headers.get("cache-control") ?? ""
  if (!tipo.startsWith("text/html") || !/s-maxage/i.test(cache)) return respuesta

  const cabeceras = new Headers(respuesta.headers)
  cabeceras.set("cache-control", CACHE_HTML)
  return new Response(respuesta.body, { status: respuesta.status, statusText: respuesta.statusText, headers: cabeceras })
}
