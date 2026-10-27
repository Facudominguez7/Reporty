import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { AUTH_EMAIL_TEMPLATES } from "./auth-email-templates"

const TEMPLATES_DIR = join(process.cwd(), "supabase/templates")

/** `npx vitest run --mode templates lib/notifications/auth-email-templates.test.ts` rewrites the files. */
const WRITE_TEMPLATES = import.meta.env.MODE === "templates"

const confirmLink = (type: string) =>
  `href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&redirect_to={{ .RedirectTo }}"`

describe("Supabase Auth email templates", () => {
  it("covers every Supabase Auth email with a Spanish subject", () => {
    expect(AUTH_EMAIL_TEMPLATES.map(({ file, subject }) => [file, subject])).toEqual([
      ["confirmation.html", "Confirmá tu cuenta de Reporty"],
      ["recovery.html", "Creá una nueva contraseña para Reporty"],
      ["email_change.html", "Confirmá tu correo en Reporty"],
      ["magic_link.html", "Tu enlace para entrar a Reporty"],
      ["invite.html", "Te invitaron a Reporty"],
      ["reauthentication.html", "Tu código de verificación de Reporty"],
    ])
  })

  it.each([
    ["confirmation.html", "email"],
    ["recovery.html", "recovery"],
    ["email_change.html", "email_change"],
    ["magic_link.html", "email"],
    ["invite.html", "invite"],
  ])("%s links to /auth/confirm on the site, never to supabase.co", (file, type) => {
    const { html } = AUTH_EMAIL_TEMPLATES.find((template) => template.file === file)!

    expect(html).toContain(confirmLink(type))
    expect(html).not.toContain("{{ .ConfirmationURL }}")
    expect(html).not.toContain("supabase.co")
  })

  it("shows the code in the reauthentication email", () => {
    const { html } = AUTH_EMAIL_TEMPLATES.find((template) => template.file === "reauthentication.html")!

    expect(html).toContain("{{ .Token }}")
    expect(html).not.toContain("/auth/confirm")
  })

  it.each(AUTH_EMAIL_TEMPLATES.map((template) => [template.file, template.html]))(
    "%s uses the shared Reporty layout served from the site",
    (_file, html) => {
      expect(html).toContain('src="{{ .SiteURL }}/email/reporty-logo.png"')
      expect(html).toContain("url('{{ .SiteURL }}/email/posadas-mapa.jpg')")
      expect(html).toContain('<html lang="es">')
      expect(html).toContain("{{ if .Data.name }}")
    },
  )

  it.each(AUTH_EMAIL_TEMPLATES.map((template) => [template.file, template.html]))(
    "supabase/templates/%s matches the generated template",
    (file, html) => {
      const path = join(TEMPLATES_DIR, file)

      if (WRITE_TEMPLATES) {
        mkdirSync(TEMPLATES_DIR, { recursive: true })
        writeFileSync(path, html)
      }

      expect(readFileSync(path, "utf8").replace(/\r\n/g, "\n"), `Regenerate with: npm run email:templates`).toBe(html)
    },
  )
})
