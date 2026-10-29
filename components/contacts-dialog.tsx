"use client"

import { Mail, MessageCircle, Phone, Siren } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const CONTACT_GROUPS = {
  alumbrado: [
    ["EMSA", "3764242513", "phone"],
    ["Atención al Vecino", "3764140677", "phone"],
    ["Defensoría del pueblo", "3764125611", "phone"],
    ["Planificación estratégica", "3764449087 (llamada)", "phone"],
    ["Planificación estratégica", "sec_planificacion@posadas.gov.ar", "email"],
  ],
  baches: [
    ["Atención al Vecino", "3764140677", "phone"],
    ["Defensoría del pueblo", "3764125611", "phone"],
    ["Planificación estratégica", "3764449087 (llamada)", "phone"],
    ["Planificación estratégica", "sec_planificacion@posadas.gov.ar", "email"],
    ["Movilidad Urbana", "3764188865 (llamada)", "phone"],
    ["Movilidad Urbana", "movilidadurbana@posadas.gov.ar", "email"],
  ],
  arboles: [
    ["Atención al Vecino", "3764140677", "phone"],
    ["Defensoría del pueblo", "3764125611", "phone"],
    ["Planificación estratégica", "3764449087 (llamada)", "phone"],
    ["Planificación estratégica", "sec_planificacion@posadas.gov.ar", "email"],
  ],
  residuos: [
    ["Atención al Vecino", "3764140677", "phone"],
    ["Defensoría del pueblo", "3764125611", "phone"],
    ["Planificación estratégica", "3764449087 (llamada)", "phone"],
    ["Planificación estratégica", "sec_planificacion@posadas.gov.ar", "email"],
  ],
  seguridad: [
    ["Atención al Vecino", "3764140677", "phone"],
    ["Defensoría del pueblo", "3764125611", "phone"],
    ["Planificación estratégica", "3764449087 (llamada)", "phone"],
    ["Planificación estratégica", "sec_planificacion@posadas.gov.ar", "email"],
  ],
  semaforo: [
    ["Atención al Vecino", "3764140677", "phone"],
    ["Defensoría del pueblo", "3764125611", "phone"],
    ["Planificación estratégica", "3764449087 (llamada)", "phone"],
    ["Planificación estratégica", "sec_planificacion@posadas.gov.ar", "email"],
    ["Movilidad Urbana", "3764188865 (llamada)", "phone"],
    ["Movilidad Urbana", "movilidadurbana@posadas.gov.ar", "email"],
  ],
  agua: [
    ["EPRAC", "3765046100", "phone"],
    ["Atención al Vecino", "3764140677", "phone"],
    ["Defensoría del pueblo", "3764125611", "phone"],
    ["Planificación estratégica", "3764449087 (llamada)", "phone"],
    ["Planificación estratégica", "sec_planificacion@posadas.gov.ar", "email"],
  ],
  otros: [
    ["Atención al Vecino", "3764140677", "phone"],
    ["Defensoría del pueblo", "3764125611", "phone"],
    ["Planificación estratégica", "3764449087 (llamada)", "phone"],
    ["Planificación estratégica", "sec_planificacion@posadas.gov.ar", "email"],
  ],
} as const

const GROUP_LABELS: Record<keyof typeof CONTACT_GROUPS, string> = {
  alumbrado: "Alumbrado",
  baches: "Baches",
  arboles: "Árboles caídos",
  residuos: "Residuos",
  seguridad: "Seguridad",
  semaforo: "Semáforo",
  agua: "Agua",
  otros: "Otros",
}

const EMERGENCIES = [
  ["911", "Emergencias generales: policía y solicitud de asistencia urgente."],
  ["100", "Bomberos: incendios y rescates."],
  ["102", "Línea de asistencia para niños, niñas y adolescentes."],
  ["103", "Defensa Civil: inundaciones, derrumbes y otras situaciones de riesgo."],
  ["105", "Emergencias ambientales."],
  ["106", "Emergencias náuticas: Prefectura Naval."],
  ["107", "Emergencias médicas. En Misiones figura como número de asistencia médica de emergencia."],
  ["109", "Número de emergencias que aparece en algunas referencias telefónicas; conviene confirmar su función local antes de utilizarlo."],
  ["130", "ANSES: consultas y trámites de seguridad social."],
  ["135", "Prevención del suicidio y asistencia en crisis emocionales."],
  ["137", "Asistencia a víctimas de violencia familiar y sexual."],
  ["142", "Denuncias e información sobre chicos y chicas extraviados."],
  ["144", "Atención y asesoramiento por violencia de género."],
  ["145", "Denuncias por trata de personas."],
] as const

type Contact = (typeof CONTACT_GROUPS)[keyof typeof CONTACT_GROUPS][number]

function ContactRow({ contact }: { contact: Contact }) {
  const [label, value, type] = contact
  const href = type === "email" ? `mailto:${value}` : `tel:${value.replace(/\D/g, "")}`
  return (
    <div className="flex min-w-0 items-start justify-between gap-2 rounded-xl border border-border/70 bg-muted/30 px-2.5 py-2 text-xs sm:px-3 sm:py-2.5 sm:text-sm">
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <a href={href} className="inline-flex min-w-0 shrink break-all items-center justify-end gap-1 text-right font-medium text-primary hover:underline">
        {type === "email" ? <Mail className="size-3.5" aria-hidden="true" /> : <Phone className="size-3.5" aria-hidden="true" />}
        {value}
      </a>
    </div>
  )
}

export function ContactsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 rounded-full bg-background/70 text-foreground shadow-sm hover:bg-background">
          <Phone className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Contactos</span>
          <span className="sr-only sm:hidden">Contactos</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl min-w-0 gap-2 overflow-x-hidden p-2.5 sm:gap-3 sm:p-5">
        <DialogHeader className="pr-2">
          <DialogTitle className="text-base sm:text-2xl">Contactos</DialogTitle>
          <DialogDescription className="text-[11px] sm:text-sm">Canales de atención por tipo de reporte y emergencias.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="contactos" className="min-w-0">
          <TabsList className="grid w-full shrink-0 grid-cols-2 gap-0">
            <TabsTrigger value="contactos" className="min-h-8 min-w-0 px-1 py-1 text-xs sm:text-sm data-[state=active]:border-primary data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground">Contactos</TabsTrigger>
            <TabsTrigger value="emergencias" className="min-h-8 min-w-0 gap-1 px-1 py-1 text-xs sm:text-sm data-[state=active]:border-primary data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground"><Siren className="size-3.5" /> Emergencias</TabsTrigger>
          </TabsList>
          <TabsContent value="contactos" className="space-y-2">
            <Tabs defaultValue="alumbrado" className="min-w-0">
              <TabsList className="w-full max-w-full justify-between overflow-x-auto [&>[data-slot=tabs-trigger]]:min-h-8 [&>[data-slot=tabs-trigger]]:flex-none [&>[data-slot=tabs-trigger]]:shrink-0 [&>[data-slot=tabs-trigger]]:px-2 [&>[data-slot=tabs-trigger]]:text-xs">
                {(Object.keys(CONTACT_GROUPS) as Array<keyof typeof CONTACT_GROUPS>).map((group) => (
                  <TabsTrigger key={group} value={group}>{GROUP_LABELS[group]}</TabsTrigger>
                ))}
              </TabsList>
              {(Object.keys(CONTACT_GROUPS) as Array<keyof typeof CONTACT_GROUPS>).map((group) => (
                <TabsContent key={group} value={group} className="grid gap-1 sm:grid-cols-2">
                  {CONTACT_GROUPS[group].map((contact, index) => <ContactRow key={`${group}-${index}`} contact={contact} />)}
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>
          <TabsContent value="emergencias" className="grid max-h-[40dvh] grid-cols-1 content-start gap-1 overflow-y-auto sm:max-h-none sm:grid-cols-2 sm:overflow-visible">
            {EMERGENCIES.map(([number, description]) => (
              <div key={number} className="rounded-xl border border-border/70 bg-muted/30 px-2 py-1.5 text-[11px] leading-4 sm:px-3 sm:py-2.5 sm:text-sm">
                <a href={`tel:${number}`} className="font-semibold text-primary hover:underline">{number}</a>
                <p className="mt-0.5 text-muted-foreground sm:mt-1">{description}</p>
              </div>
            ))}
          </TabsContent>
        </Tabs>
        <DialogFooter className="flex-col gap-1.5 border-t pt-1 sm:flex-col sm:justify-start">
          <Button asChild variant="outline" className="h-auto min-h-0 w-full py-1">
            <a href="https://wa.me/5493764241856" className="flex flex-col items-center gap-0.5">
              <span className="inline-flex items-center gap-1.5"><MessageCircle className="size-4" aria-hidden="true" />Contactanos</span>
              <span className="text-xs font-normal">+54 9 3764 24-1856</span>
            </a>
          </Button>
          <p className="w-full text-center text-[10px] leading-none text-muted-foreground">
            Creado por <a href="https://god.com.ar" className="font-semibold" aria-label="GOD, god.com.ar"><span className="text-black">G</span><span className="text-black">O</span><span className="text-violet-600">D</span></a>
          </p>
          <DialogClose asChild>
            <Button type="button" size="sm" className="w-full sm:w-auto">Entendido</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
