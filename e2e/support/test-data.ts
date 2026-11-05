import { randomUUID } from "node:crypto"
import { execFileSync } from "node:child_process"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { deleteAuthEmailsTo } from "./mailpit"

/** Posadas downtown, so test reports land inside the map's area. */
export const POSADAS = { lat: -27.3671, lon: -55.8961 }

export const TEST_PASSWORD = "E2e-Password-123!"

export function adminClient(): SupabaseClient {
  const url = process.env.E2E_SUPABASE_URL
  const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Run the E2E suite with `npx playwright test`, which sets the local Supabase keys.")
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** A short random tag that makes every test's rows easy to find and impossible to confuse. */
export function uniqueTag() {
  return `e2e-${randomUUID().slice(0, 8)}`
}

/**
 * Deletes the rows that reference a report with `on delete restrict` and that the service role
 * cannot remove: those tables grant it read (and update) access only, so the test data would
 * outlive the test. Arithmetic identifiers keep the statement free of injected values.
 *
 * @param reportIds - Reports about to be deleted.
 */
function borrarFilasRestringidas(reportIds: number[]) {
  const url = process.env.E2E_SUPABASE_DB_URL
  if (!url) throw new Error("Run the E2E suite with `npx playwright test`, which exports the local database URL.")
  const ids = reportIds.join(",")
  const consulta = [
    `delete from public.avisos_retiro_reporte where reporte_id in (${ids});`,
    `delete from public.puntos_creacion_reporte where reporte_id in (${ids});`,
    `delete from public.reservas_moderacion where solicitud in (select id from public.moderacion_imagenes where reporte_id in (${ids}));`,
    `delete from public.moderacion_imagenes where reporte_id in (${ids});`,
  ].join("\n")

  try {
    execFileSync("psql", [url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", consulta], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    })
  } catch {
    throw new Error("Could not delete the restricted rows of the tracked reports from the local database.")
  }
}

export type TestUser = { id: string; email: string; password: string; username: string }

/**
 * Creates the users and reports a test needs and, once the test ends, hard-deletes every row and
 * storage object it created: reports (with their photos, votes, moderation queue, awarded points
 * and history), then auth users (which removes their profiles), then the auth emails they got.
 * Pre-existing rows are never touched.
 */
export class TestData {
  private readonly supabase = adminClient()
  private readonly userIds = new Set<string>()
  private readonly reportIds = new Set<number>()
  private readonly mailboxes = new Set<string>()

  /** Tracks a user created through the app itself, such as one who signs up in a test. */
  trackUser(id: string) {
    this.userIds.add(id)
  }

  /** Remembers an address whose auth emails must be deleted from Mailpit. */
  trackMailbox(email: string) {
    this.mailboxes.add(email)
  }

  /** An address no account uses yet, for tests that sign up through the app. */
  newEmail() {
    const email = `${uniqueTag()}@e2e.reporty.test`
    this.trackMailbox(email)
    return email
  }

  async trackUserByEmail(email: string) {
    const { data, error } = await this.supabase.from("profiles").select("id").eq("email", email).maybeSingle()
    if (error) throw error
    if (data) this.trackUser(data.id)
  }

  async createUser({ confirmed = true }: { confirmed?: boolean } = {}): Promise<TestUser> {
    const tag = uniqueTag()
    const email = `${tag}@e2e.reporty.test`
    const { data, error } = await this.supabase.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: confirmed,
    })
    if (error || !data.user) throw error ?? new Error("Could not create the test user")
    this.trackUser(data.user.id)
    this.trackMailbox(email)

    const username = tag.replace("-", "_")
    const { error: profileError } = await this.supabase.from("profiles").update({ username }).eq("id", data.user.id)
    if (profileError) throw profileError

    return { id: data.user.id, email, password: TEST_PASSWORD, username }
  }

  async createReport(owner: TestUser, fields: { titulo?: string; descripcion?: string; estadoId?: number } = {}) {
    const { data, error } = await this.supabase
      .from("reportes")
      .insert({
        usuario_id: owner.id,
        titulo: fields.titulo ?? `Bache de prueba ${uniqueTag()}`,
        descripcion: fields.descripcion ?? "Reporte creado por las pruebas automáticas.",
        categoria_id: 1,
        prioridad_id: 2,
        estado_id: fields.estadoId ?? 1,
        lat: POSADAS.lat,
        lon: POSADAS.lon,
      })
      .select("id, titulo")
      .single()
    if (error) throw error
    this.reportIds.add(data.id)
    return data as { id: number; titulo: string }
  }

  /**
   * Tracks a report created through the app, and its owner, by its unique title. Covers guests,
   * whose anonymous identity is created in the browser.
   */
  async trackReportByTitle(titulo: string) {
    const { data, error } = await this.supabase.from("reportes").select("id, usuario_id").eq("titulo", titulo).single()
    if (error) throw error
    this.reportIds.add(data.id)
    this.trackUser(data.usuario_id)
    return data as { id: number; usuario_id: string }
  }

  /** Size in bytes of each stored photo of a report and its thumbnail. */
  async storedPhotoSizes(reportId: number) {
    const { data, error } = await this.supabase
      .from("fotos_reporte")
      .select("path, thumbnail_path")
      .eq("reporte_id", reportId)
    if (error) throw error

    const sizeOf = async (path: string | null) => {
      if (!path) return null
      const { data: file, error: downloadError } = await this.supabase.storage.from("reportes").download(path)
      if (downloadError) throw downloadError
      return file.size
    }

    return Promise.all(
      data.map(async (photo) => ({ photo: await sizeOf(photo.path), thumbnail: await sizeOf(photo.thumbnail_path) })),
    )
  }

  /** Tracks reports created through the app, by their owner. */
  async trackReportsOf(userId: string) {
    const { data, error } = await this.supabase.from("reportes").select("id").eq("usuario_id", userId)
    if (error) throw error
    for (const { id } of data) this.reportIds.add(id)
  }

  /**
   * Deletes the private moderation queue of tracked reports. Its rows reference the report
   * with `on delete restrict`, and its private photo lives in a bucket of its own, so both
   * must go before the report itself.
   *
   * @param reportIds - Reports whose moderation rows must disappear first.
   */
  private async cleanupModeracion(reportIds: number[]) {
    const { data: filas, error } = await this.supabase
      .from("moderacion_imagenes")
      .select("id, path_privado")
      .in("reporte_id", reportIds)
    if (error) throw error

    if (filas.length > 0) {
      const privados = filas.map((fila) => fila.path_privado)
      const { error: privadoError } = await this.supabase.storage.from("reportes-pendientes").remove(privados)
      if (privadoError) throw privadoError

      // Published copies live under `<moderacion id>/`, whatever their token was.
      for (const { id } of filas) {
        const { data: objetos, error: listError } = await this.supabase.storage.from("reportes").list(id)
        if (listError) throw listError
        const paths = objetos.map((objeto) => `${id}/${objeto.name}`)
        if (paths.length === 0) continue
        const { error: publicoError } = await this.supabase.storage.from("reportes").remove(paths)
        if (publicoError) throw publicoError
      }
    }

    borrarFilasRestringidas(reportIds)
  }

  async cleanup() {
    for (const userId of this.userIds) await this.trackReportsOf(userId)
    const reportIds = [...this.reportIds]

    if (reportIds.length > 0) {
      const { data: photos, error } = await this.supabase
        .from("fotos_reporte")
        .select("path, thumbnail_path")
        .in("reporte_id", reportIds)
      if (error) throw error

      const paths = photos.flatMap((photo) => [photo.path, photo.thumbnail_path]).filter(Boolean) as string[]
      if (paths.length > 0) {
        const { error: storageError } = await this.supabase.storage.from("reportes").remove(paths)
        if (storageError) throw storageError
      }

      await this.cleanupModeracion(reportIds)

      const { error: deleteError } = await this.supabase.from("reportes").delete().in("id", reportIds)
      if (deleteError) throw deleteError
    }

    for (const userId of this.userIds) {
      const { error } = await this.supabase.auth.admin.deleteUser(userId)
      if (error && !/not found/i.test(error.message)) throw error
    }

    for (const email of this.mailboxes) await deleteAuthEmailsTo(email)

    this.reportIds.clear()
    this.userIds.clear()
    this.mailboxes.clear()
  }
}
