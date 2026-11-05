import { expect, test } from "./fixtures"
import { openAuthTab, signIn, submitAuth } from "./support/auth"
import { confirmLinkPath, waitForAuthEmail } from "./support/mailpit"
import { TEST_PASSWORD } from "./support/test-data"

test.describe("accounts", () => {
  test("signing up needs the email confirmation before the account can sign in", async ({ page, testData }) => {
    const email = testData.newEmail()

    await page.goto("/auth")
    // Switching tabs right away mounts the signup challenge while the shared script still loads.
    await openAuthTab(page, "Registrarme")
    const registro = page.getByRole("tabpanel", { name: "Registrarme" })
    await registro.getByLabel("Nombre").fill("Ana")
    await registro.getByLabel("Apellido").fill("Prueba")
    await registro.getByLabel("Correo electrónico").fill(email)
    await registro.getByLabel("Contraseña", { exact: true }).fill(TEST_PASSWORD)
    await registro.getByLabel("Confirmar contraseña").fill(TEST_PASSWORD)
    await registro.getByRole("checkbox").check()
    await submitAuth(page, "Crear cuenta")

    // The same copy also arrives as a toast, so the form's own alert is what gets asserted.
    await expect(registro.getByText("Te enviamos un correo de confirmación.")).toBeVisible()
    await testData.trackUserByEmail(email)

    // Before confirming, the password alone is not enough.
    await openAuthTab(page, "Ingresar")
    const ingreso = page.getByRole("tabpanel", { name: "Ingresar" })
    await ingreso.getByLabel("Correo electrónico").fill(email)
    await ingreso.getByLabel("Contraseña", { exact: true }).fill(TEST_PASSWORD)
    await submitAuth(page, "Ingresar")
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
    await submitAuth(page, "Ingresar")

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
