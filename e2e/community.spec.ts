import { expect, test } from "./fixtures"
import type { BrowserContext } from "@playwright/test"
import { signIn } from "./support/auth"
import { adminClient, uniqueTag } from "./support/test-data"

type CapturedEmail = { to: string[]; subject: string; text: string; html: string }

/** Poll the local capture: a successful mutation alone does not prove email delivery. */
async function notification(to: string, subject: string): Promise<CapturedEmail> {
  let matches: CapturedEmail[] = []
  await expect.poll(async () => {
    const response = await fetch(`${process.env.E2E_FAKE_RESEND_URL}/emails?to=${encodeURIComponent(to)}`)
    expect(response.ok).toBeTruthy()
    const emails = await response.json() as CapturedEmail[]
    matches = emails.filter((email) => email.subject === subject)
    return matches.length
  }).toBe(1)
  return matches[0]
}

test.describe("community", () => {
  test("a citizen comments and the report owner receives the notification", async ({ page, testData }) => {
    const owner = await testData.createUser()
    const citizen = await testData.createUser()
    const report = await testData.createReport(owner)
    const comment = `Actualización ${uniqueTag()}`
    await signIn(page, citizen)
    await page.goto(`/reportes/${report.id}`)
    await page.getByRole("textbox").fill(comment)
    await page.getByRole("button", { name: "Publicar", exact: true }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Publicar Comentario" }).click()
    await expect(page.getByRole("alertdialog")).toBeHidden()
    await expect(page.getByRole("textbox")).toHaveValue("")
    await expect(page.getByText(comment, { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText(comment, { exact: true })).toBeVisible()

    const email = await notification(owner.email, `Nuevo comentario en tu reporte: ${report.titulo}`)
    expect(email.to).toEqual([owner.email])
    expect(email.text).toContain(comment)
    expect(email.text).toContain(citizen.username)
    expect(email.text).toContain(report.titulo)
    expect(email.text).toContain(`/reportes/${report.id}`)
    expect(email.html).toContain(comment)
  })

  test("the update form follows the activity and empty state", async ({ page, testData }) => {
    const owner = await testData.createUser()
    const reader = await testData.createUser()
    const report = await testData.createReport(owner)
    await signIn(page, reader)
    await page.goto(`/reportes/${report.id}`)

    const activityCard = page.locator('[data-slot="card"]').filter({ has: page.getByText("Actualizaciones y Comentarios", { exact: true }) }).first()
    const emptyState = activityCard.getByText("Aún no hay actividad", { exact: true }).locator("xpath=..")
    const form = activityCard.getByLabel("¿Qué novedad tenés?").locator("xpath=ancestor::form")
    await expect(emptyState).toBeVisible()
    const emptyStateBounds = await emptyState.boundingBox()
    const formBounds = await form.boundingBox()
    if (!emptyStateBounds || !formBounds) throw new Error("Activity state or update form is not rendered")
    expect(formBounds.y).toBeGreaterThan(emptyStateBounds.y + emptyStateBounds.height)
  })

  test("un ciudadano cambia su voto y conserva una sola recompensa", async ({ page, testData }) => {
    const autor = await testData.createUser()
    const ciudadano = await testData.createUser()
    const reporte = await testData.createReport(autor)
    const supabase = adminClient()
    /** Consulta el saldo del ciudadano descartable, sin modificarlo. */
    const puntos = async () => {
      const { data, error } = await supabase.from("profiles").select("puntos").eq("id", ciudadano.id).single()
      if (error) throw error
      return data.puntos ?? 0
    }
    const saldoInicial = await puntos()
    await signIn(page, ciudadano)
    await page.goto(`/reportes/${reporte.id}`)
    const controles = page.getByRole("group", { name: "Votar sobre el reporte" })
    const noExiste = controles.getByRole("button", { name: /^No existe/ })
    const reparado = controles.getByRole("button", { name: /^Reparado/ })

    await expect(noExiste).toHaveText("No existe")
    await expect(reparado).toHaveText("Reparado")
    await expect(noExiste).toHaveAttribute("aria-pressed", "false")
    await noExiste.click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar Voto" }).click()
    await expect(noExiste).toHaveText("No existe · Tu voto")
    await expect(noExiste).toHaveAttribute("aria-pressed", "true")
    await expect(reparado).toHaveText("Reparado")
    await expect.poll(puntos).toBe(saldoInicial + 1)

    await page.reload()
    await expect(noExiste).toHaveText("No existe · Tu voto")
    await expect(noExiste).toHaveAttribute("aria-pressed", "true")
    await expect(reparado).toBeEnabled()
    await reparado.click()
    const dialogo = page.getByRole("alertdialog")
    await expect(dialogo.getByText("Cambiar tu voto no suma puntos adicionales.")).toBeVisible()
    await dialogo.getByRole("button", { name: "Confirmar Voto" }).click()
    await expect(reparado).toHaveText("Reparado · Tu voto")
    await expect(reparado).toHaveAttribute("aria-pressed", "true")
    await expect(noExiste).toHaveText("No existe")
    await expect(noExiste).toBeEnabled()
    await expect.poll(puntos).toBe(saldoInicial + 1)

    await page.reload()
    await expect(reparado).toHaveText("Reparado · Tu voto")
    await expect(reparado).toHaveAttribute("aria-pressed", "true")
    await expect(noExiste).toHaveText("No existe")
    expect(await puntos()).toBe(saldoInicial + 1)
  })

  test("the report owner and four citizens vote repaired before the report closes", async ({ browser, page, testData }) => {
    const owner = await testData.createUser()
    const voters = await Promise.all(Array.from({ length: 4 }, () => testData.createUser()))
    const report = await testData.createReport(owner)
    const contexts: BrowserContext[] = []
    const baseURL = "http://127.0.0.1:3100"

    try {
      await signIn(page, owner)
      await page.goto(`/reportes/${report.id}`)
      const detailsCard = page.locator('[data-slot="card"]').filter({ has: page.getByText(report.titulo, { exact: true }) }).first()
      const repairedButton = page.getByRole("button", { name: /^Reparado(?: · Tu voto)?$/ })
      await expect(detailsCard.getByRole("button", { name: /^Reparado(?: · Tu voto)?$/ })).toHaveCount(1)
      await expect(detailsCard.getByRole("button", { name: /^No existe(?: · Tu voto)?$/ })).toHaveCount(0)
      await expect(detailsCard.getByRole("button", { name: "Avisar resuelto", exact: true })).toHaveCount(0)
      await expect(page.getByText("¿Qué pasó con este reporte?", { exact: true })).toHaveCount(0)
      await expect(detailsCard.locator("hr")).toHaveCount(1)
      await expect(repairedButton).toHaveClass(/bg-primary/)
      await expect(repairedButton).toHaveText("Reparado")
      const voteRow = repairedButton.locator("xpath=..")
      const voteRowBounds = await voteRow.boundingBox()
      const repairedBounds = await repairedButton.boundingBox()
      if (!voteRowBounds || !repairedBounds) throw new Error("Owner vote control is not laid out")
      expect(repairedBounds.x).toBeCloseTo(voteRowBounds.x, 0)
      expect(repairedBounds.x + repairedBounds.width).toBeCloseTo(voteRowBounds.x + voteRowBounds.width, 0)

      await repairedButton.click()
      const voteDialog = page.getByRole("alertdialog")
      await expect(voteDialog.getByText(/Si cinco usuarios coinciden/)).toHaveCount(0)
      await expect(voteDialog.getByText(/Al llegar a 5 votos/)).toHaveCount(0)
      await expect(voteDialog.getByText(/El admin revisará el reporte/)).toHaveCount(0)
      await voteDialog.getByRole("button", { name: "Cancelar" }).click()
      await repairedButton.click()
      await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar Voto" }).click()
      await expect(page.getByText("Pendiente", { exact: true })).toBeVisible()
      await expect(repairedButton).toHaveText("Reparado · Tu voto")
      await expect(repairedButton).toBeDisabled()

      for (let voteCount = 2; voteCount <= 5; voteCount++) {
        const context = await browser.newContext({ baseURL, locale: "es-AR" })
        contexts.push(context)
        const voterPage = await context.newPage()
        await signIn(voterPage, voters[voteCount - 2])
        await voterPage.goto(`/reportes/${report.id}`)
        const repairedVoteButton = voterPage.getByRole("button", { name: /^Reparado(?: · Tu voto)?$/ })
        const notExistsButton = voterPage.getByRole("button", { name: /^No existe(?: · Tu voto)?$/ })
        await expect(repairedVoteButton).toHaveText("Reparado")
        await expect(notExistsButton).toHaveText("No existe")

        if (voteCount === 2) {
          await expect(notExistsButton).toHaveClass(/bg-destructive/)
          await notExistsButton.click()
          const noExistsDialog = voterPage.getByRole("alertdialog")
          await expect(noExistsDialog.getByText(/Si cinco usuarios coinciden/)).toHaveCount(0)
          await expect(noExistsDialog.getByText(/El admin revisará el reporte/)).toHaveCount(0)
          await noExistsDialog.getByRole("button", { name: "Cancelar" }).click()

          const voterVoteRow = repairedVoteButton.locator("xpath=..")
          const voterVoteRowBounds = await voterVoteRow.boundingBox()
          const repairedVoterBounds = await repairedVoteButton.boundingBox()
          const noExistsBounds = await notExistsButton.boundingBox()
          if (!voterVoteRowBounds || !repairedVoterBounds || !noExistsBounds) throw new Error("Community vote controls are not laid out")
          expect(repairedVoterBounds.x).toBeCloseTo(voterVoteRowBounds.x, 0)
          expect(noExistsBounds.x + noExistsBounds.width).toBeCloseTo(voterVoteRowBounds.x + voterVoteRowBounds.width, 0)
          expect(repairedVoterBounds.width).toBeCloseTo(noExistsBounds.width, 0)
        }

        await repairedVoteButton.click()
        await voterPage.getByRole("alertdialog").getByRole("button", { name: "Confirmar Voto" }).click()

        if (voteCount < 5) {
          await expect(voterPage.getByText("Pendiente", { exact: true })).toBeVisible()
          await expect(repairedVoteButton).toHaveText("Reparado · Tu voto")
          await expect(repairedVoteButton).toBeDisabled()
        } else {
          await expect(voterPage.getByText("Reparado", { exact: true })).toBeVisible()
          await expect(voterPage.getByRole("button", { name: /^(Reparado|No existe)/ })).toHaveCount(0)
          await voterPage.reload()
          await expect(voterPage.getByText("Reparado", { exact: true })).toBeVisible()
        }
      }
    } finally {
      await Promise.all(contexts.map((context) => context.close()))
    }

    const email = await notification(owner.email, `Tu reporte "${report.titulo}" cambió de estado`)
    expect(email.text).toContain("Reparado")
    expect(email.text).toContain(`/reportes/${report.id}`)
  })

  test("vote confirmation dialogs explain points and remain accessible", async ({ page, testData }) => {
    const owner = await testData.createUser()
    const voter = await testData.createUser()
    const report = await testData.createReport(owner)
    const accessibilityWarnings: string[] = []
    page.on("console", (message) => {
      if (message.text().includes("AlertDialogContent requires a description")) accessibilityWarnings.push(message.text())
    })

    await signIn(page, voter)
    await page.goto(`/reportes/${report.id}`)
    const detailsCard = page.locator('[data-slot="card"]').filter({ has: page.getByText(report.titulo, { exact: true }) }).first()
    const repairedButton = detailsCard.getByRole("button", { name: /^Reparado(?: · Tu voto)?$/ })
    const noExistsButton = detailsCard.getByRole("button", { name: /^No existe(?: · Tu voto)?$/ })

    await repairedButton.click()
    const repairedDialog = page.getByRole("alertdialog")
    await expect(repairedDialog).toBeVisible()
    const repairedPointMessage = await repairedDialog.getByText("Tu primer voto sumará 1 punto.", { exact: true }).count()
    const repairedDescriptionId = await repairedDialog.getAttribute("aria-describedby")
    const repairedDescriptionTargetCount = repairedDescriptionId
      ? await page.locator(`[id="${repairedDescriptionId}"]`).count()
      : 0
    const repairedHasDescription = repairedDescriptionTargetCount > 0
    await repairedDialog.getByRole("button", { name: "Cancelar" }).click()

    await noExistsButton.click()
    const noExistsDialog = page.getByRole("alertdialog")
    await expect(noExistsDialog).toBeVisible()
    const noExistsPointMessage = await noExistsDialog.getByText("Tu primer voto sumará 1 punto.", { exact: true }).count()
    const noExistsDescriptionId = await noExistsDialog.getAttribute("aria-describedby")
    const noExistsDescriptionTargetCount = noExistsDescriptionId
      ? await page.locator(`[id="${noExistsDescriptionId}"]`).count()
      : 0
    const noExistsHasDescription = noExistsDescriptionTargetCount > 0
    await noExistsDialog.getByRole("button", { name: "Cancelar" }).click()

    expect({ repairedPointMessage, noExistsPointMessage, repairedHasDescription, noExistsHasDescription, accessibilityWarnings }).toEqual({
      repairedPointMessage: 1,
      noExistsPointMessage: 1,
      repairedHasDescription: true,
      noExistsHasDescription: true,
      accessibilityWarnings: [],
    })
  })

  test("an administrator changes state and the owner receives the notification", async ({ page, testData }) => {
    const owner = await testData.createUser()
    const admin = await testData.createUser()
    // Only elevate this disposable local user, never a pre-existing profile.
    const { data, error } = await adminClient().from("profiles").update({ rol_id: 1 }).eq("id", admin.id).select("rol_id").single()
    expect(error).toBeNull()
    expect(data?.rol_id).toBe(1)
    const report = await testData.createReport(owner)
    const description = `Reparación verificada ${uniqueTag()}`
    await signIn(page, admin)
    await page.goto(`/reportes/${report.id}`)
    await page.getByRole("button", { name: "Abrir herramientas de administrador" }).click()
    const panel = page.getByRole("dialog", { name: "Panel de Administrador" })
    await panel.getByRole("combobox").click()
    await page.getByRole("option", { name: "Reparado", exact: true }).click()
    await panel.getByPlaceholder("Descripción del cambio (opcional)").fill(description)
    await panel.getByRole("button", { name: "Actualizar Estado", exact: true }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar Cambio" }).click()
    await expect(page.getByText("Estado actualizado exitosamente")).toBeVisible()
    await expect(page.getByRole("main").getByText("Reparado", { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole("main").getByText("Reparado", { exact: true })).toBeVisible()
    const email = await notification(owner.email, `Tu reporte "${report.titulo}" cambió de estado`)
    expect(email.to).toEqual([owner.email])
    expect(email.text).toContain("Reparado")
    expect(email.text).toContain(description)
    expect(email.text).toContain(report.titulo)
    expect(email.text).toContain(`/reportes/${report.id}`)
  })
})
