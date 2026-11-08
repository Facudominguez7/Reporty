import { NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isSafeInteger(id) || id <= 0) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } })

  const supabase = createAdminClient()
  const { data: pet, error } = await supabase.from("mascotas_perdidas")
    .select("foto_path").eq("id", id).eq("moderacion_estado", "aprobada").is("retirada_at", null).maybeSingle()
  if (error || !pet) return new NextResponse(null, { status: error ? 500 : 404, headers: { "Cache-Control": "private, no-store" } })

  const { data: photo, error: photoError } = await supabase.storage.from("reportes").download(pet.foto_path)
  if (photoError || !photo) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } })
  return new NextResponse(photo, { headers: { "Content-Type": photo.type || "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
}
