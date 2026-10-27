import { expect, test } from "./fixtures"
import { signIn } from "./support/auth"
import { adminClient } from "./support/test-data"

test("administrator can filter audit activity on desktop and mobile", async ({ page, testData }) => {
  const owner = await testData.createUser()
  const admin = await testData.createUser()
  const { error } = await adminClient().from("profiles").update({ rol_id: 1 }).eq("id", admin.id)
  expect(error).toBeNull()
  const report = await testData.createReport(owner)

  await signIn(page, admin)
  await page.goto("/admin/auditoria")
  const filters = page.locator("#audit-filters")
  await expect(filters).toBeVisible()
  await filters.getByRole("textbox", { name: "Usuario" }).fill(owner.username)
  await filters.getByRole("combobox", { name: "Acción" }).selectOption("report_created")
  await filters.getByRole("button", { name: "Aplicar" }).click()
  await expect(page.getByText(report.titulo)).toBeVisible()
  await expect(page).toHaveURL(/accion=report_created/)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(filters).toBeHidden()
  await page.getByRole("button", { name: "Mostrar filtros" }).click()
  await expect(filters).toBeVisible()
  await expect(filters.getByRole("textbox", { name: "Usuario" })).toHaveValue(owner.username)
})
