import { describe, expect, it } from "vitest"
import { buttonVariants } from "./button"

describe("button variants", () => {
  it("provides a transparent bordered ghost without changing ghost", () => {
    const bordered = buttonVariants({ variant: "ghost-bordered" })
    expect(bordered).toContain("text-secondary")
    expect(bordered).toContain("border-secondary")
    expect(bordered).toContain("bg-transparent")
    expect(buttonVariants({ variant: "ghost" })).not.toContain("border-secondary")
  })
})
