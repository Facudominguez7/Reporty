import { createLucideIcon } from "lucide-react"

export type CategoryIconNode = Array<[string, Record<string, string>]>

export const categoryIconNodes: Record<string, CategoryIconNode> = {
  Bache: [
    ["rect", { x: "2", y: "6", width: "20", height: "8", rx: "1" }],
    ["path", { d: "M17 14v7" }],
    ["path", { d: "M7 14v7" }],
    ["path", { d: "M17 3v3" }],
    ["path", { d: "M7 3v3" }],
    ["path", { d: "M10 14 2.3 6.3" }],
    ["path", { d: "m14 6 7.7 7.7" }],
    ["path", { d: "m8 6 8 8" }],
  ],
  Semaforo: [
    ["path", { d: "M9.3 6.2a4.55 4.55 0 0 0 5.4 0" }],
    ["path", { d: "M7.9 10.7c.9.8 2.4 1.3 4.1 1.3s3.2-.5 4.1-1.3" }],
    ["path", { d: "M13.9 3.5a1.93 1.93 0 0 0-3.8-.1l-3 10c-.1.2-.1.4-.1.6 0 1.7 2.2 3 5 3s5-1.3 5-3c0-.2 0-.4-.1-.5Z" }],
    ["path", { d: "m7.5 12.2-4.7 2.7c-.5.3-.8.7-.8 1.1s.3.8.8 1.1l7.6 4.5c.9.5 2.1.5 3 0l7.6-4.5c.7-.3 1-.7 1-1.1s-.3-.8-.8-1.1l-4.7-2.8" }],
  ],
  "Arbol caido": [
    ["path", { d: "M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z" }],
    ["path", { d: "M7 16v6" }],
    ["path", { d: "M13 19v3" }],
    ["path", { d: "M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5" }],
  ],
  Alumbrado: [
    ["path", { d: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" }],
    ["path", { d: "M9 18h6" }],
    ["path", { d: "M10 22h4" }],
  ],
  Residuos: [
    ["path", { d: "M3 6h18" }],
    ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }],
    ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }],
    ["line", { x1: "10", x2: "10", y1: "11", y2: "17" }],
    ["line", { x1: "14", x2: "14", y1: "11", y2: "17" }],
  ],
  Seguridad: [
    ["path", { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }],
    ["path", { d: "M12 8v4" }],
    ["path", { d: "M12 16h.01" }],
  ],
  Agua: [
    ["path", { d: "M12 22a7 7 0 0 0 7-7c0-5-7-13-7-13S5 10 5 15a7 7 0 0 0 7 7Z" }],
  ],
  default: [
    ["circle", { cx: "12", cy: "12", r: "1" }],
    ["circle", { cx: "19", cy: "12", r: "1" }],
    ["circle", { cx: "5", cy: "12", r: "1" }],
  ],
}

export const getCategoryIconNode = (category: string): CategoryIconNode =>
  categoryIconNodes[category] ?? categoryIconNodes.default

const categoryIconComponents = new Map(
  Object.entries(categoryIconNodes).map(([category, iconNode]) => [
    category,
    createLucideIcon(
      `ReportyCategory${category.replace(/\s+/g, "")}`,
      iconNode.map(([tag, attributes], index) => [
        tag,
        { ...attributes, key: `${category}-${index}` },
      ]),
    ),
  ])
)

export const getCategoryIconComponent = (category: string) =>
  categoryIconComponents.get(category) ?? categoryIconComponents.get("default")!

export const iconNodeToSvgMarkup = (iconNode: CategoryIconNode): string =>
  iconNode
    .map(([tag, attributes]) => {
      const attrs = Object.entries(attributes)
        .map(([name, value]) => `${name}="${value}"`)
        .join(" ")
      return `<${tag} ${attrs} />`
    })
    .join("")
