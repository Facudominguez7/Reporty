"use client"

import { useEffect, useRef, useState } from "react"
import { Search, X } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function buildMascotasSearchHref(search: string, value: string, pathname = "/reportes") {
  const params = new URLSearchParams(search)
  const query = value.trim()
  if (query) params.set("searchMascota", query)
  else params.delete("searchMascota")
  params.delete("offset")
  return params.toString() ? `${pathname}?${params.toString()}` : pathname
}

export function BuscadorMascotas() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(() => searchParams.get("searchMascota") ?? "")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const updateSearch = (nextValue: string) => {
    setValue(nextValue)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      router.replace(buildMascotasSearchHref(searchParams.toString(), nextValue, pathname))
    }, 250)
  }

  const clearSearch = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setValue("")
    router.replace(buildMascotasSearchHref(searchParams.toString(), "", pathname))
  }

  return (
    <div className="relative w-full">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={value}
        onChange={(event) => updateSearch(event.target.value)}
        placeholder="Buscar mascotas..."
        aria-label="Buscar mascotas"
        className="h-11 rounded-full border-border/70 bg-card/80 pl-11 pr-11 shadow-sm"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={clearSearch}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full text-muted-foreground hover:text-foreground"
          aria-label="Limpiar búsqueda de mascotas"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}
