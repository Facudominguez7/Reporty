import { describe, expect, it } from "vitest"
import { moderatePetText, moderateReportText, moderateText } from "./texto-determinista.server"

const incidentTitles = [
  "Bache en la avenida",
  "Pozo en la calzada",
  "Vereda levantada",
  "Cloaca rebalsada",
  "Pérdida de agua",
  "Luminaria apagada",
  "Semáforo intermitente",
  "Cable bajo",
  "Poste inclinado",
  "Árbol caído",
  "Basura acumulada",
  "Contenedor lleno",
  "Vidrios en la calle",
  "Humo en el barrio",
  "Rata en la vereda",
  "Sapo en el desagüe",
  "Animal herido",
  "Gato atrapado",
  "Perro suelto",
  "Mascota encontrada",
] as const

const incidentDescriptions = [
  "La situación se encuentra frente a la escuela y dificulta el paso de peatones.",
  "Está junto a la plaza y aumenta el riesgo para quienes cruzan la calle.",
  "El problema aparece cerca de la avenida y necesita una revisión municipal.",
  "La vereda queda bloqueada desde la esquina hasta la parada de colectivo.",
  "El agua se acumula después de la lluvia y vuelve resbaloso el camino.",
  "Los vecinos avisaron que ocurre desde ayer en el barrio.",
  "El inconveniente afecta a quienes circulan de noche por la zona.",
  "Hay residuos alrededor del contenedor y se necesita limpieza.",
  "El animal está cerca del camino y puede provocar un accidente.",
  "La señal no se ve porque quedó tapada por una rama.",
  "La instalación necesita reparación antes de que alguien se lastime.",
  "El acceso al centro comunitario queda parcialmente bloqueado.",
  "El olor llega a las viviendas cercanas durante la tarde.",
  "La calle queda difícil de transitar cuando llueve fuerte.",
  "El problema se repite en la esquina y todavía no fue resuelto.",
  "La zona necesita una inspección y señalización preventiva.",
  "La situación fue observada junto al contenedor de residuos.",
  "El paso para sillas de ruedas queda obstruido por el material.",
  "La pérdida genera agua sobre la calzada y afecta el tránsito.",
  "El hecho fue informado por vecinos del barrio San Martín.",
  "La plaza necesita mantenimiento para evitar nuevos riesgos.",
  "El inconveniente está a metros del puente y del arroyo.",
  "La reparación permitiría recuperar el acceso a la vereda.",
  "La situación empeora cuando hay viento o lluvia.",
  "Se solicita revisar el lugar y retirar los residuos.",
] as const

const petAnimals = [
  "Gato perdido",
  "Gata encontrada",
  "Perro perdido",
  "Perra encontrada",
  "Rata perdida",
  "Sapo encontrado",
  "Cerdo perdido",
  "Cerda encontrada",
  "Marrano perdido",
  "Marrana encontrada",
  "Puerco perdido",
  "Puerca encontrada",
  "Animal perdido",
  "Mascota encontrada",
  "Perro pequeño perdido",
  "Gata joven encontrada",
  "Perra grande perdida",
  "Gato adulto encontrado",
  "Rata pequeña perdida",
  "Sapo verde encontrado",
] as const

const petDetails = [
  "Tiene collar rojo y una placa con teléfono.",
  "Fue visto cerca de la plaza durante la mañana.",
  "Tiene pelaje negro y una mancha blanca en el pecho.",
  "Es de tamaño mediano y usa una correa azul.",
  "Se perdió después de la tormenta en el barrio.",
  "Fue encontrado junto a la escuela y está tranquilo.",
  "Tiene una pata lastimada y necesita una veterinaria.",
  "Es marrón, de cola corta y tiene ojos claros.",
  "Lleva una cinta amarilla en el cuello.",
  "Fue encontrado dentro de una jaula cerca del camino.",
  "Tiene orejas grandes y una marca en la cabeza.",
  "Se perdió cerca de la avenida y responde a su nombre.",
  "Es blanco con manchas grises y de tamaño pequeño.",
  "Fue visto junto al contenedor de residuos.",
  "Tiene una cicatriz en la pata trasera.",
  "Usa collar verde y necesita volver con su familia.",
  "Es joven, asustado y está cerca del refugio.",
  "Tiene pelaje corto y una mancha negra en la espalda.",
  "Fue encontrado en una caja de cartón.",
  "Se perdió en la zona rural y lleva una marca azul.",
  "Es tranquilo y tiene una placa de identificación.",
  "Fue visto cerca del puente y del arroyo.",
  "Tiene una oreja caída y ojos verdes.",
  "Se encontró junto a una jaula abierta.",
  "La familia busca información sobre su paradero.",
] as const

const incidentes = incidentTitles.flatMap((title) => incidentDescriptions.map((description) => [title, description] as const))
const mascotas = petAnimals.flatMap((animal) => petDetails.map((detail) => `${animal}. ${detail}`))

describe("500 incidentes legítimos", () => {
  it("genera exactamente 500 casos", () => {
    expect(incidentes).toHaveLength(500)
  })

  it.each(incidentes)("permite incidente: %s", (titulo, descripcion) => {
    expect(moderateReportText(titulo, descripcion)).toBeNull()
  })
})

describe("500 mascotas legítimas", () => {
  it("genera exactamente 500 casos", () => {
    expect(mascotas).toHaveLength(500)
  })

  it.each(mascotas)("permite mascota: %s", (descripcion) => {
    expect(moderatePetText(descripcion)).toBeNull()
  })
})

describe("insultos argentinos ambiguos", () => {
  it("mantiene coger como palabra bloqueada", () => {
    expect(moderateText("coger").allowed).toBe(false)
  })
})
