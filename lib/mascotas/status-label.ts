export type PetStatus = "Perdida" | "Encontrada"

/** Use the masculine adjective to agree with the species label shown before it. */
export function getPetStatusAdjective(status: PetStatus): "Perdido" | "Encontrado" {
  return status === "Perdida" ? "Perdido" : "Encontrado"
}
