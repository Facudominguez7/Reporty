"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

const REVEAL_SELECTOR = ".page-container > *, .auth-shell > *"

export function ScrollReveal() {
  const pathname = usePathname()

  useEffect(() => {
    if (pathname === "/mapa" || pathname.startsWith("/mapa") || pathname === "/admin" || pathname.startsWith("/admin")) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let observer: IntersectionObserver | undefined
    let revealFrame = 0
    let hydrationDelay: number | undefined
    let loadHandler: (() => void) | undefined

    const startReveal = () => {
      hydrationDelay = window.setTimeout(() => {
        const elements = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR)).filter(
          (element) => !element.closest(".admin-workspace"),
        )

        if (!elements.length || !("IntersectionObserver" in window)) return

        revealFrame = window.requestAnimationFrame(() => {
          for (const element of elements) {
            if (element.getBoundingClientRect().top < window.innerHeight * 0.92) {
              element.classList.add("scroll-reveal-visible")
            }
          }
        })

        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue
              entry.target.classList.add("scroll-reveal-visible")
              observer?.unobserve(entry.target)
            }
          },
          { threshold: 0.08, rootMargin: "0px 0px -8%" },
        )

        for (const element of elements) {
          element.classList.add("scroll-reveal")
          if (element.getBoundingClientRect().top >= window.innerHeight * 0.92) {
            observer.observe(element)
          }
        }
      }, 120)
    }

    // The root layout can hydrate before streamed page content. Wait for the initial
    // load so DOM-only reveal classes cannot race page hydration.
    if (document.readyState === "complete") {
      startReveal()
    } else {
      loadHandler = startReveal
      window.addEventListener("load", loadHandler, { once: true })
    }

    return () => {
      if (hydrationDelay !== undefined) window.clearTimeout(hydrationDelay)
      if (loadHandler) window.removeEventListener("load", loadHandler)
      window.cancelAnimationFrame(revealFrame)
      observer?.disconnect()
    }
  }, [pathname])

  return null
}
