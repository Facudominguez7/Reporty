import { Award, CheckCircle2, ChevronRight, Clock3, FileText, Medal, Trophy, Users, UsersRound } from "lucide-react"
import Link from "next/link"

import { getComunidadPageData } from "@/database/queries/comunidad"
import { getUserInitials } from "@/lib/identity/display"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageTitleBar } from "@/components/page-title-bar"
import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo/site"

const rankingVariants = ["ranking-first", "ranking-second", "ranking-third"] as const
const rankingIcons = [Trophy, Medal, Award] as const

export const metadata: Metadata = pageMetadata({
  title: "Comunidad",
  description:
    "Los vecinos que más aportan a Reporty y cuántos problemas de Posadas, Misiones, ya se reportaron y se resolvieron.",
  path: "/comunidad",
})

export default async function ComunidadPage() {
  const data = await getComunidadPageData()

  const summary = [
    { label: "Miembros", description: "Personas registradas", value: data.members, icon: Users, href: null },
    { label: "Reportes totales", description: "Reportes públicos", value: data.totalReports, icon: FileText, href: "/reportes" },
    { label: "Resueltos", description: "Casos solucionados", value: data.solvedReports, icon: CheckCircle2, href: "/reportes?estado=Reparado" },
    { label: "Pendientes", description: "Casos por atender", value: data.pendingReports, icon: Clock3, href: "/reportes?estado=Pendiente" },
  ]

  const topContributors = data.contributors.slice(0, 3)
  const remainingContributors = data.contributors.slice(3)

  return (
    <div className="page-shell">
      <div className="page-container page-stack">
        <section className="space-y-3">
          <PageTitleBar
            icon={<UsersRound className="size-4" />}
            title="Comunidad"
            description="Conocé la participación de la comunidad."
          />
          <Tabs defaultValue="ranking" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ranking">Ranking</TabsTrigger>
              <TabsTrigger value="reports">Reportes</TabsTrigger>
            </TabsList>

          <TabsContent value="ranking" className="space-y-2 pt-2">
            <section aria-labelledby="ranking-destacado">
              <Card className="gap-0 py-3">
                <CardHeader className="px-4 pb-2"><CardTitle id="ranking-destacado" className="text-secondary">Personas que más reportan</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {topContributors.length === 0 ? (
                    <div className="rounded-[var(--radius)] border border-dashed p-8 text-center">
                      <p className="font-semibold">Todavía no hay colaboradores para mostrar.</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">Sé la primera persona en sumar un reporte público a la comunidad.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-1 py-2 sm:gap-2">
                      {topContributors.map((contributor, index) => {
                        const rank = index + 1
                        const RankIcon = rankingIcons[index]
                        return (
                          <div key={contributor.id} className="flex min-w-0 flex-col items-center gap-1 px-1 py-1 text-center sm:px-2">
                            <Badge
                              variant={rankingVariants[index]}
                              className="size-14 rounded-full border-2 border-background text-base font-bold leading-none shadow-sm sm:size-16"
                              aria-label={`Puesto ${rank}: ${contributor.username}`}
                            >
                              <RankIcon className="!size-5" aria-hidden="true" />
                              <span>{rank}</span>
                            </Badge>
                            <p className="w-full break-words text-xs font-semibold leading-5">{contributor.username}</p>
                            <p className="ranking-points text-xs font-semibold">{contributor.points} puntos</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            {remainingContributors.length > 0 && (
              <section aria-labelledby="ranking-completo">
                <Card className="gap-0">
                  <CardHeader><CardTitle id="ranking-completo" className="text-secondary">Ranking completo</CardTitle></CardHeader>
                  <CardContent className="divide-y p-0">
                    {remainingContributors.map((contributor, index) => {
                      const rank = index + 4
                      return (
                        <div key={contributor.id} className="flex items-center gap-3 px-5 py-3">
                          <span className="flex size-8 shrink-0 items-center justify-center text-sm font-semibold text-muted-foreground" aria-label={`Puesto ${rank}`}>{rank}</span>
                          <Avatar className="size-10 border border-border">
                            <AvatarFallback>{getUserInitials(contributor.username)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold">{contributor.username}</p>
                          </div>
                          <div className="text-right">
                            <p className="ranking-points font-semibold">{contributor.points}</p>
                            <p className="text-xs text-muted-foreground">puntos</p>
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              </section>
            )}
          </TabsContent>

          <TabsContent value="reports" className="space-y-4 pt-2" aria-labelledby="resumen-comunidad">
            <h2 id="resumen-comunidad" className="sr-only">Resumen de reportes de la comunidad</h2>
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {summary.map(({ label, description, value, icon: Icon, href }) => {
                  const content = (
                    <>
                      <Icon className="size-4 shrink-0 text-secondary" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="text-xs text-muted-foreground">{description}</p>
                      </div>
                      <p className="text-lg font-semibold tracking-tight">{value}</p>
                      {href && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    </>
                  )

                  return href ? (
                    <Link
                      key={label}
                      href={href}
                      aria-label={`${label}: ${description}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div key={label} className="flex items-center gap-3 px-5 py-3">
                      {content}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  )
}
