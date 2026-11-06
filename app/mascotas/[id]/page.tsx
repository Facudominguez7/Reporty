import { notFound } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getMascotaDetalle } from "@/database/queries/mascotas/detalle"
import { DetalleMascota } from "./detalle-mascota"
import { getUserRoleContext, isAdminRole } from "@/lib/authz/roles"
export default async function MascotaDetallePage({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<1)notFound();const [{data:pet},supabase]=await Promise.all([getMascotaDetalle(Number(id)),createClient()]);if(!pet)notFound();const {data:{user},error:authError}=await supabase.auth.getUser();let isOwner=false;let isAdmin=false;if(!authError&&user&&!user.is_anonymous){const service=createAdminClient();const [{data},role]=await Promise.all([service.from("mascotas_perdidas").select("id").eq("id",pet.id).eq("propietario_id",user.id).maybeSingle(),getUserRoleContext(service,user.id)]);isOwner=!!data;isAdmin=!role.error&&isAdminRole(role.data?.roleId)}return <DetalleMascota pet={pet} isOwner={isOwner} isAdmin={isAdmin}/>}
