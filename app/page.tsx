import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";
import { pageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Reportes urbanos y mascotas perdidas en Posadas", description: "Reportá problemas de la ciudad o ayudá a encontrar mascotas perdidas en Posadas.", path: "/" }),
  // The root layout's title template only reaches child segments, not this page.
  title: { absolute: "Reporty · Reportes urbanos y mascotas perdidas en Posadas" },
};

/**
 * Robot de Android dibujado con primitivas; usa el verde oficial de la marca.
 * El viewBox está recortado al dibujo, igual que el de la manzana, para que ambos
 * logos tengan la misma altura y la misma base.
 */
function IconoAndroid() {
  return (
    <svg viewBox="3 1.7 18 20.3" aria-hidden="true" className="h-7 w-auto text-[#3DDC84]">
      <g fill="currentColor">
        <path d="M6 8.6a6 6 0 0 1 12 0z" />
        <rect x="6" y="9.4" width="12" height="9" rx="1.5" />
        <rect x="3" y="9.6" width="2.2" height="7" rx="1.1" />
        <rect x="18.8" y="9.6" width="2.2" height="7" rx="1.1" />
        <rect x="8.4" y="16.5" width="2.4" height="5.5" rx="1.2" />
        <rect x="13.2" y="16.5" width="2.4" height="5.5" rx="1.2" />
      </g>
      <path d="M8.7 3.7 7.5 1.7M15.3 3.7l1.2-2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <circle cx="9.6" cy="6.3" r="0.75" fill="var(--card)" />
      <circle cx="14.4" cy="6.3" r="0.75" fill="var(--card)" />
    </svg>
  );
}

/** Manzana de Apple; toma el color del texto para verse bien en modo claro y oscuro. */
function IconoApple() {
  return (
    <svg viewBox="2.22 0 19.55 24" aria-hidden="true" className="h-7 w-auto text-foreground">
      <path
        fill="currentColor"
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
      />
    </svg>
  );
}

/**
 * Pantalla de bienvenida: qué es Reporty, la entrada al mapa y el aviso de que las
 * apps de Android e iOS están en camino. El aviso no enlaza a ninguna tienda porque
 * las apps todavía no están publicadas.
 */
export default function HomePage() {
  return (
    <section className="welcome-screen flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6" aria-labelledby="welcome-title">
      <div className="page-container items-center justify-center gap-4 px-5 py-6 text-center sm:gap-6 sm:px-10 sm:py-10 md:w-fit md:flex-none">
        <Image
          src="/logos/logoSinBg.png"
          alt="Reporty"
          width={260}
          height={80}
          priority
          className="h-auto w-32 object-contain sm:w-44"
        />
        <div className="section-stack max-w-2xl">
          <h1 id="welcome-title" className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            ¿Hay algo que habría que arreglar?
          </h1>
          <p className="section-copy mx-auto">
            Encontrá problemas de la ciudad y mascotas perdidas en el mapa, o contá qué está pasando en tu barrio.
            Entre todos, es más fácil que se vea. <span className="text-primary">Es gratis.</span>
          </p>
        </div>
        <Link href="/mapa" className={buttonVariants({ size: "lg", className: "mt-1" })}>
          Explorar el mapa <ArrowRight aria-hidden="true" />
        </Link>
        <p className="text-xs text-primary">Posadas, Misiones</p>
        <div className="flex w-full flex-col items-center gap-2 border-t border-border pt-4">
          <p className="text-sm font-semibold text-foreground">Próximamente en Android y iOS</p>
          <div className="flex items-center gap-4">
            <span data-plataforma="android" className="inline-flex">
              <IconoAndroid />
            </span>
            <span aria-hidden="true" className="h-7 w-px bg-border" />
            <span data-plataforma="ios" className="inline-flex">
              <IconoApple />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
