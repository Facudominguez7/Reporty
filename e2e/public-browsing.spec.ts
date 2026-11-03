import { expect, test } from "./fixtures"
import { adminClient } from "./support/test-data"

test.describe("public browsing, without an account", () => {
  test("the map loads with report markers", async ({ page, testData }) => {
    const owner = await testData.createUser()
    await testData.createReport(owner)

    await page.goto("/mapa")

    await expect(page.locator(".leaflet-container")).toBeVisible()
    await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible()
  })

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test(`map filters are clickable at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.addInitScript(() => localStorage.setItem("reporty_onboarding_completed", "true"))
      await page.goto("/mapa")
      await page.getByRole("button", { name: "Abrir filtros", exact: true }).click()
      await expect(page.getByPlaceholder("Título, descripción o referencia")).toBeVisible()
    })
  }

  test("a report can be found in the list and opened", async ({ page, testData }) => {
    const owner = await testData.createUser()
    const reporte = await testData.createReport(owner, { descripcion: "Pozo profundo frente a la plaza." })

    await page.goto(`/reportes?search=${encodeURIComponent(reporte.titulo)}`)
    await page.getByRole("link", { name: new RegExp(reporte.titulo) }).first().click()

    await expect(page).toHaveURL(new RegExp(`/reportes/${reporte.id}$`))
    await expect(page.getByRole("heading", { name: "Detalle del reporte" })).toBeVisible()
    await expect(page.getByText(reporte.titulo, { exact: true })).toBeVisible()
    await expect(page.getByText("Pozo profundo frente a la plaza.")).toBeVisible()
  })

  test("the map popup keeps its report author", async ({ page, testData }) => {
    const owner = await testData.createUser()
    const report = await testData.createReport(owner)
    await page.addInitScript(() => localStorage.setItem("reporty_onboarding_completed", "true"))

    await page.goto(`/mapa?search=${encodeURIComponent(report.titulo)}`)
    await page.locator(".leaflet-marker-icon:not(.custom-cluster-icon)").first().click()
    const popup = page.locator(".leaflet-popup")
    await expect(popup.getByText(owner.username, { exact: true })).toBeVisible()
    await expect(popup.locator(`a[href="/reportes/${report.id}"]`)).toBeVisible()
  })

  test("loading more reports preserves authors in the public API", async ({ page, testData }) => {
    const owner = await testData.createUser()
    const reports = []
    for (let i = 0; i < 13; i++) {
      reports.push(await testData.createReport(owner, { titulo: `${owner.username} report ${i}` }))
    }

    await page.goto(`/reportes?search=${encodeURIComponent(owner.username)}`)
    const response = page.waitForResponse((result) => result.url().includes("/api/reportes?") && result.status() === 200)
    await page.getByRole("button", { name: "Cargar Más Reportes" }).click()
    const body = await (await response).json()

    expect(body.offset).toBe(12)
    expect(body.hasMore).toBe(false)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].author).toBe(owner.username)
    for (const report of reports) await expect(page.getByText(report.titulo, { exact: true })).toBeVisible()
  })

  test("report detail loads additional photos lazily", async ({ page, testData }) => {
    const owner = await testData.createUser()
    const report = await testData.createReport(owner)
    const { error } = await adminClient().from("fotos_reporte").insert([
      { reporte_id: report.id, url: "/logos/logoSinBg.png" },
      { reporte_id: report.id, url: "/logos/logoSinBg.png" },
    ])
    if (error) throw error

    await page.goto(`/reportes/${report.id}`)
    const first = page.getByAltText("Imagen 1 del reporte")
    const second = page.getByAltText("Imagen 2 del reporte")
    await expect(first).toBeVisible()
    await expect(first).not.toHaveAttribute("loading", "lazy")
    await expect(second).toHaveAttribute("loading", "lazy")
    await expect(second).toHaveAttribute("src", /logoSinBg\.png/)
  })

  test("community shows its ranking and report summary", async ({ page }) => {
    await page.goto("/comunidad")
    await expect(page.getByText("Personas que más reportan")).toBeVisible()
    await page.getByRole("tab", { name: "Reportes", exact: true }).click()
    await expect(page.getByText("Reportes totales", { exact: true })).toBeVisible()
  })

  test("the state filter leaves out reports in other states", async ({ page, testData }) => {
    const owner = await testData.createUser()
    const reporte = await testData.createReport(owner)
    const search = encodeURIComponent(reporte.titulo)

    await page.goto(`/reportes?search=${search}&estado=Pendiente`)
    await expect(page.getByText(reporte.titulo).first()).toBeVisible()

    await page.goto(`/reportes?search=${search}&estado=Reparado`)
    await expect(page.getByText(reporte.titulo)).toHaveCount(0)
  })

  test("a report that does not exist says so", async ({ page }) => {
    await page.goto("/reportes/999999999")

    await expect(page.getByText("Reporte no encontrado", { exact: true })).toBeVisible()
  })
})
