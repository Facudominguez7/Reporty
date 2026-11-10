import { z } from "zod"

/** Montos sugeridos en pesos, en el orden en que se muestran en `/donar`. */
export const MONTOS_DONACION = [1000, 2000, 5000, 10000, 20000] as const

/** Monto mínimo aceptado para «Otro». */
export const MONTO_MINIMO_DONACION = 500

/** Tope de seguridad para un monto libre; evita errores de tipeo con ceros de más. */
export const MONTO_MAXIMO_DONACION = 1_000_000

export const LARGO_MAXIMO_NOMBRE = 80
export const LARGO_MAXIMO_MENSAJE = 280

/**
 * Convierte un texto opcional en `null` cuando está vacío, para no guardar cadenas en blanco.
 */
const textoOpcional = (maximo: number, campo: string) =>
  z
    .string()
    .trim()
    .max(maximo, `${campo} puede tener hasta ${maximo} caracteres.`)
    .transform((valor) => (valor.length ? valor : null))
    .nullable()
    .optional()
    .transform((valor) => valor ?? null)

/** Datos que el donante completa en `/donar`, validados en el servidor. */
export const esquemaDonacion = z.object({
  monto: z.coerce
    .number({ error: "Elegí un monto." })
    .int("El monto tiene que ser un número entero de pesos.")
    .min(MONTO_MINIMO_DONACION, `El monto mínimo es ${formatearMonto(MONTO_MINIMO_DONACION)}.`)
    .max(MONTO_MAXIMO_DONACION, `El monto máximo es ${formatearMonto(MONTO_MAXIMO_DONACION)}.`),
  nombre: textoOpcional(LARGO_MAXIMO_NOMBRE, "El nombre"),
  mensaje: textoOpcional(LARGO_MAXIMO_MENSAJE, "El mensaje"),
})

export type DatosDonacion = z.infer<typeof esquemaDonacion>

/**
 * Formatea un monto en pesos argentinos sin decimales cuando es entero, por ejemplo `$5.000`.
 */
export function formatearMonto(monto: number): string {
  const entero = Number.isInteger(monto)
  return `$${monto.toLocaleString("es-AR", { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: 2 })}`
}
