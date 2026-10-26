/**
 * "Mis reportes": lists the reports owned by the current Supabase identity, guest or
 * permanent. It only reads the existing session and never creates an anonymous user.
 */

import Link from "next/link"
import { CheckCircle2, ClipboardList, FileText, Info, KeyRound, Plus, ShieldCheck } from "lucide-react"

import { LinkEmailForm } from "@/components/guest-account/link-email-form"
import { SetPasswordForm } from "@/components/guest-account/set-password-form"
import { PageTitleBar } from "@/components/page-title-bar"
import { ReportCompactCard } from "@/components/report-compact-card"
import { SignOutSection } from "@/components/sign-out-section"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getDashboardUserReports } from "@/database/queries/reportes/get-reportes"
import { needsPasswordSetup } from "@/lib/authz/guest-account"
import { isAnonymousUser } from "@/lib/authz/roles"
import { createClient } from "@/utils/supabase/server"

type MisReportesPageProps = {
  searchParams: Promise<{ cuenta?: string }>
}

export default async function MisReportesPage({ searchParams }: MisReportesPageProps) {
  const { cuenta } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="page-shell">
        <div className="page-container page-stack">
          <PageTitleBar
            icon={<ClipboardList className="size-4" />}
            title="Mis reportes"
            description="Revisá los reportes que enviaste."
          />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Info className="size-5 text-[var(--semantic-info)]" aria-hidden="true" />
                No encontramos una sesión en este navegador
              </CardTitle>
              <CardDescription>
                Tus reportes aparecen acá cuando reportás desde este navegador, como invitado o con tu cuenta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                Si ya reportaste como invitado y eliminaste los datos del sitio, tus reportes siguen publicados, pero no
                podemos recuperar tu identidad de invitado automáticamente.
              </p>
              <p>Si guardaste tu cuenta con un correo, ingresá con ese correo para volver a verlos.</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild className="flex-1">
                  <Link href="/reportes/nuevo">
                    <Plus className="size-4" aria-hidden="true" />
                    Reportar incidencia
                  </Link>
                </Button>
                <Button asChild variant="outline" className="flex-1">
                  <Link href="/auth?next=/mis-reportes">Ingresar</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const isGuest = isAnonymousUser(user)
  const passwordPending = needsPasswordSetup(user)
  const { data: reports } = await getDashboardUserReports(user.id)

  return (
    <div className="page-shell">
      <div className={`page-container ${isGuest ? "space-y-6 md:space-y-8 lg:space-y-10" : "page-stack"}`}>
        <PageTitleBar
          icon={<ClipboardList className="size-4" />}
          title="Mis reportes"
          description="Revisá los reportes que enviaste."
        />

        {passwordPending && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="size-5 text-primary" aria-hidden="true" />
                Creá tu contraseña
              </CardTitle>
              <CardDescription>
                Confirmaste {user.email}. Último paso: creá una contraseña para ingresar desde cualquier dispositivo con tu
                correo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SetPasswordForm />
            </CardContent>
          </Card>
        )}

        {cuenta === "lista" && !isGuest && !passwordPending && (
          <Alert>
            <CheckCircle2 className="size-4" aria-hidden="true" />
            <AlertTitle>¡Cuenta lista!</AlertTitle>
            <AlertDescription>
              Desde ahora ingresás con {user.email} y tu contraseña desde cualquier dispositivo.
            </AlertDescription>
          </Alert>
        )}

        {cuenta === "vinculada" && !isGuest && !passwordPending && (
          <Alert>
            <CheckCircle2 className="size-4" aria-hidden="true" />
            <AlertTitle>¡Cuenta guardada!</AlertTitle>
            <AlertDescription>
              Tus reportes quedaron vinculados a {user.email}. Ya podés ingresar desde cualquier dispositivo.
            </AlertDescription>
          </Alert>
        )}

        {isGuest && (
          <Alert>
            <Info className="size-4" aria-hidden="true" />
            <AlertDescription>
              Estás usando Reporty como invitado. Tus reportes están vinculados a este navegador. Si eliminás los datos
              del sitio, podrías perder el acceso. Vinculá tu correo para conservar tu cuenta.
            </AlertDescription>
          </Alert>
        )}

        <section aria-label="Listado de mis reportes" className="space-y-3">
          {reports.length > 0 ? (
            reports.map((report) => (
              <ReportCompactCard
                key={report.id}
                id={report.id}
                title={report.titulo}
                description={report.descripcion}
                category={report.categoria}
                priority={report.prioridad}
                status={report.estado}
                createdAt={report.createdAt}
                image={report.imageUrl}
              />
            ))
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <FileText className="size-10 text-muted-foreground opacity-60" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Todavía no creaste reportes desde esta cuenta.</p>
                <Button asChild size="sm">
                  <Link href="/reportes/nuevo">
                    <Plus className="size-4" aria-hidden="true" />
                    Reportar incidencia
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </section>

        {isGuest && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
                Guardar mi cuenta
              </CardTitle>
              <CardDescription>
                Vinculá tu correo para ver tus reportes desde cualquier dispositivo. Confirmás el correo, creás tu
                contraseña y ya podés ingresar, comentar, votar y sumar puntos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LinkEmailForm pendingEmail={user.new_email ?? null} />
            </CardContent>
          </Card>
        )}

        {isGuest && <SignOutSection guest />}
      </div>
    </div>
  )
}
