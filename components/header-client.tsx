"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  LayoutDashboard,
  List,
  LogIn,
  Map,
  Plus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { buttonVariants } from "@/components/ui/button";
import { HowToUseDialog } from "@/components/how-to-use-dialog"
import { ContactsDialog } from "@/components/contacts-dialog";
import { BackButton } from "@/components/back-button";
import { needsPasswordSetup } from "@/lib/authz/guest-account";

interface HeaderClientProps {
  user: User | null | undefined;
}

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** Last nav slot: visitors sign in, guests open their reports, permanent users their account. */
function getAccountNavItem(user: User | null | undefined): NavItem {
  if (!user) {
    return { href: "/auth", label: "Ingresar", icon: LogIn };
  }

  // Guests and converted guests that still have to create their password land on "Mis reportes".
  if (user.is_anonymous || needsPasswordSetup(user)) {
    return { href: "/mis-reportes", label: "Mis reportes", icon: FileText };
  }

  return { href: "/dashboard", label: "Cuenta", icon: LayoutDashboard };
}

export function HeaderClient({ user }: HeaderClientProps) {
  const pathname = usePathname();
  const bottomItems: NavItem[] = [
    { href: "/mapa", label: "Mapa", icon: Map },
    { href: "/reportes", label: "Reportes", icon: List },
    { href: "/reportes/nuevo", label: "Crear", icon: Plus },
    { href: "/comunidad", label: "Comunidad", icon: Users },
    getAccountNavItem(user),
  ];

  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const showTopHeader = !isAdminRoute && pathname !== "/" && !pathname.startsWith("/auth");
  const isReportDetail = /^\/reportes\/\d+$/.test(pathname);

  const isActive = (href: string) => {
    if (href === "/mapa") return pathname === "/" || pathname.startsWith("/mapa");
    if (href === "/reportes") return pathname.startsWith("/reportes") && !pathname.startsWith("/reportes/nuevo");
    if (href === "/reportes/nuevo") return pathname.startsWith("/reportes/nuevo");
    if (href === "/dashboard") return pathname.startsWith("/dashboard");
    if (href === "/auth") return pathname.startsWith("/auth");
    if (href === "/mis-reportes") return pathname.startsWith("/mis-reportes");
    return pathname === href;
  };

  return (
    <>
      {showTopHeader && <div className="h-[calc(4.75rem+env(safe-area-inset-top))] shrink-0" aria-hidden="true" />}
      {showTopHeader && (
        <header className="app-header fixed inset-x-0 top-0 z-40 flex min-h-[4.75rem] items-center justify-center bg-transparent px-4 pt-[env(safe-area-inset-top)] sm:px-6">
          {isReportDetail && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 sm:left-6">
              <BackButton />
            </div>
          )}
          <Link href="/" className="inline-flex rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-secondary" aria-label="Reporty, ir al inicio">
            <Image
              src="/logos/logoSinBg.png"
              alt="Reporty"
              width={136}
              height={34}
              className="h-8 w-auto object-contain sm:h-10"
              priority
            />
          </Link>
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 sm:right-6 sm:gap-2">
            <ContactsDialog />
            <HowToUseDialog />
          </div>
        </header>
      )}
      {!isAdminRoute && pathname !== "/" && <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-[60] grid min-h-16 grid-cols-5 rounded-t-[1.5rem] border border-b-0 border-secondary-foreground/15 bg-secondary px-2 pb-[max(env(safe-area-inset-bottom),0.2rem)] pt-0.5 text-secondary-foreground shadow-[0_-10px_30px_rgba(0,0,0,0.2)] sm:px-3">
        {bottomItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);

          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              className={`flex min-h-10 flex-col items-center justify-center gap-1 rounded-[1.1rem] px-1 text-[0.64rem] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-secondary ${
                active ? "text-primary" : "text-secondary-foreground/70 hover:text-secondary-foreground"
              }`}
            >
              {href === "/reportes/nuevo" ? (
                <span className={`${buttonVariants({ variant: "default", size: "icon-lg" })} -mt-3 size-10 border-2 border-secondary shadow-xl`}>
                  <Icon className="size-4.5" aria-hidden="true" />
                </span>
              ) : (
                <Icon className="size-4.5" aria-hidden="true" />
              )}
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>}
    </>
  );
}
