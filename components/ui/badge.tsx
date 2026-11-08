import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-0.5 whitespace-nowrap rounded-[var(--radius-pill)] border px-1.5 py-0 text-[0.55rem] font-semibold uppercase tracking-[0.06em] [&>svg]:size-2 [&>svg]:pointer-events-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-foreground text-background [a&]:hover:bg-foreground/88",
        primary:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90",
        outline:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        blue: "border-transparent bg-[var(--semantic-info)] text-card [a&]:hover:bg-[var(--semantic-info)]/90",
        category: "border-transparent bg-[var(--category-accent)] text-card [a&]:hover:bg-[var(--category-accent)]/90",
        petType: "border-transparent bg-[var(--pet-type)] text-[var(--pet-type-foreground)] [a&]:hover:bg-[var(--pet-type)]/90",
        alta: "border-transparent bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90",
        media: "border-transparent bg-[var(--priority-medium)] text-primary-foreground [a&]:hover:bg-[var(--priority-medium)]/90",
        baja: "border-transparent bg-[var(--priority-low)] text-card [a&]:hover:bg-[var(--priority-low)]/90",
        "ranking-first": "border-transparent bg-[var(--ranking-first)] text-foreground [a&]:hover:bg-[var(--ranking-first)]/90",
        "ranking-second": "border-transparent bg-[var(--ranking-second)] text-card-foreground [a&]:hover:bg-[var(--ranking-second)]/90",
        "ranking-third": "border-transparent bg-[var(--ranking-third)] text-card [a&]:hover:bg-[var(--ranking-third)]/90",
        reparado: "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        pendiente: "border-transparent bg-[var(--semantic-warning)] text-primary-foreground [a&]:hover:bg-[var(--semantic-warning)]/90",
        rechazado: "border-transparent bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90",
        admin: "border-transparent bg-[var(--semantic-admin)] text-card [a&]:hover:bg-[var(--semantic-admin)]/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

/**
 * Componente visual que renderiza una etiqueta compacta (badge) con variantes de estilo.
 *
 * @param variant - Clave de la variante visual a aplicar (p. ej. `default`, `secondary`, `destructive`, `blue`, `alta`, `media`, `baja`, `reparado`, `pendiente`, `rechazado`).
 * @param asChild - Si es `true`, renderiza el contenido usando `Slot` para delegar el elemento raíz; por defecto renderiza un `span`.
 * @returns El elemento React que representa la badge: un `span` por defecto o el componente pasado mediante `asChild`.
 */
function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
