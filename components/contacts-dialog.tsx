"use client"

import { useEffect, useState } from "react"
import { Phone, Siren } from "lucide-react"
import { contactHref, getMunicipalityContacts, type ReportContact } from "@/lib/report-contacts/contact-actions"
import { createClient } from "@/utils/supabase/client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const GROUP_LABELS = {
  Alumbrado: "Alumbrado",
  Bache: "Baches",
  "Arbol caido": "Árboles caídos",
  Residuos: "Residuos",
  Seguridad: "Seguridad",
  Semaforo: "Semáforo",
  Agua: "Agua",
  Otros: "Otros",
} as const

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

export function ContactRow({ contact }: { contact: ReportContact }) {
  const href = contactHref(contact.channel_type, contact.channel_value, "")
  const channel = contact.channel_type === "phone" ? "Teléfono" : contact.channel_type === "whatsapp" ? "WhatsApp" : contact.channel_type === "email" ? "Correo" : "Formulario"
  const action = contact.channel_type === "phone" ? "Llamar" : contact.channel_type === "whatsapp" ? "Abrir WhatsApp" : "Redactar correo"
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/30 px-2.5 py-2 text-xs sm:text-sm">
      <span className="min-w-0 break-all"><span className="font-medium">{contact.organization}</span><br /><span className="text-muted-foreground">{channel}{contact.channel_type === "form" ? "" : ` · ${contact.channel_value}`}</span></span>
      {href && <a href={href} aria-label={`${action}: ${contact.organization}`} className="shrink-0 font-medium text-primary hover:underline">{action}</a>}
    </div>
  )
}

export function ContactsDialog() {
  const [open, setOpen] = useState(false)
  const [municipality, setMunicipality] = useState("Posadas")
  const [category, setCategory] = useState<keyof typeof GROUP_LABELS>("Alumbrado")
  const [result, setResult] = useState<{ key: string; contacts?: ReportContact[]; failed?: boolean } | null>(null)
  const key = `${municipality}:${category}`

  useEffect(() => {
    if (!open) return
    let active = true
    getMunicipalityContacts(createClient(), municipality, category).then(
      (contacts) => { if (active) setResult({ key, contacts }) },
      () => { if (active) setResult({ key, failed: true }) },
    )
    return () => { active = false }
  }, [open, municipality, category, key])

  const current = result?.key === key ? result : null
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setResult(null); setOpen(nextOpen) }}>
      <DialogTrigger asChild>
        <Button variant="liquid-glass" size="sm" className="size-9 p-0 gap-1.5 sm:size-auto sm:px-3.5">
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
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0 space-y-1">
            <Label htmlFor="contact-city" className="text-xs">Ciudad</Label>
            <Select value={municipality} onValueChange={(value) => { setResult(null); setMunicipality(value) }}>
              <SelectTrigger id="contact-city" className="w-full min-w-0"><SelectValue /></SelectTrigger>
              <SelectContent className="w-full">
                <SelectItem value="Posadas">Posadas</SelectItem><SelectItem value="Candelaria">Candelaria</SelectItem><SelectItem value="Garupá">Garupá</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1">
            <Label htmlFor="contact-category" className="text-xs">Tipo de reporte</Label>
            <Select value={category} onValueChange={(value) => { setResult(null); setCategory(value as keyof typeof GROUP_LABELS) }}>
              <SelectTrigger id="contact-category" className="w-full min-w-0"><SelectValue /></SelectTrigger>
              <SelectContent className="w-full">
                {(Object.keys(GROUP_LABELS) as Array<keyof typeof GROUP_LABELS>).map((group) => <SelectItem key={group} value={group}>{GROUP_LABELS[group]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Tabs defaultValue="contactos" className="min-w-0">
          <TabsList className="grid w-full shrink-0 grid-cols-2 gap-0">
            <TabsTrigger value="contactos" className="min-h-8 min-w-0 px-1 py-1 text-xs sm:text-sm data-[state=active]:border-primary data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground">Contactos</TabsTrigger>
            <TabsTrigger value="emergencias" className="min-h-8 min-w-0 gap-1 px-1 py-1 text-xs sm:text-sm data-[state=active]:border-primary data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground"><Siren className="size-3.5" /> Emergencias</TabsTrigger>
          </TabsList>
          <TabsContent value="contactos" className="space-y-2">
            <div aria-live="polite" className="max-h-[40dvh] overflow-y-auto">
                {!current ? <p role="status">Cargando contactos…</p>
                  : current.failed ? <p role="status">No pudimos cargar los contactos. Intentá nuevamente más tarde.</p>
                  : current.contacts?.length === 0 ? <p role="status">No hay contactos disponibles para esta ciudad y categoría.</p>
                  : <div className="grid gap-1 sm:grid-cols-2">{current.contacts?.map((contact) => <ContactRow key={contact.id} contact={contact} />)}</div>}
            </div>
          </TabsContent>
          <TabsContent value="emergencias" className="grid max-h-[40dvh] grid-cols-1 content-start gap-1 overflow-y-auto sm:max-h-none sm:grid-cols-2 sm:overflow-visible">
            {EMERGENCIES.map(([number, description]) => (
              <div key={number} className="rounded-xl border border-border/70 bg-muted/30 px-2 py-1.5 text-xs leading-4 sm:px-3 sm:py-2.5 sm:text-sm">
                <a href={`tel:${number}`} className="font-semibold text-primary hover:underline">{number}</a>
                <p className="mt-0.5 text-muted-foreground sm:mt-1">{description}</p>
              </div>
            ))}
          </TabsContent>
        </Tabs>
        <DialogFooter className="flex-col gap-1.5 border-t pt-1 sm:flex-col sm:justify-start">
          <p className="flex w-full items-center justify-center gap-2 text-[10px] leading-none text-muted-foreground">
            <span>Creado por <a href="https://god.com.ar" className="font-semibold" aria-label="GOD, god.com.ar"><span className="text-black">G</span><span className="text-black">O</span><span className="text-violet-600">D</span></a></span>
            <a href="https://wa.me/5493764241856" className="inline-flex min-h-0 items-center py-1 text-primary hover:underline sm:min-h-11 sm:py-0" aria-label="Contactar por WhatsApp al +54 9 3764 24-1856">
              Contactar
            </a>
          </p>
          <DialogClose asChild>
            <Button type="button" size="sm" className="w-full sm:w-auto">Entendido</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
