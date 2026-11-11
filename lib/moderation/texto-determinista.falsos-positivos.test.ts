import { describe, expect, it } from "vitest"
import { moderatePetText, moderateReportText } from "./texto-determinista.server"

const mascotas = [
  "Gato perdido negro con collar rojo",
  "Gata encontrada en la plaza, es blanca y pequeña",
  "Perra perdida de tamaño mediano con correa azul",
  "Perro encontrado, pelaje marrón y una mancha blanca",
  "Gatos perdidos cerca de la terminal, uno gris y otro naranja",
  "Perras encontradas junto al refugio veterinario",
  "Rata encontrada en una jaula, tiene una mancha negra",
  "Sapo perdido del patio, color verde y pequeño",
  "Cerda encontrada en la zona rural, lleva una marca azul",
  "Cerdo perdido cerca del arroyo, es marrón y grande",
  "Marrana encontrada con una cinta roja en el cuello",
  "Puerco perdido, tiene una oreja caída y pelaje claro",
  "Mascota perdida con collar y placa de identificación",
  "Animal encontrado, tamaño chico y cola larga",
  "Perro perdido después de la tormenta, responde a su nombre",
  "Gata encontrada con una pata lastimada y ojos verdes",
  "Perra negra perdida en el barrio San Martín",
  "Gato blanco encontrado frente a la escuela",
  "Perro marrón perdido con collar amarillo",
  "Gata gris encontrada en una caja de cartón",
  "Mascota encontrada cerca de la avenida, tiene una cicatriz",
  "Animal perdido, pelaje corto y orejas grandes",
  "Perra encontrada en la vereda, está asustada pero sana",
  "Gato perdido, tamaño pequeño y cola corta",
  "Perro encontrado junto a una jaula abierta",
] as const

const incidentes = [
  ["Rata en la calle", "Hay una rata cerca del contenedor de basura."],
  ["Sapo en la vereda", "Un sapo grande está junto a la entrada de la plaza."],
  ["Basura acumulada", "Hay residuos y olor fuerte en la esquina."],
  ["Pozo profundo", "El pozo ocupa media calzada y es peligroso para motos."],
  ["Cloaca rota", "Sale agua de la cloaca y la vereda está resbaladiza."],
  ["Luminaria apagada", "La luz de la calle no funciona desde anoche."],
  ["Cable suelto", "Hay un cable bajo y peligroso frente a la escuela."],
  ["Árbol caído", "Una rama grande bloquea el paso por la vereda."],
  ["Perro suelto", "Hay un perro suelto cerca de la avenida y el tránsito."],
  ["Gato en el techo", "Un gato quedó atrapado en el techo de una casa."],
  ["Agua en la calle", "La pérdida deja agua sobre la calzada después de cada lluvia."],
  ["Vereda rota", "La vereda tiene baldosas levantadas y alguien puede tropezar."],
  ["Semáforo apagado", "El semáforo no enciende y genera riesgo en la esquina."],
  ["Humo en el barrio", "Sale humo de un terreno baldío desde la mañana."],
  ["Olor a basura", "El contenedor está lleno y el olor llega a las casas."],
  ["Pared peligrosa", "Una pared inclinada puede caer sobre la vereda."],
  ["Puerta rota", "La puerta del espacio público quedó abierta y dañada."],
  ["Plaza sin luz", "La plaza está oscura porque varias luminarias no funcionan."],
  ["Camino inundado", "El camino queda cubierto de agua cuando llueve."],
  ["Rama sobre el cable", "Una rama cayó sobre el cableado de la calle."],
  ["Marrón en la calle", "Hay una mancha de barro que vuelve resbalosa la esquina."],
  ["Animal herido", "Un animal herido necesita ayuda cerca del puente."],
  ["Mascota encontrada", "Encontramos una mascota y buscamos a su familia."],
  ["Perro perdido", "Un perro perdido fue visto cerca de la plaza."],
  ["Gato encontrado", "Un gato encontrado espera a su dueño en el domicilio indicado."],
] as const

describe("corpus de falsos positivos de textos legítimos", () => {
  it.each(mascotas)("permite descripción de mascota: %s", (descripcion) => {
    expect(moderatePetText(descripcion)).toBeNull()
  })

  it.each(incidentes)("permite incidente legítimo: %s", (titulo, descripcion) => {
    expect(moderateReportText(titulo, descripcion)).toBeNull()
  })
})
