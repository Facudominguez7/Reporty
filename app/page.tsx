import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";
import { pageMetadata, SITE_DESCRIPTION } from "@/lib/seo/site";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Reportá problemas urbanos en Posadas", description: SITE_DESCRIPTION, path: "/" }),
  // The root layout's title template only reaches child segments, not this page.
  title: { absolute: "Reporty · Reportá problemas urbanos en Posadas" },
};

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
            Encontrá problemas de la ciudad en el mapa o contá qué está pasando en tu barrio.
            Entre todos, es más fácil que se vea. <span className="text-primary">Es gratis.</span>
          </p>
        </div>
        <Link href="/mapa" className={buttonVariants({ size: "lg", className: "mt-1" })}>
          Explorar el mapa <ArrowRight aria-hidden="true" />
        </Link>
        <p className="text-xs text-primary">Posadas, Misiones</p>
      </div>
    </section>
  );
}
