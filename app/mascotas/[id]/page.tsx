import { notFound } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getMascotaDetalle } from "@/database/queries/mascotas/detalle"
import { DetalleMascota } from "./detalle-mascota"
export default async function MascotaDetallePage({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<1)notFound();const [{data:pet},supabase]=await Promise.all([getMascotaDetalle(Number(id)),createClient()]);if(!pet)notFound();const {data:{user}}=await supabase.auth.getUser();let isOwner=false;if(user&&!user.is_anonymous){const {data}=await createAdminClient().from("mascotas_perdidas").select("id").eq("id",pet.id).eq("propietario_id",user.id).maybeSingle();isOwner=!!data}return <DetalleMascota pet={pet} isOwner={isOwner}/>}
