import { CuadrillasPage } from "@/components/cuadrillas/cuadrillas-page"

export const metadata = { title: "Operaciones · Administración", robots: { index: false, follow: false } }

/** Reuses the protected operational workspace inside the role-aware admin shell. */
export default function AdminOperacionesPage() {
  return <CuadrillasPage adminShell />
}
