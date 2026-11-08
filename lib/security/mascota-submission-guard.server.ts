import "server-only"
import { z } from "zod"

const mascotaSubmissionSchema = z.object({
  tipoAnimal: z.enum(["perro", "gato", "otro"]),
  descripcion: z.string().trim().min(1).max(5000),
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
  telefono: z.string().min(1).max(40).regex(/^[0-9]+$/),
}).strict()

export type MascotaSubmission = z.infer<typeof mascotaSubmissionSchema>

/** Validate only client-submitted pet fields; identity, evidence and moderation stay server-owned. */
export function validatePetSubmission(input: unknown): MascotaSubmission {
  return mascotaSubmissionSchema.parse(input)
}
