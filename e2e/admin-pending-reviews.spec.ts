import { randomUUID } from "node:crypto"

import { expect, test } from "./fixtures"
import { signIn } from "./support/auth"
import { adminClient } from "./support/test-data"

test("pending review count appears in desktop and mobile admin navigation", async ({ page, testData }) => {
  const service = adminClient()
  const owner = await testData.createUser()
  const admin = await testData.createUser()
  const { error: roleError } = await service.from("profiles").update({ rol_id: 1 }).eq("id", admin.id)
  expect(roleError).toBeNull()
  const report = await testData.createReport(owner)
  const { count, error: countError } = await service.from("moderacion_imagenes")
    .select("id", { count: "exact", head: true }).eq("decision", "REVIEW").eq("estado_publicacion", "pendiente")
  expect(countError).toBeNull()
  const imageId = randomUUID()
  const { error: insertError } = await service.from("moderacion_imagenes").insert({
    id: imageId, reporte_id: report.id, propietario_id: owner.id,
    hash_sha256: "0".repeat(64), path_privado: `${owner.id}/${imageId}`,
  })
  expect(insertError).toBeNull()

  try {
    await signIn(page, admin)
    await page.goto("/admin")
    await expect(page.getByRole("navigation", { name: "Navegación de administración", exact: true })
      .getByLabel(`${(count ?? 0) + 1} revisiones pendientes`)).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await page.getByText("Menú", { exact: true }).click()
    await expect(page.getByRole("navigation", { name: "Navegación de administración móvil" })
      .getByLabel(`${(count ?? 0) + 1} revisiones pendientes`)).toBeVisible()
  } finally {
    const { error } = await service.from("moderacion_imagenes").delete().eq("id", imageId)
    expect(error).toBeNull()
  }
})
