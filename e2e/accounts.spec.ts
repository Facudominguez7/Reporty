import type { Page } from "@playwright/test"

import { expect, test } from "./fixtures"
import { signIn } from "./support/auth"
import { confirmLinkPath, waitForAuthEmail } from "./support/mailpit"
import { TEST_PASSWORD } from "./support/test-data"

/**
 * Opens one of the `/auth` tabs and waits for it to be selected.
 *
 * A click dispatched right after the page scrolls is dropped by the browser: its hit test still
 * uses the pre-scroll layers, so the pointer lands where the tab used to be (the signup answer
 * scrolls the page). The attempt is retried until the tab reports itself as selected.
 *
 * @param page - Page showing the auth tabs.
 * @param name - Visible name of the tab.
 */
async function openTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name })

  await expect(async () => {
    await tab.click({ timeout: 5_000 })
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
}

test.describe("accounts", () => {
  test("signing up needs the email confirmation before the account can sign in", async ({ page, testData }) => {
    const email = testData.newEmail()

    await page.goto("/auth")
    // Switching tabs right away mounts the signup challenge while the shared script still loads.
    await openTab(page, "Registrarme")
    const registro = page.getByRole("tabpanel", { name: "Registrarme" })
    await registro.getByLabel("Nombre").fill("Ana")
    await registro.getByLabel("Apellido").fill("Prueba")
    await registro.getByLabel("Correo electrónico").fill(email)
    await registro.getByLabel("Contraseña", { exact: true }).fill(TEST_PASSWORD)
    await registro.getByLabel("Confirmar contraseña").fill(TEST_PASSWORD)
    await registro.getByRole("checkbox").check()
    await registro.getByRole("button", { name: "Crear cuenta" }).click()

    // The same copy also arrives as a toast, so the form's own alert is what gets asserted.
    await expect(registro.getByText("Te enviamos un correo de confirmación.")).toBeVisible()
    await testData.trackUserByEmail(email)

    // Before confirming, the password alone is not enough.
    await openTab(page, "Ingresar")
    const ingreso = page.getByRole("tabpanel", { name: "Ingresar" })
    await ingreso.getByLabel("Correo electrónico").fill(email)
    await ingreso.getByLabel("Contraseña", { exact: true }).fill(TEST_PASSWORD)
    await ingreso.getByRole("button", { name: "Ingresar", exact: true }).click()
    await expect(ingreso.getByText("Primero confirmá tu correo desde el enlace que te enviamos.")).toBeVisible()

    const confirmation = await waitForAuthEmail(email, "Confirmá tu cuenta de Reporty")
    await page.goto(confirmLinkPath(confirmation))
    await expect(page).toHaveURL(/\/mapa$/)

    await page.context().clearCookies()
    await signIn(page, { email, password: TEST_PASSWORD })
  })

  test("a wrong password is rejected", async ({ page, testData }) => {
    const user = await testData.createUser()

    await page.goto("/auth")
    await page.getByLabel("Correo electrónico").fill(user.email)
    await page.getByLabel("Contraseña", { exact: true }).fill("Not-The-Password-1!")
    await page.getByRole("button", { name: "Ingresar", exact: true }).click()

    // The same copy also appears as a toast, so the form's own alert is asserted.
    const ingreso = page.getByRole("tabpanel", { name: "Ingresar" })
    await expect(ingreso.getByText("El correo o la contraseña no son correctos.")).toBeVisible()
    await expect(page).toHaveURL(/\/auth/)
  })

  test("signing out ends the session", async ({ page, testData }) => {
    const user = await testData.createUser()
    await signIn(page, user)

    await page.goto("/dashboard")
    await page.getByRole("button", { name: "Cerrar sesión" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Cerrar sesión" }).click()

    await expect(page.getByText("Sesión cerrada")).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/auth\?next=%2Fdashboard$/)
  })

  test("a forgotten password can be replaced from the recovery email", async ({ page, testData }) => {
    const user = await testData.createUser()
    const newPassword = "E2e-Nueva-456!"

    await page.goto("/auth/recuperar")
    await page.getByLabel("Correo electrónico").fill(user.email)
    await page.getByRole("button", { name: "Enviarme el enlace" }).click()
    await expect(page.getByText("Revisá tu correo")).toBeVisible()

    const recovery = await waitForAuthEmail(user.email, "Creá una nueva contraseña para Reporty")
    await page.goto(confirmLinkPath(recovery))
    await expect(page).toHaveURL(/\/auth\/nueva-contrasena$/)

    await page.getByLabel("Contraseña", { exact: true }).fill(newPassword)
    await page.getByLabel("Repetir contraseña").fill(newPassword)
    await page.getByRole("button", { name: "Crear contraseña" }).click()
    await expect(page).toHaveURL(/\/mis-reportes\?cuenta=lista$/)

    await page.context().clearCookies()
    await signIn(page, { email: user.email, password: newPassword })
  })
})
