import { test as base } from "@playwright/test"

import { TestData } from "./support/test-data"

/**
 * The app animates every scroll (`html { scroll-behavior: smooth }` in `app/globals.css`). When
 * Playwright scrolls an element into view, the animation is still running while it computes the
 * click coordinates, so the click lands on the pre-scroll position and silently hits nothing
 * (seen on the `/auth` tabs after a submission scrolled the page). The suite disables that
 * animation, which changes no app code and makes every click land where it was aimed.
 */
const SCROLL_INSTANTANEO = `
  html { scroll-behavior: auto !important; }
`

/** `testData` creates what a test needs and deletes all of it when the test ends, pass or fail. */
export const test = base.extend<{ testData: TestData }>({
  page: async ({ page }, provide) => {
    await page.addInitScript((css) => {
      const aplicar = () => {
        if (!document.documentElement) return false
        const style = document.createElement("style")
        style.textContent = css
        document.documentElement.appendChild(style)
        return true
      }

      if (!aplicar()) document.addEventListener("DOMContentLoaded", aplicar, { once: true })
    }, SCROLL_INSTANTANEO)

    await provide(page)
  },
  testData: async ({}, provide) => {
    const testData = new TestData()
    await provide(testData)
    await testData.cleanup()
  },
})

export { expect } from "@playwright/test"
