import { expect, it, vi } from "vitest"
import { z } from "zod"

it("rejects oversized constrained arrays before validating their elements", () => {
  const validateElement = vi.fn(() => false)
  const result = z.array(z.string().refine(validateElement)).max(3).safeParse(Array(64).fill("invalid"))

  expect(result.success).toBe(false)
  if (result.success) throw new Error("Expected oversized array rejection")
  expect(result.error.issues.map(({ code, path }) => ({ code, path }))).toEqual([
    { code: "too_big", path: [] },
  ])
  expect(validateElement).not.toHaveBeenCalled()
})
