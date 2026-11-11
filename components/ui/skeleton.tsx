import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

type SkeletonProps = ComponentProps<"div">

export function Skeleton({ className, ...props }: SkeletonProps) {
  return <div aria-hidden="true" data-skeleton className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />
}
