import type { Locator } from "@playwright/test"

import { expect, test } from "./fixtures"
import { signIn } from "./support/auth"

/** Obtiene la posición mundial del marcador a partir de los mosaicos visibles de Leaflet. */
async function posicionDelMarcador(mapa: Locator) {
  return mapa.evaluate((elemento) => {
    const marcador = elemento.querySelector<HTMLElement>(".leaflet-marker-icon")
    const mosaico = elemento.querySelector<HTMLImageElement>(".leaflet-tile")
    if (!marcador || !mosaico) throw new Error("Falta el marcador o un mosaico del mapa")
    const coordenadas = new URL(mosaico.src).pathname.match(/\/(\d+)\/(\d+)\/(\d+)\.png$/)
    if (!coordenadas) throw new Error("No se encontraron las coordenadas del mosaico")
    const punto = marcador.getBoundingClientRect()
    const origen = mosaico.getBoundingClientRect()
    return {
      zoom: Number(coordenadas[1]),
      x: Number(coordenadas[2]) * 256 + punto.left + 12 - origen.left,
      y: Number(coordenadas[3]) * 256 + punto.top + 41 - origen.top,
    }
  })
}

/** Comprueba que el marcador visible corresponda a las coordenadas mostradas en el formulario. */
async function comprobarPosicion(mapa: Locator, latitud: number, longitud: number) {
  await expect.poll(async () => {
    const punto = await posicionDelMarcador(mapa)
    const escala = 256 * 2 ** punto.zoom
    const seno = Math.sin(latitud * Math.PI / 180)
    const x = (longitud + 180) / 360 * escala
    const y = (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)) * escala
    return Math.hypot(punto.x - x, punto.y - y)
  }).toBeLessThan(3)
}

/** Lee las coordenadas que el formulario muestra al usuario. */
async function coordenadasDelFormulario(ubicacion: Locator) {
  const texto = await ubicacion.innerText()
  const valores = texto.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
  if (!valores) throw new Error(`No se encontraron coordenadas en: ${texto}`)
  return { latitud: Number(valores[1]), longitud: Number(valores[2]) }
}

test("seleccionar otra ubicación actualiza el marcador y las coordenadas del formulario", async ({ page, testData }) => {
  const usuario = await testData.createUser()
  await signIn(page, usuario)
  await page.goto("/reportes/nuevo")

  const mapa = page.locator(".leaflet-container")
  await expect(mapa).toBeVisible()
  await expect(mapa.locator(".leaflet-marker-icon")).toHaveCount(0)
  await mapa.click()
  const ubicacion = page.getByText(/Ubicación seleccionada:/)
  await expect(ubicacion).toBeVisible()
  await expect(mapa.locator(".leaflet-marker-icon")).toHaveCount(1)
  const primeraUbicacion = await ubicacion.textContent()
  const primera = await coordenadasDelFormulario(ubicacion)
  await comprobarPosicion(mapa, primera.latitud, primera.longitud)
  const primeraPosicion = await posicionDelMarcador(mapa)

  const dimensiones = await mapa.boundingBox()
  if (!dimensiones) throw new Error("El mapa no está visible")
  await mapa.click({ position: { x: dimensiones.width / 2 + 30, y: dimensiones.height / 2 } })
  await expect(ubicacion).not.toHaveText(primeraUbicacion!)
  await expect(mapa.locator(".leaflet-marker-icon")).toHaveCount(1)
  const segunda = await coordenadasDelFormulario(ubicacion)
  await comprobarPosicion(mapa, segunda.latitud, segunda.longitud)
  const segundaPosicion = await posicionDelMarcador(mapa)
  expect(Math.hypot(segundaPosicion.x - primeraPosicion.x, segundaPosicion.y - primeraPosicion.y)).toBeGreaterThan(10)
})

test("la geolocalización centra el marcador y rechaza ubicaciones fuera de cobertura", async ({ page, context, testData }) => {
  const usuario = await testData.createUser()
  await signIn(page, usuario)
  await context.grantPermissions(["geolocation"])
  await context.setGeolocation({ latitude: -27.3676, longitude: -55.8961 })
  await page.goto("/reportes/nuevo")

  const mapa = page.locator(".leaflet-container")
  const marcador = mapa.locator(".leaflet-marker-icon")
  const ubicacion = page.getByText(/Ubicación seleccionada:/)
  await mapa.click()
  const anterior = await ubicacion.textContent()
  await page.getByRole("button", { name: "Usar mi ubicación" }).click()
  await expect(ubicacion).toHaveText("Ubicación seleccionada: -27.36760, -55.89610")
  expect(await ubicacion.textContent()).not.toBe(anterior)
  await expect(marcador).toHaveCount(1)
  await comprobarPosicion(mapa, -27.3676, -55.8961)
  await expect.poll(async () => {
    const limitesMapa = await mapa.boundingBox()
    const limitesMarcador = await marcador.boundingBox()
    if (!limitesMapa || !limitesMarcador) return Infinity
    return Math.hypot(
      limitesMarcador.x + 12 - (limitesMapa.x + limitesMapa.width / 2),
      limitesMarcador.y + 41 - (limitesMapa.y + limitesMapa.height / 2),
    )
  }).toBeLessThan(3)
  const posicionAceptada = await posicionDelMarcador(mapa)
  expect(posicionAceptada.zoom).toBe(13)

  await context.setGeolocation({ latitude: -26, longitude: -54 })
  await page.getByRole("button", { name: "Usar mi ubicación" }).click()
  await expect(page.getByText("Tu ubicación está fuera del área de cobertura")).toBeVisible()
  await expect(ubicacion).toHaveText("Ubicación seleccionada: -27.36760, -55.89610")
  await comprobarPosicion(mapa, -27.3676, -55.8961)
  const posicionRechazada = await posicionDelMarcador(mapa)
  expect(Math.hypot(posicionRechazada.x - posicionAceptada.x, posicionRechazada.y - posicionAceptada.y)).toBeLessThan(1)
})
