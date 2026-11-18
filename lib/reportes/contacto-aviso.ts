/**
 * Validación del contacto que el autor deja al avisar a la institución responsable.
 * Regla de producto: como mínimo email o teléfono, uno de los dos (S3 del feature
 * odd/tasks/defensoria-reclamos.md). El teléfono se captura solo al avisar y vive en
 * `reportes.telefono_contacto`, nunca en `profiles` (opción A, S7).
 */
import "server-only"

import { z } from "zod"

/** Contacto opcional del autor para el aviso al organismo; al menos uno es obligatorio. */
export type ContactoAviso = {
  email: string | null
  telefono: string | null
}

const contactoSchema = z
  .object({
    email: z.preprocess(
      (valor) => (typeof valor === "string" && valor.trim() === "" ? null : valor),
      z.string().trim().email("Revisá el email: el formato no es válido.").nullish(),
    ),
    telefono: z.preprocess(
      (valor) => (typeof valor === "string" && valor.trim() === "" ? null : valor),
      z
        .string()
        .trim()
        .regex(/^[0-9+\-\s()]{6,40}$/, "El teléfono solo acepta números, espacios y + - ( ), entre 6 y 40 caracteres.")
        .nullish(),
    ),
  })
  .refine(({ email, telefono }) => Boolean(email || telefono), {
    message: "Dejanos al menos un email o un número de teléfono para que el organismo pueda contactarte.",
  })

type ResultadoContacto =
  | { success: true; contacto: ContactoAviso }
  | { success: false; error: string }

/**
 * Valida y normaliza el contacto del aviso: recorta espacios, convierte vacíos en null
 * y exige la regla mínimo email o teléfono.
 *
 * @param entrada - Contacto crudo recibido del cliente.
 * @returns El contacto normalizado, o el mensaje de error para mostrar en la UI.
 */
export function validarContactoAviso(entrada: { email?: string | null; telefono?: string | null }): ResultadoContacto {
  const parseado = contactoSchema.safeParse(entrada)
  if (!parseado.success) {
    return { success: false, error: parseado.error.issues[0]?.message ?? "El contacto no es válido." }
  }
  return {
    success: true,
    contacto: { email: parseado.data.email ?? null, telefono: parseado.data.telefono ?? null },
  }
}
