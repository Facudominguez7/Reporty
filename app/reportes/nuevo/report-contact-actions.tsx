"use client"

import { useEffect, useRef, useState } from "react"
import { Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { contactHref, createContactDraft, getReportContacts, type ReportContact } from "@/lib/report-contacts/contact-actions"
import { createClient } from "@/utils/supabase/client"

type Props = { category: string; description: string; latitude: number; longitude: number; date: string; reportUrl: string }

export function ReportContactActions(props: Props) {
  const draft = createContactDraft(props)
  const [contacts, setContacts] = useState<ReportContact[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [hasOverflow, setHasOverflow] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    let active = true
    getReportContacts(createClient(), props.latitude, props.longitude, props.category).then(
      (data) => { if (active) setContacts(data) },
      () => { if (active) setFailed(true) },
    )
    return () => { active = false }
  }, [props.latitude, props.longitude, props.category])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const update = () => setHasOverflow(list.scrollHeight > list.clientHeight)
    const observer = new ResizeObserver(update)
    observer.observe(list)
    Array.from(list.children).forEach((child) => observer.observe(child))
    update()
    return () => observer.disconnect()
  }, [contacts, failed])

  return (
    <section className="space-y-2" aria-labelledby="contact-heading">
      <h2 id="contact-heading" className="flex items-center gap-2 font-semibold"><Building2 aria-hidden="true" className="size-4 shrink-0" />Contactar a organismos</h2>
      <p className="text-sm text-muted-foreground">Podés contactar directamente a estos organismos. Reporty no envía el mensaje ni garantiza una respuesta.</p>
      {failed ? <p role="status">No pudimos cargar los contactos. Intentá nuevamente más tarde.</p>
        : contacts === null ? <p role="status">Cargando contactos…</p>
        : contacts.length === 0 ? <p role="status">No hay contactos disponibles para esta ubicación y categoría.</p>
        : <>
        {hasOverflow && <p id="contact-scroll-hint" className="text-xs text-muted-foreground">Desplazate para ver más organismos</p>}
        <ul ref={listRef} aria-label="Lista de organismos" aria-describedby={hasOverflow ? "contact-scroll-hint" : undefined} tabIndex={0} className="max-h-40 space-y-2 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {contacts.map((contact) => {
            const href = contactHref(contact.channel_type, contact.channel_value, draft)
            const action = contact.channel_type === "phone" ? "Llamar" : contact.channel_type === "whatsapp" ? "Abrir WhatsApp" : "Redactar correo"
            const channelLabel = contact.channel_type === "phone" ? "Teléfono" : contact.channel_type === "whatsapp" ? "WhatsApp" : contact.channel_type === "email" ? "Correo" : "Formulario"
            return <li key={contact.id} className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-card px-2 py-1 text-[0.8rem]">
              <span className="flex min-w-0 flex-1 flex-col [overflow-wrap:anywhere] font-medium">
                <span>{contact.organization}</span>
                <span className="text-[0.65rem] font-normal text-muted-foreground">{channelLabel}{contact.channel_type === "form" ? "" : ` · ${contact.channel_value}`}</span>
              </span>
              {href && <Button asChild variant="default" size="xs" className="shrink-0 whitespace-nowrap"><a href={href} aria-label={`${action}: ${contact.organization}`}>
                {action}
              </a></Button>}
            </li>
          })}
        </ul></>}
    </section>
  )
}
