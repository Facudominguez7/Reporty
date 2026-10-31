export { canShowReportContacts } from "./eligibility"

import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveReportMunicipality } from "../map/report-coverage"

export type ReportContact = {
  id: number
  organization: string
  purpose: string
  channel_type: "phone" | "whatsapp" | "email" | "form"
  channel_value: string
  verification_status: "pending" | "verified" | "disabled"
}

export async function getReportContacts(client: SupabaseClient, latitude: number, longitude: number, category: string) {
  const municipality = resolveReportMunicipality(latitude, longitude)
  if (!municipality) return []
  const { data, error } = await client.from("report_contact_directory")
    .select("id, organization, purpose, channel_type, channel_value, verification_status")
    .eq("municipality", municipality).eq("category", category)
    .order("priority", { ascending: true }).order("id", { ascending: true })
  if (error) throw error
  return (data ?? []) as ReportContact[]
}

export function createContactDraft(input: { category: string; description: string; latitude: number; longitude: number; date: string; reportUrl?: string }) {
  return [`Categoría: ${input.category}`, `Descripción: ${input.description}`, `Ubicación: ${input.latitude}, ${input.longitude}`, `Fecha: ${input.date}`, ...(input.reportUrl ? [`Reporte: ${input.reportUrl}`] : [])].join("\n")
}

export function contactHref(type: ReportContact["channel_type"], value: string, draft: string) {
  if (type === "phone") return `tel:${value.replace(/[^+\d]/g, "")}`
  if (type === "email") return `mailto:${encodeURIComponent(value)}?subject=${encodeURIComponent("Reporte ciudadano")}&body=${encodeURIComponent(draft)}`
  if (type === "whatsapp") {
    const digits = value.replace(/\D/g, "")
    const number = digits.length === 10 ? `549${digits}`
      : digits.length === 12 && digits.startsWith("54") ? `549${digits.slice(2)}`
      : digits
    return `https://wa.me/${number}?text=${encodeURIComponent(draft)}`
  }
  return null
}
