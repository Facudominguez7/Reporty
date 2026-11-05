import { expect, type Page } from "@playwright/test"

/** Accessible name of the group that holds the shared challenge and the submit of the active tab. */
const GRUPO_VERIFICACION = "Verificación de seguridad y envío"

/**
 * Opens one of the `/auth` tabs and waits for it to be selected.
 *
 * A click dispatched right after the page scrolls is dropped by the browser: its hit test still
 * uses the pre-scroll layers, so the pointer lands where the tab used to be. The attempt is
 * retried until the tab reports itself as selected.
 *
 * @param page - Page showing the auth tabs.
 * @param name - Visible name of the tab.
 */
export async function openAuthTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name })

  await expect(async () => {
    await tab.click({ timeout: 5_000 })
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
}

/**
 * Submits the form of the active `/auth` tab through the shared verification group.
 *
 * The submit lives outside the tab panels, in the group that also holds the Turnstile challenge,
 * and stays disabled until a token arrives (about two seconds). At the default 1280×720 viewport
 * its centre sits under the fixed bottom navigation: Playwright sees the button as in view, does
 * not scroll, and the click lands on the navigation, so no server action is posted. Scrolling to
 * the end of the document leaves the group clear of the navigation, and waiting two animation
 * frames makes the hit test read the post-scroll layout instead of the previous one.
 *
 * @param page - Page showing `/auth`.
 * @param name - Visible name of the submit of the active tab.
 */
export async function submitAuth(page: Page, name: string) {
  const button = page
    .getByRole("group", { name: GRUPO_VERIFICACION })
    .getByRole("button", { name, exact: true })

  await expect(button).toBeEnabled({ timeout: 30_000 })
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.scrollTo(0, document.documentElement.scrollHeight)
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
  await button.click()
}

/** Signs in through the login form and waits for the default landing page. */
export async function signIn(page: Page, { email, password }: { email: string; password: string }) {
  await page.goto("/auth")
  await page.getByLabel("Correo electrónico").fill(email)
  await page.getByLabel("Contraseña", { exact: true }).fill(password)
  await submitAuth(page, "Ingresar")
  await expect(page).toHaveURL(/\/mapa$/)
}
