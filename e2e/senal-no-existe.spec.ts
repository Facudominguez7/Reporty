import { expect, test } from "./fixtures"
import { signIn } from "./support/auth"
import { adminClient } from "./support/test-data"

test.use({ viewport: { width: 390, height: 844 } })

test("No existe signal: neighbors, own vote and admin review, never a number", async ({ page, testData }) => {
  const service = adminClient()
  const owner = await testData.createUser()
  const [vecina, yo, ...resto] = await Promise.all(Array.from({ length: 5 }, () => testData.createUser()))
  const report = await testData.createReport(owner)

  // Without votes there is no signal.
  await page.goto(`/reportes/${report.id}`)
  await expect(page.getByRole("button", { name: /No existe/ })).toBeVisible()
  await expect(page.getByText("Otros vecinos también lo marcaron")).toHaveCount(0)

  // A neighbor voted: before voting, the signal invites to add the vote.
  const { error: primerVoto } = await service.from("votos_no_existe").insert({ reporte_id: report.id, usuario_id: vecina.id })
  expect(primerVoto).toBeNull()
  await signIn(page, yo)
  await page.goto(`/reportes/${report.id}`)
  const aviso = page.getByRole("status").filter({ hasText: "Otros vecinos también lo marcaron como «No existe»." })
  await expect(aviso).toContainText("Si vos tampoco lo ves, sumá tu voto.")
  await expect(aviso).not.toContainText(/\d/)

  // After voting, the signal changes without reloading.
  await page.getByRole("button", { name: /No existe/ }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: /Confirmar Voto/ }).click()
  await expect(page.getByRole("status").filter({ hasText: "Vos y otros vecinos lo marcaron." })).toBeVisible()

  // At five votes the review opens: chip and notice, still without numbers.
  const { error: restoVotos } = await service.from("votos_no_existe").insert(resto.map((u) => ({ reporte_id: report.id, usuario_id: u.id })))
  expect(restoVotos).toBeNull()
  await page.reload()
  await expect(page.getByText("Revisión: En revisión", { exact: true })).toBeVisible()
  const revision = page.getByRole("status").filter({ hasText: "Varios vecinos dicen que este problema no existe." })
  await expect(revision).toContainText("Un administrador lo está revisando.")

  // Once an admin dismisses the review, the report is no longer shown as under review.
  const { error: descarte } = await service.from("reportes_revision_rechazo")
    .update({ estado: "descartada", resuelto_at: new Date().toISOString() }).eq("reporte_id", report.id)
  expect(descarte).toBeNull()
  await page.reload()
  await expect(page.getByText("Revisión: En revisión", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("status").filter({ hasText: "Vos y otros vecinos lo marcaron." })).toBeVisible()
})
