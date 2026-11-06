import Image from "next/image"
import Link from "next/link"
import { Calendar, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { MascotaLista } from "@/database/queries/mascotas/listado"

export function MascotaCompactCard({ pet }: { pet: MascotaLista }) {
  return <Link href={`/mascotas/${pet.id}`} className="group block">
    <Card className="incident-card overflow-hidden border-border/70 bg-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
      <CardContent className="px-3 py-0 sm:px-4"><div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="size-20 flex-none overflow-hidden rounded-[1.25rem] bg-surface-subtle shadow-inner sm:size-24">
          <Image src={pet.image || "/placeholder.svg"} alt={pet.title} width={96} height={96} sizes="(min-width: 640px) 96px, 76px" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <h2 className="line-clamp-1 text-xs font-bold tracking-tight text-foreground" title={pet.title}>{pet.title}</h2>
          <p className="line-clamp-1 text-[11px] leading-4 text-muted-foreground" title={pet.description}>{pet.description}</p>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Calendar className="size-3.5" />{new Date(pet.createdAt).toLocaleDateString("es-AR")}</span>
        </div>
        <div className="flex min-w-0 flex-col items-end gap-1.5">
          <Badge variant="secondary" className="max-w-24 truncate px-1 py-0.5 text-[8px] sm:px-2 sm:py-1 sm:text-[10px]">{pet.type}</Badge>
          <Badge variant={pet.status === "Perdida" ? "destructive" : "default"} className="max-w-24 truncate px-1 py-0.5 text-[8px] sm:px-2 sm:py-1 sm:text-[10px]">{pet.status}</Badge>
        </div>
        <ChevronRight className="size-5 flex-none text-muted-foreground/70" aria-hidden="true" />
      </div></CardContent>
    </Card>
  </Link>
}
