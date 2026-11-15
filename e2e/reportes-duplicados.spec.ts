import { homedir } from "node:os"
import { join } from "node:path"

import type { Page } from "@playwright/test"

import { expect, test } from "./fixtures"
import { signIn } from "./support/auth"
import { adminClient, type TestData, type TestUser } from "./support/test-data"

/** Pausa entre interacciones para que el video se pueda seguir (3 segundos, pedido explícito). */
const PAUSA_MS = 3_000

/** Carpeta donde quedan los videos de cada escenario. */
const CARPETA_VIDEOS = join(homedir(), "Documentos", "pruebas-playwright")

test.use({ viewport: { width: 390, height: 844 }, video: { mode: "on", size: { width: 390, height: 844 } } })

/**
 * Espera entre una interacción y la siguiente.
 *
 * @param page - Página del escenario.
 */
async function pausa(page: Page) {
  await page.waitForTimeout(PAUSA_MS)
}

/**
 * Foto liviana dibujada en el navegador, así no vive ningún binario en el repositorio.
 *
 * @param page - Página donde se dibuja.
 */
async function foto(page: Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 800
    canvas.height = 600
    const context = canvas.getContext("2d")!
    const gradiente = context.createLinearGradient(0, 0, 800, 600)
    gradiente.addColorStop(0, "#1f2933")
    gradiente.addColorStop(1, "#52606d")
    context.fillStyle = gradiente
    context.fillRect(0, 0, 800, 600)
    return canvas.toDataURL("image/jpeg", 0.9).split(",")[1]
  })
  return { name: "poste.jpg", mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") }
}

/** Categoría «Alumbrado», o la primera que no sea «Otros», para que el título se arme solo. */
async function categoriaDePrueba() {
  const { data, error } = await adminClient().from("categorias").select("id, nombre").order("id")
  if (error) throw error
  const categoria = data.find(({ nombre }) => nombre === "Alumbrado") ?? data.find(({ nombre }) => nombre !== "Otros")
  if (!categoria) throw new Error("No hay categorías en la base local")
  return categoria as { id: number; nombre: string }
}

/**
 * Completa descripción, prioridad y ubicación (sin categoría todavía) y devuelve el punto elegido.
 *
 * @param page - Página del formulario.
 */
async function completarSinCategoria(page: Page) {
  await page.getByLabel("Descripción Detallada *").fill("La luminaria de la esquina no enciende hace semanas.")
  await pausa(page)
  await page.getByRole("group", { name: "Prioridad *" }).getByRole("button", { name: "Media" }).click()
  await pausa(page)
  await page.locator(".leaflet-container").click()
  const texto = await page.getByText(/Ubicación seleccionada:/).textContent()
  const [lat, lon] = (texto ?? "").replace("Ubicación seleccionada:", "").split(",").map((valor) => Number(valor.trim()))
  await pausa(page)
  return { lat, lon }
}

/**
 * Inserta un reporte abierto ya existente y lo registra para limpiarlo al final.
 *
 * @param testData - Datos de la prueba.
 * @param autor - Dueño del reporte.
 * @param punto - Ubicación.
 * @param categoriaId - Misma categoría que se elige en el formulario.
 */
async function reporteExistente(testData: TestData, autor: TestUser, punto: { lat: number; lon: number }, categoriaId: number) {
  const { data, error } = await adminClient()
    .from("reportes")
    .insert({
      usuario_id: autor.id,
      titulo: "Alumbrado en Calle 111, Posadas",
      descripcion: "Hace dos años estamos sin alumbrado público.",
      categoria_id: categoriaId,
      prioridad_id: 2,
      estado_id: 1,
      lat: punto.lat,
      lon: punto.lon,
    })
    .select("id")
    .single()
  if (error) throw error
  await testData.trackReportsOf(autor.id)
  return data.id as number
}

/**
 * Elige la categoría en el formulario, lo que dispara la búsqueda de duplicados.
 *
 * @param page - Página del formulario.
 * @param nombre - Nombre visible de la categoría.
 */
async function elegirCategoria(page: Page, nombre: string) {
  await page.getByRole("combobox").first().click()
  await pausa(page)
  await page.getByRole("option", { name: nombre }).click()
  await pausa(page)
}

/**
 * Adjunta la foto obligatoria, publica y confirma.
 *
 * @param page - Página del formulario.
 */
async function adjuntarYPublicar(page: Page) {
  await page.locator("#images").setInputFiles(await foto(page))
  await expect(page.getByAltText("Preview 1")).toBeVisible({ timeout: 30_000 })
  await pausa(page)
  await page.getByRole("button", { name: "Enviar Reporte" }).click()
  await pausa(page)
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar y Enviar" }).click()
  await expect(page.getByText("Reporte registrado en Reporty")).toBeVisible({ timeout: 30_000 })
  await pausa(page)
}

/**
 * Cierra la página y guarda su video con un nombre descriptivo.
 *
 * @param page - Página del escenario.
 * @param nombre - Nombre del archivo, sin extensión.
 */
async function guardarVideo(page: Page, nombre: string) {
  const video = page.video()
  await page.close()
  await video?.saveAs(join(CARPETA_VIDEOS, `${nombre}.webm`))
}

/** Desplaza un punto hacia el este la cantidad de metros pedida. */
function alEste(punto: { lat: number; lon: number }, metros: number) {
  return { lat: punto.lat, lon: punto.lon + metros / (111_320 * Math.cos((punto.lat * Math.PI) / 180)) }
}

test.describe("reportes duplicados", () => {
  test("otro vecino ya lo reportó: suma una novedad al existente", async ({ page, testData }) => {
    const categoria = await categoriaDePrueba()
    const vecina = await testData.createUser()
    const yo = await testData.createUser()
    await signIn(page, yo)
    await page.goto("/reportes/nuevo")
    await pausa(page)

    const punto = await completarSinCategoria(page)
    const existenteId = await reporteExistente(testData, vecina, alEste(punto, 30), categoria.id)
    await elegirCategoria(page, categoria.nombre)

    await expect(page.getByRole("heading", { name: "Parece que ya está reportado" })).toBeVisible()
    await expect(page.getByLabel("¿Qué novedad tenés?")).toHaveValue("problema_sigue_igual")
    await page.getByRole("heading", { name: "Parece que ya está reportado" }).scrollIntoViewIfNeeded()
    await pausa(page)
    await page.getByRole("button", { name: "Es el mismo: publicar novedad" }).click()

    await expect(page).toHaveURL(new RegExp(`/reportes/${existenteId}$`), { timeout: 15_000 })
    await expect(page.getByText("El problema sigue igual").first()).toBeVisible()
    await pausa(page)
    await guardarVideo(page, "duplicados-1-reporte-de-otro-vecino")
  })

  test("ya lo reporté en el mismo punto: no deja publicar hasta reemplazarlo", async ({ page, testData }) => {
    const categoria = await categoriaDePrueba()
    const yo = await testData.createUser()
    await signIn(page, yo)
    await page.goto("/reportes/nuevo")
    await pausa(page)

    const punto = await completarSinCategoria(page)
    const anteriorId = await reporteExistente(testData, yo, alEste(punto, 8), categoria.id)
    await elegirCategoria(page, categoria.nombre)

    await expect(page.getByRole("heading", { name: "Ya reportaste este punto" })).toBeVisible()
    await page.getByRole("heading", { name: "Ya reportaste este punto" }).scrollIntoViewIfNeeded()
    await pausa(page)
    await page.getByRole("button", { name: "Reemplazar mi reporte" }).click()
    await pausa(page)
    await page.getByRole("alertdialog").getByRole("button", { name: "Reemplazar al publicar" }).click()
    await expect(page.getByText(/Al publicar, se elimina tu reporte/)).toBeVisible()
    await pausa(page)

    await adjuntarYPublicar(page)
    await testData.trackReportsOf(yo.id)
    const { data: anterior } = await adminClient().from("reportes").select("deleted_at").eq("id", anteriorId).single()
    expect(anterior?.deleted_at).not.toBeNull()
    await guardarVideo(page, "duplicados-2-reemplazar-mi-reporte")
  })

  test("ya reporté otro poste de la cuadra: confirma que es otro punto y publica", async ({ page, testData }) => {
    const categoria = await categoriaDePrueba()
    const yo = await testData.createUser()
    await signIn(page, yo)
    await page.goto("/reportes/nuevo")
    await pausa(page)

    const punto = await completarSinCategoria(page)
    const anteriorId = await reporteExistente(testData, yo, alEste(punto, 60), categoria.id)
    await elegirCategoria(page, categoria.nombre)

    await expect(page.getByRole("heading", { name: "Ya reportaste este problema a 60 m" })).toBeVisible()
    await page.getByRole("heading", { name: "Ya reportaste este problema a 60 m" }).scrollIntoViewIfNeeded()
    await pausa(page)
    await page.getByRole("button", { name: "Es otro punto: seguir" }).click()
    await expect(page.getByText("Lo vas a publicar como un problema distinto.")).toBeVisible()
    await pausa(page)

    await adjuntarYPublicar(page)
    await testData.trackReportsOf(yo.id)
    const { data: anterior } = await adminClient().from("reportes").select("deleted_at").eq("id", anteriorId).single()
    expect(anterior?.deleted_at).toBeNull()
    await guardarVideo(page, "duplicados-3-otro-poste-de-la-cuadra")
  })
})
