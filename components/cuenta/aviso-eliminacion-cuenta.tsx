import { DATOS_QUE_SE_CONSERVAN, DATOS_QUE_SE_ELIMINAN } from "@/lib/cuenta/eliminacion"

/**
 * Explica qué pasa al eliminar la cuenta: qué se borra para siempre y qué se conserva.
 * Se muestra en el diálogo de confirmación y en la página pública /eliminar-cuenta.
 *
 * @returns La lista de consecuencias de la eliminación.
 */
export function AvisoEliminacionCuenta() {
  return (
    <div className="space-y-3 text-left text-sm text-muted-foreground">
      <p className="font-medium text-foreground">Se borra para siempre y no se puede deshacer:</p>
      <ul className="list-disc space-y-1 pl-5">
        {DATOS_QUE_SE_ELIMINAN.map((dato) => (
          <li key={dato}>{dato}</li>
        ))}
      </ul>
      <p className="font-medium text-foreground">Se conserva sin vínculo con tu cuenta:</p>
      <ul className="list-disc space-y-1 pl-5">
        {DATOS_QUE_SE_CONSERVAN.map((dato) => (
          <li key={dato}>{dato}</li>
        ))}
      </ul>
    </div>
  )
}
