import { describe, expect, it } from "vitest"

import { categoryIconNodes, getCategoryIconNode } from "./category-icons"

describe("category icon mapping", () => {
  it("uses a dedicated water-drop icon for Agua", () => {
    expect(getCategoryIconNode("Agua")).not.toEqual(categoryIconNodes.default)
    expect(getCategoryIconNode("Agua")).toContainEqual([
      "path",
      { d: "M12 22a7 7 0 0 0 7-7c0-5-7-13-7-13S5 10 5 15a7 7 0 0 0 7 7Z" },
    ])
  })
})
