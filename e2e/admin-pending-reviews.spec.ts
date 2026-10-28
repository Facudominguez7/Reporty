import { randomUUID } from "node:crypto"

import { expect, test } from "./fixtures"
import { signIn } from "./support/auth"
import { adminClient } from "./support/test-data"

test("admin reviews photo and report queues with one combined pending badge", async ({ page, testData }) => {
  const service = adminClient()
  const owner = await testData.createUser()
  const voters = await Promise.all(Array.from({ length: 5 }, () => testData.createUser()))
  const admin = await testData.createUser()
  const { error: roleError } = await service.from("profiles").update({ rol_id: 1 }).eq("id", admin.id)
  expect(roleError).toBeNull()
  const report = await testData.createReport(owner)
  const { error: voteError } = await service.from("votos_no_existe").insert(
    voters.map((voter) => ({ reporte_id: report.id, usuario_id: voter.id })),
  )
  expect(voteError).toBeNull()
  const { count, error: countError } = await service.from("moderacion_imagenes")
    .select("id", { count: "exact", head: true }).eq("decision", "REVIEW").eq("estado_publicacion", "pendiente")
  expect(countError).toBeNull()
  const imageId = randomUUID()

  try {
    const { error: insertError } = await service.from("moderacion_imagenes").insert({
      id: imageId, reporte_id: report.id, propietario_id: owner.id,
      hash_sha256: "0".repeat(64), path_privado: `${owner.id}/${imageId}`,
    })
    expect(insertError).toBeNull()

    await signIn(page, admin)
    await page.goto("/admin")
    const desktopNav = page.getByRole("navigation", { name: "Navegación de administración", exact: true })
    await expect(desktopNav.getByLabel(`${(count ?? 0) + 2} revisiones pendientes`)).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await page.getByText("Menú", { exact: true }).click()
    await expect(page.getByRole("navigation", { name: "Navegación de administración móvil" })
      .getByLabel(`${(count ?? 0) + 2} revisiones pendientes`)).toBeVisible()

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/admin/moderacion")
    const reviewNav = page.getByRole("navigation", { name: "Tipos de revisión" })
    await expect(reviewNav.getByRole("link", { name: "Fotos", exact: true })).toHaveAttribute("aria-current", "page")
    await reviewNav.getByRole("link", { name: "Reportes", exact: true }).click()
    await expect(page).toHaveURL(/tipo=reportes/)

    const reviewCard = page.locator('[data-slot="card"]').filter({ hasText: report.titulo }).first()
    await expect(reviewCard).toBeVisible()
    await expect(reviewCard.getByText(/5 votos.*No existe/i)).toBeVisible()
    for (const voter of voters) await expect(page.getByText(voter.username, { exact: true })).toHaveCount(0)
    await reviewCard.getByRole("button", { name: "Rechazar reporte" }).click()
    await expect(page.getByText(report.titulo, { exact: true })).toHaveCount(0)
    await expect(page.getByText("No hay reportes pendientes de revisión.", { exact: true })).toBeVisible()

    await page.goto(`/reportes/${report.id}`)
    await expect(page.getByText("Rechazado", { exact: true })).toBeVisible()
    await page.goto("/admin")
    await expect(page.getByRole("navigation", { name: "Navegación de administración", exact: true })
      .getByLabel(`${(count ?? 0) + 1} revisiones pendientes`)).toBeVisible()
  } finally {
    const { error } = await service.from("moderacion_imagenes").delete().eq("id", imageId)
    expect(error).toBeNull()
  }
})
