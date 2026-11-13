import type { Page } from "@playwright/test"

import { expect, test } from "./fixtures"
import { openAuthTab, signIn, submitAuth } from "./support/auth"
import { uniqueTag } from "./support/test-data"

const MAX_STORED_BYTES = 100 * 1024

/**
 * A 4000×3000 JPEG of a few megabytes, drawn in the browser so no binary lives in the repo.
 * Gradients with fine noise behave like a phone photo: heavy, but compressible.
 */
async function heavyPhoto(page: Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 4000
    canvas.height = 3000
    const context = canvas.getContext("2d")!
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
    gradient.addColorStop(0, "#5b6b4a")
    gradient.addColorStop(0.5, "#8a8f86")
    gradient.addColorStop(1, "#3d3a35")
    context.fillStyle = gradient
    context.fillRect(0, 0, canvas.width, canvas.height)

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let index = 0; index < pixels.data.length; index += 4) {
      const noise = (Math.random() - 0.5) * 40
      pixels.data[index] += noise
      pixels.data[index + 1] += noise
      pixels.data[index + 2] += noise
    }
    context.putImageData(pixels, 0, 0)

    return canvas.toDataURL("image/jpeg", 0.95).split(",")[1]
  })

  return { name: "bache.jpg", mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") }
}

/**
 * Fills the new-report form; the location is the point clicked in the middle of the map.
 * It uses the "Otros" category, the only one with a typed title, so each test can find its
 * report by a unique title (every other category gets "<Category> en <address>").
 */
async function fillReportForm(page: Page, titulo: string) {
  await page.getByLabel("Descripción Detallada *").fill("Pozo grande que ocupa medio carril.")
  await page.getByRole("combobox").click()
  await page.getByRole("option", { name: "Otros" }).click()
  await page.getByLabel("Título del reporte *").fill(titulo)
  await page.getByRole("group", { name: "Prioridad *" }).getByRole("button", { name: "Media" }).click()
  await page.locator(".leaflet-container").click()
  await expect(page.getByText(/Ubicación seleccionada:/)).toBeVisible()
}

async function submitReport(page: Page) {
  await page.getByRole("button", { name: "Enviar Reporte" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar y Enviar" }).click()
  await expect(page.getByText("Reporte registrado en Reporty")).toBeVisible({ timeout: 15_000 })
}

test.describe("reports", () => {
  test("a citizen reports a problem with a heavy photo, stored optimized", async ({ page, testData }) => {
    const user = await testData.createUser()
    const titulo = `Bache con foto ${uniqueTag()}`
    await signIn(page, user)

    await page.goto("/reportes/nuevo")
    await fillReportForm(page, titulo)
    const photo = await heavyPhoto(page)
    expect(photo.buffer.byteLength).toBeGreaterThan(1024 * 1024)
    await page.locator("#images").setInputFiles(photo)
    await expect(page.getByAltText("Preview 1")).toBeVisible({ timeout: 30_000 })
    await submitReport(page)

    await expect(page.getByText("Sumaste 10 puntos.", { exact: false })).toBeVisible()
    const reporte = await testData.trackReportByTitle(titulo)
    expect(reporte.usuario_id).toBe(user.id)

    const [stored] = await testData.storedPhotoSizes(reporte.id)
    expect(stored.photo).toBeGreaterThan(0)
    expect(stored.photo).toBeLessThanOrEqual(MAX_STORED_BYTES)
    expect(stored.thumbnail).toBeGreaterThan(0)
    expect(stored.thumbnail).toBeLessThanOrEqual(MAX_STORED_BYTES)

    await page.getByRole("link", { name: "Ver el reporte" }).click()
    await expect(page.getByText(titulo, { exact: true })).toBeVisible()
    // The alt text also names the author and the date: "Foto 1 del reporte, publicada por …".
    const image = page.getByAltText(/^Foto 1 del reporte/)
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
  })

  test("a guest can decline the institution notice after reporting", async ({ page, testData }) => {
    const titulo = `Bache de invitado ${uniqueTag()}`

    // The guest choice precedes the anonymous session, which is created on click.
    await page.goto("/reportes/nuevo")
    await expect(page).toHaveURL(/\/auth/)
    // The submit only renders while the guest tab is the active one.
    await openAuthTab(page, "Invitado")
    await submitAuth(page, "Continuar como invitado")
    await expect(page).toHaveURL(/\/reportes\/nuevo$/)
    await fillReportForm(page, titulo)
    await page.locator("#images").setInputFiles(await heavyPhoto(page))
    await expect(page.getByAltText("Preview 1")).toBeVisible({ timeout: 30_000 })
    await submitReport(page)

    await expect(page.getByText("Reportaste como invitado.", { exact: false })).toBeVisible()
    const reporte = await testData.trackReportByTitle(titulo)

    await expect(page.getByText("¿Querés avisar a la institución responsable?")).toBeVisible()
    await expect(page.getByRole("link", { name: "Ver mis reportes" })).toHaveCount(0)
    await page.getByRole("button", { name: "No, gracias" }).click()
    await expect(page.getByRole("status").getByText("No se envió ningún correo.")).toBeVisible()
    expect(reporte.usuario_id).toBeTruthy()

    // "No existe" is the only vote left: a repair is reported with photo evidence instead.
    // A guest still cannot vote and is asked to sign in.
    await page.goto(`/reportes/${reporte.id}`)
    await page.getByRole("group", { name: "Acciones sobre el reporte" }).getByRole("button", { name: "No existe", exact: true }).click()
    const dialog = page.getByRole("alertdialog")
    await expect(dialog.getByText("Para votar necesitás iniciar sesión con una cuenta.")).toBeVisible()
    await dialog.getByRole("button", { name: "Entendido" }).click()
  })

  test("the owner can delete their report", async ({ page, testData }) => {
    const user = await testData.createUser()
    const reporte = await testData.createReport(user)
    await signIn(page, user)

    await page.goto(`/reportes/${reporte.id}`)
    await page.getByRole("button", { name: "Eliminar reporte" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar Reporte" }).click()

    await expect(page.getByText("Reporte eliminado exitosamente")).toBeVisible()
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 })
    await page.goto(`/reportes/${reporte.id}`)
    await expect(page.getByText("Reporte no encontrado", { exact: true })).toBeVisible()
  })
})
