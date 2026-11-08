import { redirect } from "next/navigation"

export default function AdminMascotasRedirect() {
  redirect("/admin/reportes?vista=mascotas")
}
